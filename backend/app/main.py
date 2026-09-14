import csv
import io
import json
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from .agent import execute_run
from .db import connect, now, rows, workspace_path, seed_demo, area_location
from .auth import router as auth_router, initialize_accounts, lookup_session, workspace_file, COOKIE
from .locations import router as locations_router
from .planning import compatible, distance, eta, in_area, snapshot
from .providers import configured_mode, identity, readiness


@asynccontextmanager
async def lifespan(app):
    initialize_accounts()
    yield


app = FastAPI(title='Second Serve API', version='1.0.0', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173', 'http://localhost:8080'],
                   allow_methods=['GET', 'POST'], allow_headers=['Content-Type', 'X-Requested-With'], allow_credentials=True)

app.include_router(auth_router)
app.include_router(locations_router)


@app.middleware('http')
async def account_boundary(request: Request, call_next):
    path = request.url.path
    if path.startswith('/api/') and request.method not in ('GET', 'HEAD', 'OPTIONS'):
        origins = set(os.getenv('APP_ORIGINS', 'http://localhost:8080,http://127.0.0.1:8080,http://localhost:5173,http://127.0.0.1:5173').split(','))
        origin = request.headers.get('origin')
        if request.headers.get('x-requested-with') != 'SecondServe' or (origin and origin not in origins):
            return JSONResponse({'detail': 'Request origin could not be verified. Reload the application.'}, status_code=403)
    public = {'/api/health', '/api/auth/register', '/api/auth/login'}
    if not path.startswith('/api/') or path in public or request.method == 'OPTIONS':
        response = await call_next(request)
        if path.startswith('/api/auth/'):
            response.headers['Cache-Control'] = 'no-store'
        return response
    user = lookup_session(request.cookies.get(COOKIE))
    if not user:
        return JSONResponse({'detail': 'Please sign in to continue.'}, status_code=401)
    request.state.user = user
    if not user['location'] and path != '/api/map-config' and not path.startswith(('/api/auth/', '/api/locations/')):
        return JSONResponse({'detail': 'Choose your workspace location first.'}, status_code=409)
    token = workspace_path.set(workspace_file(user['id']))
    try:
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        return response
    finally:
        workspace_path.reset(token)


def mode():
    return configured_mode()


@app.get('/api/agent/status')
def agent_status():
    return readiness()


def get_run(conn, run_id):
    row = conn.execute('SELECT * FROM runs WHERE id=?', (run_id,)).fetchone()
    if row is None:
        raise HTTPException(404, 'Run not found')
    result = dict(row)
    result['plan'] = json.loads(result['plan']) if result['plan'] else None
    result['events'] = rows(conn, 'SELECT * FROM events WHERE run_id=? ORDER BY id', (run_id,))
    return result


class DonationInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')
    donor: str = Field(min_length=2, max_length=100)
    food: str = Field(min_length=3, max_length=150)
    category: Literal['Bakery', 'Prepared meals', 'Produce']
    portions: int = Field(ge=1, le=2000, strict=True)
    allergens: list[Literal['gluten', 'dairy', 'nuts', 'soy', 'eggs', 'shellfish']] = Field(default_factory=list, max_length=6)
    vegetarian: bool = True
    address: str = Field(min_length=3, max_length=200)
    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    lng: float = Field(ge=-180, le=180, allow_inf_nan=False)
    pickup_within_minutes: int = Field(ge=15, le=1440, strict=True)
    note: str = Field(default='', max_length=600)


class RunInput(BaseModel):
    instructions: str = Field(default='', max_length=1000)
    radius_km: float = Field(default=5, ge=0.2, le=20, allow_inf_nan=False)


@app.get('/api/health')
def health():
    with connect() as conn:
        conn.execute('SELECT 1')
    return {'status': 'ok', 'mode': mode(), 'agent_framework': 'Strands Agents', 'version': '1.0.0'}


@app.get('/api/overview')
def overview(request: Request):
    with connect() as conn:
        local_donations = [d for d in rows(conn, 'SELECT * FROM donations WHERE remaining>0 AND expires_at>?', (now(),)) if in_area(d)]
        active = (len(local_donations), sum(d['remaining'] for d in local_donations))
        completed = conn.execute("SELECT coalesce(sum(portions),0), count(*) FROM missions WHERE status='completed'").fetchone()
        reserved = conn.execute("SELECT coalesce(sum(portions),0), count(*) FROM missions WHERE status='scheduled'").fetchone()
        partners = len([r for r in rows(conn, 'SELECT * FROM recipients') if in_area(r)])
        latest = conn.execute('SELECT id,plan FROM runs ORDER BY created_at DESC LIMIT 1').fetchone()
        if latest and latest['plan'] and json.loads(latest['plan']).get('area') != request.state.user['location']:
            latest = None
        demo = conn.execute("SELECT value FROM settings WHERE key='demo_data'").fetchone()
        return {'available_listings': active[0], 'available_portions': active[1], 'rescued_portions': completed[0],
                'completed_trips': completed[1], 'reserved_portions': reserved[0], 'scheduled_trips': reserved[1],
                'partners': partners, 'latest_run_id': latest['id'] if latest else None,
                'mode': mode(), 'agent': readiness(), 'city': request.state.user['location']['name'], 'location': request.state.user['location'], 'demo_data': bool(demo), 'area_radius_km': 50}


