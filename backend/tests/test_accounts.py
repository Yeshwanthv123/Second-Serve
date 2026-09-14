import hashlib
import json
import time
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest
from fastapi.testclient import TestClient

from app.auth import COOKIE, accounts_path, workspace_file
from app.db import connect
from app.main import app

AREA = dict(name='Pune', label='Pune, India', lat=18.52, lng=73.85, country='India', country_code='IN', source='manual')
OTHER = dict(name='London', label='London, UK', lat=51.507, lng=-.128, country='United Kingdom', country_code='GB', source='manual')
HEADERS = {'X-Requested-With': 'SecondServe'}
PASSWORD = 'test-password-123'


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('DATABASE_PATH', str(tmp_path / 'accounts-test.db'))
    monkeypatch.setenv('AGENT_MODE', 'demo')
    with TestClient(app, headers=HEADERS) as client:
        yield client


def register(client, email='alex@example.com'):
    response = client.post('/api/auth/register', json={'name': 'Alex', 'email': email, 'password': PASSWORD})
    assert response.status_code == 201, response.text
    return response.json()['user']


def locate(client, area=AREA):
    response = client.post('/api/auth/location', json=area)
    assert response.status_code == 200, response.text


def plan(client):
    response = client.post('/api/runs', json={})
    assert response.status_code == 202, response.text
    result = client.get('/api/runs/' + response.json()['id']).json()
    assert result['status'] == 'ready', result
    return result


def test_registration_requires_location_and_starts_empty(client):
    assert client.get('/api/overview').status_code == 401
    user = register(client)
    assert user['location'] is None
    assert client.get('/api/overview').status_code == 409
    assert client.get('/api/map-config').status_code == 200
    locate(client)
    overview = client.get('/api/overview').json()
    assert overview['city'] == 'Pune'
    assert overview['available_portions'] == overview['partners'] == 0
    assert overview['demo_data'] is False
    assert client.get('/api/donations').json() == []
    assert client.get('/api/recipients').json() == []


def test_password_hash_cookie_rotation_logout_and_expiration(client):
    user = register(client)
    original = client.cookies.get(COOKIE)
    with connect(accounts_path()) as conn:
        row = conn.execute('SELECT * FROM users').fetchone()
        assert row['password_hash'] != PASSWORD
        assert len(row['password_hash'].split(':')) == 2
        assert conn.execute('SELECT token_hash FROM sessions').fetchone()[0] == hashlib.sha256(original.encode()).hexdigest()
    locate(client)
    response = client.post('/api/auth/login', json={'email': 'ALEX@EXAMPLE.COM', 'password': PASSWORD})
    assert response.status_code == 200
    assert response.json()['user']['id'] == user['id']
    assert response.json()['user']['location'] == AREA
    assert response.headers['cache-control'] == 'no-store'
    assert 'HttpOnly' in response.headers['set-cookie']
    assert 'SameSite=lax' in response.headers['set-cookie']
    assert client.cookies.get(COOKIE) != original
    stranger = TestClient(app, headers=HEADERS)
    stranger.cookies.set(COOKIE, original)
    assert stranger.get('/api/auth/me').status_code == 401
    assert client.post('/api/auth/logout').status_code == 200
    assert client.get('/api/auth/me').status_code == 401
    assert client.post('/api/auth/login', json={'email':'alex@example.com','password':PASSWORD}).status_code == 200
    with connect(accounts_path()) as conn:
        conn.execute('UPDATE sessions SET expires_at=?', (time.time()-1,))
    assert client.get('/api/overview').status_code == 401


def test_invalid_credentials_duplicate_accounts_csrf_and_rate_limit(client):
    assert client.post('/api/auth/register', json={'name':'Alex','email':'bad','password':'short'}).status_code == 422
    register(client)
    assert client.post('/api/auth/register', json={'name':'Alex','email':'ALEX@example.com','password':PASSWORD}).status_code == 409
    assert client.post('/api/auth/location', json=AREA, headers={'Origin':'https://evil.example'}).status_code == 403
    assert client.post('/api/auth/location', json=AREA, headers={'X-Requested-With':''}).status_code == 403
    assert client.post('/api/auth/location', json=AREA | {'lat': 100}).status_code == 422
    for _ in range(10):
        assert client.post('/api/auth/login', json={'email':'alex@example.com','password':'wrong-password'}).status_code == 401
    limited = client.post('/api/auth/login', json={'email':'alex@example.com','password':PASSWORD})
    assert limited.status_code == 429
    assert 'retry-after' in limited.headers


