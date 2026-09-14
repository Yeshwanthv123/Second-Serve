import json
import os
import sqlite3
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
from pathlib import Path


workspace_path = ContextVar('workspace_path', default=None)


def now():
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def connect(path=None):
    path = path or workspace_path.get() or os.getenv("DATABASE_PATH", "data/secondserve.db")
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def rows(conn, sql, args=()):
    return [dict(row) for row in conn.execute(sql, args).fetchall()]


def initialize(path=None):
    with connect(path) as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript('''
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS donations (
          id TEXT PRIMARY KEY, donor TEXT NOT NULL, food TEXT NOT NULL,
          category TEXT NOT NULL, portions INTEGER NOT NULL CHECK(portions > 0),
          remaining INTEGER NOT NULL CHECK(remaining >= 0), allergens TEXT NOT NULL,
          vegetarian INTEGER NOT NULL, address TEXT NOT NULL,
          lat REAL NOT NULL, lng REAL NOT NULL, expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL, note TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS recipients (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL,
          lat REAL NOT NULL, lng REAL NOT NULL, capacity INTEGER NOT NULL,
          remaining_capacity INTEGER NOT NULL CHECK(remaining_capacity >= 0),
          vegetarian_only INTEGER NOT NULL, excluded_allergens TEXT NOT NULL,
          description TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS runs (
          id TEXT PRIMARY KEY, status TEXT NOT NULL, mode TEXT NOT NULL,
          created_at TEXT NOT NULL, completed_at TEXT, instructions TEXT NOT NULL,
          radius_km REAL NOT NULL, summary TEXT, plan TEXT, error TEXT
        );
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL REFERENCES runs(id),
          tool TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS missions (
          id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
          donation_id TEXT NOT NULL REFERENCES donations(id),
          recipient_id TEXT NOT NULL REFERENCES recipients(id),
          portions INTEGER NOT NULL, distance_km REAL NOT NULL, eta_minutes INTEGER NOT NULL,
          status TEXT NOT NULL, created_at TEXT NOT NULL, completed_at TEXT
        );
        ''')
        columns = {row['name'] for row in conn.execute('PRAGMA table_info(runs)')}
        for name, declaration in [('model_id','TEXT'), ('model_calls','INTEGER NOT NULL DEFAULT 0'), ('elapsed_ms','INTEGER')]:
            if name not in columns:
                conn.execute(f'ALTER TABLE runs ADD COLUMN {name} {declaration}')
        # A stopped process must never leave a run permanently spinning.
        conn.execute("UPDATE runs SET status='failed', error='Server restarted during planning. Start a new run.' WHERE status='running'")


def event(run_id, tool, title, detail):
    with connect() as conn:
        conn.execute("INSERT INTO events(run_id,tool,title,detail,created_at) VALUES (?,?,?,?,?)", (run_id, tool, title, detail, now()))


def area_location():
    with connect() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key='location'").fetchone()
    return json.loads(row['value']) if row else None


def sample_point(location, lat, lng):
    # Fictional points relative to the chosen area. They are never represented as
    # geocoded businesses. Spherical offsets also work near poles/date lines.
    import math
    north, east = (lat-12.975)*111, (lng-77.635)*108
    angle = math.hypot(north, east)/6371
    bearing = math.atan2(east, north)
    origin = math.radians(location['lat'])
    dest = math.asin(math.sin(origin)*math.cos(angle)+math.cos(origin)*math.sin(angle)*math.cos(bearing))
    lon = math.radians(location['lng'])+math.atan2(math.sin(bearing)*math.sin(angle)*math.cos(origin),math.cos(angle)-math.sin(origin)*math.sin(dest))
    return math.degrees(dest), (math.degrees(lon)+540)%360-180


def seed_demo(location):
    from fastapi import HTTPException
    with connect() as conn:
        conn.execute('BEGIN IMMEDIATE')
        if conn.execute('SELECT count(*) FROM donations').fetchone()[0] or conn.execute('SELECT count(*) FROM recipients').fetchone()[0]:
            raise HTTPException(409, 'Sample data can only be loaded into an empty workspace.')
        conn.execute("INSERT OR REPLACE INTO settings VALUES ('demo_data','true')")
        if True:
            recipients = [
                ('r1', 'The Open Table', 'Indiranagar, Bengaluru', 12.976, 77.637, 100, 100, 0, '[]', 'Community dining · lunch & dinner'),
                ('r2', 'Asha Community Kitchen', 'Domlur, Bengaluru', 12.963, 77.638, 80, 80, 1, '["nuts"]', 'Vegetarian kitchen · nut-free meals'),
                ('r3', 'Night Shelter Collective', 'Ulsoor, Bengaluru', 12.986, 77.625, 100, 100, 0, '[]', 'Evening meals · open to all'),
                ('r4', 'Neighbourhood Pantry', 'Koramangala, Bengaluru', 12.941, 77.622, 70, 70, 1, '[]', 'Family pantry · vegetarian food'),
            ]
            for i, row in enumerate(recipients):
                row = list(row)
                row[1] = 'Sample · ' + row[1]
                row[2] = f"Sample community stop {i+1}, {location['name']}"
                row[3], row[4] = sample_point(location, row[3], row[4])
                conn.execute("INSERT INTO recipients VALUES (?,?,?,?,?,?,?,?,?,?)", row)
        if conn.execute("SELECT count(*) FROM donations").fetchone()[0] == 0:
            seeds = [
                ('d1', 'The Flour House', 'Sourdough & morning pastries', 'Bakery', 48, ['gluten', 'dairy'], True, '12th Main, Indiranagar', 12.972, 77.641, 95, 'Packed in paper bags. Collect from the side entrance.'),
                ('d2', 'Green Theory', 'Roasted vegetable grain bowls', 'Prepared meals', 36, [], True, 'Double Road, Indiranagar', 12.978, 77.645, 70, 'Individually packed; donor confirms ready for collection.'),
                ('d3', 'The Daily Harvest', 'Seasonal fruit & vegetable boxes', 'Produce', 64, [], True, 'Cambridge Road, Ulsoor', 12.981, 77.632, 240, 'Fresh produce. Each box is one declared portion.'),
                ('d4', 'Sunday Deli', 'Chicken & rice lunch boxes', 'Prepared meals', 24, [], False, '100 Feet Road, Domlur', 12.961, 77.644, 110, 'Sealed meal boxes. Verify handling conditions at collection.'),
                ('d5', 'Little Millet', 'Millet khichdi & lentil bowls', 'Prepared meals', 42, [], True, '80 Feet Road, Koramangala', 12.946, 77.626, 155, 'Donor-provided pickup window; bring transport crates.'),
                ('d6', 'Common Ground Café', 'Banana bread & oat cookies', 'Bakery', 30, ['gluten', 'nuts'], True, 'CMH Road, Indiranagar', 12.984, 77.642, 180, 'Contains nuts. Ingredients listed on each package.'),
            ]
            for ident, donor, food, category, portions, allergens, veg, address, lat, lng, minutes, note in seeds:
                donor = 'Sample · ' + donor
                address = f"Sample pickup {ident}, {location['name']}"
                lat, lng = sample_point(location, lat, lng)
                expires = (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()
                conn.execute("INSERT INTO donations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (ident, donor, food, category, portions, portions, json.dumps(allergens), int(veg), address, lat, lng, expires, now(), note))