@app.get('/api/donations')
def donations():
    with connect() as conn:
        data = rows(conn, 'SELECT * FROM donations ORDER BY expires_at')
    data = [item for item in data if in_area(item)]
    for item in data:
        item['allergens'] = json.loads(item['allergens'])
        item['vegetarian'] = bool(item['vegetarian'])
    return data


@app.post('/api/donations', status_code=201)
def add_donation(body: DonationInput):
    if not in_area(body.model_dump()):
        raise HTTPException(422, 'Choose a pickup within 50 km of your workspace location.')
    ident = 'd-' + uuid.uuid4().hex[:12]
    expires = (datetime.now(timezone.utc) + timedelta(minutes=body.pickup_within_minutes)).isoformat()
    with connect() as conn:
        conn.execute('INSERT INTO donations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                     (ident, body.donor, body.food, body.category, body.portions, body.portions,
                      json.dumps(sorted(set(body.allergens))), int(body.vegetarian), body.address,
                      body.lat, body.lng, expires, now(), body.note))
    return {'id': ident}


@app.get('/api/recipients')
def recipients():
    with connect() as conn:
        data = rows(conn, 'SELECT * FROM recipients ORDER BY name')
    data = [item for item in data if in_area(item)]
    for item in data:
        item['excluded_allergens'] = json.loads(item['excluded_allergens'])
        item['vegetarian_only'] = bool(item['vegetarian_only'])
    return data


@app.post('/api/runs', status_code=202)
def start_run(body: RunInput, tasks: BackgroundTasks):
    status = readiness()
    if not status['ready']:
        raise HTTPException(503, status['detail'])
    food, partners = snapshot()
    if not food or not partners:
        raise HTTPException(409, 'Add surplus food and at least one receiving partner before running the agent.')
    ident = 'run-' + uuid.uuid4().hex[:12]
    with connect() as conn:
        conn.execute('BEGIN IMMEDIATE')
        if conn.execute("SELECT id FROM runs WHERE status='running'").fetchone():
            raise HTTPException(409, 'A planning run is already in progress')
        conn.execute('INSERT INTO runs(id,status,mode,created_at,instructions,radius_km) VALUES (?,?,?,?,?,?)',
                     (ident, 'running', mode(), now(), body.instructions, body.radius_km))
        conn.execute('UPDATE runs SET model_id=? WHERE id=?', (status['model_id'], ident))
    tasks.add_task(execute_run, ident, workspace_path.get())
    return {'id': ident, 'status': 'running'}


@app.get('/api/runs')
def list_runs():
    with connect() as conn:
        return rows(conn, 'SELECT id,status,mode,created_at,summary,error FROM runs ORDER BY created_at DESC LIMIT 50')


@app.get('/api/runs/{run_id}')
def run_detail(run_id: str):
    with connect() as conn:
        return get_run(conn, run_id)


@app.post('/api/runs/{run_id}/approve')
def approve(run_id: str):
    with connect() as conn:
        conn.execute('BEGIN IMMEDIATE')
        run = get_run(conn, run_id)
        if run['status'] == 'dispatched':
            return {'status': 'dispatched', 'missions': rows(conn, 'SELECT * FROM missions WHERE run_id=?', (run_id,))}
        if run['status'] != 'ready' or not run['plan']:
            raise HTTPException(409, 'Only a ready plan can be approved')
        if run['plan'].get('area') != area_location():
            raise HTTPException(409, 'The workspace location changed. Create a fresh plan for this area.')
        if not run['plan']['allocations']:
            raise HTTPException(409, 'No feasible pickups. Add fresh donations or change the radius.')
        for a in run['plan']['allocations']:
            d = dict(conn.execute('SELECT * FROM donations WHERE id=?', (a['donation_id'],)).fetchone())
            r = dict(conn.execute('SELECT * FROM recipients WHERE id=?', (a['recipient_id'],)).fetchone())
            km = distance(d, r)
            minutes_left = (datetime.fromisoformat(d['expires_at']) - datetime.now(timezone.utc)).total_seconds() / 60
            if (d['remaining'] < a['portions'] or r['remaining_capacity'] < a['portions']
                or not compatible(d, r) or km > run['radius_km'] or eta(km) >= minutes_left):
                raise HTTPException(409, 'The plan is stale: inventory, capacity, or pickup window changed. Run the agent again.')
            conn.execute('UPDATE donations SET remaining=remaining-? WHERE id=?', (a['portions'], d['id']))
            conn.execute('UPDATE recipients SET remaining_capacity=remaining_capacity-? WHERE id=?', (a['portions'], r['id']))
            conn.execute('INSERT INTO missions VALUES (?,?,?,?,?,?,?,?,?,?)',
                         ('trip-' + uuid.uuid4().hex[:10], run_id, d['id'], r['id'], a['portions'], km,
                          eta(km), 'scheduled', now(), None))
        conn.execute("UPDATE runs SET status='dispatched' WHERE id=?", (run_id,))
        conn.execute('INSERT INTO events(run_id,tool,title,detail,created_at) VALUES (?,?,?,?,?)',
                     (run_id, 'approval', 'Pickup manifests created', 'Coordinator approved. Inventory and recipient capacity reserved atomically. No external messages sent.', now()))
        return {'status': 'dispatched', 'missions': rows(conn, 'SELECT * FROM missions WHERE run_id=?', (run_id,))}


