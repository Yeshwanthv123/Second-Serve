"""Real local-LLM acceptance check against a running Compose installation.

Creates its own test account. No fake model, mocked HTTP or scripted provider.
Evidence contains only fictional test records, never the account password/cookie.
"""
import json
from pathlib import Path
import secrets
import time

import httpx

ROOT = Path(__file__).resolve().parents[1]


def main():
    with httpx.Client(base_url='http://localhost:8080', timeout=30, headers={'X-Requested-With':'SecondServe','Origin':'http://localhost:8080'}) as client:
        def post(path, body=None):
            r=client.post('/api'+path,json=body or {})
            r.raise_for_status()
            return r.json()
        def get(path):
            r=client.get('/api'+path);r.raise_for_status();return r.json()
        post('/auth/register',dict(name='Live LLM verification',email='llm-'+secrets.token_hex(6)+'@example.com',password=secrets.token_urlsafe(24)))
        post('/auth/location',dict(name='Pune',label='Pune, India',lat=18.52,lng=73.85,country='India',country_code='IN',source='manual'))
        status=get('/agent/status')
        assert status['mode']=='ollama' and status['llm'] and status['ready'],status
        near=post('/recipients',dict(name='Nearby Community Kitchen',address='Fictional nearby test hall',lat=18.52,lng=73.85,capacity=40))['id']
        shelter=post('/recipients',dict(name='Night Shelter',address='Fictional shelter test hall',lat=18.525,lng=73.855,capacity=20,vegetarian_only=True,excluded_allergens=['nuts']))['id']
        post('/donations',dict(donor='Verification Restaurant',food='Vegetable lunch boxes',category='Prepared meals',portions=30,vegetarian=True,allergens=[],address='Fictional test pickup',lat=18.52,lng=73.85,pickup_within_minutes=120))
        def run(instructions):
            start=time.monotonic();ident=post('/runs',dict(instructions=instructions,radius_km=5))['id'];seen=0
            print('Started real LLM run '+ident,flush=True)
            while time.monotonic()-start < 660:
                result=get('/runs/'+ident)
                for e in result['events'][seen:]:
                    print(e['title']+': '+e['detail'],flush=True)
                seen=len(result['events'])
                if result['status']!='running':break
                time.sleep(1)
            assert result['status']=='ready',result
            assert result['mode']=='ollama' and result['model_calls']>=2,result
            assert result['summary'] and result['plan']['total_portions']==30,result
            return result
        baseline=run('No partner preference. Use the nearest suitable receiving partner.')
        assert baseline['plan']['allocations'][0]['recipient_id']==near,baseline
        preferred=run('Prioritize Night Shelter for dinner tonight. Send as many suitable portions there as its capacity allows, then use other partners for the rest.')
        assert preferred['plan']['priority_recipient_id']==shelter,preferred
        assert preferred['plan']['allocations'][0]['recipient_id']==shelter,preferred
        assert preferred['plan']['allocations'][0]['portions']==20,preferred
        post('/runs/'+preferred['id']+'/approve')
        assert client.post('/api/runs/'+baseline['id']+'/approve',json={}).status_code==409
        missions=get('/missions')
        for mission in missions:post('/missions/'+mission['id']+'/complete')
        assert get('/overview')['rescued_portions']==30
        evidence={'status':'passed','provider':status,'fictional_test_records':True,
                  'baseline':baseline,'preferred':preferred,'completed_portions':30,'completed_pickups':len(missions),
                  'assertions':['Actual Ollama model used through Strands','Model responses recorded','Natural-language preference changed the chosen recipient','Capacity capped at 20; remaining 10 assigned elsewhere','Stale earlier plan rejected','Approval and confirmed handoffs persisted']}
        (ROOT/'artifacts').mkdir(exist_ok=True)
        output=ROOT/'artifacts'/'live-llm-verification.json';output.write_text(json.dumps(evidence,indent=2),encoding='utf-8')
        post('/auth/logout')
        print(json.dumps({'status':'passed','model':status['model_id'],'baseline_model_calls':baseline['model_calls'],'preferred_model_calls':preferred['model_calls'],'baseline_seconds':baseline['elapsed_ms']/1000,'preferred_seconds':preferred['elapsed_ms']/1000,'preferred_partner':'Night Shelter','portions':30,'pickups':len(missions),'evidence':str(output)},indent=2),flush=True)


if __name__=='__main__':main()
