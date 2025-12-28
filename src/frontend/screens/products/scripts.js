// src/frontend/screens/products/script.js
/**
 * PRODUCT MANAGEMENT SCREEN
 */

class ProductsScreen {
    constructor(app) {
        this.app = app;
        this.api = app.api;
        this.products = [];
        this.categories = [];
        this.brands = [];
        this.selectedProducts = new Set();
        this.currentPage = 1;
        this.pageSize = 50;
        this.totalPages = 1;
        this.filters = {};
        
        this.init();
    }

    init() {
        console.log('Initializing Products Screen');
        this.loadCategories();
        this.loadBrands();
        this.loadProducts();
        this.setupEventListeners();
    }

    refresh() {
        this.loadProducts();
    }

    setupEventListeners() {
        // Search input
        const searchInput = document.getElementById('product-search');
        if (searchInput) {
            searchInput.addEventListener('input', this.debounce(() => {
                this.filters.search = searchInput.value;
                this.currentPage = 1;
                this.loadProducts();
            }, 500));
        }

        // Filter dropdowns
        const categoryFilter = document.getElementById('category-filter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', () => {
                this.filters.category_id = categoryFilter.value || null;
                this.currentPage = 1;
                this.loadProducts();
            });
        }

        const brandFilter = document.getElementById('brand-filter');
        if (brandFilter) {
            brandFilter.addEventListener('change', () => {
                this.filters.brand_id = brandFilter.value || null;
                this.currentPage = 1;
                this.loadProducts();
            });
        }

        const stockFilter = document.getElementById('stock-filter');
        if (stockFilter) {
            stockFilter.addEventListener('change', () => {
                switch(stockFilter.value) {
                    case 'low_stock':
                        this.filters.low_stock = true;
                        delete this.filters.out_of_stock;
                        break;
                    case 'out_of_stock':
                        this.filters.out_of_stock = true;
                        delete this.filters.low_stock;
                        break;
                    default:
                        delete this.filters.low_stock;
                        delete this.filters.out_of_stock;
                }
                this.currentPage = 1;
                this.loadProducts();
            });
        }

        const statusFilter = document.getElementById('status-filter');
        if (statusFilter) {
            statusFilter.addEventListener('change', () => {
                this.filters.is_active = statusFilter.value === 'active' ? true : 
                                       statusFilter.value === 'inactive' ? false : null;
                this.currentPage = 1;
                this.loadProducts();
            });
        }

