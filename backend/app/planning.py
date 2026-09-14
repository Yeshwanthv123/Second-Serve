"""Deterministic constraints shared by Strands tools and approval validation."""
import json
import math
from datetime import datetime, timezone

from .db import connect, rows, area_location


def distance(a, b):
    lat1, lat2 = math.radians(a['lat']), math.radians(b['lat'])
    dlat = lat2 - lat1
    dlng = math.radians(b['lng'] - a['lng'])
    x = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return round(6371 * 2 * math.asin(min(1, math.sqrt(x))) * 1.35, 2)


def eta(km):
    return math.ceil(km / 18 * 60) + 8


def compatible(donation, recipient):
    return (not recipient['vegetarian_only'] or donation['vegetarian']) and not (
        set(json.loads(donation['allergens'])) & set(json.loads(recipient['excluded_allergens']))
    )


def in_area(record):
    area = area_location()
    return not area or distance(record, area) / 1.35 <= 50


def snapshot():
    with connect() as conn:
        donations = rows(conn, "SELECT * FROM donations WHERE remaining>0 ORDER BY expires_at")
        recipients = rows(conn, "SELECT * FROM recipients ORDER BY id")
        return [d for d in donations if in_area(d)], [r for r in recipients if in_area(r)]


def make_plan(radius_km, priority_recipient_id=''):
    donations, recipients = snapshot()
    if priority_recipient_id and not any(r['id'] == priority_recipient_id for r in recipients):
        raise ValueError('Priority recipient must be an ID from inspect_recipient_needs. Use an empty string for no preference.')
    capacity = {r['id']: r['remaining_capacity'] for r in recipients}
    allocations, skipped = [], []
    current = datetime.now(timezone.utc)
    for d in donations:
        remaining = d['remaining']
        minutes_left = (datetime.fromisoformat(d['expires_at']) - current).total_seconds() / 60
        candidates = sorted(recipients, key=lambda r: (bool(priority_recipient_id) and r['id'] != priority_recipient_id, distance(d, r)))
        for r in candidates:
            km = distance(d, r)
            if not compatible(d, r) or km > radius_km or eta(km) >= minutes_left:
                continue
            portions = min(remaining, capacity[r['id']])
            if portions <= 0:
                continue
            allocations.append({
                'donation_id': d['id'], 'recipient_id': r['id'], 'donor': d['donor'],
                'food': d['food'], 'recipient': r['name'], 'portions': portions,
                'distance_km': km, 'eta_minutes': eta(km),
                'reason': ('Coordinator-preferred partner; capacity, diet, deadline and radius checked.' if r['id'] == priority_recipient_id else 'Earliest pickup deadline first; nearest compatible recipient with available capacity.'),
                'expires_at': d['expires_at'],
                'pickup': {'lat': d['lat'], 'lng': d['lng'], 'address': d['address']},
                'dropoff': {'lat': r['lat'], 'lng': r['lng'], 'address': r['address']},
            })
            remaining -= portions
            capacity[r['id']] -= portions
            if remaining == 0:
                break
        if remaining:
            skipped.append({'donor': d['donor'], 'portions': remaining,
                            'reason': 'No match within pickup window, radius, dietary rules, and remaining capacity.'})
    return {'area': area_location(), 'allocations': allocations, 'skipped': skipped, 'priority_recipient_id': priority_recipient_id,
            'total_portions': sum(a['portions'] for a in allocations),
            'total_km': round(sum(a['distance_km'] for a in allocations), 2),
            'method': 'Earliest deadline first; preferred partner when feasible, then nearest compatible recipient. Separate trips, not fleet routing.',
            'estimates': 'Distance = straight-line × 1.35. ETA = distance / 18 km/h + 8 min handling. No live traffic.'}
