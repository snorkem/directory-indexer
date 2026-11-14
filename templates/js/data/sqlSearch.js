/**
 * sqlSearch.js
 * Helpers for case-insensitive "contains" searches against the SQLite database
 */

/**
 * Register the SQL functions the search helpers rely on
 * @param {Object} db - sql.js database instance
 */
function registerSearchFunctions(db) {
    // SQLite's LOWER() only folds ASCII; this folds every letter the way JavaScript does
    db.create_function('ulower', value => (typeof value === 'string' ? value.toLowerCase() : value));
}

/**
 * Build a LIKE pattern that matches text anywhere, treating % and _ literally
 * @param {string} text - Search text
 * @returns {string} Pattern for a LIKE clause that uses backslash as its ESCAPE character
 */
function likeContainsPattern(text) {
    return '%' + text.replace(/[\\%_]/g, '\\$&') + '%';
}

/**
 * Build a WHERE fragment matching rows where any column contains the text, ignoring case
 * @param {Array<string>} columns - Column names to search
 * @param {string} text - Search text
 * @returns {{sql: string, params: Array<string>}} Parenthesized SQL and its bound parameters
 */
function containsClause(columns, text) {
    const lowered = text.toLowerCase();
    // The built-in LOWER() is much faster, so the JavaScript version is only
    // used when the search has non-ASCII letters that LOWER() and LIKE can't fold
    const lower = /[^\x00-\x7f]/.test(lowered) ? 'ulower' : 'LOWER';
    const pattern = likeContainsPattern(lowered);
    return {
        sql: '(' + columns.map(column => `${lower}(${column}) LIKE ? ESCAPE '\\'`).join(' OR ') + ')',
        params: columns.map(() => pattern)
    };
}
