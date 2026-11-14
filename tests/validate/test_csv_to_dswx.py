import csv
from pathlib import Path
import sys

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'pipeline/validate'))
from csv_to_dswx import convert

FIELDS = ['cell_id', 'acq_utc', 'acq_local', 'valid', 'water']


def write_rows(path, rows):
    with path.open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def sample_rows():
    return [
        dict(cell_id='b', acq_utc='2026-09-01T00:00:00Z', acq_local='2026-09-01T07:00:00', valid='true', water='true'),
        dict(cell_id='a', acq_utc='2026-09-01T00:00:00Z', acq_local='2026-09-01T07:00:00', valid='false', water=''),
        dict(cell_id='a', acq_utc='2026-09-02T00:00:00Z', acq_local='2026-09-02T07:00:00', valid='true', water='false'),
        dict(cell_id='b', acq_utc='2026-09-02T00:00:00Z', acq_local='2026-09-02T07:00:00', valid='true', water='false'),
    ]


def test_exact_booleans_and_missing_water_are_preserved(tmp_path):
    path = tmp_path/'source.csv'; write_rows(path, sample_rows())
    out = convert(path, 'Asia/Ho_Chi_Minh')
    assert out['cell_id'].tolist() == ['a', 'b']
    assert out['valid'].tolist() == [[False, True], [True, True]]
    assert out['water'].tolist() == [[False, True], [False, False]]
    assert out['TD_utc'].tolist() == ['2026-09-01T00:00:00', '2026-09-02T00:00:00']
    assert 'water13' not in out


@pytest.mark.parametrize('defect', ['duplicate', 'missing', 'invalid_bool', 'time_mismatch'])
def test_invalid_or_incomplete_tables_are_rejected(tmp_path, defect):
    rows = sample_rows()
    if defect == 'duplicate': rows.append(rows[0].copy())
    elif defect == 'missing': rows.pop()
    elif defect == 'invalid_bool': rows[0]['water'] = 'maybe'
    else: rows[0]['acq_local'] = '2026-09-01T08:00:00'
    path = tmp_path/'source.csv'; write_rows(path, rows)
    with pytest.raises(ValueError): convert(path, 'Asia/Ho_Chi_Minh')
