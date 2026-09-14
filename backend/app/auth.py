"""Local accounts with scrypt passwords and revocable, opaque cookie sessions."""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .db import connect, initialize

router = APIRouter(prefix='/api/auth', tags=['Account'])
COOKIE = 'secondserve_session'


def accounts_path():
    return os.getenv('DATABASE_PATH', 'data/secondserve.db') + '.accounts'


def workspace_file(user_id):
    # IDs are server-generated hex strings, never client-provided path fragments.
    if not re.fullmatch(r'[0-9a-f]{32}', user_id):
        raise ValueError('Invalid account identifier')
    root = Path(os.getenv('DATABASE_PATH', 'data/secondserve.db'))
    return str(root.parent / (root.stem + '-workspaces') / (user_id + '.db'))


def initialize_accounts():
    with connect(accounts_path()) as conn:
        conn.executescript('''
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL, location TEXT, created_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS rate_limits (
          bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS location_cache (
          cache_key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at REAL NOT NULL
        );
        ''')
        # Recover interrupted jobs across existing private workspaces.
        profiles = list(conn.execute('SELECT id,location FROM users'))
    for profile in profiles:
        initialize(workspace_file(profile['id']))
        # The account profile is canonical. Repair interrupted location writes
        # across the two SQLite files during startup.
        if profile['location']:
            with connect(workspace_file(profile['id'])) as conn:
                conn.execute("INSERT OR REPLACE INTO settings VALUES ('location',?)", (profile['location'],))


def limit(bucket, maximum, seconds):
    stamp = time.time()
    with connect(accounts_path()) as conn:
        conn.execute('BEGIN IMMEDIATE')
        record = conn.execute('SELECT * FROM rate_limits WHERE bucket=?', (bucket,)).fetchone()
        if record and record['resets_at'] > stamp and record['count'] >= maximum:
            raise HTTPException(429, 'Too many attempts. Please wait and try again.', headers={'Retry-After': str(max(1, int(record['resets_at']-stamp)))})
        if not record or record['resets_at'] <= stamp:
            conn.execute('INSERT OR REPLACE INTO rate_limits VALUES (?,1,?)', (bucket, stamp+seconds))
        else:
            conn.execute('UPDATE rate_limits SET count=count+1 WHERE bucket=?', (bucket,))
        conn.execute('DELETE FROM rate_limits WHERE resets_at<?', (stamp-86400,))


def public_user(row):
    return {'id': row['id'], 'name': row['name'], 'email': row['email'],
            'location': json.loads(row['location']) if row['location'] else None}


def lookup_session(token):
    if not token or len(token) > 200:
        return None
    with connect(accounts_path()) as conn:
        row = conn.execute('''SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
                            WHERE s.token_hash=? AND s.expires_at>?''',
                           (hashlib.sha256(token.encode()).hexdigest(), time.time())).fetchone()
    return public_user(row) if row else None


def issue_session(response, user_id, old_token=None):
    token = secrets.token_urlsafe(32)
    with connect(accounts_path()) as conn:
        conn.execute('DELETE FROM sessions WHERE expires_at<?', (time.time(),))
        if old_token:
            conn.execute('DELETE FROM sessions WHERE token_hash=?', (hashlib.sha256(old_token.encode()).hexdigest(),))
        conn.execute('INSERT INTO sessions VALUES (?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), user_id, time.time()+7*86400))
    response.set_cookie(COOKIE, token, max_age=7*86400, httponly=True, samesite='lax',
                        secure=os.getenv('COOKIE_SECURE', 'false').lower() == 'true', path='/')


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    derived = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1, dklen=32).hex()
    return salt + ':' + derived


class Credentials(BaseModel):
    model_config = ConfigDict(extra='forbid')
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=10, max_length=128)

    @field_validator('email')
    @classmethod
    def normalize_email(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value):
            raise ValueError('Enter a valid email address')
        return value


class Registration(Credentials):
    name: str = Field(min_length=2, max_length=80)

    @field_validator('name')
    @classmethod
    def clean_name(cls, value):
        if len(value.strip()) < 2:
            raise ValueError('Enter your name')
        return value.strip()


class LocationInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    name: str = Field(min_length=2, max_length=150)
    label: str = Field(min_length=2, max_length=300)
    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    lng: float = Field(ge=-180, le=180, allow_inf_nan=False)
    country: str = Field(default='', max_length=100)
    country_code: str = Field(default='', max_length=3)
    source: str = Field(default='manual', pattern='^(open-meteo|device|manual)$')


@router.post('/register', status_code=201)
def register(body: Registration, request: Request, response: Response):
    ip = request.client.host if request.client else 'local'
    limit('register:' + ip, 20, 900)
    ident = secrets.token_hex(16)
    hashed = password_hash(body.password)
    try:
        with connect(accounts_path()) as conn:
            conn.execute('INSERT INTO users VALUES (?,?,?,?,NULL,?)', (ident, body.name, body.email, hashed, time.time()))
    except sqlite3.IntegrityError:
        raise HTTPException(409, 'Unable to create this account. Try signing in or use another email.')
    initialize(workspace_file(ident))
    issue_session(response, ident, request.cookies.get(COOKIE))
    return {'user': {'id': ident, 'name': body.name, 'email': body.email, 'location': None}}


@router.post('/login')
def login(body: Credentials, request: Request, response: Response):
    ip = request.client.host if request.client else 'local'
    limit('login-ip:' + ip, 30, 900)
    limit('login-email:' + hashlib.sha256(body.email.encode()).hexdigest(), 10, 900)
    with connect(accounts_path()) as conn:
        row = conn.execute('SELECT * FROM users WHERE email=?', (body.email,)).fetchone()
    stored = row['password_hash'] if row else '00'*16 + ':' + '00'*32
    expected = password_hash(body.password, stored.split(':')[0])
    if not row or not hmac.compare_digest(expected, stored):
        raise HTTPException(401, 'Email or password is incorrect.')
    issue_session(response, row['id'], request.cookies.get(COOKIE))
    return {'user': public_user(row)}


@router.get('/me')
def me(request: Request):
    return {'user': request.state.user}


@router.post('/logout')
def logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE, '')
    with connect(accounts_path()) as conn:
        conn.execute('DELETE FROM sessions WHERE token_hash=?', (hashlib.sha256(token.encode()).hexdigest(),))
    response.delete_cookie(COOKIE, path='/')
    return {'status': 'signed_out'}


@router.post('/location')
def save_location(body: LocationInput, request: Request):
    user = request.state.user
    location = body.model_dump()
    # Keep profile and planner updates in the same request transaction.
    with connect(accounts_path()) as conn:
        conn.execute('ATTACH DATABASE ? AS workspace', (workspace_file(user['id']),))
        conn.execute('BEGIN IMMEDIATE')
        if conn.execute("SELECT id FROM workspace.runs WHERE status='running'").fetchone():
            raise HTTPException(409, 'Wait for the current rescue plan to finish before changing location.')
        conn.execute('UPDATE users SET location=? WHERE id=?', (json.dumps(location), user['id']))
        conn.execute("INSERT OR REPLACE INTO workspace.settings VALUES ('location',?)", (json.dumps(location),))
    return {'user': user | {'location': location}}
