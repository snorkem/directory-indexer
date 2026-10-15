"""Tests for the virtual scroll window calculation (templates/js/table/virtualScroll.js)."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parent.parent / 'templates' / 'js' / 'table' / 'virtualScroll.js'

pytestmark = pytest.mark.skipif(shutil.which('node') is None, reason='node is required for JS tests')


def _window(scroll_top: float, viewport: float, row_height: float, rows: int, buffer: int = 10) -> dict:
    program = (
        SCRIPT.read_text()
        + f'\nconsole.log(JSON.stringify(computeVirtualWindow({scroll_top}, {viewport}, {row_height}, {rows}, {buffer})));'
    )
    out = subprocess.run(['node', '-e', program], check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def _row_top(w: dict, index: int, row_height: float) -> float:
    return w['topSpacer'] + (index - w['start']) * row_height


def test_rows_line_up_with_scroll_position():
    w = _window(scroll_top=4900, viewport=585, row_height=49, rows=1000)
    assert w['start'] == 90
    assert _row_top(w, 100, 49) == 4900
    assert w['topSpacer'] + (w['end'] - w['start']) * 49 + w['bottomSpacer'] == 1000 * 49


def test_one_pixel_of_scroll_moves_rows_one_pixel():
    a = _window(scroll_top=1567, viewport=585, row_height=49, rows=1000)
    b = _window(scroll_top=1568, viewport=585, row_height=49, rows=1000)
    # Whichever row is at the top, its on-screen position moves with the scroll
    assert _row_top(b, 32, 49) - 1568 == _row_top(a, 32, 49) - 1567 - 1


def test_huge_lists_are_capped_and_the_last_row_is_reachable():
    rows, h, viewport = 2_000_000, 49, 585
    top = _window(scroll_top=0, viewport=viewport, row_height=h, rows=rows)
    assert top['totalHeight'] == 15_000_000
    bottom = _window(scroll_top=15_000_000 - viewport, viewport=viewport, row_height=h, rows=rows)
    assert bottom['end'] == rows
    assert bottom['bottomSpacer'] == 0
    # Last row ends at the bottom edge of the scrollable area
    assert _row_top(bottom, rows, h) == pytest.approx(15_000_000)


def test_empty_list():
    w = _window(scroll_top=0, viewport=585, row_height=49, rows=0)
    assert (w['start'], w['end'], w['topSpacer'], w['bottomSpacer']) == (0, 0, 0, 0)
