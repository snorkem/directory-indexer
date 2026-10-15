/**
 * Virtual Table Renderer
 *
 * Implements virtual scrolling for large file lists to maintain performance.
 * Only renders visible rows plus a buffer, dramatically improving performance
 * for large datasets.
 */

class VirtualTableRenderer {
    /**
     * Create a virtual table renderer
     * @param {Object} config - Configuration object
     * @param {string} config.containerId - ID of scroll container element
     * @param {string} config.tbodyId - ID of table body element
     * @param {string} config.noResultsId - ID of no results message element
     * @param {string} config.resultNumberId - ID of result count element
     * @param {number} config.rowHeight - Initial row height estimate in pixels (measured after first render)
     * @param {number} config.bufferSize - Number of extra rows to render above/below viewport
     */
    constructor(config) {
        this.container = document.getElementById(config.containerId);
        this.tbody = document.getElementById(config.tbodyId);
        this.noResults = document.getElementById(config.noResultsId);
        this.resultNumber = document.getElementById(config.resultNumberId);

        this.rowHeight = config.rowHeight || 45;
        this.bufferSize = config.bufferSize || 10;
        this.columnCount = 6;

        this.data = [];
        this.maxFileSize = 0;

        this.virtualScroll = {
            startIndex: 0,
            endIndex: 0
        };

        // Bind scroll handler
        if (this.container) {
            this.container.addEventListener('scroll', throttle(() => this.render(), 16));
        }
    }

    /**
     * Set the data to be rendered
     * @param {Array} data - Array of file objects
     * @param {number} maxFileSize - Maximum file size for size bar calculation
     */
    setData(data, maxFileSize) {
        this.data = data;
        this.maxFileSize = maxFileSize;
    }

    /**
     * Render the table based on current scroll position
     */
    render() {
        if (!this.container || !this.tbody) {
            console.error('Table elements not found');
            return;
        }

        // Update result count
        if (this.resultNumber) {
            this.resultNumber.textContent = this.data.length.toLocaleString();
        }

        // Handle empty data
        if (this.data.length === 0) {
            this.tbody.innerHTML = '';
            this.tbody.style.display = 'none';
            if (this.noResults) this.noResults.style.display = 'block';
            return;
        }

        this.tbody.style.display = '';
        if (this.noResults) this.noResults.style.display = 'none';

        this.renderRows();

        // Rows are a uniform height set by CSS; if the estimate was off,
        // re-render once with the measured height so rows line up with scroll
        const measured = measureRowHeight(this.tbody);
        if (measured && Math.abs(measured - this.rowHeight) > 0.01) {
            this.rowHeight = measured;
            this.renderRows();
        }
    }

    /**
     * Render the visible rows between spacer rows
     */
    renderRows() {
        const headerHeight = tableHeaderHeight(this.container);
        const win = computeVirtualWindow(
            this.container.scrollTop,
            this.container.clientHeight - headerHeight,
            this.rowHeight,
            this.data.length,
            this.bufferSize
        );
        this.virtualScroll.startIndex = win.start;
        this.virtualScroll.endIndex = win.end;

        const rows = this.data.slice(win.start, win.end).map(file => {
            const sizePercent = this.maxFileSize > 0
                ? (file.size_bytes / this.maxFileSize * 100).toFixed(1)
                : 0;

            return `
                <tr>
                    <td>
                        <div class="file-name">
                            <span class="file-icon">${file.icon}</span>
                            <span title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                        </div>
                    </td>
                    <td><span class="file-extension">${escapeHtml(file.extension)}</span></td>
                    <td class="file-path">${escapeHtml(file.directory)}</td>
                    <td>
                        <div class="size-cell">
                            <div class="size-bar-container">
                                <div class="size-bar" style="width: ${sizePercent}%"></div>
                            </div>
                            <span class="size-text">${file.size_human}</span>
                        </div>
                    </td>
                    <td class="modified">${file.modified}</td>
                    <td class="modified">${file.created}</td>
                </tr>
            `;
        }).join('');

        this.tbody.innerHTML =
            virtualSpacerRow(win.topSpacer, this.columnCount) +
            rows +
            virtualSpacerRow(win.bottomSpacer, this.columnCount);
    }

    /**
     * Scroll to top of table
     */
    scrollToTop() {
        if (this.container) {
            this.container.scrollTop = 0;
        }
    }
}
