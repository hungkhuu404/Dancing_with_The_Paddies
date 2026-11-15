import json
import sys
from argparse import Namespace
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'pipeline/validate'))
import run_s6
import dswx
import landcover


def inputs():
    cube = dict(cell_id=np.array(['a','b']), acq_utc=np.array(['2026-09-01T00:00:00Z']),
                track=np.array(['047D']), s=np.array([[1,2]]), s_raw=np.array([[1,2]]))
    dsw = dict(cell_id=np.array(['b','a']), TD_utc=np.array(['2026-09-01T00:00:00']),
               TD=np.array(['2026-09-01T07:00:00']), valid=np.array([[True,True]]),
               water=np.array([[True,False]]), water13=np.array([[True,False]]))
    return cube, dsw


def test_same_grid_can_arrive_in_different_order():
    run_s6.validate_inputs(*inputs())


def test_water13_is_optional_for_primary_open_water_comparison():
    cube, dsw = inputs()
    del dsw['water13']
    run_s6.validate_inputs(cube, dsw)


@pytest.mark.parametrize('bad', ['duplicates', 'different_grid', 'bad_state', 'wrong_shape'])
def test_reject_incompatible_inputs(bad):
    cube, dsw = inputs()
    if bad == 'duplicates':
        dsw['cell_id'] = np.array(['a','a'])
    elif bad == 'different_grid':
        dsw['cell_id'] = np.array(['a','c'])
    elif bad == 'bad_state':
        cube['s'][0,0] = 3
    elif bad == 'wrong_shape':
        dsw['water'] = np.array([[True]])
    with pytest.raises(ValueError):
        run_s6.validate_inputs(cube, dsw)


def test_duplicate_csv_rows_rejected(tmp_path):
    p = tmp_path/'rows.csv'
    p.write_text('cell_id,value\na,1\na,2\n')
    with pytest.raises(ValueError, match='Duplicate'):
        run_s6.read_csv(p)


def test_published_data_is_not_an_output_target():
    args = Namespace(output_dir=run_s6.REPO/'data/tan_hoi')
    with pytest.raises(ValueError, match='cannot publish'):
        run_s6.protect_output(args)


@pytest.mark.parametrize('loader', [dswx.load_config, landcover.load_config])
def test_reader_paths_follow_config_not_caller_cwd(tmp_path, monkeypatch, loader):
    cfg_file = tmp_path/'with spaces'/'site.toml'
    cfg_file.parent.mkdir()
    cfg_file.write_text('site = "test"\n')
    monkeypatch.chdir(tmp_path)
    cfg = loader(cfg_file)
    assert cfg['_base'] == cfg_file.parent


def test_posthoc_options_must_be_paired():
    with pytest.raises(SystemExit) as error:
        run_s6.main(['--cube','c','--metrics','m','--dswx','d','--landcover','l',
                     '--gate','g','--output-dir','out','--posthoc-entry','p'])
    assert error.value.code == 2
