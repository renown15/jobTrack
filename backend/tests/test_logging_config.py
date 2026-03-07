import importlib
import sys
import logging
from logging import handlers


def _reload_app_module():
    # ensure fresh import so logging is configured from current env
    if "app" in sys.modules:
        del sys.modules["app"]
    return importlib.import_module("app")


def test_file_logging(tmp_path, monkeypatch):
    logpath = tmp_path / "jobtrack_test.log"
    monkeypatch.setenv("JOBTRACK_LOGFILE", str(logpath))
    monkeypatch.setenv("LOG_LEVEL", "DEBUG")
    app_module = _reload_app_module()
    handlers_list = app_module.app.logger.handlers
    assert any(isinstance(h, handlers.RotatingFileHandler) for h in handlers_list)
    found = False
    for h in handlers_list:
        if isinstance(h, handlers.RotatingFileHandler):
            # RotatingFileHandler stores filename in baseFilename
            assert getattr(h, "baseFilename", "") == str(logpath)
            found = True
    assert found


def test_stream_logging(monkeypatch):
    # ensure no logfile env vars
    monkeypatch.delenv("JOBTRACK_LOGFILE", raising=False)
    monkeypatch.delenv("LOGFILE", raising=False)
    monkeypatch.delenv("LOG_PATH", raising=False)
    monkeypatch.setenv("LOG_LEVEL", "INFO")
    app_module = _reload_app_module()
    handlers_list = app_module.app.logger.handlers
    # should have a StreamHandler and not a RotatingFileHandler
    assert any(isinstance(h, logging.StreamHandler) for h in handlers_list)
    assert not any(isinstance(h, handlers.RotatingFileHandler) for h in handlers_list)
