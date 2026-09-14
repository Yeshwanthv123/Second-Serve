"""Provider boundary tests; fake responses here are not evidence of live inference."""
import httpx
import pytest

from app import agent
from app.db import connect, workspace_path
from app.auth import workspace_file
from app.planning import make_plan
from app.providers import readiness
from app.local_model import LocalOllamaModel
from test_accounts import client, register, locate, AREA


def test_ollama_preserves_parallel_tool_requests_and_named_results():
    model=LocalOllamaModel(host='http://unused',model_id='unused')
    messages=[{'role':'assistant','content':[{'text':''},{'toolUse':{'toolUseId':'a','name':'inspect_surplus','input':{}}},{'toolUse':{'toolUseId':'b','name':'inspect_recipient_needs','input':{}}}]},
              {'role':'user','content':[{'toolResult':{'toolUseId':'a','content':[{'text':'food records'}],'status':'success'}},{'toolResult':{'toolUseId':'b','content':[{'text':'partner records'}],'status':'success'}}]}]
    result=model._format_request_messages(messages)
    assert len(result)==3
    assert len(result[0]['tool_calls'])==2
    assert result[0]['tool_calls'][0]['function']['name']=='inspect_surplus'
    assert result[1]=={'role':'tool','tool_name':'inspect_surplus','content':'food records'}
    assert result[2]['tool_name']=='inspect_recipient_needs'


def test_default_provider_is_a_real_local_llm(monkeypatch):
    monkeypatch.delenv('AGENT_MODE', raising=False)
    monkeypatch.setattr('app.providers.httpx.get', lambda url, **kw: httpx.Response(200, request=httpx.Request('GET', url), json={'models':[{'name':'qwen3:4b-instruct'}]}))
    status = readiness()
    assert status['mode'] == 'ollama'
    assert status['llm'] and status['ready']


def test_missing_model_does_not_create_a_fake_run(client, monkeypatch):
    register(client); locate(client)
    monkeypatch.setenv('AGENT_MODE', 'ollama')
    monkeypatch.setattr('app.providers.httpx.get', lambda url, **kw: httpx.Response(200, request=httpx.Request('GET', url), json={'models':[]}))
    assert client.get('/api/agent/status').json()['status'] == 'model_missing'
    assert client.post('/api/runs', json={}).status_code == 503
    assert client.get('/api/runs').json() == []


def test_empty_account_is_given_an_actionable_prerequisite(client):
    register(client); locate(client)
    response = client.post('/api/runs', json={})
    assert response.status_code == 409
    assert 'receiving partner' in response.json()['detail']


def test_ollama_exception_is_recorded_without_scripted_fallback(client, monkeypatch):
    register(client); locate(client); client.post('/api/workspace/sample')
    monkeypatch.setenv('AGENT_MODE','ollama')
    monkeypatch.setattr('app.main.readiness', lambda: {'ready':True,'model_id':'test-local-model'})
    def broken(**kwargs):
        raise RuntimeError('Test inference failure')
    monkeypatch.setattr(agent,'OllamaModel',broken)
    response = client.post('/api/runs',json={})
    result = client.get('/api/runs/'+response.json()['id']).json()
    assert result['status'] == 'failed'
    assert result['mode'] == 'ollama'
    assert result['model_id'] == 'test-local-model'
    assert result['model_calls'] == 0
    assert 'No scripted fallback' in result['error']
    assert result['plan'] is None
    assert client.get('/api/missions').json() == []


def test_provider_audit_counts_responses_and_model_identity(client, monkeypatch):
    register(client); locate(client); client.post('/api/workspace/sample')
    monkeypatch.setenv('AGENT_MODE','ollama')
    monkeypatch.setattr('app.main.readiness', lambda: {'ready':True,'model_id':'unit-test-fake'})
    class FakeTransport(agent.DemoModel):
        def __init__(self, **kwargs):
            assert kwargs['model_id'] == 'unit-test-fake'
            super().__init__()
    monkeypatch.setattr(agent,'OllamaModel',FakeTransport)
    started=client.post('/api/runs',json={})
    result=client.get('/api/runs/'+started.json()['id']).json()
    assert result['status']=='ready'
    assert result['model_calls']==4
    assert result['elapsed_ms'] >= 0
    assert len([e for e in result['events'] if e['tool']=='model'])==4
    assert 'inspect_surplus' in next(e['detail'] for e in result['events'] if e['tool']=='model')


def test_early_text_answer_gets_goal_feedback_then_calls_real_tool_boundary(client, monkeypatch):
    register(client);locate(client);client.post('/api/workspace/sample')
    monkeypatch.setenv('AGENT_MODE','ollama')
    monkeypatch.setattr('app.main.readiness',lambda:{'ready':True,'model_id':'unit-test-early-stop'})
    class EarlyStop(agent.DemoModel):
        def __init__(self, **kwargs):
            super().__init__();self.first=True
        async def stream(self,*args,**kwargs):
            first=self.first
            if first:
                self.step=3;self.first=False
            async for item in super().stream(*args,**kwargs):
                yield item
            if first:self.step=0
    monkeypatch.setattr(agent,'OllamaModel',EarlyStop)
    started=client.post('/api/runs',json={})
    result=client.get('/api/runs/'+started.json()['id']).json()
    assert result['status']=='ready'
    assert result['model_calls']==5
    assert len([e for e in result['events'] if e['tool']=='validation'])==1
    assert len([e for e in result['events'] if e['tool']=='create_rescue_plan'])==1
    assert client.get('/api/missions').json()==[]


def test_preference_can_change_allocation_but_never_override_constraints(client):
    user=register(client);locate(client)
    near=client.post('/api/recipients',json=dict(name='Nearby kitchen',address='Nearby hall',lat=18.52,lng=73.85,capacity=40)).json()['id']
    far=client.post('/api/recipients',json=dict(name='Night shelter',address='Shelter hall',lat=18.525,lng=73.855,capacity=20,excluded_allergens=['nuts'])).json()['id']
    food=client.post('/api/donations',json=dict(donor='Restaurant',food='Vegetable boxes',category='Prepared meals',portions=30,address='Pickup door',lat=18.52,lng=73.85,pickup_within_minutes=120)).json()['id']
    token=workspace_path.set(workspace_file(user['id']))
    try:
        assert make_plan(5)['allocations'][0]['recipient_id']==near
        preferred=make_plan(5,far)
        assert preferred['allocations'][0]['recipient_id']==far
        assert preferred['allocations'][0]['portions']==20
        assert preferred['total_portions']==30
        with connect() as conn:
            conn.execute('UPDATE donations SET allergens=? WHERE id=?', ('["nuts"]',food))
        incompatible=make_plan(5,far)
        assert all(a['recipient_id']!=far for a in incompatible['allocations'])
        assert incompatible['total_portions']==30
        with pytest.raises(ValueError,match='Priority recipient'):
            make_plan(5,'invented-model-id')
    finally:
        workspace_path.reset(token)
