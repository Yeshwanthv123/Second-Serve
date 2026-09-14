import csv
import io
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.db import connect, initialize, workspace_path
from app.auth import workspace_file
from app.main import app
from app.planning import compatible, make_plan


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('DATABASE_PATH', str(tmp_path / 'test.db'))
    monkeypatch.setenv('AGENT_MODE', 'demo')
    with TestClient(app, headers={'X-Requested-With': 'SecondServe'}) as client:
        user = client.post('/api/auth/register', json={'name':'Test Coordinator','email':'test@example.com','password':'test-password-123'}).json()['user']
        area = {'name':'Bengaluru','label':'Bengaluru, India','lat':12.975,'lng':77.635,'country':'India','country_code':'IN','source':'manual'}
        assert client.post('/api/auth/location', json=area).status_code == 200
        assert client.post('/api/workspace/sample', json={}).status_code == 201
        token = workspace_path.set(workspace_file(user['id']))
        try:
            yield client
        finally:
            workspace_path.reset(token)


def run_plan(client, **settings):
    response = client.post('/api/runs', json=settings)
    assert response.status_code == 202, response.text
    result = client.get('/api/runs/' + response.json()['id']).json()
    assert result['status'] == 'ready', result
    return result


def listing(**updates):
    data = {'donor': 'Test Kitchen', 'food': 'Fresh vegetable rice', 'category': 'Prepared meals',
            'portions': 20, 'allergens': [], 'vegetarian': True, 'address': 'Indiranagar, Bengaluru',
            'lat': 12.975, 'lng': 77.640, 'pickup_within_minutes': 120, 'note': 'Sealed boxes'}
    return data | updates


def test_health_and_seeded_state(client):
    assert client.get('/api/health').json()['agent_framework'] == 'Strands Agents'
    overview = client.get('/api/overview').json()
    assert overview['available_portions'] == 244
    assert overview['rescued_portions'] == 0
    assert overview['partners'] == 4
    assert len(client.get('/api/donations').json()) == 6
    assert len(client.get('/api/recipients').json()) == 4


def test_full_strands_plan_approval_handoff_and_exports(client):
    result = run_plan(client)
    assert result['plan']['total_portions'] == 244
    tools = [e['tool'] for e in result['events']]
    assert tools == ['agent', 'inspect_surplus', 'inspect_recipient_needs', 'create_rescue_plan', 'review']
    # Planning cannot reserve or imply delivery.
    assert client.get('/api/overview').json()['available_portions'] == 244
    assert client.get('/api/missions').json() == []
    approved = client.post(f'/api/runs/{result["id"]}/approve').json()
    assert approved['status'] == 'dispatched'
    trips = client.get('/api/missions').json()
    assert sum(t['portions'] for t in trips) == 244
    assert client.get('/api/overview').json()['reserved_portions'] == 244
    first = trips[0]
    assert client.post(f'/api/missions/{first["id"]}/complete').status_code == 200
    overview = client.get('/api/overview').json()
    assert overview['rescued_portions'] == first['portions']
    assert overview['reserved_portions'] == 244 - first['portions']
    csv_response = client.get('/api/missions/export.csv')
    assert csv_response.status_code == 200
    records = list(csv.DictReader(io.StringIO(csv_response.text)))
    assert len(records) == len(trips)
    assert sum(int(r['portions']) for r in records) == 244
    manifest = client.get(f'/api/runs/{result["id"]}/manifest').json()
    assert manifest['run']['status'] == 'dispatched'
    assert len(manifest['missions']) == len(trips)


def test_repeated_approval_and_completion_are_idempotent(client):
    result = run_plan(client)
    url = f'/api/runs/{result["id"]}/approve'
    first = client.post(url).json()
    second = client.post(url).json()
    assert first == second
    trip = first['missions'][0]
    url = f'/api/missions/{trip["id"]}/complete'
    client.post(url)
    client.post(url)
    assert client.get('/api/overview').json()['rescued_portions'] == trip['portions']


def test_overlapping_plans_cannot_double_reserve(client):
    a, b = run_plan(client), run_plan(client)
    assert client.post(f'/api/runs/{a["id"]}/approve').status_code == 200
    assert client.post(f'/api/runs/{b["id"]}/approve').status_code == 409
    assert client.get('/api/overview').json()['reserved_portions'] == 244
    with connect() as conn:
        assert conn.execute('SELECT min(remaining) FROM donations').fetchone()[0] >= 0
        assert conn.execute('SELECT min(remaining_capacity) FROM recipients').fetchone()[0] >= 0


def test_concurrent_approvals_are_atomic(client):
    a, b = run_plan(client), run_plan(client)
    with ThreadPoolExecutor(max_workers=2) as pool:
        codes = list(pool.map(lambda r: client.post(f'/api/runs/{r["id"]}/approve').status_code, [a, b]))
    assert sorted(codes) == [200, 409]
    assert client.get('/api/overview').json()['reserved_portions'] == 244


