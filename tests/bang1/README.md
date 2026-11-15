# Protocol regression suite

This suite checks the cell-level functions of stages S4 and S5 against fixed expected values. All inputs are synthetic. The expected values were written independently of the implementation.

It has 59 behaviour cases and 3 fixture integrity checks (one per case file):

| Case file | Cases | What is checked |
| --- | --- | --- |
| `cases/classify.json` | 12 | One observation, from cell-mean HH and HV in dB and the thresholds, gives `W`, `N` or `-`. |
| `cases/filter.json` | 17 | The single-flip temporal filter on a sequence of `W`, `N` and `-`. |
| `cases/metrics.json` | 30 | The per-cell metrics and the >30-day flag, from an already filtered sequence. |

The tests call the code through an adapter module that exports `classify`, `filter_states` and `compute_metrics`. `pipeline/core/bang1_adapter.py` maps these to `classify`, `filter_singletons` and `metrics_for_cell` in `pipeline/core/science.py`. `adapter_template.py` documents the interface.

Run from the repository root:

```sh
python -I -m pytest -p no:cacheprovider -q tests/bang1/tests \
  --bang1-adapter pipeline/core/bang1_adapter.py --bang1-require-adapter
```

Without `--bang1-adapter`, the behaviour cases are skipped. With `--bang1-require-adapter` and no adapter, pytest stops with a usage error.

This suite does not test the pixel-fraction rule (75%) or the 50% fill guard. Those tests are in `tests/core/test_pixel_dual.py`.
