"""Tests for the database-mode output folder layout."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

INDEXER = Path(__file__).resolve().parent.parent / 'directory_indexer.py'


def _make_source(tmp_path: Path) -> Path:
    root = tmp_path / 'proj'
    (root / 'sub').mkdir(parents=True)
    (root / 'sub' / 'a.txt').write_text('a')
    return root


def _run_indexer(*args: str) -> None:
    subprocess.run([sys.executable, str(INDEXER), *args], check=True, capture_output=True)


def _assert_archive_at(folder: Path, name: str) -> None:
    assert (folder / 'data' / f'{name}.db').is_file()
    assert (folder / 'data' / f'{name}.html').is_file()
    assert (folder / 'macOS' / 'start-viewer.command').is_file()


def test_default_output_is_not_nested_twice(tmp_path):
    root = _make_source(tmp_path)
    _run_indexer(str(root), '--extdb')

    archive = next(root.glob('index_proj_*'))
    _assert_archive_at(archive, archive.name)


def test_relative_output_is_not_nested_twice(tmp_path):
    root = _make_source(tmp_path)
    _run_indexer(str(root), 'archive.html', '--extdb')

    _assert_archive_at(root / 'archive', 'archive')


def test_absolute_file_output_gets_its_own_folder(tmp_path):
    root = _make_source(tmp_path)
    out_dir = tmp_path / 'exports'
    out_dir.mkdir()
    _run_indexer(str(root), str(out_dir / 'archive.html'), '--extdb')

    _assert_archive_at(out_dir / 'archive', 'archive')
