"""Cached, user-initiated city lookup; no keys or IP geolocation required."""
import hashlib
import json
import os
import time

import httpx
from fastapi import APIRouter, HTTPException, Query, Request

from .auth import accounts_path, limit
from .db import connect

router = APIRouter(prefix='/api/locations', tags=['Locations'])


@router.get('/search')
def search(request: Request, q: str = Query(min_length=2, max_length=100)):
    query = q.strip()
    if len(query) < 2:
        raise HTTPException(422, 'Enter at least two characters of a city or postal code.')
    limit('geocode-user:' + request.state.user['id'], 20, 60)
    key = hashlib.sha256(query.casefold().encode()).hexdigest()
    with connect(accounts_path()) as conn:
        row = conn.execute('SELECT value FROM location_cache WHERE cache_key=? AND expires_at>?', (key, time.time())).fetchone()
    if row:
        return json.loads(row['value'])
    # Conservative application-wide caps for the free non-commercial service.
    limit('geocode-minute', 50, 60)
    limit('geocode-hour', 500, 3600)
    limit('geocode-day', 9000, 86400)
    try:
        result = httpx.get(os.getenv('GEOCODING_URL', 'https://geocoding-api.open-meteo.com/v1/search'),
                           params={'name': query, 'count': 6, 'language': 'en', 'format': 'json'},
                           headers={'User-Agent': 'SecondServe/2.0 (community food rescue prototype)'}, timeout=12)
        result.raise_for_status()
        data = result.json()
        if not isinstance(data, dict):
            raise ValueError('Invalid provider response')
        if data.get('error'):
            raise ValueError('Provider returned an error')
        places = []
        for item in data.get('results', []):
            lat, lng = float(item['latitude']), float(item['longitude'])
            if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                continue
            parts = list(dict.fromkeys(p for p in [item['name'], item.get('admin1'), item.get('country')] if p))
            places.append({'name': item['name'], 'label': ', '.join(parts), 'lat': lat, 'lng': lng,
                           'country': item.get('country', ''), 'country_code': item.get('country_code', ''), 'source': 'open-meteo'})
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        raise HTTPException(503, 'City search is unavailable right now. Try again, use your device location, or enter coordinates manually.')
    payload = {'results': places, 'provider': 'Open-Meteo', 'attribution': 'Location data by GeoNames via Open-Meteo'}
    with connect(accounts_path()) as conn:
        conn.execute('INSERT OR REPLACE INTO location_cache VALUES (?,?,?)', (key, json.dumps(payload), time.time()+86400))
        conn.execute('DELETE FROM location_cache WHERE expires_at<?', (time.time(),))
        conn.execute('DELETE FROM location_cache WHERE cache_key NOT IN (SELECT cache_key FROM location_cache ORDER BY expires_at DESC LIMIT 1000)')
    return payload