def test_stale_late_allocation_rolls_back_every_reservation(client):
    result = run_plan(client)
    last = result['plan']['allocations'][-1]
    past = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    with connect() as conn:
        conn.execute('UPDATE donations SET expires_at=? WHERE id=?', (past, last['donation_id']))
    assert client.post(f'/api/runs/{result["id"]}/approve').status_code == 409
    assert client.get('/api/missions').json() == []
    with connect() as conn:
        assert conn.execute('SELECT sum(remaining) FROM donations').fetchone()[0] == 244
        assert conn.execute('SELECT sum(remaining_capacity) FROM recipients').fetchone()[0] == 350


def test_constraints_and_capacity_are_enforced(client):
    result = run_plan(client)
    with connect() as conn:
        for a in result['plan']['allocations']:
            donor = conn.execute('SELECT * FROM donations WHERE id=?', (a['donation_id'],)).fetchone()
            recipient = conn.execute('SELECT * FROM recipients WHERE id=?', (a['recipient_id'],)).fetchone()
            assert compatible(donor, recipient)
            assert a['distance_km'] <= 5
        conn.execute('UPDATE recipients SET vegetarian_only=1, excluded_allergens=?, remaining_capacity=10', ('["nuts","gluten"]',))
    plan = make_plan(5)
    assert plan['total_portions'] <= 40
    assert all(a['donation_id'] not in ('d1', 'd4', 'd6') for a in plan['allocations'])
    assert plan['skipped']


def test_expired_food_and_empty_plan(client):
    with connect() as conn:
        conn.execute('UPDATE donations SET expires_at=?', ((datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),))
    result = run_plan(client)
    assert result['plan']['total_portions'] == 0
    assert client.post(f'/api/runs/{result["id"]}/approve').status_code == 409
    assert client.get('/api/overview').json()['available_portions'] == 0


def test_add_surplus_persists_and_is_used_by_agent(client):
    response = client.post('/api/donations', json=listing())
    assert response.status_code == 201
    ident = response.json()['id']
    result = run_plan(client)
    assert any(a['donation_id'] == ident for a in result['plan']['allocations'])
    initialize()
    assert any(d['id'] == ident for d in client.get('/api/donations').json())


@pytest.mark.parametrize('updates', [
    {'portions': -1}, {'portions': 0}, {'portions': 1.5}, {'donor': ' '},
    {'allergens': ['unknown']}, {'lat': 0}, {'lng': 99}, {'pickup_within_minutes': 1},
    {'category': 'Unknown'}, {'unexpected': 'field'}
])
def test_invalid_listings_are_rejected(client, updates):
    assert client.post('/api/donations', json=listing(**updates)).status_code == 422


def test_csv_neutralizes_formula_injection(client):
    client.post('/api/donations', json=listing(donor='=1+1'))
    result = run_plan(client)
    client.post(f'/api/runs/{result["id"]}/approve')
    records = list(csv.DictReader(io.StringIO(client.get('/api/missions/export.csv').text)))
    assert any(r['donor'] == "'=1+1" for r in records)


def test_missing_records_and_invalid_run_settings(client):
    assert client.get('/api/runs/missing').status_code == 404
    assert client.get('/api/runs/missing/manifest').status_code == 404
    assert client.post('/api/runs/missing/approve').status_code == 404
    assert client.post('/api/missions/missing/complete').status_code == 404
    assert client.post('/api/runs', json={'radius_km': -5}).status_code == 422


def test_restart_marks_interrupted_run_failed(client):
    with connect() as conn:
        conn.execute("INSERT INTO runs(id,status,mode,created_at,instructions,radius_km) VALUES ('interrupted','running','demo','2026-09-12','','5')")
    assert client.post('/api/runs', json={}).status_code == 409
    initialize()
    assert client.get('/api/runs/interrupted').json()['status'] == 'failed'


def test_bedrock_failure_is_visible_without_demo_fallback(client, monkeypatch):
    import app.agent as module
    def unavailable(**kwargs):
        raise RuntimeError('Simulated provider failure')
    monkeypatch.setenv('AGENT_MODE', 'bedrock')
    monkeypatch.setattr(module, 'BedrockModel', unavailable)
    response = client.post('/api/runs', json={})
    result = client.get('/api/runs/' + response.json()['id']).json()
    assert result['status'] == 'failed'
    assert result['mode'] == 'bedrock'
    assert 'Bedrock request failed' in result['error']
    assert client.get('/api/missions').json() == []


def test_run_budget_stops_a_looping_model(client, monkeypatch):
    import app.agent as module

    original = module.DemoModel

    class LoopingModel(original):
        async def stream(self, *args, **kwargs):
            self.step = 0
            async for item in super().stream(*args, **kwargs):
                yield item

    monkeypatch.setattr(module, 'DemoModel', LoopingModel)
    response = client.post('/api/runs', json={})
    result = client.get('/api/runs/' + response.json()['id']).json()
    assert result['status'] == 'failed'
    assert len([e for e in result['events'] if e['tool'] == 'inspect_surplus']) == 8
    assert client.get('/api/missions').json() == []
