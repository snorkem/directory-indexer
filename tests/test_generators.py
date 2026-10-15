"""Regression tests for HTML/JS generation with hostile or unusual names."""

from __future__ import annotations

import json
import re
from pathlib import Path

from src.core.tree_builder import DirectoryTreeBuilder
from src.generators.db_generator import DbGenerator
from src.generators.html_builder import HtmlBuilder
from src.generators.json_generator import JsonGenerator
from src.generators.script_generators import generate_server_script
from src.models import FileInfo


def _generate_json_page(tmp_path: Path, names: list[str], root: str = '/archive/Root') -> str:
    files = [FileInfo(name=n, full_path=n, size=10, extension='.txt', modified=0) for n in names]
    dicts = [f.to_dict() for f in files]
    tree = DirectoryTreeBuilder(Path(root)).build_tree(dicts)
    stats = {'.txt': {'count': len(files), 'size': 10 * len(files)}}
    out = tmp_path / 'out.html'
    JsonGenerator().generate(files, root, 10 * len(files), stats, str(out), directory_tree=tree)
    return out.read_text(encoding='utf-8')


def _data_script(html: str) -> str:
    return re.search(r'// Embedded file data for JSON mode\n(.*?)</script>', html, re.S).group(1)


def _embedded_names(html: str) -> list[str]:
    data = re.search(r'window\.fileData = (.*?);\nwindow\.directoryTree', html, re.S).group(1)
    return [f['name'] for f in json.loads(data)]


def test_render_template_does_not_rescan_inserted_values():
    rendered = HtmlBuilder().render_template('{a}|{b}', {'a': '{b}', 'b': 'X'})
    assert rendered == '{b}|X'


def test_placeholder_like_filenames_survive_page_assembly(tmp_path):
    names = ['{modals}.txt', '{page_content}.txt', '{javascript}.txt']
    html = _generate_json_page(tmp_path, names)
    assert _embedded_names(html) == names


def test_embedded_json_cannot_close_or_comment_out_the_script(tmp_path):
    names = ['<!--<script>.txt', 'a</script>.txt']
    html = _generate_json_page(tmp_path, names)
    assert '<' not in _data_script(html)
    assert _embedded_names(html) == names


def test_root_path_is_html_escaped(tmp_path):
    html = _generate_json_page(tmp_path, ['a.txt'], root='/archive/<img src=x onerror=alert(1)>')
    assert '<img src=x' not in html
    assert '&lt;img src=x onerror=alert(1)&gt;' in html


def test_db_filename_is_a_valid_js_string_literal():
    name = "Alex's </script> Drive #2.db"
    script = DbGenerator()._create_db_init_script(name)
    literal = re.search(r'window\.dbFilename = (.*);', script).group(1)
    assert json.loads(literal) == name
    assert '</script' not in literal


def test_server_only_listens_on_localhost_without_cors(tmp_path):
    source = Path(generate_server_script(str(tmp_path), 'index.html')).read_text()
    assert 'TCPServer(("127.0.0.1", PORT)' in source
    assert 'Access-Control-Allow-Origin' not in source
