/**
 * db-mode.js
 * Entry point and initialization for database mode (SQLite via sql.js)
 *
 * This file orchestrates all components for database mode:
 * - Database loading and initialization
 * - Virtual table rendering with pagination
 * - Search and filtering via SQL queries
 * - Browse mode (folders loaded on demand)
 * - Statistics display
 * - Column management
 * - Tab switching
 */

// ====================================================================
// Global State
// ====================================================================

let db = null;
let maxFileSize = 0;
let totalFilteredCount = 0;

let currentSort = { column: 'name', ascending: true };
let currentFilter = { search: '', extension: null };

const BUFFER_SIZE = 10;
const TABLE_COLUMNS = 6;

// Row height estimate; replaced by the measured height after the first render
let rowHeight = 45;

// Columns the All Files table may sort by (interpolated into ORDER BY)
const SORTABLE_COLUMNS = new Set(['name', 'extension', 'directory', 'size_bytes', 'modified', 'created']);

let virtualScroll = {
    startIndex: 0,
    endIndex: 0
};

// Component instances
let tabManager = null;
let browseController = null;

// ====================================================================
// Database Initialization
// ====================================================================

/**
 * Initialize sql.js and load database
 */
async function initDatabase() {
    try {
        // Update progress
        updateLoadingProgress(10, 'Loading sql.js library...');

        // Initialize SQL.js
        const SQL = await initSqlJs({
            locateFile: file => `lib/${file}`
        });

        updateLoadingProgress(30, 'Fetching database file...');

        // Fetch the database file
        const dbFilename = window.dbFilename || 'directory_index.db';
        // Encode so names with spaces, '#' or '?' resolve to the right file
        const response = await fetch(encodeURIComponent(dbFilename));
        if (!response.ok) {
            throw new Error('Failed to load database. Make sure to run this via HTTP server (python serve.py)');
        }
        const arrayBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        updateLoadingProgress(70, 'Initializing database...');

        // Create database
        db = new SQL.Database(bytes);

        updateLoadingProgress(90, 'Loading statistics...');

        // Calculate max file size for progress bars
        const maxSizeResult = db.exec('SELECT MAX(size_bytes) as max_size FROM files');
        if (maxSizeResult.length > 0 && maxSizeResult[0].values.length > 0) {
            maxFileSize = maxSizeResult[0].values[0][0] || 0;
        }

        updateLoadingProgress(100, 'Ready!');

        // Unicode-aware lowercasing for searches
        registerSearchFunctions(db);

        // Initialize UI
        await initializeUI();

        // Hide loading overlay
        document.getElementById('loadingOverlay').classList.add('hidden');

    } catch (error) {
        console.error('Failed to load database:', error);
        document.getElementById('loadingStats').textContent = 'Error loading database: ' + error.message;
    }
}

/**
 * Update loading progress display
 * @param {number} percent - Progress percentage
 * @param {string} message - Status message
 */
function updateLoadingProgress(percent, message) {
    const fill = document.getElementById('loadingProgressFill');
    const stats = document.getElementById('loadingStats');
    if (fill) {
        fill.style.width = percent + '%';
        fill.textContent = percent + '%';
    }
    if (stats) {
        stats.textContent = message;
    }
}

// ====================================================================
// UI Initialization
// ====================================================================

/**
 * Initialize UI components and event listeners
 */
async function initializeUI() {
    console.log('Initializing UI...');

    // Initialize components
    initializeComponents();

    // Load statistics tab data
    loadStatistics();

    // Initial table render
    updateFilteredCount();
    renderTable();

    // Setup event listeners
    setupEventListeners();

    // Update sort headers
    updateSortHeaders();

    console.log('UI initialized successfully');
}

/**
 * Initialize all component instances
 */
