"""Tests for CLI behavior and file metadata collection."""

from __future__ import annotations

import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import pytest

from src.core.scanner import DirectoryScanner
from src.utils import formatting
from src.utils.formatting import format_timestamp

INDEXER = Path(__file__).resolve().parent.parent / 'directory_indexer.py'


def _make_source(tmp_path: Path) -> Path:
    root = tmp_path / 'proj'
    root.mkdir()
    (root / 'a.txt').write_text('a')
    return root


def _run(*args: str, cwd: Path | None = None) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(INDEXER), *args], cwd=cwd, capture_output=True, text=True)


def test_relative_root_uses_real_folder_name(tmp_path):
    root = _make_source(tmp_path)
    out = tmp_path / 'out.html'
    assert _run('.', str(out), '--json', cwd=root).returncode == 0

    html = out.read_text(encoding='utf-8')
    assert '<title>Directory Index: proj</title>' in html
    assert str(root.resolve()) in html


def test_json_output_creates_missing_parent_folder(tmp_path):
    root = _make_source(tmp_path)
    out = tmp_path / 'not' / 'yet' / 'there.html'
    result = _run(str(root), str(out), '--json')

    assert result.returncode == 0, result.stderr
    assert out.is_file()


def test_json_and_extdb_flags_are_rejected_together(tmp_path):
    root = _make_source(tmp_path)
    result = _run(str(root), '--json', '--extdb')

    assert result.returncode == 2
    assert 'not allowed with' in result.stderr


@pytest.mark.skipif(not hasattr(os.stat_result, 'st_birthtime'), reason='needs file creation times')
def test_created_is_creation_time_not_modification_time(tmp_path):
    root = _make_source(tmp_path)
    # Move the modification time forward (macOS also moves creation time back
    # if a file's modification time is set earlier than it)
    later = datetime(2040, 2, 3, 4, 5, 6).timestamp()
    os.utime(root / 'a.txt', (later, later))

    info = DirectoryScanner(str(root)).scan().files_data[0].to_dict()
    assert info['modified'] == '2040-02-03 04:05:06'
    assert not info['created'].startswith('2040')


def test_timestamps_the_platform_cannot_convert_still_format(monkeypatch):
    class WindowsLikeDatetime(datetime):
        @classmethod
        def fromtimestamp(cls, ts, tz=None):
            if ts < 0:
                raise OSError(22, 'Invalid argument')  # what Windows does before 1970
            return super().fromtimestamp(ts, tz)

    monkeypatch.setattr(formatting, 'datetime', WindowsLikeDatetime)
    assert format_timestamp(-86400) == '1969-12-31 00:00:00'
