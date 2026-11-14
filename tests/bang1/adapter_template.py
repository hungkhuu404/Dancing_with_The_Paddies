"""Tân fills in imports and delegates to actual S4/S5 functions.

This is a proposed test interface, not a change to the team's file contract.
Do not replace calls with hardcoded fixture results or an alternate algorithm.
"""


def classify(hh_db, hv_db, valid, hh_threshold_db=-14.0, hv_threshold_db=-20.0):
    """One observation -> Python string W/N/-. Map invalid None to your API."""
    raise NotImplementedError('Connect to actual S4 classifier')


def filter_states(s_raw):
    """Chronologically sorted string W/N/- -> same-length filtered string.

    If core uses numeric codes, map -=0, N=1, W=2 in both directions.
    """
    raise NotImplementedError('Connect to actual S4 simultaneous filter')


def compute_metrics(acquisitions, s, cropland):
    """S5 only; s is already filtered. Return a dict with spec English keys.

    acquisitions: list of {acq_utc: ISO UTC string, track: string}.
    s: same-length W/N/- string. cropland: bool or None (sample stub).
    Return native Python values, including bool and None, not CSV strings.
    Pass cropland to the actual flag calculation, wherever the pipeline owns it.
    Do not run the S4 filter here. Do not recalculate metrics in this adapter.
    """
    raise NotImplementedError('Connect to actual S5 metrics and flag calculation')
