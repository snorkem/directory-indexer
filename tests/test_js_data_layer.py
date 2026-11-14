"""Tests for the browse data layer (templates/js/data), run under Node with the vendored sql.js."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from src.core.database import DatabaseManager
from src.models import FileInfo

REPO = Path(__file__).resolve().parent.parent
JS = REPO / 'templates' / 'js'
SQL_JS = REPO / 'templates' / 'vendor' / 'sql.js' / '1.8.0'
SOURCES = ['common/sorting.js', 'data/DataService.js', 'data/sqlSearch.js', 'data/DatabaseBrowseService.js']

pytestmark = pytest.mark.skipif(shutil.which('node') is None, reason='node is required for JS tests')


def _run_js(body: str, db_path: Path | None = None) -> dict:
    """Run `body` (an async function body that returns a value) with the data-layer sources loaded."""
    sources = '\n'.join((JS / name).read_text() for name in SOURCES)
    program = f"""
{sources}
(async () => {{
    let db = null;
    if ({json.dumps(str(db_path) if db_path else None)}) {{
        const initSqlJs = require({json.dumps(str(SQL_JS / 'sql-wasm.js'))});
        const SQL = await initSqlJs({{ locateFile: f => {json.dumps(str(SQL_JS))} + '/' + f }});
        db = new SQL.Database(require('fs').readFileSync({json.dumps(str(db_path) if db_path else '')}));
        registerSearchFunctions(db);
    }}
    const result = await (async () => {{ {body} }})();
    console.log(JSON.stringify(result));
}})().catch(e => {{ console.error(e); process.exit(1); }});
"""
    out = subprocess.run(['node', '-e', program], check=True, capture_output=True, text=True).stdout
    return json.loads(out.strip().splitlines()[-1])


def _make_db(tmp_path: Path, paths: list[str]) -> Path:
    files = []
    for index, path in enumerate(paths):
        name = path.rsplit('/', 1)[-1]
        ext = '.' + name.rsplit('.', 1)[-1]
        files.append(FileInfo(name=name, full_path=path, size=1000 * (index + 1), extension=ext, modified=0).to_dict())
    db_path = tmp_path / 'index.db'
    DatabaseManager(str(db_path)).create_database(files, 0, {}, Path('/root'))
    return db_path


# Folder-only tree matching the paths used below (what buildTreeFromDatabase produces)
TREE_JS = """
const node = (name, path, children = {}) => ({ name, path, file_count: 0, total_size: 0, children, files: [] });
const tree = node('root', '', {
    'Vidéos': node('Vidéos', 'Vidéos', { '2024': node('2024', 'Vidéos/2024') }),
    'Docs': node('Docs', 'Docs'),
});
"""
PATHS = ['readme.txt', 'Vidéos/2024/Été.mov', 'Vidéos/2024/b.mov', 'Docs/100%_done.txt', 'Docs/100x_done.txt']


def test_tree_file_indices_are_resolved_to_shared_records():
    result = _run_js("""
        const files = [{ name: 'a.txt', extension: '.txt' }, { name: 'b.mov', extension: '.mov' }];
        const tree = { name: 'r', children: { sub: { name: 'sub', children: {}, files: [1] } }, files: [0] };
        resolveTreeFileIndices(tree, files);
        const service = new DataService(tree);
        const found = await service.searchGlobal('b.m');
        return { rootIsSameObject: tree.files[0] === files[0], sub: tree.children.sub.files[0].name,
                 found: found.map(f => [f.type, f.name, f.path]) };
    """)
    assert result == {'rootIsSameObject': True, 'sub': 'b.mov', 'found': [['file', 'b.mov', 'sub']]}


def test_database_browse_loads_one_folders_files_at_a_time(tmp_path):
    result = _run_js(TREE_JS + """
        const service = new DatabaseBrowseService(db, tree);
        const videos = await service.getFiles('Vidéos/2024');
        const afterVideos = tree.children['Vidéos'].children['2024'].files.length;
        const root = await service.getFiles('');
        return {
            videoFiles: videos.items.map(f => [f.name, f.size_bytes, f.size_human]),
            afterVideos,
            rootItems: root.items.map(f => f.name),
            videosReleased: tree.children['Vidéos'].children['2024'].files.length,
        };
    """, _make_db(tmp_path, PATHS))

    assert result['videoFiles'] == [['b.mov', 3000, '2.93 KB'], ['Été.mov', 2000, '1.95 KB']]
    assert result['afterVideos'] == 2
    assert result['rootItems'] == ['Docs', 'Vidéos', 'readme.txt']
    assert result['videosReleased'] == 0


def test_database_search_folds_non_ascii_case_and_finds_folders(tmp_path):
    result = _run_js(TREE_JS + """
        const service = new DatabaseBrowseService(db, tree);
        const names = async q => (await service.searchGlobal(q)).map(r => `${r.type}:${r.path}:${r.name}`);
        return { accented: await names('été'), upper: await names('ÉTÉ'), folder: await names('vidé'), ascii: await names('README') };
    """, _make_db(tmp_path, PATHS))

    assert result['accented'] == ['file:Vidéos/2024:Été.mov']
    assert result['upper'] == ['file:Vidéos/2024:Été.mov']
    assert result['folder'] == ['folder:Vidéos:Vidéos']
    assert result['ascii'] == ['file::readme.txt']


def test_contains_clause_treats_wildcards_literally_and_folds_case(tmp_path):
    result = _run_js("""
        const count = text => {
            const clause = containsClause(['name', 'directory'], text);
            return db.exec('SELECT COUNT(*) FROM files WHERE ' + clause.sql, clause.params)[0].values[0][0];
        };
        return { percent: count('%'), underscore: count('_'), accentedDir: count('VIDÉOS'), all: count('') ,
                 asciiUsesBuiltin: containsClause(['name'], 'abc').sql, unicodeUsesJs: containsClause(['name'], 'é').sql };
    """, _make_db(tmp_path, PATHS))

    assert result['percent'] == 1
    assert result['underscore'] == 2
    assert result['accentedDir'] == 2
    assert result['all'] == 5
    assert result['asciiUsesBuiltin'].startswith('(LOWER(name)')
    assert result['unicodeUsesJs'].startswith('(ulower(name)')
