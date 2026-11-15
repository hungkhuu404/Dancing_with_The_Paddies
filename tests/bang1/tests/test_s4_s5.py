"""Independent expected values; synthetic inputs only."""
import copy
import json
from datetime import datetime
from pathlib import Path

import pytest

CASES = Path(__file__).resolve().parents[1] / 'cases'


def load(name):
    return json.loads((CASES / f'{name}.json').read_text(encoding='utf-8'))


@pytest.mark.parametrize('case', load('classify'), ids=lambda c: c['id'])
def test_classification(tan_adapter, case):
    assert tan_adapter.classify(**copy.deepcopy(case['input'])) == case['expected']


@pytest.mark.parametrize('case', load('filter'), ids=lambda c: c['id'])
def test_filter(tan_adapter, case):
    assert tan_adapter.filter_states(case['input']) == case['expected']


@pytest.mark.parametrize('case', load('metrics'), ids=lambda c: c['id'])
def test_metrics(tan_adapter, case):
    # s is ALREADY filtered. Do not filter a second time: simultaneous filtering
    # is not necessarily idempotent. Adapter calls S5 directly.
    actual = tan_adapter.compute_metrics(**copy.deepcopy(case['input']))
    assert isinstance(actual, dict)
    for key, expected in case['expected'].items():
        assert key in actual, f"{case['id']}: missing {key}"
        if isinstance(expected, bool):
            assert actual[key] is expected, (key, actual[key], expected)
        elif isinstance(expected, float):
            assert isinstance(actual[key], (int, float)) and not isinstance(actual[key], bool), key
            assert actual[key] == pytest.approx(expected, rel=0, abs=1e-8), key
        elif isinstance(expected, int):
            assert type(actual[key]) is int, (key, actual[key])
            assert actual[key] == expected, (key, actual[key], expected)
        elif expected is None:
            assert actual[key] is None, (key, actual[key])
        else:
            assert actual[key] == expected, (key, actual[key], expected)
    if actual.get('flood_days_min') is not None and actual.get('flood_days_max') is not None:
        assert actual['flood_days_min'] <= actual['flood_days_max']
    if actual.get('onset_after_local') and actual.get('onset_by_local'):
        assert actual['onset_after_local'] < actual['onset_by_local']


@pytest.mark.parametrize('name', ['classify', 'filter', 'metrics'])
def test_fixture_integrity(name):
    """Validate fixture data only. Passing this does not validate the pipeline code."""
    cases = load(name)
    assert len({c['id'] for c in cases}) == len(cases)
    for case in cases:
        assert set(case) == {'id', 'input', 'expected'}
        if name == 'filter':
            assert len(case['input']) == len(case['expected'])
            assert set(case['input']) <= set('WN-')
            assert set(case['expected']) <= set('WN-')
            assert [i for i, x in enumerate(case['input']) if x == '-'] == [i for i, x in enumerate(case['expected']) if x == '-']
        elif name == 'metrics':
            obs = case['input']['acquisitions']
            assert len(obs) == len(case['input']['s'])
            times = [datetime.fromisoformat(a['acq_utc'].replace('Z', '+00:00')) for a in obs]
            assert times == sorted(set(times))
            assert set(case['input']['s']) <= set('WN-')
            for key in ('flood_days_min', 'flood_days_max', 'max_gap_days'):
                if key in case['expected'] and case['expected'][key] is not None:
                    assert case['expected'][key] >= 0
