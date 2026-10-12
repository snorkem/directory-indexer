"""Tests for DirectoryTreeBuilder folder aggregation."""

from __future__ import annotations

from pathlib import Path

from src.core.tree_builder import DirectoryTreeBuilder


def _file(relative_path: str, size: int) -> dict:
    return {'relative_path': relative_path, 'size_bytes': size}


def _build(files: list[dict]) -> dict:
    return DirectoryTreeBuilder(Path('/archive/Root')).build_tree(files)


def test_intermediate_folders_include_nested_files():
    """Folders with only subfolders must still report their descendants' totals."""
    tree = _build([
        _file('root.txt', 1),
        _file('Projects/2024/a.mov', 100),
        _file('Projects/2024/Day1/b.mov', 1000),
    ])

    projects = tree['children']['Projects']
    year = projects['children']['2024']
    day = year['children']['Day1']

    assert (tree['file_count'], tree['total_size']) == (3, 1101)
    assert (projects['file_count'], projects['total_size']) == (2, 1100)
    assert (year['file_count'], year['total_size']) == (2, 1100)
    assert (day['file_count'], day['total_size']) == (1, 1000)


def test_files_attached_only_to_direct_parent():
    """Aggregation must not duplicate file entries into ancestor folders."""
    tree = _build([
        _file('root.txt', 1),
        _file('Projects/2024/a.mov', 100),
        _file('Projects/2024/Day1/b.mov', 1000),
    ])

    projects = tree['children']['Projects']
    year = projects['children']['2024']

    assert [f['relative_path'] for f in tree['files']] == ['root.txt']
    assert projects['files'] == []
    assert [f['relative_path'] for f in year['files']] == ['Projects/2024/a.mov']
    assert [f['relative_path'] for f in year['children']['Day1']['files']] == [
        'Projects/2024/Day1/b.mov'
    ]


def test_sibling_folders_aggregate_independently():
    tree = _build([
        _file('A/x/1.bin', 10),
        _file('A/y/2.bin', 20),
        _file('B/3.bin', 5),
    ])

    a = tree['children']['A']
    b = tree['children']['B']

    assert (a['file_count'], a['total_size']) == (2, 30)
    assert (a['children']['x']['total_size'], a['children']['y']['total_size']) == (10, 20)
    assert (b['file_count'], b['total_size']) == (1, 5)
    assert (tree['file_count'], tree['total_size']) == (3, 35)
