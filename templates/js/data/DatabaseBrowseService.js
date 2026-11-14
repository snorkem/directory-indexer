/**
 * DatabaseBrowseService.js
 * Browse-mode data service for database mode
 */

/**
 * Data service for browsing a database-mode archive.
 *
 * The tree holds only folders (with their totals). A folder's files are read
 * from the database when the folder is opened, and only one folder's files
 * are kept at a time, so memory use doesn't grow with the size of the archive.
 */
class DatabaseBrowseService extends DataService {
    /**
     * Initialize database browse service
     * @param {Object} db - sql.js database instance
     * @param {Object} directoryTree - Root directory tree node (folders only)
     */
    constructor(db, directoryTree) {
        super(directoryTree);
        this.db = db;
        this.loadedNode = null;
    }

    /**
     * Get files in a folder, loading them from the database first
     * @param {string} path - Folder path
     * @param {Object} opts - Options for filtering/sorting
     * @returns {Object} Object with items and total
     * @private
     */
    _getFilesInline(path, opts) {
        this._loadFiles(path);
        return super._getFilesInline(path, opts);
    }

    /**
     * Load a folder's own files into its tree node, releasing the previously loaded folder's
     * @param {string} path - Folder path
     * @private
     */
    _loadFiles(path) {
        const node = this._findNode(path);
        if (!node || node === this.loadedNode) return;

        if (this.loadedNode) this.loadedNode.files = [];

        node.files = this._queryFiles(
            'SELECT name, extension, size_bytes, size_human, modified, created, icon, directory ' +
            'FROM files WHERE directory = ? ORDER BY name',
            [path || '']
        );
        this.loadedNode = node;
    }

    /**
     * Find files whose name or extension contains the query, using the database
     * @param {string} queryLower - Lowercased search query
     * @param {number} limit - Maximum number of results
     * @returns {Array} Matching file items
     * @private
     */
    _matchingFiles(queryLower, limit) {
        if (limit <= 0) return [];

        const clause = containsClause(['name', 'extension'], queryLower);
        const files = this._queryFiles(
            'SELECT name, extension, size_bytes, size_human, modified, created, icon, directory ' +
            `FROM files WHERE ${clause.sql} ORDER BY directory, name LIMIT ?`,
            [...clause.params, limit]
        );
        return files.map(file => ({ ...file, path: file.directory, type: 'file' }));
    }

    /**
     * Run a query that selects the standard file columns and map rows to file objects
     * @param {string} sql - Query selecting name, extension, size_bytes, size_human, modified, created, icon, directory
     * @param {Array} params - Bound parameters
     * @returns {Array} File objects
     * @private
     */
    _queryFiles(sql, params) {
        const stmt = this.db.prepare(sql);
        stmt.bind(params);

        const files = [];
        while (stmt.step()) {
            const row = stmt.get();
            files.push({
                name: row[0],
                extension: row[1],
                size_bytes: row[2],
                size_human: row[3],
                modified: row[4],
                created: row[5],
                icon: row[6],
                directory: row[7]
            });
        }
        stmt.free();

        return files;
    }
}
