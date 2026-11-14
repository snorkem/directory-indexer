/**
 * DataService.js
 * Folder and file access for browse mode over an in-memory directory tree
 */

// Maximum number of results a global search returns
const SEARCH_RESULT_LIMIT = 1000;

/**
 * Replace the file indices stored in each tree node with the file records
 * themselves. Archives embed every file once (in the flat file list) and the
 * tree refers to them by index; this links the two without copying records.
 * @param {Object} tree - Root directory tree node
 * @param {Array} files - Flat list of all file records
 */
function resolveTreeFileIndices(tree, files) {
    // Explicit stack to avoid call stack overflow on deeply nested structures
    const stack = [tree];
    while (stack.length > 0) {
        const node = stack.pop();
        node.files = (node.files || []).map(entry => (typeof entry === 'number' ? files[entry] : entry));
        Object.values(node.children || {}).forEach(child => stack.push(child));
    }
}

/**
 * Data service for browse mode backed by a directory tree whose nodes
 * hold their own files. DatabaseBrowseService extends this to load files
 * from the database on demand.
 */
class DataService {
    /**
     * Initialize data service
     * @param {Object} directoryTree - Root directory tree node
     */
    constructor(directoryTree) {
        this.dataSource = directoryTree;
    }

    /**
     * Get folder information by path
     * @param {string} path - Folder path
     * @returns {Promise<Object>} Folder object with name, path, fileCount, totalSize, children, files
     */
    async getFolder(path) {
        return this._getFolderInline(path);
    }

    /**
     * Get files and folders in a path with filtering and sorting
     * @param {string} path - Folder path
     * @param {Object} options - Options for sort, search, pagination
     * @returns {Promise<Object>} Object with items array and total count
     */
    async getFiles(path, options = {}) {
        const defaults = {
            sort: { column: 'name', ascending: true, foldersFirst: true },
            search: '',
            limit: 1000,
            offset: 0
        };
        return this._getFilesInline(path, { ...defaults, ...options });
    }

    /**
     * Search globally across all files and folders
     * @param {string} query - Search query
     * @returns {Promise<Array>} Array of matching files and folders
     */
    async searchGlobal(query) {
        return this._searchInline(query);
    }

    /**
     * Find a tree node by path
     * @param {string} path - Folder path ('' for the root)
     * @returns {Object|null} Tree node, or null if the path doesn't exist
     * @private
     */
    _findNode(path) {
        let node = this.dataSource;
        if (path) {
            for (const part of path.split('/')) {
                node = node.children[part];
                if (!node) return null;
            }
        }
        return node;
    }

    /**
     * Get folder from the tree structure
     * @param {string} path - Folder path
     * @returns {Object} Folder object
     * @private
     */
    _getFolderInline(path) {
        const node = this._findNode(path);
        if (!node) return null;
        return {
            name: node.name,
            path: path,
            fileCount: node.file_count,
            totalSize: node.total_size,
            children: Object.keys(node.children || {}),
            files: node.files || []
        };
    }

    /**
     * Get files in a folder from the tree structure
     * @param {string} path - Folder path
     * @param {Object} opts - Options for filtering/sorting
     * @returns {Object} Object with items and total
     * @private
     */
    _getFilesInline(path, opts) {
        const folder = this._getFolderInline(path);
        if (!folder) return { items: [], total: 0 };

        let files = [...folder.files];

        // Apply search filter to files
        if (opts.search) {
            const query = opts.search.toLowerCase();
            files = files.filter(f =>
                f.name.toLowerCase().includes(query) ||
                f.extension.toLowerCase().includes(query)
            );
        }

        // Get child folders
        let folders = folder.children.map(name => {
            const childPath = path ? `${path}/${name}` : name;
            const childFolder = this._getFolderInline(childPath);
            return {
                type: 'folder',
                name: name,
                fileCount: childFolder.fileCount,
                totalSize: childFolder.totalSize,
                path: childPath
            };
        });

        // Apply search filter to folders
        if (opts.search) {
            const query = opts.search.toLowerCase();
            folders = folders.filter(f => f.name.toLowerCase().includes(query));
        }

        // Sort folders and files separately
        folders = this._sortItems(folders, opts.sort);
        files = this._sortItems(files, opts.sort);

        // Combine with folders first (if foldersFirst is enabled)
        const combined = opts.sort.foldersFirst ? [...folders, ...files] : [...folders, ...files].sort((a, b) =>
            compareWithFoldersFirst(a, b, opts.sort.column, opts.sort.ascending, false)
        );

        const total = combined.length;

        // Apply pagination
        const paginated = combined.slice(opts.offset, opts.offset + opts.limit);

        return { items: paginated, total };
    }

    /**
     * Search the whole tree for matching folders and files
     * @param {string} query - Search query
     * @returns {Array} Matching folders, then matching files (limited to SEARCH_RESULT_LIMIT)
     * @private
     */
    _searchInline(query) {
        const queryLower = query.toLowerCase();
        const folders = this._matchingFolders(queryLower, SEARCH_RESULT_LIMIT);
        const files = this._matchingFiles(queryLower, SEARCH_RESULT_LIMIT - folders.length);
        return [...folders, ...files];
    }

    /**
     * Find folders whose name contains the query (iterative to avoid stack overflow)
     * @param {string} queryLower - Lowercased search query
     * @param {number} limit - Maximum number of results
     * @returns {Array} Matching folder items
     * @private
     */
    _matchingFolders(queryLower, limit) {
        const results = [];
        const stack = [{ node: this.dataSource, currentPath: '' }];

        while (stack.length > 0 && results.length < limit) {
            const { node, currentPath } = stack.pop();

            Object.entries(node.children || {}).forEach(([name, child]) => {
                const childPath = currentPath ? `${currentPath}/${name}` : name;
                if (name.toLowerCase().includes(queryLower) && results.length < limit) {
                    results.push({
                        type: 'folder',
                        name: name,
                        path: childPath,
                        fileCount: child.file_count,
                        totalSize: child.total_size
                    });
                }
                stack.push({ node: child, currentPath: childPath });
            });
        }

        return results;
    }

    /**
     * Find files whose name or extension contains the query (iterative to avoid stack overflow)
     * @param {string} queryLower - Lowercased search query
     * @param {number} limit - Maximum number of results
     * @returns {Array} Matching file items
     * @private
     */
    _matchingFiles(queryLower, limit) {
        const results = [];
        const stack = [{ node: this.dataSource, currentPath: '' }];

        while (stack.length > 0 && results.length < limit) {
            const { node, currentPath } = stack.pop();

            for (const file of node.files || []) {
                if (results.length >= limit) break;
                if (file.name.toLowerCase().includes(queryLower) ||
                    file.extension.toLowerCase().includes(queryLower)) {
                    results.push({
                        ...file,
                        path: currentPath,
                        type: 'file'
                    });
                }
            }

            Object.entries(node.children || {}).forEach(([name, child]) => {
                stack.push({ node: child, currentPath: currentPath ? `${currentPath}/${name}` : name });
            });
        }

        return results;
    }

    /**
     * Sort items by column
     * @param {Array} items - Items to sort
     * @param {Object} sort - Sort configuration
     * @returns {Array} Sorted items
     * @private
     */
    _sortItems(items, sort) {
        return items.sort((a, b) =>
            compareWithFoldersFirst(a, b, sort.column, sort.ascending, false)
        );
    }
}
