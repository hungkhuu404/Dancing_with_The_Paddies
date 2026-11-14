from urllib.error import HTTPError

import pytest

import read_cache


@pytest.mark.parametrize("status,expected_calls,exception", [(401, 1, PermissionError), (403, 1, PermissionError), (404, 1, None), (503, 3, None)])
def test_http_failures_are_classified_without_leaking_urls(tmp_path, monkeypatch, capsys, status, expected_calls, exception):
    cfg = {"read": {"network_retries": 2}}
    row = dict(track="047", direction="D", frame="083", acq_utc="2026-01-01T00:00:00Z", date_local="2026-01-01", crid="P05023", granule="g")
    monkeypatch.setattr(read_cache, "load_inputs", lambda *args: (cfg, [row], tmp_path))
    calls = []
    def failure(*args, **kwargs):
        calls.append(True)
        raise HTTPError("https://example.invalid/?private-signature=DO_NOT_LOG", status, "DO_NOT_LOG", {}, None)
    monkeypatch.setattr(read_cache, "read_acquisition", failure)
    monkeypatch.setattr(read_cache.time, "sleep", lambda seconds: None)
    if exception:
        with pytest.raises(exception):
            read_cache.read_batch("unused", tmp_path / "out")
    else:
        result = read_cache.read_batch("unused", tmp_path / "out")
        assert result["skipped"][0]["detail"] == "HTTPError"
    assert len(calls) == expected_calls
    assert "DO_NOT_LOG" not in capsys.readouterr().out