        // Apply/Clear filters
        const applyFiltersBtn = document.getElementById('apply-filters');
        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', () => {
                this.currentPage = 1;
                this.loadProducts();
            });
        }

        const clearFiltersBtn = document.getElementById('clear-filters');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => {
                this.clearFilters();
            });
        }

        // Quick actions
        const quickActions = document.querySelectorAll('.quick-action-btn');
        quickActions.forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                this.handleQuickAction(action);
            });
        });

        // Add product button
        const addProductBtn = document.getElementById('add-product-btn');
        if (addProductBtn) {
            addProductBtn.addEventListener('click', () => {
                this.showAddProductModal();
            });
        }

        // Bulk import button
        const bulkImportBtn = document.getElementById('bulk-import-btn');
        if (bulkImportBtn) {
            bulkImportBtn.addEventListener('click', () => {
                this.showBulkImportModal();
            });
        }

        // Refresh button
        const refreshBtn = document.getElementById('refresh-products');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refresh();
            });
        }

        // Pagination
        const prevPageBtn = document.getElementById('prev-page');
        if (prevPageBtn) {
            prevPageBtn.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.loadProducts();
                }
            });
        }

        const nextPageBtn = document.getElementById('next-page');
        if (nextPageBtn) {
            nextPageBtn.addEventListener('click', () => {
                if (this.currentPage < this.totalPages) {
                    this.currentPage++;
                    this.loadProducts();
                }
            });
        }

        // Select all checkbox
        const selectAllCheckbox = document.getElementById('select-all');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                this.toggleSelectAll(e.target.checked);
            });
        }

        // Bulk actions
        const bulkActivateBtn = document.getElementById('bulk-activate');
        if (bulkActivateBtn) {
            bulkActivateBtn.addEventListener('click', () => {
                this.bulkUpdateStatus(true);
            });
        }

        const bulkDeactivateBtn = document.getElementById('bulk-deactivate');
        if (bulkDeactivateBtn) {
            bulkDeactivateBtn.addEventListener('click', () => {
                this.bulkUpdateStatus(false);
            });
        }

        const bulkAdjustStockBtn = document.getElementById('bulk-adjust-stock');
        if (bulkAdjustStockBtn) {
            bulkAdjustStockBtn.addEventListener('click', () => {
                this.showBulkStockAdjustmentModal();
            });
        }

        const bulkDeleteBtn = document.getElementById('bulk-delete');
        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener('click', () => {
                this.bulkDeleteProducts();
            });
        }

        // Export/Print
        const exportBtn = document.getElementById('export-products');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportProducts();
            });
        }

        const printBtn = document.getElementById('print-products');
        if (printBtn) {
            printBtn.addEventListener('click', () => {
                this.printProducts();
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault();
                searchInput.focus();
                searchInput.select();
            }
            
            if (e.ctrlKey && e.key === 'n') {
                e.preventDefault();
                this.showAddProductModal();
            }
            
            if (e.key === 'Escape') {
                this.selectedProducts.clear();
                this.updateBulkActions();
            }
        });
    }

    async loadCategories() {
        try {
            const response = await this.api.get('/products/categories');
            this.categories = response.categories;
            this.renderCategoryFilter();
        } catch (error) {
            console.error('Failed to load categories:', error);
            this.app.showNotification('Failed to load categories', 'error');
        }
    }

    renderCategoryFilter() {
        const categoryFilter = document.getElementById('category-filter');
        if (!categoryFilter) return;
        
        // Clear existing options except first
        while (categoryFilter.options.length > 1) {
            categoryFilter.remove(1);
        }
        
        // Add categories recursively
        const addCategories = (categories, level = 0) => {
            categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = ' '.repeat(level * 2) + category.name;
                categoryFilter.appendChild(option);
                
                if (category.children) {
                    addCategories(category.children, level + 1);
                }
            });
        };
        
        addCategories(this.categories);
    }

    async loadBrands() {
        try {
            const response = await this.api.get('/products/brands');
            this.brands = response.brands;
            this.renderBrandFilter();
        } catch (error) {
            console.error('Failed to load brands:', error);
            this.app.showNotification('Failed to load brands', 'error');
        }
    }

    renderBrandFilter() {
        const brandFilter = document.getElementById('brand-filter');
        if (!brandFilter) return;
        
        // Clear existing options except first
        while (brandFilter.options.length > 1) {
            brandFilter.remove(1);
        }
        
        // Add brands
        this.brands.forEach(brand => {
            const option = document.createElement('option');
            option.value = brand.id;
            option.textContent = brand.name;
            brandFilter.appendChild(option);
        });
    }

    async loadProducts() {
        this.app.showLoading('Loading products...');
        
        try {
            // Build query parameters
            const params = new URLSearchParams({
                page: this.currentPage,
                page_size: this.pageSize
            });
            
            if (this.filters.category_id) {
                params.append('category_id', this.filters.category_id);
            }
            
            if (this.filters.brand_id) {
                params.append('brand_id', this.filters.brand_id);
            }
            
            if (this.filters.search) {
                params.append('search', this.filters.search);
            }
            
            if (this.filters.is_active !== undefined && this.filters.is_active !== null) {
                params.append('is_active', this.filters.is_active);
            }
            
            if (this.filters.low_stock) {
                params.append('low_stock', 'true');
            }
            
            if (this.filters.out_of_stock) {
                params.append('out_of_stock', 'true');
            }
            
            const response = await this.api.get(`/products?${params.toString()}`);
            
            this.products = response.products;
            this.totalPages = response.total_pages;
            this.currentPage = response.current_page;
            
            this.renderProducts();
            this.updatePagination();
            this.updateProductCount();
            
        } catch (error) {
            console.error('Failed to load products:', error);
            this.app.showNotification('Failed to load products', 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    renderProducts() {
        const tbody = document.getElementById('products-tbody');
        if (!tbody) return;
        
        tbody.innerHTML = this.products.map(product => `
            <tr data-product-id="${product.id}" class="${product.current_stock <= 0 ? 'out-of-stock' : product.current_stock <= product.min_stock ? 'low-stock' : ''}">
                <td>
                    <input type="checkbox" class="product-select" 
                           data-product-id="${product.id}"
                           ${this.selectedProducts.has(product.id) ? 'checked' : ''}>
                </td>
                <td>
                    <div class="product-code">${product.product_code}</div>
                    ${product.barcode ? `<div class="barcode">${product.barcode}</div>` : ''}
                </td>
                <td>
                    <div class="product-name">${product.name}</div>
                    ${product.description ? `<div class="product-desc">${product.description.substring(0, 50)}${product.description.length > 50 ? '...' : ''}</div>` : ''}
                </td>
                <td>${product.category_name || '-'}</td>
                <td>${product.brand_name || '-'}</td>
                <td>
                    <div class="stock-info">
                        <span class="stock-quantity ${product.current_stock <= product.min_stock ? 'text-warning' : ''} ${product.current_stock <= 0 ? 'text-danger' : ''}">
                            ${product.current_stock}
                        </span>
                        <div class="stock-min">Min: ${product.min_stock}</div>
                    </div>
                </td>
                <td class="text-right">${this.app.formatCurrency(product.cost_price)}</td>
                <td class="text-right">
                    <div class="retail-price">${this.app.formatCurrency(product.retail_price)}</div>
                    ${product.wholesale_price ? `<div class="wholesale-price text-muted">Whole: ${this.app.formatCurrency(product.wholesale_price)}</div>` : ''}
                    ${product.dealer_price ? `<div class="dealer-price text-muted">Dealer: ${this.app.formatCurrency(product.dealer_price)}</div>` : ''}
                </td>
                <td class="text-right">
                    <span class="${((product.retail_price - product.cost_price) / product.cost_price * 100) >= 30 ? 'text-success' : 'text-warning'}">
                        ${((product.retail_price - product.cost_price) / product.cost_price * 100).toFixed(1)}%
                    </span>
                </td>
                <td>
                    <span class="status-badge ${product.is_active ? 'status-active' : 'status-inactive'}">
                        ${product.is_active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-action btn-view" data-product-id="${product.id}" title="View">
                            👁️
                        </button>
                        <button class="btn-action btn-edit" data-product-id="${product.id}" title="Edit">
                            ✏️
                        </button>
                        <button class="btn-action btn-stock" data-product-id="${product.id}" title="Adjust Stock">
                            📦
                        </button>
                        <button class="btn-action btn-delete" data-product-id="${product.id}" title="Delete">
                            🗑️
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
        
        // Add event listeners to action buttons
        tbody.querySelectorAll('.btn-view').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productId = btn.dataset.productId;
                this.viewProduct(productId);
            });
        });
        
        tbody.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productId = btn.dataset.productId;
                this.editProduct(productId);
            });
        });
        
        tbody.querySelectorAll('.btn-stock').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productId = btn.dataset.productId;
                this.adjustStock(productId);
            });
        });
        
        tbody.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productId = btn.dataset.productId;
                this.deleteProduct(productId);
            });
        });
        
        // Add event listeners to select checkboxes
        tbody.querySelectorAll('.product-select').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const productId = parseInt(checkbox.dataset.productId);
                if (checkbox.checked) {
                    this.selectedProducts.add(productId);
                } else {
                    this.selectedProducts.delete(productId);
                }
                this.updateBulkActions();
            });
        });
    }

    updatePagination() {
        const prevPageBtn = document.getElementById('prev-page');
        const nextPageBtn = document.getElementById('next-page');
        const currentPageSpan = document.getElementById('current-page');
        const totalPagesSpan = document.getElementById('total-pages');
        
        if (prevPageBtn) {
            prevPageBtn.disabled = this.currentPage <= 1;
        }
        
        if (nextPageBtn) {
            nextPageBtn.disabled = this.currentPage >= this.totalPages;
        }
        
        if (currentPageSpan) {
            currentPageSpan.textContent = this.currentPage;
        }
        
        if (totalPagesSpan) {
            totalPagesSpan.textContent = this.totalPages;
        }
    }

    updateProductCount() {
        const productCount = document.getElementById('product-count');
        if (productCount) {
            productCount.textContent = this.products.length;
        }
    }

    updateBulkActions() {
        const bulkActions = document.getElementById('bulk-actions');
        const selectedCount = document.getElementById('selected-count');
        const selectAllCheckbox = document.getElementById('select-all');
        
        if (this.selectedProducts.size > 0) {
            if (bulkActions) bulkActions.style.display = 'flex';
            if (selectedCount) selectedCount.textContent = this.selectedProducts.size;
            if (selectAllCheckbox) selectAllCheckbox.checked = this.selectedProducts.size === this.products.length;
        } else {
            if (bulkActions) bulkActions.style.display = 'none';
            if (selectAllCheckbox) selectAllCheckbox.checked = false;
        }
    }

    toggleSelectAll(selectAll) {
        const checkboxes = document.querySelectorAll('.product-select');
        
        checkboxes.forEach(checkbox => {
            const productId = parseInt(checkbox.dataset.productId);
            
            if (selectAll) {
                checkbox.checked = true;
                this.selectedProducts.add(productId);
            } else {
                checkbox.checked = false;
                this.selectedProducts.delete(productId);
            }
        });
        
        this.updateBulkActions();
    }

    clearFilters() {
        // Clear filter inputs
        document.getElementById('product-search').value = '';
        document.getElementById('category-filter').value = '';
        document.getElementById('brand-filter').value = '';
        document.getElementById('stock-filter').value = '';
        document.getElementById('status-filter').value = '';
        
        // Clear filter object
        this.filters = {};
        
        // Reset pagination
        this.currentPage = 1;
        
        // Reload products
        this.loadProducts();
    }

    handleQuickAction(action) {
        switch(action) {
            case 'low-stock':
                this.filters.low_stock = true;
                delete this.filters.out_of_stock;
                this.currentPage = 1;
                this.loadProducts();
                break;
                
            case 'out-of-stock':
                this.filters.out_of_stock = true;
                delete this.filters.low_stock;
                this.currentPage = 1;
                this.loadProducts();
                break;
                
            case 'top-selling':
                this.showTopSellingProducts();
                break;
                
            case 'bulk-price-update':
                this.showBulkPriceUpdateModal();
                break;
        }
    }

    async viewProduct(productId) {
        this.app.showLoading('Loading product details...');
        
        try {
            const response = await this.api.get(`/products/${productId}`);
            this.showProductDetailsModal(response.product);
        } catch (error) {
            console.error('Failed to load product details:', error);
            this.app.showNotification('Failed to load product details', 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    showProductDetailsModal(product) {
        const modalHtml = `
            <div class="modal" style="width: 800px;">
                <div class="modal-header">
                    <h3 class="modal-title">Product Details</h3>
                    <button class="modal-close" onclick="POS.screens.products.closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="product-details-container">
                        <!-- Product Header -->
                        <div class="product-header">
                            <div class="product-basic-info">
                                <h4>${product.name}</h4>
                                <div class="product-code">Code: ${product.product_code}</div>
                                ${product.barcode ? `<div class="barcode">Barcode: ${product.barcode}</div>` : ''}
                            </div>
                            <div class="product-status">
                                <span class="status-badge ${product.is_active ? 'status-active' : 'status-inactive'}">
                                    ${product.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                        </div>
                        
                        <!-- Product Tabs -->
                        <div class="product-tabs">
                            <button class="tab-btn active" data-tab="basic">Basic Info</button>
                            <button class="tab-btn" data-tab="pricing">Pricing</button>
                            <button class="tab-btn" data-tab="stock">Stock</button>
                            <button class="tab-btn" data-tab="sales">Sales History</button>
                        </div>
                        
                        <!-- Tab Contents -->
                        <div class="tab-content active" id="tab-basic">
                            <div class="info-grid">
                                <div class="info-item">
                                    <label>Category:</label>
                                    <span>${product.category_name || '-'}</span>
                                </div>
                                <div class="info-item">
                                    <label>Brand:</label>
                                    <span>${product.brand_name || '-'}</span>
                                </div>
                                <div class="info-item">
                                    <label>Unit:</label>
                                    <span>${product.unit || 'pcs'}</span>
                                </div>
                                <div class="info-item">
                                    <label>Vehicle Type:</label>
                                    <span>${product.for_vehicle_type || 'All'}</span>
                                </div>
                                <div class="info-item">
                                    <label>Warranty:</label>
                                    <span>${product.warranty_days || 0} days</span>
                                </div>
                                <div class="info-item">
                                    <label>Has Serial:</label>
                                    <span>${product.has_serial ? 'Yes' : 'No'}</span>
                                </div>
                                <div class="info-item full-width">
                                    <label>Description:</label>
                                    <div>${product.description || 'No description'}</div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="tab-content" id="tab-pricing">
                            <div class="pricing-grid">
                                <div class="price-item">
                                    <label>Cost Price:</label>
                                    <span class="price-value">${this.app.formatCurrency(product.cost_price)}</span>
                                </div>
                                <div class="price-item">
                                    <label>Retail Price:</label>
                                    <span class="price-value retail">${this.app.formatCurrency(product.retail_price)}</span>
                                </div>
                                <div class="price-item">
                                    <label>Wholesale Price:</label>
                                    <span class="price-value">${product.wholesale_price ? this.app.formatCurrency(product.wholesale_price) : '-'}</span>
                                </div>
                                <div class="price-item">
                                    <label>Dealer Price:</label>
                                    <span class="price-value">${product.dealer_price ? this.app.formatCurrency(product.dealer_price) : '-'}</span>
                                </div>
                                <div class="price-item">
                                    <label>Min Sale Price:</label>
                                    <span class="price-value">${product.min_sale_price ? this.app.formatCurrency(product.min_sale_price) : '-'}</span>
                                </div>
                                <div class="price-item">
                                    <label>Profit Margin:</label>
                                    <span class="price-value ${((product.retail_price - product.cost_price) / product.cost_price * 100) >= 30 ? 'text-success' : 'text-warning'}">
                                        ${((product.retail_price - product.cost_price) / product.cost_price * 100).toFixed(1)}%
                                    </span>
                                </div>
                                <div class="price-item">
                                    <label>GST Rate:</label>
                                    <span class="price-value">${product.gst_rate || 17}%</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="tab-content" id="tab-stock">
                            <div class="stock-info-grid">
                                <div class="stock-item">
                                    <label>Current Stock:</label>
                                    <span class="stock-value ${product.current_stock <= 0 ? 'text-danger' : product.current_stock <= product.min_stock ? 'text-warning' : ''}">
                                        ${product.current_stock}
                                    </span>
                                </div>
                                <div class="stock-item">
                                    <label>Minimum Stock:</label>
                                    <span class="stock-value">${product.min_stock}</span>
                                </div>
                                <div class="stock-item">
                                    <label>Maximum Stock:</label>
                                    <span class="stock-value">${product.max_stock || 'Not set'}</span>
                                </div>
                                <div class="stock-item">
                                    <label>Reorder Level:</label>
                                    <span class="stock-value">${product.reorder_level || 'Not set'}</span>
                                </div>
                                <div class="stock-item">
                                    <label>Stock Value:</label>
                                    <span class="stock-value">${this.app.formatCurrency(product.current_stock * product.cost_price)}</span>
                                </div>
                                <div class="stock-item">
                                    <label>Last Stock Update:</label>
                                    <span class="stock-value">${product.last_stock_update ? this.app.formatDate(product.last_stock_update) : 'Never'}</span>
                                </div>
                            </div>
                            
                            <!-- Stock Movements -->
                            <h4>Recent Stock Movements</h4>
                            ${product.stock_movements && product.stock_movements.length > 0 ? `
                                <div class="stock-movements">
                                    ${product.stock_movements.slice(0, 10).map(movement => `
                                        <div class="movement-item">
                                            <div class="movement-type ${movement.movement_type}">${movement.movement_type.toUpperCase()}</div>
                                            <div class="movement-quantity ${movement.quantity > 0 ? 'positive' : 'negative'}">
                                                ${movement.quantity > 0 ? '+' : ''}${movement.quantity}
                                            </div>
                                            <div class="movement-date">${this.app.formatDate(movement.created_at)}</div>
                                            <div class="movement-user">${movement.user_name || 'System'}</div>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : '<p>No stock movements recorded</p>'}
                        </div>
                        
                        <div class="tab-content" id="tab-sales">
                            ${product.sales_history && product.sales_history.length > 0 ? `
                                <div class="sales-history">
                                    <table class="table">
                                        <thead>
                                            <tr>
                                                <th>Invoice</th>
                                                <th>Date</th>
                                                <th>Customer</th>
                                                <th>Quantity</th>
                                                <th>Unit Price</th>
                                                <th>Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${product.sales_history.map(sale => `
                                                <tr>
                                                    <td>${sale.invoice_number}</td>
                                                    <td>${this.app.formatDate(sale.invoice_date)}</td>
                                                    <td>${sale.customer_name || 'Walk-in'}</td>
                                                    <td>${sale.quantity}</td>
                                                    <td>${this.app.formatCurrency(sale.unit_price)}</td>
                                                    <td>${this.app.formatCurrency(sale.line_total)}</td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            ` : '<p>No sales history recorded</p>'}
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="POS.screens.products.closeModal()">
                        Close
                    </button>
                    <button class="btn btn-primary" onclick="POS.screens.products.editProduct(${product.id})">
                        Edit Product
                    </button>
                </div>
            </div>
        `;
        
        this.showModal(modalHtml);
        
        // Setup tab switching
        setTimeout(() => {
            const tabBtns = document.querySelectorAll('.tab-btn');
            tabBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    // Remove active class from all tabs
                    tabBtns.forEach(b => b.classList.remove('active'));
                    document.querySelectorAll('.tab-content').forEach(content => {
                        content.classList.remove('active');
                    });
                    
                    // Add active class to clicked tab
                    btn.classList.add('active');
                    const tabId = btn.dataset.tab;
                    document.getElementById(`tab-${tabId}`).classList.add('active');
                });
            });
        }, 100);
    }

    showAddProductModal() {
        const modalHtml = `
            <div class="modal" style="width: 700px;">
                <div class="modal-header">
                    <h3 class="modal-title">Add New Product</h3>
                    <button class="modal-close" onclick="POS.screens.products.closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="add-product-form" class="product-form">
                        <div class="form-section">
                            <h4>Basic Information</h4>
                            <div class="form-grid">
                                <div class="form-group">
                                    <label class="input-label required">Product Code</label>
                                    <input type="text" id="product-code" class="input-field" 
                                           placeholder="PROD001" required>
                                </div>
                                <div class="form-group">
                                    <label class="input-label">Barcode</label>
                                    <input type="text" id="barcode" class="input-field" 
                                           placeholder="8901234567890">
                                </div>
                                <div class="form-group">
                                    <label class="input-label required">Product Name</label>
                                    <input type="text" id="product-name" class="input-field" 
                                           placeholder="Enter product name" required>
                                </div>
                                <div class="form-group">
                                    <label class="input-label required">Category</label>
                                    <select id="category" class="input-field" required>
                                        <option value="">Select Category</option>
                                        ${this.generateCategoryOptions()}
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label class="input-label">Brand</label>
                                    <select id="brand" class="input-field">
                                        <option value="">Select Brand</option>
                                        ${this.brands.map(brand => `
                                            <option value="${brand.id}">${brand.name}</option>
                                        `).join('')}
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label class="input-label">Unit</label>
                                    <select id="unit" class="input-field">
                                        <option value="pcs">Pieces (pcs)</option>
                                        <option value="kg">Kilogram (kg)</option>
                                        <option value="litre">Litre</option>
                                        <option value="meter">Meter</option>
                                        <option value="set">Set</option>
                                        <option value="pair">Pair</option>
                                    </select>
                                </div>
                                <div class="form-group full-width">
                                    <label class="input-label">Description</label>
                                    <textarea id="description" class="input-field" 
                                              rows="3" placeholder="Product description"></textarea>
                                </div>
                            </div>
                        </div>
                        
                        <div class="form-section">
                            <h4>Pricing Information</h4>
                            <div class="form-grid">
                                <div class="form-group">
                                    <label class="input-label required">Cost Price</label>
                                    <input type="number" id="cost-price" class="input-field" 
                                           step="0.01" min="0" required>
                                </div>
                                <div class="form-group">
                                    <label class="input-label required">Retail Price</label>
                                    <input type="number" id="retail-price" class="input-field" 
                                           step="0.01" min="0" required>
                                </div>
                                <div class="form-group">
                                    <label class="input-label">Wholesale Price</label>
                                    <input type="number" id="wholesale-price" class="input-field" 
                                           step="0.01" min="0">
                                </div>
                                <div class="form-group">
                                    <label class="input-label">Dealer Price</label>
                                    <input type="number" id="dealer-price" class="input-field" 
                                           step="0.01" min="0">
                                </div>
                                <div class="form-group">
                                    <label class="input-label">Minimum Sale Price</label>
                                    <input type="number" id="min-sale-price" class="input-field" 
                                           step="0.01" min="0">
                                </div>
                                <div class="form-group">
                                    <label class="input-label">GST Rate (%)</label>
                                    <input type="number" id="gst-rate" class="input-field" 
                                           value="17" step="0.01" min="0" max="100">
                                </div>
                            </div>
                        </div>
                        
                        <div class="form-section">
                            <h4>Stock Information</h4>
                            <div class="form-grid">
                                <div class="form-group">
                                    <label class="input-label">Current Stock</label>
                                    <input type="number" id="current-stock" class="input-field" 
                                           value="0" step="0.001" min="0">
                                </div>
                                <div class="form-group">
                                    <label class="input-label">Minimum Stock</label>
                                    <input type="number" id="min-stock" class="input-field" 
                                           value="5" step="0.001" min="0">
                                </div>
                                <div class="form-group">
                                    <label class="input-label">Maximum Stock</label>
                                    <input type="number" id="max-stock" class="input-field" 
                                           step="0.001" min="0">
                                </div>
                                <div class="form-group">
                                    <label class="input-label">Reorder Level</label>
                                    <input type="number" id="reorder-level" class="input-field" 
                                           step="0.001" min="0">
                                </div>
                            </div>
                        </div>
                        
                        <div class="form-section">
                            <h4>Additional Information</h4>
                            <div class="form-grid">
                                <div class="form-group">
                                    <label class="input-label">Vehicle Type</label>
                                    <select id="vehicle-type" class="input-field">
                                        <option value="">All Vehicles</option>
                                        <option value="car">Car</option>
                                        <option value="bike">Bike</option>
                                        <option value="rickshaw">Rickshaw</option>
                                        <option value="truck">Truck</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label class="input-label">Warranty Days</label>
                                    <input type="number" id="warranty-days" class="input-field" 
                                           value="180" min="0">
                                </div>
                                <div class="form-group">
                                    <label class="input-label">
                                        <input type="checkbox" id="has-serial"> Track Serial Numbers
                                    </label>
                                </div>
                                <div class="form-group">
                                    <label class="input-label">
                                        <input type="checkbox" id="is-service" checked> Is Product
                                    </label>
                                </div>
                                <div class="form-group">
                                    <label class="input-label">
                                        <input type="checkbox" id="is-active" checked> Active
                                    </label>
                                </div>
                            </div>
                        </div>
                        
                        <div id="form-error" class="text-danger" style="display: none;"></div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="POS.screens.products.closeModal()">
                        Cancel
                    </button>
                    <button class="btn btn-primary" onclick="POS.screens.products.createProduct()">
                        Create Product
                    </button>
                </div>
            </div>
        `;
        
        this.showModal(modalHtml);
        
        // Auto-focus on product code
        setTimeout(() => {
            document.getElementById('product-code').focus();
        }, 100);
        
        // Calculate profit margin on price change
        const costPriceInput = document.getElementById('cost-price');
        const retailPriceInput = document.getElementById('retail-price');
        
        const calculateMargin = () => {
            const cost = parseFloat(costPriceInput.value) || 0;
            const retail = parseFloat(retailPriceInput.value) || 0;
            
            if (cost > 0 && retail > 0) {
                const margin = ((retail - cost) / cost * 100).toFixed(1);
                // You could display this somewhere
            }
        };
        
        if (costPriceInput && retailPriceInput) {
            costPriceInput.addEventListener('input', calculateMargin);
            retailPriceInput.addEventListener('input', calculateMargin);
        }
    }

    generateCategoryOptions(categories = null, level = 0) {
        if (!categories) categories = this.categories;
        
        let options = '';
        categories.forEach(category => {
            const indent = ' '.repeat(level * 2);
            options += `<option value="${category.id}">${indent}${category.name}</option>`;
            
            if (category.children) {
                options += this.generateCategoryOptions(category.children, level + 1);
            }
        });
        
        return options;
    }

    async createProduct() {
        const formData = {
            product_code: document.getElementById('product-code').value.trim(),
            barcode: document.getElementById('barcode').value.trim() || null,
            name: document.getElementById('product-name').value.trim(),
            category_id: parseInt(document.getElementById('category').value),
            brand_id: document.getElementById('brand').value ? parseInt(document.getElementById('brand').value) : null,
            unit: document.getElementById('unit').value,
            description: document.getElementById('description').value.trim() || null,
            cost_price: parseFloat(document.getElementById('cost-price').value),
            retail_price: parseFloat(document.getElementById('retail-price').value),
            wholesale_price: document.getElementById('wholesale-price').value ? parseFloat(document.getElementById('wholesale-price').value) : null,
            dealer_price: document.getElementById('dealer-price').value ? parseFloat(document.getElementById('dealer-price').value) : null,
            min_sale_price: document.getElementById('min-sale-price').value ? parseFloat(document.getElementById('min-sale-price').value) : null,
            current_stock: parseFloat(document.getElementById('current-stock').value) || 0,
            min_stock: parseFloat(document.getElementById('min-stock').value) || 5,
            max_stock: document.getElementById('max-stock').value ? parseFloat(document.getElementById('max-stock').value) : null,
            reorder_level: document.getElementById('reorder-level').value ? parseFloat(document.getElementById('reorder-level').value) : null,
            gst_rate: parseFloat(document.getElementById('gst-rate').value) || 17.0,
            for_vehicle_type: document.getElementById('vehicle-type').value || null,
            warranty_days: parseInt(document.getElementById('warranty-days').value) || 180,
            has_serial: document.getElementById('has-serial').checked,
            is_service: !document.getElementById('is-service').checked,
            is_active: document.getElementById('is-active').checked
        };
        
        // Validation
        const errorElement = document.getElementById('form-error');
        if (!formData.product_code || !formData.name || !formData.category_id || 
            isNaN(formData.cost_price) || isNaN(formData.retail_price)) {
            errorElement.textContent = 'Please fill all required fields';
            errorElement.style.display = 'block';
            return;
        }
        
        if (formData.retail_price < formData.cost_price) {
            errorElement.textContent = 'Retail price cannot be less than cost price';
            errorElement.style.display = 'block';
            return;
        }
        
        try {
            this.app.showLoading('Creating product...');
            
            const response = await this.api.post('/products', formData);
            
            this.closeModal();
            this.app.showNotification('Product created successfully', 'success');
            
            // Refresh products list
            this.loadProducts();
            
        } catch (error) {
            console.error('Failed to create product:', error);
            errorElement.textContent = error.message || 'Failed to create product';
            errorElement.style.display = 'block';
        } finally {
            this.app.hideLoading();
        }
    }

    async editProduct(productId) {
        this.app.showLoading('Loading product...');
        
        try {
            const response = await this.api.get(`/products/${productId}`);
            this.showEditProductModal(response.product);
        } catch (error) {
            console.error('Failed to load product:', error);
            this.app.showNotification('Failed to load product', 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    showEditProductModal(product) {
        // Similar to add modal but with existing data
        // Implement edit functionality
        console.log('Edit product:', product);
        this.app.showNotification('Edit product functionality would open here', 'info');
    }

    async adjustStock(productId) {
        const modalHtml = `
            <div class="modal" style="width: 500px;">
                <div class="modal-header">
                    <h3 class="modal-title">Adjust Stock</h3>
                    <button class="modal-close" onclick="POS.screens.products.closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="current-stock-info">
                        <h4>Current Stock: <span id="current-stock-value">Loading...</span></h4>
                    </div>
                    
                    <form id="adjust-stock-form">
                        <div class="form-group">
                            <label class="input-label required">Adjustment Type</label>
                            <select id="movement-type" class="input-field" required>
                                <option value="purchase">Purchase/Inward</option>
                                <option value="sale">Sale/Outward</option>
                                <option value="adjustment">Stock Adjustment (Increase)</option>
                                <option value="damage">Damage/Write-off</option>
                                <option value="return">Customer Return</option>
                                <option value="transfer">Stock Transfer</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label class="input-label required">Quantity</label>
                            <input type="number" id="adjustment-quantity" class="input-field" 
                                   step="0.001" required>
                            <div class="input-hint">Use negative value for reduction</div>
                        </div>
                        
                        <div class="form-group">
                            <label class="input-label">Reference Number</label>
                            <input type="text" id="reference-number" class="input-field" 
                                   placeholder="Optional reference">
                        </div>
                        
                        <div class="form-group">
                            <label class="input-label">Reason</label>
                            <textarea id="adjustment-reason" class="input-field" 
                                      rows="3" placeholder="Reason for stock adjustment"></textarea>
                        </div>
                        
                        <div class="form-group">
                            <label class="input-label">Notes</label>
                            <textarea id="adjustment-notes" class="input-field" 
                                      rows="2" placeholder="Additional notes"></textarea>
                        </div>
                        
                        <div id="stock-error" class="text-danger" style="display: none;"></div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="POS.screens.products.closeModal()">
                        Cancel
                    </button>
                    <button class="btn btn-primary" onclick="POS.screens.products.submitStockAdjustment(${productId})">
                        Adjust Stock
                    </button>
                </div>
            </div>
        `;
        
        this.showModal(modalHtml);
        
        // Load current stock
        this.loadProductStock(productId);
    }

    async loadProductStock(productId) {
        try {
            const response = await this.api.get(`/products/${productId}`);
            const currentStock = response.product.current_stock;
            
            const stockElement = document.getElementById('current-stock-value');
            if (stockElement) {
                stockElement.textContent = currentStock;
                stockElement.className = currentStock <= 0 ? 'text-danger' : 
                                       currentStock <= response.product.min_stock ? 'text-warning' : '';
            }
        } catch (error) {
            console.error('Failed to load product stock:', error);
        }
    }

    async submitStockAdjustment(productId) {
        const movementType = document.getElementById('movement-type').value;
        const quantity = parseFloat(document.getElementById('adjustment-quantity').value);
        const referenceNumber = document.getElementById('reference-number').value.trim();
        const reason = document.getElementById('adjustment-reason').value.trim();
        const notes = document.getElementById('adjustment-notes').value.trim();
        const errorElement = document.getElementById('stock-error');
        
        if (isNaN(quantity) || quantity === 0) {
            errorElement.textContent = 'Please enter a valid non-zero quantity';
            errorElement.style.display = 'block';
            return;
        }
        
        try {
            this.app.showLoading('Adjusting stock...');
            
            const adjustmentData = {
                quantity: quantity,
                movement_type: movementType,
                reason: reason || 'Stock adjustment',
                notes: notes
            };
            
            if (referenceNumber) {
                adjustmentData.reference_number = referenceNumber;
            }
            
            await this.api.post(`/products/${productId}/adjust-stock`, adjustmentData);
            
            this.closeModal();
            this.app.showNotification('Stock adjusted successfully', 'success');
            
            // Refresh products list
            this.loadProducts();
            
        } catch (error) {
            console.error('Failed to adjust stock:', error);
            errorElement.textContent = error.message || 'Failed to adjust stock';
            errorElement.style.display = 'block';
        } finally {
            this.app.hideLoading();
        }
    }

    async deleteProduct(productId) {
        if (!confirm('Are you sure you want to delete this product? This will deactivate it.')) {
            return;
        }
        
        try {
            this.app.showLoading('Deleting product...');
            
            await this.api.delete(`/products/${productId}`);
            
            this.app.showNotification('Product deleted successfully', 'success');
            
            // Refresh products list
            this.loadProducts();
            
        } catch (error) {
            console.error('Failed to delete product:', error);
            this.app.showNotification('Failed to delete product', 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    async bulkUpdateStatus(activate) {
        if (this.selectedProducts.size === 0) return;
        
        const action = activate ? 'activate' : 'deactivate';
        if (!confirm(`Are you sure you want to ${action} ${this.selectedProducts.size} products?`)) {
            return;
        }
        
        try {
            this.app.showLoading(`${activate ? 'Activating' : 'Deactivating'} products...`);
            
            // Update each product
            const updates = Array.from(this.selectedProducts).map(productId => {
                return this.api.put(`/products/${productId}`, {
                    is_active: activate
                }).catch(error => {
                    console.error(`Failed to update product ${productId}:`, error);
                    return null;
                });
            });
            
            await Promise.all(updates);
            
            this.app.showNotification(`${this.selectedProducts.size} products ${action}d successfully`, 'success');
            
            // Clear selection and refresh
            this.selectedProducts.clear();
            this.updateBulkActions();
            this.loadProducts();
            
        } catch (error) {
            console.error('Failed to bulk update status:', error);
            this.app.showNotification('Failed to update products', 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    showBulkStockAdjustmentModal() {
        if (this.selectedProducts.size === 0) return;
        
        const modalHtml = `
            <div class="modal" style="width: 500px;">
                <div class="modal-header">
                    <h3 class="modal-title">Bulk Stock Adjustment</h3>
                    <button class="modal-close" onclick="POS.screens.products.closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <p>Adjusting stock for <strong>${this.selectedProducts.size}</strong> products</p>
                    
                    <form id="bulk-adjust-form">
                        <div class="form-group">
                            <label class="input-label required">Adjustment Type</label>
                            <select id="bulk-movement-type" class="input-field" required>
                                <option value="purchase">Purchase/Inward</option>
                                <option value="adjustment">Stock Adjustment (Increase)</option>
                                <option value="damage">Damage/Write-off</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label class="input-label required">Quantity per Product</label>
                            <input type="number" id="bulk-quantity" class="input-field" 
                                   step="0.001" value="0" required>
                        </div>
                        
                        <div class="form-group">
                            <label class="input-label">Reason</label>
                            <input type="text" id="bulk-reason" class="input-field" 
                                   value="Bulk stock adjustment" required>
                        </div>
                        
                        <div id="bulk-error" class="text-danger" style="display: none;"></div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="POS.screens.products.closeModal()">
                        Cancel
                    </button>
                    <button class="btn btn-primary" onclick="POS.screens.products.submitBulkStockAdjustment()">
                        Adjust All
                    </button>
                </div>
            </div>
        `;
        
        this.showModal(modalHtml);
    }

    async submitBulkStockAdjustment() {
        const movementType = document.getElementById('bulk-movement-type').value;
        const quantity = parseFloat(document.getElementById('bulk-quantity').value);
        const reason = document.getElementById('bulk-reason').value.trim();
        const errorElement = document.getElementById('bulk-error');
        
        if (isNaN(quantity) || quantity === 0) {
            errorElement.textContent = 'Please enter a valid non-zero quantity';
            errorElement.style.display = 'block';
            return;
        }
        
        if (!reason) {
            errorElement.textContent = 'Please enter a reason';
            errorElement.style.display = 'block';
            return;
        }
        
        try {
            this.app.showLoading('Adjusting stock for all selected products...');
            
            // Adjust stock for each product
            const adjustments = Array.from(this.selectedProducts).map(productId => {
                return this.api.post(`/products/${productId}/adjust-stock`, {
                    quantity: quantity,
                    movement_type: movementType,
                    reason: reason,
                    notes: 'Bulk stock adjustment'
                }).catch(error => {
                    console.error(`Failed to adjust stock for product ${productId}:`, error);
                    return { success: false, productId, error };
                });
            });
            
            const results = await Promise.all(adjustments);
            
            const successful = results.filter(r => r && !r.error).length;
            const failed = results.length - successful;
            
            this.closeModal();
            
            if (failed === 0) {
                this.app.showNotification(`Stock adjusted for ${successful} products`, 'success');
            } else {
                this.app.showNotification(`Stock adjusted for ${successful} products, ${failed} failed`, 
                                         failed === results.length ? 'error' : 'warning');
            }
            
            // Clear selection and refresh
            this.selectedProducts.clear();
            this.updateBulkActions();
            this.loadProducts();
            
        } catch (error) {
            console.error('Failed to bulk adjust stock:', error);
            errorElement.textContent = error.message || 'Failed to adjust stock';
            errorElement.style.display = 'block';
        } finally {
            this.app.hideLoading();
        }
    }

    async bulkDeleteProducts() {
        if (this.selectedProducts.size === 0) return;
        
        if (!confirm(`Are you sure you want to delete ${this.selectedProducts.size} products? This will deactivate them.`)) {
            return;
        }
        
        try {
            this.app.showLoading('Deleting products...');
            
            // Delete each product
            const deletions = Array.from(this.selectedProducts).map(productId => {
                return this.api.delete(`/products/${productId}`).catch(error => {
                    console.error(`Failed to delete product ${productId}:`, error);
                    return { success: false, productId, error };
                });
            });
            
            const results = await Promise.all(deletions);
            
            const successful = results.filter(r => r && !r.error).length;
            const failed = results.length - successful;
            
            if (failed === 0) {
                this.app.showNotification(`${successful} products deleted successfully`, 'success');
            } else {
                this.app.showNotification(`${successful} products deleted, ${failed} failed`, 
                                         failed === results.length ? 'error' : 'warning');
            }
            
            // Clear selection and refresh
            this.selectedProducts.clear();
            this.updateBulkActions();
            this.loadProducts();
            
        } catch (error) {
            console.error('Failed to bulk delete products:', error);
            this.app.showNotification('Failed to delete products', 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    showBulkImportModal() {
        const modalHtml = `
            <div class="modal" style="width: 600px;">
                <div class="modal-header">
                    <h3 class="modal-title">Bulk Import Products</h3>
                    <button class="modal-close" onclick="POS.screens.products.closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="import-instructions">
                        <h4>Instructions:</h4>
                        <ol>
                            <li>Download the <a href="#" onclick="POS.screens.products.downloadTemplate()">template file</a></li>
                            <li>Fill in the product data</li>
                            <li>Upload the completed file</li>
                        </ol>
                        
                        <div class="template-info">
                            <strong>Required Fields:</strong> Product Code, Name, Category, Cost Price, Retail Price
                            <br>
                            <strong>Optional Fields:</strong> Barcode, Description, Brand, Unit, etc.
                        </div>
                    </div>
                    
                    <div class="import-form">
                        <div class="form-group">
                            <label class="input-label">Select File</label>
                            <input type="file" id="import-file" class="input-field" 
                                   accept=".csv,.xlsx,.xls">
                            <div class="input-hint">Supported formats: CSV, Excel</div>
                        </div>
                        
                        <div class="form-group">
                            <label class="input-label">
                                <input type="checkbox" id="update-existing" checked> Update existing products
                            </label>
                        </div>
                        
                        <div id="import-preview" style="display: none;">
                            <h4>Preview (first 5 rows):</h4>
                            <div class="preview-table"></div>
                        </div>
                        
                        <div id="import-error" class="text-danger" style="display: none;"></div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="POS.screens.products.closeModal()">
                        Cancel
                    </button>
                    <button class="btn btn-primary" id="start-import" disabled>
                        Start Import
                    </button>
                </div>
            </div>
        `;
        
        this.showModal(modalHtml);
        
        // Setup file upload
        const fileInput = document.getElementById('import-file');
        const startImportBtn = document.getElementById('start-import');
        
        if (fileInput && startImportBtn) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    startImportBtn.disabled = false;
                    this.previewImportFile(e.target.files[0]);
                } else {
                    startImportBtn.disabled = true;
                }
            });
            
            startImportBtn.addEventListener('click', () => {
                this.processImportFile(fileInput.files[0]);
            });
        }
    }

    downloadTemplate() {
        // Create template data
        const templateData = [
            ['product_code', 'barcode', 'name', 'description', 'category_id', 'brand_id', 
             'unit', 'cost_price', 'retail_price', 'wholesale_price', 'dealer_price', 
             'min_sale_price', 'current_stock', 'min_stock', 'gst_rate', 'for_vehicle_type', 
             'warranty_days', 'has_serial', 'is_service', 'is_active'],
            ['PROD001', '8901234567890', 'Sample Product', 'Product description', '1', '1', 
             'pcs', '100.00', '150.00', '135.00', '120.00', '110.00', '10', '5', '17.0', 
             'car', '180', 'false', 'false', 'true'],
            ['PROD002', '', 'Another Product', '', '2', '', 'pcs', '50.00', '75.00', '', 
             '', '', '20', '10', '17.0', '', '90', 'false', 'false', 'true']
        ];
        
        // Convert to CSV
        const csvContent = templateData.map(row => row.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        
        // Download
        const a = document.createElement('a');
        a.href = url;
        a.download = 'product_import_template.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }

    previewImportFile(file) {
        // Preview first few rows of the file
        // This would parse CSV/Excel and show preview
        console.log('Preview file:', file);
        
        const previewDiv = document.getElementById('import-preview');
        if (previewDiv) {
            previewDiv.style.display = 'block';
            previewDiv.querySelector('.preview-table').innerHTML = `
                <p>File: ${file.name} (${(file.size / 1024).toFixed(1)} KB)</p>
                <p>Parsing would show first few rows here...</p>
            `;
        }
    }

    async processImportFile(file) {
        this.app.showLoading('Processing import file...');
        
        try {
            // Parse the file (simplified - in real app use a CSV/Excel parser)
            const productsData = await this.parseImportFile(file);
            
            if (!productsData || productsData.length === 0) {
                throw new Error('No valid product data found in file');
            }
            
            // Send to backend
            const response = await this.api.post('/products/bulk-import', productsData);
            
            this.closeModal();
            
            if (response.successful > 0) {
                this.app.showNotification(`Imported ${response.successful} products successfully`, 'success');
            }
            
            if (response.failed > 0) {
                this.app.showNotification(`${response.failed} products failed to import`, 'warning');
                // Could show errors in a modal
            }
            
            // Refresh products list
            this.loadProducts();
            
        } catch (error) {
            console.error('Failed to import products:', error);
            this.app.showNotification('Failed to import products: ' + error.message, 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    parseImportFile(file) {
        return new Promise((resolve, reject) => {
            // Simplified parsing - in real app use Papa Parse for CSV or similar
            if (file.name.endsWith('.csv')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const content = e.target.result;
                        const lines = content.split('\n');
                        const headers = lines[0].split(',');
                        
                        const products = [];
                        for (let i = 1; i < Math.min(lines.length, 1000); i++) {
                            if (!lines[i].trim()) continue;
                            
                            const values = lines[i].split(',');
                            const product = {};
                            
                            headers.forEach((header, index) => {
                                if (values[index]) {
                                    product[header.trim()] = values[index].trim();
                                }
                            });
                            
                            // Convert numeric fields
                            ['cost_price', 'retail_price', 'wholesale_price', 'dealer_price', 
                             'min_sale_price', 'current_stock', 'min_stock', 'gst_rate', 
                             'warranty_days', 'category_id', 'brand_id'].forEach(field => {
                                if (product[field]) {
                                    product[field] = parseFloat(product[field]);
                                }
                            });
                            
                            // Convert boolean fields
                            ['has_serial', 'is_service', 'is_active'].forEach(field => {
                                if (product[field]) {
                                    product[field] = product[field].toLowerCase() === 'true';
                                }
                            });
                            
                            products.push(product);
                        }
                        
                        resolve(products);
                    } catch (error) {
                        reject(new Error('Failed to parse CSV file: ' + error.message));
                    }
                };
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsText(file);
            } else {
                reject(new Error('Unsupported file format. Please use CSV.'));
            }
        });
    }

    showBulkPriceUpdateModal() {
        if (this.selectedProducts.size === 0) {
            this.app.showNotification('Please select products first', 'warning');
            return;
        }
        
        const modalHtml = `
            <div class="modal" style="width: 500px;">
                <div class="modal-header">
                    <h3 class="modal-title">Bulk Price Update</h3>
                    <button class="modal-close" onclick="POS.screens.products.closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <p>Updating prices for <strong>${this.selectedProducts.size}</strong> products</p>
                    
                    <form id="bulk-price-form">
                        <div class="form-group">
                            <label class="input-label required">Price Type</label>
                            <select id="price-type" class="input-field" required>
                                <option value="retail_price">Retail Price</option>
                                <option value="wholesale_price">Wholesale Price</option>
                                <option value="dealer_price">Dealer Price</option>
                                <option value="cost_price">Cost Price</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label class="input-label required">Update Method</label>
                            <select id="update-method" class="input-field" required>
                                <option value="percentage">Percentage Change</option>
                                <option value="fixed">Fixed Amount</option>
                                <option value="set">Set to Specific Value</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label class="input-label required" id="value-label">Percentage (%)</label>
                            <input type="number" id="update-value" class="input-field" 
                                   step="0.01" required>
                        </div>
                        
                        <div class="form-group">
                            <label class="input-label">
                                <input type="checkbox" id="round-prices"> Round to nearest 5
                            </label>
                        </div>
                        
                        <div id="price-error" class="text-danger" style="display: none;"></div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="POS.screens.products.closeModal()">
                        Cancel
                    </button>
                    <button class="btn btn-primary" onclick="POS.screens.products.submitBulkPriceUpdate()">
                        Update Prices
                    </button>
                </div>
            </div>
        `;
        
        this.showModal(modalHtml);
        
        // Update value label based on method
        const updateMethodSelect = document.getElementById('update-method');
        const valueLabel = document.getElementById('value-label');
        
        if (updateMethodSelect && valueLabel) {
            updateMethodSelect.addEventListener('change', () => {
                switch(updateMethodSelect.value) {
                    case 'percentage':
                        valueLabel.textContent = 'Percentage (%)';
                        break;
                    case 'fixed':
                        valueLabel.textContent = 'Amount to Add/Subtract';
                        break;
                    case 'set':
                        valueLabel.textContent = 'New Price';
                        break;
                }
            });
        }
    }

    async submitBulkPriceUpdate() {
        const priceType = document.getElementById('price-type').value;
        const updateMethod = document.getElementById('update-method').value;
        const updateValue = parseFloat(document.getElementById('update-value').value);
        const roundPrices = document.getElementById('round-prices').checked;
        const errorElement = document.getElementById('price-error');
        
        if (isNaN(updateValue)) {
            errorElement.textContent = 'Please enter a valid value';
            errorElement.style.display = 'block';
            return;
        }
        
        // Prepare update data
        const updateData = {
            product_ids: Array.from(this.selectedProducts),
            price_type: priceType,
            new_value: updateValue,
            is_percentage: updateMethod === 'percentage'
        };
        
        if (updateMethod === 'set') {
            updateData.is_percentage = false;
            // For set method, we'll handle differently
        }
        
        try {
            this.app.showLoading('Updating prices...');
            
            const response = await this.api.post('/products/bulk-update-prices', updateData);
            
            this.closeModal();
            this.app.showNotification(`Updated prices for ${response.updated_count} products`, 'success');
            
            // Clear selection and refresh
            this.selectedProducts.clear();
            this.updateBulkActions();
            this.loadProducts();
            
        } catch (error) {
            console.error('Failed to update prices:', error);
            errorElement.textContent = error.message || 'Failed to update prices';
            errorElement.style.display = 'block';
        } finally {
            this.app.hideLoading();
        }
    }

    showTopSellingProducts() {
        // Show modal with top selling products report
        this.app.showNotification('Top selling products report would open here', 'info');
    }

    exportProducts() {
        // Export products to CSV/Excel
        const csvData = [
            ['Code', 'Name', 'Category', 'Brand', 'Stock', 'Cost Price', 'Retail Price', 'Status']
        ];
        
        this.products.forEach(product => {
            csvData.push([
                product.product_code,
                product.name,
                product.category_name || '',
                product.brand_name || '',
                product.current_stock,
                product.cost_price,
                product.retail_price,
                product.is_active ? 'Active' : 'Inactive'
            ]);
        });
        
        const csvContent = csvData.map(row => row.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `products_export_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        this.app.showNotification('Products exported successfully', 'success');
    }

    printProducts() {
        // Print products list
        const printContent = `
            <html>
            <head>
                <title>Products List</title>
                <style>
                    body { font-family: Arial, sans-serif; }
                    h1 { text-align: center; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #000; padding: 8px; text-align: left; }
                    th { background-color: #f0f0f0; }
                </style>
            </head>
            <body>
                <h1>Products List</h1>
                <p>Generated: ${new Date().toLocaleString()}</p>
                <table>
                    <thead>
                        <tr>
                            <th>Code</th>
                            <th>Name</th>
                            <th>Category</th>
                            <th>Brand</th>
                            <th>Stock</th>
                            <th>Cost Price</th>
                            <th>Retail Price</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.products.map(product => `
                            <tr>
                                <td>${product.product_code}</td>
                                <td>${product.name}</td>
                                <td>${product.category_name || ''}</td>
                                <td>${product.brand_name || ''}</td>
                                <td>${product.current_stock}</td>
                                <td>${product.cost_price.toFixed(2)}</td>
                                <td>${product.retail_price.toFixed(2)}</td>
                                <td>${product.is_active ? 'Active' : 'Inactive'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </body>
            </html>
        `;
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    }

    showModal(html) {
        const modalContainer = document.getElementById('product-modal');
        if (modalContainer) {
            modalContainer.innerHTML = `<div class="modal-overlay">${html}</div>`;
            modalContainer.style.display = 'flex';
        }
    }

    closeModal() {
        const modalContainer = document.getElementById('product-modal');
        if (modalContainer) {
            modalContainer.style.display = 'none';
            modalContainer.innerHTML = '';
        }
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// Register screen with main app
if (window.POS) {
    window.POS.screens.products = ProductsScreen;
}