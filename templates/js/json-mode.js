/**
 * json-mode.js
 * Entry point and initialization for JSON mode (inline data)
 *
 * This file orchestrates all components for JSON mode:
 * - Virtual table rendering
 * - Search and filtering
 * - Browse mode
 * - Statistics display
 * - Column management
 * - Tab switching
 */

// ====================================================================
// Global State
// ====================================================================

let tableData = [];
let filteredData = [];
let maxFileSize = 0;

let currentSort = { column: 'name', ascending: true };
let currentFilter = { search: '', extension: 'all' };

// Component instances
let virtualTableRenderer = null;
let columnManager = null;
let tabManager = null;
let tooltip = null;
let browseController = null;
let dataService = null;

// ====================================================================
// Initialization
// ====================================================================

/**
 * Initialize the application
 */
async function initializeApp() {
    try {
        console.log('Initializing JSON mode application...');

        // Initialize data service with embedded data
        const directoryTree = window.directoryTree;
        const fileData = window.fileData;

        // The tree refers to files by index into fileData; link the records in
        resolveTreeFileIndices(directoryTree, fileData);
        dataService = new DataService(directoryTree);

        // Set global data
        tableData = fileData;
        // Start sorted to match currentSort, so the first header click toggles as expected
        filteredData = [...tableData];
        sortData(filteredData);
        maxFileSize = tableData.reduce((max, f) => Math.max(max, f.size_bytes || 0), 0);

        // Initialize components
        initializeComponents();
        updateSortHeaders();

        // Setup event listeners
        setupEventListeners();

        // Initial render
        renderTable();

        // Hide loading overlay
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.classList.add('hidden');
        }

        console.log('Application initialized successfully');
    } catch (error) {
        console.error('Error initializing application:', error);
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            const stats = document.getElementById('loadingStats');
            if (stats) {
                stats.textContent = 'Error loading data: ' + error.message;
            }
        }
    }
}

/**
 * Initialize all component instances
 */
function initializeComponents() {
    // Virtual table renderer
    virtualTableRenderer = new VirtualTableRenderer({
        containerId: 'tableContainer',
        tbodyId: 'tableBody',
        noResultsId: 'noResults',
        resultNumberId: 'resultNumber',
        rowHeight: 45,
        bufferSize: 10
    });
    virtualTableRenderer.setData(filteredData, maxFileSize);

    // Column manager
    columnManager = new ColumnManager({
        settingsToggleId: 'settingsToggle',
        settingsPanelId: 'settingsPanel'
    });

    // Tab manager
    tabManager = new TabManager();

    // Tooltip
    tooltip = new Tooltip({
        tooltipId: 'pathTooltip',
        targetSelector: '.file-path'
    });
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

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            tabManager.switchTab(tabName);

            // Hide loading overlay when not on Files tab
            const loadingOverlay = document.getElementById('loadingOverlay');
            if (tabName !== 'files' && loadingOverlay) {
                loadingOverlay.classList.add('hidden');
            }

            // Initialize browse mode if switching to it
            if (tabName === 'browse' && !document.getElementById('folderTree').hasChildNodes()) {
                initializeBrowseMode();
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

    const searchTerm = searchBox ? searchBox.value.toLowerCase() : '';
    const extensionValue = extensionFilter ? extensionFilter.value : '';

    currentFilter.search = searchTerm;
    currentFilter.extension = extensionValue;

    // Apply filters manually
    filteredData = tableData.filter(file => {
        const matchesSearch = searchTerm === '' ||
            file.name.toLowerCase().includes(searchTerm) ||
            (file.path && file.path.toLowerCase().includes(searchTerm)) ||
            (file.directory && file.directory.toLowerCase().includes(searchTerm));

        const matchesExtension = extensionValue === '' || file.extension === extensionValue;

        return matchesSearch && matchesExtension;
    });

    // Re-sort filtered data
    sortData(filteredData);

    // Update renderer and render
    virtualTableRenderer.setData(filteredData, maxFileSize);
    virtualTableRenderer.scrollToTop();
    renderTable();
}

/**
 * Handle column sort
 * @param {string} column - Column name to sort by
 */
function handleSort(column) {
    if (currentSort.column === column) {
        currentSort.ascending = !currentSort.ascending;
    } else {
        currentSort.column = column;
        currentSort.ascending = true;
    }

    // Sort filtered data
    sortData(filteredData);

    // Update sort indicators in headers
    updateSortHeaders();

    // Update UI
    virtualTableRenderer.setData(filteredData, maxFileSize);
    renderTable();
}

/**
 * Sort data array in place
 * @param {Array} data - Array to sort
 */
function sortData(data) {
    const column = currentSort.column;
    const ascending = currentSort.ascending;

    data.sort((a, b) => {
        let valA = a[column];
        let valB = b[column];

        // Handle size column specially
        if (column === 'size') {
            valA = a.size_bytes || 0;
            valB = b.size_bytes || 0;
        }

        // Case-insensitive string comparison
        if (typeof valA === 'string' && typeof valB === 'string') {
            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
        }

        if (valA < valB) return ascending ? -1 : 1;
        if (valA > valB) return ascending ? 1 : -1;
        return 0;
    });
}

/**
 * Render the virtual table
 */
function renderTable() {
    virtualTableRenderer.render();
}

/**
 * Initialize browse mode
 */
async function initializeBrowseMode() {
    if (browseController) return; // Already initialized

    try {
        console.log('Initializing browse mode...');

        const browseState = BrowseState.restore();

        browseController = new BrowseController(dataService, browseState);
        await browseController.init();

        console.log('Browse mode initialized');
    } catch (error) {
        console.error('Error initializing browse mode:', error);
    }
}

// ====================================================================
// Application Start
// ====================================================================

// Start the application when data is available
if (window.fileData && window.directoryTree) {
    // Data is already embedded, initialize immediately
    initializeApp();
} else {
    // Wait for data to load
    console.log('Waiting for data to load...');
    let attempts = 0;
    const checkInterval = setInterval(() => {
        attempts++;
        if (window.fileData && window.directoryTree) {
            clearInterval(checkInterval);
            initializeApp();
        } else if (attempts > 50) {
            clearInterval(checkInterval);
            console.error('Data failed to load');
            const stats = document.getElementById('loadingStats');
            if (stats) {
                stats.textContent = 'Error: Data failed to load';
            }
        }
    }, 100);
}
