"""Convert exact per-cell DSWx water labels to an S6 NPZ; do not infer class 1+3."""
import argparse
import csv
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np


def convert(path, local_timezone):
    zone = ZoneInfo(local_timezone)
    entries, cells, times, local_times = {}, set(), set(), {}
    with Path(path).open(encoding='utf-8-sig', newline='') as f:
        for row in csv.DictReader(f):
            cell = row['cell_id']
            if not cell:
                raise ValueError('Empty cell_id')
            stamp = datetime.fromisoformat(row['acq_utc'].replace('Z', '+00:00'))
            if stamp.tzinfo is None or stamp.utcoffset().total_seconds() != 0:
                raise ValueError('acq_utc must be UTC')
            local = datetime.fromisoformat(row['acq_local'])
            if local.tzinfo is not None or local != stamp.astimezone(zone).replace(tzinfo=None):
                raise ValueError('acq_local differs from UTC and site timezone')
            valid, water = row['valid'].lower(), row['water'].lower()
            if valid not in ('true', 'false') or (water not in ('true', 'false') if valid == 'true' else water != ''):
                raise ValueError('Invalid valid/water flags')
            utc = stamp.astimezone(timezone.utc).replace(tzinfo=None).isoformat()
            key = (utc, cell)
            if key in entries:
                raise ValueError('Duplicate acquisition/cell')
            entries[key] = (valid == 'true', water == 'true')
            cells.add(cell); times.add(utc); local_times[utc] = local.isoformat()
    ids, dates = sorted(cells), sorted(times)
    if not ids or not dates or len(entries) != len(ids)*len(dates):
        raise ValueError('Empty or incomplete acquisition/cell table')
    return {'cell_id': np.array(ids), 'TD_utc': np.array(dates),
            'TD': np.array([local_times[t] for t in dates]),
            'valid': np.array([[entries[t, c][0] for c in ids] for t in dates], dtype=bool),
            'water': np.array([[entries[t, c][1] for c in ids] for t in dates], dtype=bool)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--csv', type=Path, required=True)
    parser.add_argument('--timezone', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = convert(args.csv, args.timezone)
    with args.output.open('xb') as f:
        np.savez_compressed(f, **result)
    print(f"Converted {len(result['cell_id'])} cells and {len(result['TD_utc'])} acquisitions; class 1+3 unavailable.")


if __name__ == '__main__':
    main()