def test_two_accounts_have_private_inventory_runs_and_exports(client):
    register(client); locate(client)
    assert client.post('/api/workspace/sample').status_code == 201
    first = plan(client)
    assert first['plan']['total_portions'] == 244
    assert client.post('/api/runs/' + first['id'] + '/approve').status_code == 200
    mission = client.get('/api/missions').json()[0]
    second = TestClient(app, headers=HEADERS)
    register(second, 'other@example.com'); locate(second, OTHER)
    assert second.get('/api/donations').json() == []
    assert second.get('/api/runs/' + first['id']).status_code == 404
    assert second.get('/api/runs/' + first['id'] + '/manifest').status_code == 404
    assert second.post('/api/runs/' + first['id'] + '/approve').status_code == 404
    assert second.post('/api/missions/' + mission['id'] + '/complete').status_code == 404
    assert second.get('/api/missions').json() == []
    assert len(second.get('/api/missions/export.csv').text.splitlines()) == 1
    assert client.get('/api/overview').json()['reserved_portions'] == 244


def test_concurrent_strands_runs_stay_in_their_own_workspaces(client):
    register(client); locate(client); client.post('/api/workspace/sample')
    other = TestClient(app, headers=HEADERS)
    register(other, 'other@example.com'); locate(other, OTHER); other.post('/api/workspace/sample')
    with ThreadPoolExecutor(max_workers=2) as pool:
        first_job = pool.submit(plan, client)
        second_job = pool.submit(plan, other)
        a, b = first_job.result(), second_job.result()
    assert a['plan']['area'] == AREA
    assert b['plan']['area'] == OTHER
    assert a['plan']['total_portions'] == b['plan']['total_portions'] == 244
    assert client.get('/api/runs/' + b['id']).status_code == 404


def test_location_changes_filter_records_and_reject_old_plan(client):
    register(client); locate(client); client.post('/api/workspace/sample')
    first = plan(client)
    before = client.get('/api/donations').json()
    assert all(d['donor'].startswith('Sample') for d in before)
    assert all(abs(d['lat']-AREA['lat']) < .1 for d in before)
    locate(client, OTHER)
    assert client.get('/api/donations').json() == []
    assert client.get('/api/overview').json()['latest_run_id'] is None
    assert client.post('/api/runs/' + first['id'] + '/approve').status_code == 409
    # A new area does not silently reseed or relocate existing records.
    assert client.post('/api/workspace/sample').status_code == 409
    locate(client)
    assert client.get('/api/donations').json() == before


def test_user_created_food_and_partner_complete_a_rescue(client):
    register(client); locate(client)
    partner = dict(name='Real Test Kitchen',address='Community hall',capacity=40,lat=18.521,lng=73.851,vegetarian_only=True,excluded_allergens=['nuts'])
    assert client.post('/api/recipients', json=partner | {'lat':51.5}).status_code == 422
    assert client.post('/api/recipients', json=partner).status_code == 201
    food = dict(donor='Test restaurant',food='Vegetable lunch boxes',category='Prepared meals',portions=30,allergens=[],vegetarian=True,address='Restaurant entrance',lat=18.52,lng=73.85,pickup_within_minutes=120)
    assert client.post('/api/donations', json=food).status_code == 201
    assert client.get('/api/overview').json()['demo_data'] is False
    result = plan(client)
    assert result['plan']['total_portions'] == 30
    assert client.post('/api/runs/'+result['id']+'/approve').status_code == 200
    mission = client.get('/api/missions').json()[0]
    assert client.post('/api/missions/'+mission['id']+'/complete').status_code == 200
    assert client.get('/api/overview').json()['rescued_portions'] == 30


def test_city_lookup_normalizes_caches_and_handles_outages(client, monkeypatch):
    register(client)
    calls = []
    def provider(url, **kwargs):
        calls.append(kwargs['params'])
        return httpx.Response(200, request=httpx.Request('GET', url), json={'results':[{'name':'Pune','latitude':18.52,'longitude':73.85,'admin1':'Maharashtra','country':'India','country_code':'IN'}]})
    monkeypatch.setattr('app.locations.httpx.get', provider)
    first = client.get('/api/locations/search?q=Pune')
    assert first.status_code == 200
    assert first.json()['results'][0]['label'] == 'Pune, Maharashtra, India'
    assert first.json()['results'][0]['source'] == 'open-meteo'
    assert client.get('/api/locations/search?q=pune').json() == first.json()
    assert len(calls) == 1
    def offline(*args, **kwargs):
        raise httpx.ConnectError('offline')
    monkeypatch.setattr('app.locations.httpx.get', offline)
    failed = client.get('/api/locations/search?q=London')
    assert failed.status_code == 503
    assert 'manually' in failed.json()['detail']
    # Manual onboarding is independent of the third-party service.
    locate(client)


def test_location_cannot_change_during_a_run(client):
    user = register(client); locate(client)
    with connect(workspace_file(user['id'])) as conn:
        conn.execute("INSERT INTO runs(id,status,mode,created_at,instructions,radius_km) VALUES ('running','running','demo','2026-09-12','',5)")
    assert client.post('/api/auth/location', json=OTHER).status_code == 409
    assert client.get('/api/auth/me').json()['user']['location'] == AREA
