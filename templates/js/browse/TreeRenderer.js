/**
 * TreeRenderer.js
 * Renders the hierarchical folder tree in the sidebar
 */

/**
 * Renders and manages the folder tree navigation sidebar
 */
class TreeRenderer {
    /**
     * Initialize tree renderer
     * @param {HTMLElement} container - Container element for the tree
     * @param {BrowseState} state - Browse state instance
     * @param {Object} rootNode - Root directory tree node
     * @param {Function} onNavigate - Callback when folder is navigated to
     */
    constructor(container, state, rootNode, onNavigate) {
        this.container = container;
        this.state = state;
        this.rootNode = rootNode;
        this.onNavigate = onNavigate;
    }

    /**
     * Render the entire tree from root
     */
    async render() {
        this.container.innerHTML = '';
        await this._renderNode(this.rootNode, this.container, '');
    }

    /**
     * Render a single tree node and its children (iterative to avoid stack overflow)
     * @param {Object} node - Directory node to render
     * @param {HTMLElement} parentElement - Parent DOM element
     * @param {string} path - Current path in the tree
     * @private
     */
    async _renderNode(node, parentElement, path) {
        // Use explicit stack to avoid call stack overflow on deeply nested structures
        const stack = [{ node, parentElement, path }];

        while (stack.length > 0) {
            const { node: currentNode, parentElement: currentParent, path: currentPath } = stack.pop();

            const hasChildren = Object.keys(currentNode.children || {}).length > 0;
            const isExpanded = this.state.expandedFolders.has(currentPath);

            const treeItem = document.createElement('div');
            treeItem.className = 'tree-item' +
                                (isExpanded ? ' expanded' : '') +
                                (this.state.currentPath === currentPath ? ' selected' : '');
            treeItem.dataset.path = currentPath;

            const content = document.createElement('div');
            content.className = 'tree-item-content';

            // Toggle icon
            const toggle = document.createElement('div');
            toggle.className = 'tree-toggle' + (hasChildren ? '' : ' empty');
            toggle.textContent = hasChildren ? (isExpanded ? '▼' : '▶') : '';
            content.appendChild(toggle);

            // Folder icon
            const icon = document.createElement('span');
            icon.className = 'tree-icon';
            icon.textContent = '📁';
            content.appendChild(icon);

            // Label
            const label = document.createElement('span');
            label.className = 'tree-label';
            label.textContent = currentNode.name;
            label.title = currentNode.name;
            content.appendChild(label);

            // File count badge
            if (currentNode.file_count > 0) {
                const badge = document.createElement('span');
                badge.className = 'tree-badge';
                badge.textContent = currentNode.file_count;
                content.appendChild(badge);
            }

            // Folder size
            const size = document.createElement('span');
            size.className = 'tree-size';
            size.textContent = formatSize(currentNode.total_size);
            content.appendChild(size);

            treeItem.appendChild(content);

            // Click handler - capture values in closure
            const nodePath = currentPath;
            const nodeHasChildren = hasChildren;
            content.addEventListener('click', async (e) => {
                e.stopPropagation();

                if (nodeHasChildren && (e.target === toggle || e.target === icon)) {
                    // Toggle expansion
                    this.state.toggleFolder(nodePath);
                    this.state.save();
                    await this.render();
                } else {
                    // Navigate to folder
                    await this.onNavigate(nodePath);
                }
            });

            currentParent.appendChild(treeItem);

            // Queue children for rendering if expanded (in reverse order for correct display)
            if (hasChildren && isExpanded) {
                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'tree-children';
                treeItem.appendChild(childrenContainer);

                const sortedChildren = Object.entries(currentNode.children).sort((a, b) =>
                    a[1].name.localeCompare(b[1].name)
                );

                // Push in reverse order so they pop in correct order
                for (let i = sortedChildren.length - 1; i >= 0; i--) {
                    const [childName, childNode] = sortedChildren[i];
                    const childPath = currentPath ? `${currentPath}/${childName}` : childName;
                    stack.push({ node: childNode, parentElement: childrenContainer, path: childPath });
                }
            }
        }
    }

    /**
     * Expand a folder by path
     * @param {string} path - Folder path to expand
     */
    expandFolder(path) {
        this.state.expandedFolders.add(path);
        this.state.save();
        this.render();
    }

    /**
     * Collapse a folder by path
     * @param {string} path - Folder path to collapse
     */
    collapseFolder(path) {
        this.state.expandedFolders.delete(path);
        this.state.save();
        this.render();
    }

    /**
     * Select a folder (highlight in tree)
     * @param {string} path - Folder path to select
     */
    selectFolder(path) {
        this.state.setPath(path);
        this.render();
    }
}
