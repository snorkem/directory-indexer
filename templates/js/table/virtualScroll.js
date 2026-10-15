/**
 * Virtual Scroll Window
 *
 * Computes which rows to render for a virtually scrolled table, and how tall
 * the spacer rows above and below them must be. Rows stay in normal table
 * flow (no transforms), so sticky table headers keep working.
 */

/**
 * Largest scrollable height to create. Browsers stop laying out elements
 * somewhere between ~17M px (Firefox) and ~33M px (Chrome); beyond the cap,
 * scroll position is mapped proportionally onto the rows instead.
 */
const MAX_VIRTUAL_HEIGHT = 15000000;

/**
 * Compute the rendered row range and spacer heights for a scroll position
 * @param {number} scrollTop - Scroll offset of the rows area in pixels
 * @param {number} viewportHeight - Visible height of the rows area in pixels
 * @param {number} rowHeight - Height of one row in pixels
 * @param {number} totalRows - Total number of rows
 * @param {number} bufferSize - Extra rows to render above and below
 * @returns {{start: number, end: number, topSpacer: number, bottomSpacer: number, totalHeight: number}}
 */
function computeVirtualWindow(scrollTop, viewportHeight, rowHeight, totalRows, bufferSize) {
    const naturalHeight = totalRows * rowHeight;
    const totalHeight = Math.min(naturalHeight, MAX_VIRTUAL_HEIGHT);
    const visibleRows = Math.ceil(viewportHeight / rowHeight);

    // Index (fractional) of the row at the top of the viewport
    let firstVisible;
    if (naturalHeight <= MAX_VIRTUAL_HEIGHT) {
        firstVisible = scrollTop / rowHeight;
    } else {
        const maxScroll = Math.max(1, totalHeight - viewportHeight);
        const maxFirst = Math.max(0, totalRows - viewportHeight / rowHeight);
        firstVisible = (Math.min(scrollTop, maxScroll) / maxScroll) * maxFirst;
    }
    firstVisible = Math.max(0, Math.min(firstVisible, totalRows));

    const start = Math.max(0, Math.floor(firstVisible) - bufferSize);
    const end = Math.min(totalRows, Math.floor(firstVisible) + visibleRows + bufferSize + 1);

    // Place row `firstVisible` exactly at scrollTop
    const topSpacer = Math.max(0, scrollTop - (firstVisible - start) * rowHeight);
    const bottomSpacer = Math.max(0, totalHeight - topSpacer - (end - start) * rowHeight);

    return { start, end, topSpacer, bottomSpacer, totalHeight };
}

/**
 * Create a spacer row that reserves vertical space for unrendered rows
 * @param {number} height - Spacer height in pixels
 * @param {number} columnCount - Number of table columns
 * @returns {string} HTML for the spacer row (empty when height is 0)
 */
function virtualSpacerRow(height, columnCount) {
    if (height <= 0) return '';
    return `<tr class="virtual-spacer" aria-hidden="true"><td colspan="${columnCount}" style="height: ${height}px"></td></tr>`;
}

/**
 * Measure the average rendered height of the data rows
 * Averaged over all rendered rows because collapsed table borders make
 * individual rows alternate by fractions of a pixel.
 * @param {HTMLElement} tbody - Table body containing rendered rows
 * @returns {number} Row height in pixels, or 0 if no data row is rendered
 */
function measureRowHeight(tbody) {
    const rows = tbody.querySelectorAll('tr:not(.virtual-spacer)');
    if (rows.length === 0) return 0;
    const first = rows[0].getBoundingClientRect();
    const last = rows[rows.length - 1].getBoundingClientRect();
    return (last.bottom - first.top) / rows.length;
}

/**
 * Height of the sticky table header inside a scroll container
 * @param {HTMLElement} container - Scroll container holding the table
 * @returns {number} Header height in pixels
 */
function tableHeaderHeight(container) {
    const thead = container.querySelector('thead');
    return thead ? thead.getBoundingClientRect().height : 0;
}
