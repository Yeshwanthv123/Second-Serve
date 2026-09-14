"""Verify the running Compose app through Nginx, with a separate test account.

Requires backend dependencies locally and containers at localhost:8080.
Creates a clearly named verification account, leaving existing users untouched.
Live Open-Meteo lookup is intentionally part of this network-dependent check.
"""
import json
import secrets
import time

import httpx


def main():
    with httpx.Client(base_url='http://localhost:8080', headers={'X-Requested-With':'SecondServe', 'Origin':'http://localhost:8080'}, timeout=20) as client:
        assert client.get('/').status_code == 200
        assert client.get('/api/health').json()['status'] == 'ok'
        assert client.get('/api/donations').status_code == 401
        email = f'verification-{secrets.token_hex(6)}@example.com'
        password = secrets.token_urlsafe(24)
        registered = client.post('/api/auth/register', json={'name':'Container verification','email':email,'password':password})
        assert registered.status_code == 201, registered.text
        assert client.get('/api/overview').status_code == 409
        config = client.get('/api/map-config').json()
        assert config['tile_url'] == 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', config
        response = client.get('/api/locations/search', params={'q':'Pune'})
        assert response.status_code == 200, response.text
        place = next(p for p in response.json()['results'] if p['country_code'] == 'IN')
        assert client.post('/api/auth/location', json=place).status_code == 200
        assert client.get('/api/overview').json()['available_portions'] == 0
        point = dict(lat=place['lat'],lng=place['lng'])
        partner = client.post('/api/recipients', json=dict(name='Verification community kitchen',address='Fictional verification stop',capacity=40,**point))
        assert partner.status_code == 201, partner.text
        food = client.post('/api/donations', json=dict(donor='Verification restaurant',food='Test vegetable boxes',category='Prepared meals',portions=30,address='Fictional verification pickup',pickup_within_minutes=120,**point))
        assert food.status_code == 201, food.text
        started = client.post('/api/runs', json={})
        assert started.status_code == 202, started.text
        run_id = started.json()['id']
        for _ in range(2400):
            run = client.get('/api/runs/'+run_id).json()
            if run['status'] != 'running':
                break
            time.sleep(.25)
        assert run['status'] == 'ready', run
        assert run['plan']['total_portions'] == 30
        assert client.post('/api/runs/'+run_id+'/approve').status_code == 200
        mission = client.get('/api/missions').json()[0]
        assert client.post('/api/missions/'+mission['id']+'/complete').status_code == 200
        assert client.get('/api/overview').json()['rescued_portions'] == 30
        assert client.get('/api/missions/export.csv').status_code == 200
        assert client.post('/api/auth/logout').status_code == 200
        assert client.get('/api/overview').status_code == 401
        assert client.post('/api/auth/login',json={'email':email,'password':password}).status_code == 200
        assert client.get('/api/auth/me').json()['user']['location'] == place
        assert client.get('/api/overview').json()['rescued_portions'] == 30
        client.post('/api/auth/logout')
        print(json.dumps({'status':'passed','transport':'Docker Nginx to FastAPI','live_geocoding':place['label'],'new_account':'empty','test_portions_completed':30,'login_location_persistence':'verified','provider':run['mode']},indent=2))


if __name__ == '__main__':
    main()