@app.get('/api/missions')
def missions():
    with connect() as conn:
        return rows(conn, '''SELECT m.*, d.donor,d.food,d.address AS pickup_address,d.note,d.allergens,
                    r.name AS recipient,r.address AS dropoff_address
                    FROM missions m JOIN donations d ON m.donation_id=d.id
                    JOIN recipients r ON m.recipient_id=r.id ORDER BY m.created_at DESC,m.id''')


@app.post('/api/missions/{mission_id}/complete')
def complete_mission(mission_id: str):
    with connect() as conn:
        conn.execute('BEGIN IMMEDIATE')
        mission = conn.execute('SELECT * FROM missions WHERE id=?', (mission_id,)).fetchone()
        if mission is None:
            raise HTTPException(404, 'Pickup not found')
        if mission['status'] == 'completed':
            return {'status': 'completed'}
        conn.execute("UPDATE missions SET status='completed',completed_at=? WHERE id=?", (now(), mission_id))
        conn.execute('INSERT INTO events(run_id,tool,title,detail,created_at) VALUES (?,?,?,?,?)',
                     (mission['run_id'], 'handoff', 'Handoff confirmed by coordinator', f'{mission["portions"]} portions marked delivered. Operator-reported, not independently verified.', now()))
    return {'status': 'completed'}


@app.get('/api/missions/export.csv')
def export_missions():
    output = io.StringIO(newline='')
    writer = csv.writer(output)
    columns = ['id', 'donor', 'food', 'recipient', 'portions', 'pickup_address', 'dropoff_address', 'eta_minutes', 'status', 'completed_at']
    writer.writerow(columns)
    for mission in missions():
        # Prevent spreadsheet formula execution in user-supplied text.
        writer.writerow([("'" + str(mission[c])) if isinstance(mission[c], str) and mission[c].lstrip().startswith(('=', '+', '-', '@')) else mission[c] for c in columns])
    return Response(output.getvalue(), media_type='text/csv', headers={'Content-Disposition': 'attachment; filename="second-serve-manifests.csv"'})


@app.get('/api/runs/{run_id}/manifest')
def manifest(run_id: str):
    with connect() as conn:
        run = get_run(conn, run_id)
        trips = rows(conn, 'SELECT * FROM missions WHERE run_id=?', (run_id,))
    return Response(json.dumps({'run': run, 'missions': trips}, indent=2), media_type='application/json',
                    headers={'Content-Disposition': f'attachment; filename="{run_id}.json"'})


class RecipientInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')
    name: str = Field(min_length=2, max_length=120)
    address: str = Field(min_length=3, max_length=200)
    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    lng: float = Field(ge=-180, le=180, allow_inf_nan=False)
    capacity: int = Field(ge=1, le=10000, strict=True)
    vegetarian_only: bool = False
    excluded_allergens: list[Literal['gluten', 'dairy', 'nuts', 'soy', 'eggs', 'shellfish']] = Field(default_factory=list, max_length=6)
    description: str = Field(default='', max_length=300)


@app.post('/api/recipients', status_code=201)
def add_recipient(body: RecipientInput):
    if not in_area(body.model_dump()):
        raise HTTPException(422, 'Choose a partner within 50 km of your workspace location.')
    ident = 'r-' + uuid.uuid4().hex[:12]
    with connect() as conn:
        conn.execute('INSERT INTO recipients VALUES (?,?,?,?,?,?,?,?,?,?)',
                     (ident, body.name, body.address, body.lat, body.lng, body.capacity, body.capacity,
                      int(body.vegetarian_only), json.dumps(sorted(set(body.excluded_allergens))), body.description))
    return {'id': ident}


@app.post('/api/workspace/sample', status_code=201)
def load_sample(request: Request):
    seed_demo(request.state.user['location'])
    return {'status': 'loaded', 'demo_data': True}


@app.get('/api/map-config')
def map_config():
    return {'tile_url': os.getenv('MAP_TILE_URL', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png')}
