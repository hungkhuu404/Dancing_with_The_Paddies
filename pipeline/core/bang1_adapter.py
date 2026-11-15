"""Protocol-suite adapter; all classification, filtering and metrics use the core science module."""
from pathlib import Path
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import science

_SYMBOLS = "-NW"


def classify(hh_db, hv_db, valid, hh_threshold_db=-14.0, hv_threshold_db=-20.0):
    hh = np.array([[hh_db if valid and hh_db is not None else np.nan]], dtype=float)
    hv = np.array([[hv_db if valid and hv_db is not None else np.nan]], dtype=float)
    return _SYMBOLS[int(science.classify(hh, hv, hh_threshold_db, hv_threshold_db)[0, 0])]


def filter_states(s_raw):
    raw = np.array([_SYMBOLS.index(value) for value in s_raw], dtype=np.uint8)[:, None]
    return "".join(_SYMBOLS[int(value)] for value in science.filter_singletons(raw)[:, 0])


def compute_metrics(acquisitions, s, cropland):
    return science.metrics_for_cell(
        [_SYMBOLS.index(value) for value in s],
        [row["acq_utc"] for row in acquisitions],
        [row["track"] for row in acquisitions],
        cropland,
    )
