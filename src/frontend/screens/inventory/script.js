// src/frontend/screens/inventory/script.js
/**
 * INVENTORY SCREEN
 * View and manage product inventory
 */

class InventoryScreen {
    constructor(app) {
        this.app = app;
        this.api = app.api;
        this.products = [];
        this.categories = [];
        this.currentPage = 1;
        this.pageSize = 100;
        this.totalPages = 1;
        this.filters = {};

        this.init();
    }

    init() {
        console.log('Initializing Inventory Screen');
        this.loadCategories();
        this.loadProducts();
        this.setupEventListeners();
    }

    refresh() {
        this.loadProducts();
    }

    setupEventListeners() {
        // Search input
        const searchInput = document.getElementById('inventory-search');
        if (searchInput) {
            searchInput.addEventListener('input', this.debounce((e) => {
                this.filters.search = e.target.value.trim();
                this.currentPage = 1;
                this.loadProducts();
            }, 400));
        }

        // Category filter
        const categoryFilter = document.getElementById('category-filter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', () => {
                this.filters.category_id = categoryFilter.value || null;
                this.currentPage = 1;
                this.loadProducts();
            });
        }

        // Stock filter
        const stockFilter = document.getElementById('stock-filter');
        if (stockFilter) {
            stockFilter.addEventListener('change', () => {
                const value = stockFilter.value;
                if (value === 'low_stock') {
                    this.filters.low_stock = true;
                    this.filters.out_of_stock = null;
                } else if (value === 'out_of_stock') {
                    this.filters.out_of_stock = true;
                    this.filters.low_stock = null;
                } else {
                    this.filters.low_stock = null;
                    this.filters.out_of_stock = null;
                }
                this.currentPage = 1;
                this.loadProducts();
            });
        }

        // Pagination
        const prevBtn = document.getElementById('prev-page');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.changePage(-1));
        }

        const nextBtn = document.getElementById('next-page');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.changePage(1));
        }

        // Refresh button
        const refreshBtn = document.getElementById('refresh-inventory');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadProducts());
        }

        // Export button
        const exportBtn = document.getElementById('export-inventory');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportInventory());
        }
    }

    async loadCategories() {
        try {
            const response = await this.api.get('/products/categories');
            this.categories = Array.isArray(response) ? response : (response.categories || []);
            this.renderCategoryFilter();
        } catch (error) {
            console.warn('Failed to load categories:', error);
            this.categories = [];
        }
    }

    renderCategoryFilter() {
        const filter = document.getElementById('category-filter');
        if (!filter) return;

        const currentValue = filter.value;
        filter.innerHTML = '<option value="">All Categories</option>';

        this.categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name || cat.category_name;
            filter.appendChild(option);
        });

        filter.value = currentValue;
    }

    async loadProducts() {
        try {
            this.app.showLoading('Loading inventory...');

            const params = new URLSearchParams({ page: 1, page_size: 9999 });
            if (this.filters.search) params.append('search', this.filters.search.trim());
            if (this.filters.category_id) params.append('category_id', this.filters.category_id);
            if (this.filters.low_stock) params.append('low_stock', 'true');
            if (this.filters.out_of_stock) params.append('out_of_stock', 'true');

            const response = await this.api.get(`/inventory/stock?${params.toString()}`);

            this.products = Array.isArray(response) ? response :
                (response.products || response.data || []);

            this.render();
        } catch (error) {
            console.error('Failed to load products:', error);
            this.app.showNotification('Failed to load inventory', 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    render() {
        const tbody = document.getElementById('inventory-tbody');
        if (!tbody) return;

        // Pagination
        this.totalPages = Math.ceil(this.products.length / this.pageSize);
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        const pageProducts = this.products.slice(start, end);

        // Update count
        const countEl = document.getElementById('product-count');
        if (countEl) countEl.textContent = this.products.length;

        // Update pagination controls
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        if (prevBtn) prevBtn.disabled = this.currentPage <= 1;
        if (nextBtn) nextBtn.disabled = this.currentPage >= this.totalPages;

        const pageEl = document.getElementById('current-page');
        if (pageEl) pageEl.textContent = this.currentPage;

        const totalEl = document.getElementById('total-pages');
        if (totalEl) totalEl.textContent = this.totalPages || 1;

        // Render rows
        if (pageProducts.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="empty-cell">
                        <div class="empty-icon">📦</div>
                        <div>No products in inventory</div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = pageProducts.map(p => {
            const stockStatus = this.getStockStatus(p);
            const stockValue = (p.current_stock || 0) * (p.cost_price || 0);

            return `
                <tr class="inventory-row" data-product-id="${p.id}">
                    <td>${p.product_code || 'N/A'}</td>
                    <td>${p.name || 'N/A'}</td>
                    <td>${p.current_stock || 0}</td>
                    <td>${p.reorder_level || 0}</td>
                    <td>Rs. ${this.app.formatCurrency(p.cost_price || 0)}</td>
                    <td>Rs. ${this.app.formatCurrency(stockValue)}</td>
                    <td><span class="status-badge ${stockStatus.class}">${stockStatus.text}</span></td>
                    <td>
                        <button class="btn btn-small" onclick="window.app.loadScreen('products')">Edit</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    getStockStatus(product) {
        const current = product.current_stock || 0;
        const reorder = product.reorder_level || 0;

        if (current === 0) {
            return { text: 'Out of Stock', class: 'danger' };
        } else if (current <= reorder) {
            return { text: 'Low Stock', class: 'warning' };
        } else {
            return { text: 'In Stock', class: 'success' };
        }
    }

    changePage(direction) {
        const newPage = this.currentPage + direction;
        if (newPage >= 1 && newPage <= this.totalPages) {
            this.currentPage = newPage;
            this.render();
            window.scrollTo(0, 0);
        }
    }

    exportInventory() {
        try {
            const csv = this.generateCSV();
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `inventory_${new Date().getTime()}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
            this.app.showNotification('Inventory exported successfully', 'success');
        } catch (error) {
            console.error('Export error:', error);
            this.app.showNotification('Failed to export inventory', 'error');
        }
    }

    generateCSV() {
        const headers = ['SKU', 'Product Name', 'Current Stock', 'Reorder Level', 'Cost Price', 'Stock Value', 'Status'];
        const rows = this.products.map(p => {
            const stockValue = (p.current_stock || 0) * (p.cost_price || 0);
            const status = this.getStockStatus(p).text;
            return [
                p.product_code || '',
                p.name || '',
                p.current_stock || 0,
                p.reorder_level || 0,
                p.cost_price || 0,
                stockValue,
                status
            ];
        });

        const csv = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        return csv;
    }

    debounce(func, wait) {
        let timeout;
        var self = this;
        return function() {
            var args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(function() { func.apply(self, args); }, wait);
        };
    }
}

// Export to window
window.InventoryScreen = InventoryScreen;