function initializeComponents() {
    // Tab manager (DB mode doesn't have column settings, tooltips, or table sorter)
    tabManager = new TabManager();
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Search box
    const searchBox = document.getElementById('searchBox');
    if (searchBox) {
        searchBox.addEventListener('input', debounce(handleFilterChange, 300));
    }

    // Extension filter
    const extensionFilter = document.getElementById('extensionFilter');
    if (extensionFilter) {
        extensionFilter.addEventListener('change', handleFilterChange);
    }

    // Sort headers (All Files table only; the Browse table has its own handlers)
    document.querySelectorAll('#fileTable th[data-column]').forEach(header => {
        header.addEventListener('click', () => {
            const column = header.dataset.column;
            handleSort(column);
        });
    });

    // Virtual scroll
    const tableContainer = document.getElementById('tableContainer');
    if (tableContainer) {
        tableContainer.addEventListener('scroll', throttle(renderTable, 16));
    }

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', async () => {
            const tabName = tab.dataset.tab;
            tabManager.switchTab(tabName);

            // Initialize Browse mode when tab is clicked
            if (tabName === 'browse' && !window.browseController) {
                await initBrowseMode();
            }
        });
    });
}

// ====================================================================
// Event Handlers
// ====================================================================

/**
 * Handle search/filter changes
 */
function handleFilterChange() {
    const searchBox = document.getElementById('searchBox');
    const extensionFilter = document.getElementById('extensionFilter');

    currentFilter.search = searchBox ? searchBox.value.toLowerCase() : '';
    currentFilter.extension = extensionFilter ? extensionFilter.value : null;

    updateFilteredCount();
    renderTable();
}

/**
 * Handle column sort
 * @param {string} column - Column name to sort by
 */
function handleSort(column) {
    if (!SORTABLE_COLUMNS.has(column)) return;

    if (currentSort.column === column) {
        currentSort.ascending = !currentSort.ascending;
    } else {
        currentSort.column = column;
        currentSort.ascending = true;
    }

    updateSortHeaders();
    renderTable();
}

/**
 * Build the WHERE conditions for the current search and extension filter
 * @returns {{sql: string, params: Array}} SQL starting with " AND ..." (or empty) and its parameters
 */
function buildFilterClause() {
    let sql = '';
    const params = [];

    if (currentFilter.search) {
        const clause = containsClause(['name', 'directory'], currentFilter.search);
        sql += ' AND ' + clause.sql;
        params.push(...clause.params);
    }

    if (currentFilter.extension && currentFilter.extension !== 'all') {
        sql += ' AND extension = ?';
        params.push(currentFilter.extension);
    }

    return { sql, params };
}

/**
 * Update filtered file count from database
 */
function updateFilteredCount() {
    const filter = buildFilterClause();
    const query = 'SELECT COUNT(*) as count FROM files WHERE 1=1' + filter.sql;
    const params = filter.params;

    try {
        const stmt = db.prepare(query);
        stmt.bind(params);
        stmt.step();
        const result = stmt.getAsObject();
        totalFilteredCount = result.count || 0;
        stmt.free();

        const resultNumber = document.getElementById('resultNumber');
        if (resultNumber) {
            resultNumber.textContent = totalFilteredCount.toLocaleString();
        }
    } catch (error) {
        console.error('Error counting filtered files:', error);
        totalFilteredCount = 0;
    }
}

/**
 * Render table with virtual scrolling and database pagination
 */
function renderTable() {
    const tbody = document.getElementById('tableBody');
    const noResults = document.getElementById('noResults');
    const container = document.getElementById('tableContainer');

    if (!tbody || !container) return;

    if (totalFilteredCount === 0) {
        tbody.innerHTML = '';
        tbody.style.display = 'none';
        if (noResults) noResults.style.display = 'block';
        return;
    }

    tbody.style.display = '';
    if (noResults) noResults.style.display = 'none';

    renderTableRows(tbody, container);

    // Rows are a uniform height set by CSS; if the estimate was off,
    // re-render once with the measured height so rows line up with scroll
    const measured = measureRowHeight(tbody);
    if (measured && Math.abs(measured - rowHeight) > ROW_HEIGHT_TOLERANCE) {
        rowHeight = measured;
        renderTableRows(tbody, container);
    }
}

/**
 * Query and render the rows visible at the current scroll position
 * @param {HTMLElement} tbody - Table body element
 * @param {HTMLElement} container - Scroll container element
 */
