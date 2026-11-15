"""The adapter is supplied by the pipeline; this suite does not implement S4/S5."""
import importlib.util
import sys
from pathlib import Path

import pytest


def pytest_addoption(parser):
    group = parser.getgroup('bang1')
    group.addoption('--bang1-adapter', help='Python file exporting classify, filter_states, compute_metrics')
    group.addoption('--bang1-require-adapter', action='store_true', help='Fail instead of skipping when no adapter is supplied')


def pytest_configure(config):
    if config.getoption('--bang1-require-adapter') and not config.getoption('--bang1-adapter'):
        raise pytest.UsageError('Protocol suite: supply --bang1-adapter; S4/S5 have NOT been verified')


@pytest.fixture(scope='session')
def tan_adapter(pytestconfig):
    path = pytestconfig.getoption('--bang1-adapter')
    if not path:
        pytest.skip('No adapter supplied; S4/S5 not checked. Use --bang1-adapter PATH')
    path = Path(path).expanduser().resolve()
    if not path.is_file():
        pytest.fail(f'Adapter does not exist: {path}')
    spec = importlib.util.spec_from_file_location('bang1_tan_adapter', path)
    if spec is None or spec.loader is None:
        pytest.fail(f'Cannot import adapter as Python module: {path}')
    module = importlib.util.module_from_spec(spec)
    # Normal Python imports register modules before executing them. Dataclass
    # decorators and annotations in a user's adapter can depend on this.
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    for name in ('classify', 'filter_states', 'compute_metrics'):
        if not callable(getattr(module, name, None)):
            pytest.fail(f'Adapter must export callable {name}')
    return module
