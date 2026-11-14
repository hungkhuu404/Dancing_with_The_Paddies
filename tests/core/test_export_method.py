import sys
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'pipeline' / 'export'))
from s7 import method_metadata, validated_gt30


def test_export_reports_pixel_dual_and_posthoc_status():
    cfg = {'thresholds': {'hh_db': -14., 'hv_db': -20., 'min_valid_pixel_fraction': .7}}
    freeze = {'classification': {'name': 'pixel_fraction_75_dual_50', 'water_fraction': .75,
                                  'fill_min_fraction': .5, 'joint_valid_fraction': .7},
              'selection': {'status': 'post_hoc'},
              'single_anomaly_filter': {'enabled': True}, 'frozen_utc': None}
    assert method_metadata(cfg, freeze) == {'rule': 'Q0', 'hh_db_max': -14., 'hv_db_max': -20.,
        'single_flip_filter': True, 'frozen_utc': None, 'classification': 'pixel_fraction_75_dual_50',
        'water_fraction': .75, 'fill_min_fraction': .5, 'joint_valid_fraction': .7,
        'selection_status': 'post_hoc'}


def test_export_refuses_old_or_inconsistent_method():
    cfg = {'thresholds': {'hh_db': -14., 'hv_db': -20., 'min_valid_pixel_fraction': .7}}
    with pytest.raises(ValueError):
        method_metadata(cfg, {'single_anomaly_filter': {'enabled': True}, 'frozen_utc': None})
    with pytest.raises(ValueError):
        method_metadata(cfg, {'classification': {'name': 'pixel_fraction_75_dual_50', 'water_fraction': .9,
            'fill_min_fraction': .5, 'joint_valid_fraction': .7}, 'selection': {'status': 'post_hoc'},
            'single_anomaly_filter': {'enabled': True}, 'frozen_utc': None})


def test_export_rejects_stale_flag_instead_of_overwriting_it():
    properties = {'cropland': True, 'status': 'flooded', 'flood_days_min': 40,
                  'flood_days_max': 45, 'ongoing': True, 'flag_gt30': 'yes'}
    assert validated_gt30(properties) == 'yes'
    with pytest.raises(ValueError, match='flag_gt30'):
        validated_gt30({**properties, 'flag_gt30': 'no'})


def test_method_schema_requires_honest_pixel_metadata():
    schema = json.loads((Path(__file__).resolve().parents[2] / 'schema' / 'meta.schema.json').read_text(encoding='utf-8'))
    assert schema['properties']['contract_version']['const'] == '2.0.0'
    cfg = {'thresholds': {'hh_db': -14., 'hv_db': -20., 'min_valid_pixel_fraction': .7}}
    frozen = {'classification': {'name': 'pixel_fraction_75_dual_50', 'water_fraction': .75,
                                   'fill_min_fraction': .5, 'joint_valid_fraction': .7},
              'selection': {'status': 'post_hoc'}, 'single_anomaly_filter': {'enabled': True}, 'frozen_utc': None}
    method = method_metadata(cfg, frozen)
    validator = Draft202012Validator(schema['properties']['method'])
    validator.validate(method)
    with pytest.raises(ValidationError):
        validator.validate({**method, 'selection_status': 'independent'})
