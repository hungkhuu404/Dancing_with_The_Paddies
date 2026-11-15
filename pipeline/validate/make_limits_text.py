"""Render the public limits text by default; --internal adds DSWx-S1 agreement figures.

Agreement after tuning against DSWx-S1 is not independent validation, so the
public limits text carries no agreement numbers.
"""
import argparse
import json
from pathlib import Path

PUBLIC_LIMITS = (
    "We used OPERA DSWx-S1 when choosing the water rules, so it is not an independent "
    "reference for assessing the final maps. DSWx-S1 is a C-band radar product from "
    "Sentinel-1, not field observations, and these maps do not measure accuracy on the ground. "
    "Each NISAR track revisits every 12 days; combining tracks can shorten the spacing, "
    "but sparse images cannot prove continuous flooding between observations. Water-entry "
    "and recession dates are bounded by observations where possible. L-band radar can look "
    "dark on dry, flat, freshly harvested fields, so water arrival may be dated too early "
    "and flood duration too long. Houses and trees along canal banks can raise the radar "
    "signal, so some flooded cells may read as dry. The cropland mask is from ESA WorldCover "
    "2021 and some fields may have changed. The tool does not measure methane or determine "
    "whether a field was sown after the water left."
)


def _number(value, digits=2):
    return 'not available' if value is None else f'{value:.{digits}f}'


def render(v, *, internal=False):
    if not internal:
        return '# Limits\n\n' + PUBLIC_LIMITS + '\n'
    f = v['filtered']
    gt = f['gt30']
    on = f['onset']
    text = (
        '# DSWx-S1 agreement (post-hoc, for review)\n\n'
        'These are agreement figures for review, not independent validation or ground accuracy. '
        'They are post-hoc and must not be presented as accuracy.\n\n'
        f"Pairs: {f['n_pairs']}. Cohen's kappa, median: {_number(f['kappa_median'])}; "
        f"range: {_number(f['kappa_min'])} to {_number(f['kappa_max'])}. "
        f"The >30-day flag has precision {_number(gt['precision'])} and recall {_number(gt['recall'])} "
        f"on {gt['n_cells']} cells. Onset intervals overlap on "
        f"{_number(None if on['overlap_share'] is None else on['overlap_share'] * 100, 1)}% "
        f"of {on['n_cells']} cells; median NISAR-minus-DSWx midpoint difference: "
        f"{_number(on['median_diff_days'], 1)} days. Negative means earlier.\n"
    )
    return text


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('validation', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--internal', action='store_true')
    args = parser.parse_args()
    args.output.write_text(render(json.loads(args.validation.read_text(encoding='utf-8')),
                                  internal=args.internal), encoding='utf-8')