function renderTableRows(tbody, container) {
    const win = computeVirtualWindow(
        container.scrollTop,
        container.clientHeight - tableHeaderHeight(container),
        rowHeight,
        totalFilteredCount,
        BUFFER_SIZE
    );
    virtualScroll.startIndex = win.start;
    virtualScroll.endIndex = win.end;

    // Build query
    const filter = buildFilterClause();
    let query = 'SELECT name, extension, directory, size_bytes, size_human, modified, created, icon FROM files WHERE 1=1' + filter.sql;
    const params = filter.params;

    // Add sorting
    query += ` ORDER BY ${currentSort.column} ${currentSort.ascending ? 'ASC' : 'DESC'}`;

    // Add pagination
    query += ` LIMIT ? OFFSET ?`;
    params.push(win.end - win.start, win.start);

    // Execute query
    try {
        const stmt = db.prepare(query);
        stmt.bind(params);

        const rows = [];
        while (stmt.step()) {
            rows.push(stmt.get());
        }
        stmt.free();

        // Render rows between spacers that stand in for unrendered rows
        const rowsHtml = rows.map(row => {
            const [name, extension, directory, size_bytes, size_human, modified, created, icon] = row;
            const sizePercent = maxFileSize > 0 ? (size_bytes / maxFileSize * 100).toFixed(1) : 0;
            return `
            <tr>
                <td>
                    <div class="file-name">
                        <span class="file-icon">${escapeHtml(icon)}</span>
                        <span title="${escapeHtml(name)}">${escapeHtml(name)}</span>
                    </div>
                </td>
                <td><span class="file-extension">${escapeHtml(extension)}</span></td>
                <td class="path-cell" title="${escapeHtml(directory)}">${escapeHtml(directory)}</td>
                <td>
                    <div class="size-container">
                        <div class="size-bar" style="width: ${sizePercent}%"></div>
                        <span class="size-text">${escapeHtml(size_human)}</span>
                    </div>
                </td>
                <td class="modified">${escapeHtml(modified)}</td>
                <td class="modified">${escapeHtml(created)}</td>
            </tr>
            `;
        }).join('');

        tbody.innerHTML =
            virtualSpacerRow(win.topSpacer, TABLE_COLUMNS) +
            rowsHtml +
            virtualSpacerRow(win.bottomSpacer, TABLE_COLUMNS);

    } catch (error) {
        console.error('Error rendering table:', error);
        tbody.innerHTML = `<tr><td colspan="${TABLE_COLUMNS}">Error loading data</td></tr>`;
    }
}

// ====================================================================
// Statistics
// ====================================================================

/**
 * Load statistics tab data from database
 */
