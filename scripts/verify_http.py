"""Exercise the API over a real HTTP socket in an isolated temporary database.

Run from the repository root: python scripts/verify_http.py
Requires backend/requirements.txt. Never touches the normal workspace database.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import site
import socket
import tempfile
import time

import httpx

ROOT = Path(__file__).resolve().parents[1]


def main():
    # A free loopback port avoids interfering with an existing development server.
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    (ROOT / '.test-results').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='http-', dir=ROOT / '.test-results') as directory:
        env = os.environ | {'DATABASE_PATH': str(Path(directory) / 'api.db'), 'AGENT_MODE': 'demo'}
        # Windows venv python.exe is a redirector. Launch the actual interpreter
        # so terminate()/wait() own the server process, not only its launcher.
        env['PYTHONPATH'] = os.pathsep.join(site.getsitepackages())
        log_path = Path(directory) / 'server.log'
        with log_path.open('w') as log:
            process = subprocess.Popen(
                [getattr(sys, '_base_executable', sys.executable), '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', str(port)],
                cwd=ROOT / 'backend', env=env, stdout=log, stderr=log,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
            )
            try:
                with httpx.Client(base_url=base, timeout=10, headers={"X-Requested-With":"SecondServe"}) as client:
                    for _ in range(100):
                        if process.poll() is not None:
                            raise RuntimeError('Test API failed to start.')
                        try:
                            if client.get('/api/health').status_code == 200:
                                break
                        except httpx.ConnectError:
                            pass
                        time.sleep(.1)
                    else:
                        raise RuntimeError('API health timed out')
                    assert client.get('/api/overview').status_code == 401
                    registration = client.post('/api/auth/register', json={'name':'HTTP Coordinator','email':'http@example.com','password':'http-test-password'})
                    assert registration.status_code == 201, registration.text
                    assert client.post('/api/auth/location', json={'name':'Pune','label':'Pune, India','lat':18.52,'lng':73.85,'country':'India','country_code':'IN','source':'manual'}).status_code == 200
                    assert client.get('/api/overview').json()['available_portions'] == 0
                    assert client.post('/api/workspace/sample').status_code == 201
                    schema = client.get('/openapi.json')
                    schema.raise_for_status()
                    assert '/api/runs/{run_id}/approve' in schema.json()['paths']
                    response = client.post('/api/donations', json={
                        'donor': 'HTTP verification kitchen', 'food': 'Vegetable rice boxes',
                        'category': 'Prepared meals', 'portions': 20, 'allergens': [], 'vegetarian': True,
                        'address': 'Pune test kitchen', 'lat': 18.52, 'lng': 73.855, 'pickup_within_minutes': 120,
                    })
                    assert response.status_code == 201, response.text
                    started = client.post('/api/runs', json={'radius_km': 5})
                    assert started.status_code == 202, started.text
                    run_id = started.json()['id']
                    for _ in range(100):
                        run = client.get(f'/api/runs/{run_id}').json()
                        if run['status'] != 'running':
                            break
                        time.sleep(.1)
                    assert run['status'] == 'ready', run
                    assert run['plan']['total_portions'] == 264, run
                    approved = client.post(f'/api/runs/{run_id}/approve')
                    assert approved.status_code == 200, approved.text
                    trips = client.get('/api/missions').json()
                    assert sum(t['portions'] for t in trips) == 264
                    for trip in trips:
                        assert client.post(f'/api/missions/{trip["id"]}/complete').status_code == 200
                    overview = client.get('/api/overview').json()
                    assert overview['rescued_portions'] == 264
                    assert overview['reserved_portions'] == 0
                    assert client.get('/api/missions/export.csv').status_code == 200
                    assert client.get(f'/api/runs/{run_id}/manifest').status_code == 200
                    print(json.dumps({'status': 'passed', 'transport': 'real HTTP', 'framework': 'Strands Agents',
                                      'provider': 'scripted demo', 'rescued_portions': 264,
                                      'completed_trips': len(trips), 'openapi': 'verified', 'exports': 'verified'}, indent=2))
            finally:
                process.terminate()
                process.wait(timeout=15)


if __name__ == '__main__':
    main()