function loadStatistics() {
    try {
        // This would populate the statistics tab
        // The actual statistics HTML is pre-generated server-side
        console.log('Statistics loaded');
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

// ====================================================================
// Browse Mode
// ====================================================================

/**
 * Build the folder tree (names and totals, no files) from the database
 * @returns {Object} Root directory tree node
 */
function buildTreeFromDatabase() {
    try {
        // Get root path from metadata to extract actual directory name
        let rootName = 'Root';
        try {
            const metaStmt = db.prepare('SELECT value FROM metadata WHERE key = ?');
            metaStmt.bind(['root_path']);
            if (metaStmt.step()) {
                const rootPath = metaStmt.get()[0];
                // Extract directory name from path
                if (rootPath) {
                    const parts = rootPath.replace(/\\/g, '/').split('/');
                    rootName = parts[parts.length - 1] || parts[parts.length - 2] || 'Root';
                }
            }
            metaStmt.free();
        } catch (error) {
            console.warn('Could not retrieve root path from metadata:', error);
        }

        // One aggregated query: every directory that directly holds files, with its
        // own file count and size (files directly in it, not in subdirectories)
        // Prototype-less maps: folder names like "constructor" must be ordinary keys
        const directStats = Object.create(null);
        const statsStmt = db.prepare('SELECT directory, COUNT(*), COALESCE(SUM(size_bytes), 0) FROM files GROUP BY directory');
        while (statsStmt.step()) {
            const row = statsStmt.get();
            directStats[row[0] || ''] = { count: row[1], size: row[2] };
        }
        statsStmt.free();

        // Those directories plus all of their parents
        const allDirs = new Set(['']); // Include root
        for (const dir of Object.keys(directStats)) {
            let currentPath = '';
            for (const part of dir.split('/')) {
                if (part) {
                    currentPath = currentPath ? `${currentPath}/${part}` : part;
                    allDirs.add(currentPath);
                }
            }
        }

        // Build tree structure. Nodes hold no files: DatabaseBrowseService
        // loads a folder's files from the database when it is opened.
        const tree = {
            name: rootName,
            path: '',
            file_count: 0,
            total_size: 0,
            children: Object.create(null),
            files: []
        };

        // Create nodes for all directories (sorted, so parents come before children)
        const nodeMap = Object.create(null);
        nodeMap[''] = tree;

        for (const dirPath of Array.from(allDirs).sort()) {
            if (dirPath === '') continue; // Skip root, already created

            const parts = dirPath.split('/');
            const name = parts[parts.length - 1];
            const parentPath = parts.slice(0, -1).join('/');

            const node = {
                name: name,
                path: dirPath,
                file_count: 0,
                total_size: 0,
                children: Object.create(null),
                files: []
            };

            nodeMap[dirPath] = node;

            // Add to parent's children
            const parent = nodeMap[parentPath];
            if (parent) {
                parent.children[name] = node;
            }
        }

        // Calculate totals for each directory (including subdirectories)
        // Process in reverse order (deepest first) to accumulate upwards
        const sortedDirs = Array.from(allDirs).sort((a, b) => {
            const depthA = a.split('/').filter(p => p).length;
            const depthB = b.split('/').filter(p => p).length;
            return depthB - depthA; // Deepest first
        });

        for (const dirPath of sortedDirs) {
            const node = nodeMap[dirPath];
            if (!node) continue;

            // Start with direct files in this directory
            const direct = directStats[dirPath] || { count: 0, size: 0 };
            node.file_count = direct.count;
            node.total_size = direct.size;

            // Add counts from all child directories
            for (const childName in node.children) {
                const child = node.children[childName];
                node.file_count += child.file_count;
                node.total_size += child.total_size;
            }
        }

        return tree;
    } catch (error) {
        console.error('Error building tree from database:', error);
        return {
            name: 'Root',
            path: '',
            file_count: 0,
            total_size: 0,
            children: {},
            files: []
        };
    }
}

// In-flight Browse initialization, shared so repeated tab clicks don't build the tree twice
let browseInitPromise = null;

/**
 * Initialize browse mode (once; concurrent calls share the same initialization)
 * @returns {Promise<void>}
 */
function initBrowseMode() {
    if (!browseInitPromise) {
        browseInitPromise = buildBrowseMode().finally(() => {
            // Allow a retry if initialization failed
            if (!window.browseController) browseInitPromise = null;
        });
    }
    return browseInitPromise;
}

/**
 * Build the directory tree and browse controller
 */
async function buildBrowseMode() {
    if (window.browseController) return; // Already initialized

    try {
        console.log('Initializing Browse mode for database...');

        // Show loading indicator
        const loadingOverlay = document.getElementById('loadingOverlay');
        const loadingStats = document.getElementById('loadingStats');
        if (loadingOverlay) {
            loadingOverlay.classList.remove('hidden');
            if (loadingStats) {
                loadingStats.textContent = 'Building directory tree...';
            }
        }

        // Build the folder tree; files are loaded per folder by the service
        const directoryTree = buildTreeFromDatabase();
        const browseDataService = new DatabaseBrowseService(db, directoryTree);

        const browseState = BrowseState.restore();

        browseController = new BrowseController(browseDataService, browseState);

        window.browseController = browseController;
        await browseController.init();

        // Hide loading indicator
        if (loadingOverlay) {
            loadingOverlay.classList.add('hidden');
        }

        console.log('Browse mode initialized successfully');
    } catch (error) {
        console.error('Failed to initialize Browse mode:', error);

        // Hide loading indicator on error
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.classList.add('hidden');
        }

        alert('Failed to initialize Browse mode: ' + error.message);
    }
}

// ====================================================================
// Application Start
// ====================================================================

// Start loading database when page loads
initDatabase();
