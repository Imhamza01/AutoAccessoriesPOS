// src/frontend/screens/pos/script.js
/**
 * POS TERMINAL SCREEN
 * Production-ready version using real API
 */

// Load shop settings module
function loadShopSettingsModule() {
    // Avoid loading the module if it's already present or the class exists
    if (window.shopSettings && window.ShopSettings) {
        return Promise.resolve();
    }

    if (window.ShopSettings && !window.shopSettings) {
        // Class exists but instance not created yet - create safely
        try {
            window.shopSettings = new window.ShopSettings();
            return Promise.resolve();
        } catch (e) {
            console.warn('Failed to instantiate existing ShopSettings class, attempting dynamic load');
            // fallthrough to dynamic load
        }
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'screens/pos/shop_settings.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load shop settings module'));
        document.head.appendChild(script);
    });
}

class PosScreen {
    constructor(app) {
        this.app = app;
        this.api = app.api;
        this.cart = [];
        this.currentCategory = null;
        this.products = [];
        this.categories = [];
        this.searchQuery = '';
        this.isScannerActive = false;
        this.selectedProduct = null;

        // Keyboard shortcuts mapping
        this.shortcuts = {
            'F1': () => this.openScanner(),
            'F2': () => this.focusSearch(),
            'F3': () => this.openQuickEntry(),
            'F4': () => this.processPayment(),
            'F5': () => this.clearCart(),
            'F6': () => this.holdSale(),
            'F7': () => this.applyDiscount(),
            'F8': () => this.showHeldSales(),
            'F9': () => this.showCreditPaymentModal(),
            'Escape': () => this.closeAllModals(),
            'Enter': () => this.addSelectedProduct(),
        };
    }

    async init() {
        console.log('Initializing POS Screen');

        // Load shop settings module first
        try {
            await loadShopSettingsModule();
            console.log('Shop settings module loaded successfully');
        } catch (error) {
            console.error('Failed to load shop settings module:', error);
            // Continue initialization even if shop settings module fails to load
        }

        try {
            await this.loadCategories();
            await this.loadProducts();
        } catch (e) {
            console.error('POS init: failed to load categories/products', e);
            this.showInitError('Failed to load product data. Check server and network.');
        }

        this.setupEventListeners();
        this.setupKeyboardShortcuts();
        this.updateCartDisplay();
        this.focusSearch();
    }

    refresh() {
        this.loadCategories(); // Refresh categories too
        this.loadProducts();
        this.updateCartDisplay();
    }

    setupEventListeners() {
        // Ensure DOM is ready before binding
        if (document.readyState !== 'loading') {
            this.bindAllEvents();
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                this.bindAllEvents();
            });
        }
    }

    bindAllEvents() {
        // Search input
        const searchInput = document.getElementById('pos-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value;
                this.filterProducts();
            });

            searchInput.addEventListener('keydown', (e) => {
                try {
                    if (e.key === 'Enter' && this.products.length > 0) {
                        // If filtering resulted in 1 match, add it
                        const filtered = this.getFilteredProducts();
                        if (filtered.length === 1) {
                            this.addProductToCart(filtered[0]);
                            this.searchQuery = '';
                            searchInput.value = '';
                            this.filterProducts();
                        }
                    }
                } catch (error) {
                    console.error('Error handling search keydown:', error);
                    this.app.showNotification('Search error occurred', 'error');
                }
            });
        }

        // Category buttons (Delegation)
        const catContainer = document.getElementById('categories-container');
        if (catContainer) {
            catContainer.addEventListener('click', (e) => {
                try {
                    const btn = e.target.closest('.category-btn');
                    if (btn) {
                        this.selectCategory(btn.dataset.categoryId);
                    }
                } catch (error) {
                    console.error('Error handling category click:', error);
                    this.app.showNotification('Category selection error', 'error');
                }
            });
        }

        // Product cards (Delegation) - REMOVED duplicate event listener
        // This was causing double-add issue - using ensureDelegationBindings instead

        // Cart controls (Delegation)
        const cartItems = document.getElementById('cart-items');
        if (cartItems) {
            cartItems.addEventListener('click', (e) => {
                const increase = e.target.closest('.quantity-increase');
                const decrease = e.target.closest('.quantity-decrease');
                const remove = e.target.closest('.remove-item');

                if (increase) this.updateCartQuantity(increase.dataset.productId, 1);
                if (decrease) this.updateCartQuantity(decrease.dataset.productId, -1);
                if (remove) this.removeFromCart(remove.dataset.productId);
            });
        }

        // Action buttons - bind immediately since DOM should be ready
        const buttonBindings = [
            ['process-payment', () => this.processPayment()],
            ['clear-cart', () => this.clearCart()],
            ['hold-sale', () => this.holdSale()],
            ['apply-discount', () => this.applyDiscount()],
            ['view-held-sales', () => this.showHeldSales()],
            ['print-receipt', () => this.printReceipt()],
            ['checkout-btn', () => this.processPayment()],
            ['shop-settings', () => this.showShopSettings()],
            ['credit-payment-btn', () => this.showCreditPaymentModal()]
        ];

        buttonBindings.forEach(([id, fn]) => {
            const btn = document.getElementById(id);
            if (btn) {
                // Remove existing listeners to prevent duplicates
                btn.replaceWith(btn.cloneNode(true));
                const newBtn = document.getElementById(id);
                if (newBtn) {
                    newBtn.addEventListener('click', fn.bind(this));
                    // mark as bound so other binding helpers don't add duplicate listeners
                    try { newBtn._posBound = true; } catch (e) { }
                }
            } else {
                console.warn('POS Button not found:', id);
            }
        });

        // Selection method buttons
        const methodBtns = document.querySelectorAll('.method-btn');
        methodBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectMethod(btn.dataset.method);
            });
        });
    }

    ensureDelegationBindings() {
        // Ensure delegation listeners are present for containers
        const catContainer = document.getElementById('categories-container');
        if (catContainer && !catContainer._posDelegation) {
            catContainer._posDelegation = true;
            catContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.category-btn');
                if (btn) this.selectCategory(btn.dataset.categoryId);
            });
        }

        const prodContainer = document.getElementById('products-container');
        if (prodContainer && !prodContainer._posDelegation) {
            prodContainer._posDelegation = true;
            prodContainer.addEventListener('click', (e) => {
                const addBtn = e.target.closest('.product-action-btn');
                const card = e.target.closest('.product-card');
                if (addBtn) {
                    e.stopPropagation();
                    e.preventDefault();
                    const productId = addBtn.dataset.productId;
                    const product = this.products.find(p => p.id == productId);
                    if (product) {
                        // Debounce to prevent double clicks
                        if (!this._addingToCart) {
                            this._addingToCart = true;
                            this.addProductToCart(product);
                            setTimeout(() => {
                                this._addingToCart = false;
                            }, 300);
                        }
                    }
                } else if (card) {
                    this.selectProduct(card.dataset.productId);
                }
            });
        }
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger shortcuts when typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            const shortcutAction = this.shortcuts[e.key] || this.shortcuts['F' + e.key];
            if (shortcutAction) {
                e.preventDefault();
                shortcutAction.call(this);
            }
        });
    }

    showInitError(message) {
        try {
            const center = document.querySelector('.pos-center-panel');
            if (center) {
                const el = document.createElement('div');
                el.className = 'pos-error-banner';
                el.textContent = message;
                el.style.background = '#ffdddd';
                el.style.color = '#900';
                el.style.padding = '10px';
                el.style.margin = '10px 0';
                center.prepend(el);
            } else {
                console.error('POS Init Error:', message);
            }
        } catch (e) {
            console.error('Failed to show POS init error', e);
        }
    }

    async loadCategories() {
        try {
            const response = await this.api.get('/products/categories');
            if (response && response.success) {
                this.categories = response.categories || response.data || [];
            } else {
                console.error('Failed to load categories:', response);
                this.categories = [];
            }
            this.renderCategories();
        } catch (error) {
            console.error('Failed to load categories:', error);
            this.categories = [];
            this.app.showNotification('Failed to load categories', 'error');
        }
    }

    renderCategories() {
        const container = document.getElementById('categories-container');
        if (!container) return;

        container.innerHTML = `
            <button class="category-btn ${!this.currentCategory ? 'active' : ''}" data-category-id="">
                <span>All Categories</span>
                <span class="category-count">${this.products.length}</span>
            </button>
        ` + this.categories.map(category => `
            <button class="category-btn ${this.currentCategory == category.id ? 'active' : ''}" data-category-id="${category.id}">
                <span>${category.name}</span>
                <span class="category-count">${category.product_count || '-'}</span>
            </button>
        `).join('');
        // Ensure delegation bindings for newly rendered elements
        this.ensureDelegationBindings();
    }

    async loadProducts(categoryId = null) {
        try {
            this.app.showLoading('Loading products...');
            let url = '/products';
            if (categoryId) url += `?category_id=${categoryId}`;

            const response = await this.api.get(url);

            if (response && response.success) {
                this.products = response.products || response.data || [];
            } else {
                console.error('Failed to load products:', response);
                this.products = [];
            }

            this.renderProducts();
        } catch (error) {
            console.error('Failed to load products:', error);
            this.products = [];
            this.renderProducts();
            this.app.showNotification('Failed to load products', 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    getFilteredProducts() {
        if (!this.searchQuery) return this.products;
        const q = this.searchQuery.toLowerCase();
        return this.products.filter(p =>
            (p.name || p[1])?.toLowerCase().includes(q) ||
            (p.product_code || p.code || p[2])?.toLowerCase().includes(q) ||
            (p.barcode || p[3])?.includes(q)
        );
    }

    renderProducts() {
        const container = document.getElementById('products-container');
        if (!container) return;

        const productsToShow = this.getFilteredProducts();

        container.innerHTML = productsToShow.map(product => `
            <div class="product-card" data-product-id="${product.id || product[0]}">
                <div class="product-image">
                    ${(product.image || product.image_path) ?
                `<img src="${product.image || product.image_path}" 
                             alt="${product.name || product[1]}" 
                             onerror="this.onerror=null; this.parentElement.innerHTML='📦'; this.style.display='none';">` :
                '📦'}
                </div>
                <div class="product-name" title="${product.name || product[1]}">
                    ${product.name || product[1] || 'N/A'}
                </div>
                <div class="product-code">${product.product_code || product.code || product[2] || 'N/A'}</div>
                <div class="product-price">${this.app.formatCurrency(product.retail_price || product.selling_price || product.price || product[4] || 0)}</div>
                <div class="product-stock">
                    Stock: ${product.current_stock || product.stock || product[7] || 0} ${(product.current_stock || product.stock || product[7] || 0) < 10 ? '?' : ''}
                </div>
                <button class="product-action-btn" 
                        data-product-id="${product.id || product[0]}"
                        ${(product.current_stock || product.stock || product[7] || 0) <= 0 ? 'disabled' : ''}>
                    ${(product.current_stock || product.stock || product[7] || 0) <= 0 ? 'Out of Stock' : 'Add to Cart'}
                </button>
            </div>
        `).join('');

        // Update product count
        const productCount = document.getElementById('product-count');
        if (productCount) {
            productCount.textContent = `${productsToShow.length} products`;
        }

        // Ensure delegation bindings for newly rendered elements
        this.ensureDelegationBindings();

        // Bind action buttons by ID (in case they were not present during initial setup)
        this.bindActionButtons();
    }

    bindActionButtons() {
        const ids = [
            ['process-payment', () => this.processPayment()],
            ['clear-cart', () => this.clearCart()],
            ['hold-sale', () => this.holdSale()],
            ['apply-discount', () => this.applyDiscount()],
            ['view-held-sales', () => this.showHeldSales()],
            ['print-receipt', () => this.printReceipt()],
            ['checkout-btn', () => this.processPayment()],
            ['shop-settings', () => this.showShopSettings()],
            ['credit-payment-btn', () => this.showCreditPaymentModal()]
        ];

        ids.forEach(([id, fn]) => {
            const el = document.getElementById(id);
            if (el && !el._posBound) {
                el.addEventListener('click', fn.bind(this));
                el._posBound = true;
            }
        });
    }

    filterProducts() {
        this.renderProducts();
    }

    selectCategory(categoryId) {
        this.currentCategory = categoryId;
        this.loadProducts(categoryId);

        // Update active state in UI
        const btns = document.querySelectorAll('.category-btn');
        btns.forEach(b => b.classList.remove('active'));

        const activeBtn = document.querySelector('.category-btn[data-category-id="' + (categoryId || '') + '"]');
        if (activeBtn) activeBtn.classList.add('active');

        // Update title
        const categoryTitle = document.getElementById('category-title');
        if (categoryTitle) {
            const cat = this.categories.find(c => c.id == categoryId);
            categoryTitle.textContent = cat ? cat.name : 'All Products';
        }
    }

    selectProduct(productId) {
        this.selectedProduct = this.products.find(p => p.id == productId);
        document.querySelectorAll('.product-card').forEach(card => {
            card.classList.remove('selected');
        });
        const selectedCard = document.querySelector('[data-product-id="' + productId + '"]');
        if (selectedCard) {
            selectedCard.classList.add('selected');
        }
    }

    selectMethod(method) {
        document.querySelectorAll('.method-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = document.querySelector('[data-method="' + method + '"]');
        if (activeBtn) activeBtn.classList.add('active');

        switch (method) {
            case 'scanner': this.openScanner(); break;
            case 'search': this.focusSearch(); break;
            case 'quick': this.openQuickEntry(); break;
        }
    }

    // METHOD 1: Barcode Scanner
    async openScanner() {
        // Implementation remains same, using Quagga or mock for now
        this.app.showNotification('Scanner initialized', 'info');
        // Real implementation would open camera modal
    }

    async handleBarcodeScanned(barcode) {
        this.app.showLoading('Looking up product...');
        try {
            const response = await this.api.get(`/products/code/${barcode}`);
            if (response.success && response.product) {
                this.addProductToCart(response.product);
                this.app.showNotification('Found: ' + response.product.name, 'success');
            } else {
                if (confirm('Product ' + barcode + ' not found. Create new?')) {
                    this.openQuickEntry(barcode);
                }
            }
        } catch (error) {
            console.error('Barcode lookup error:', error);
            this.app.showNotification('Product not found', 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    // METHOD 2: Search
    focusSearch() {
        const searchInput = document.getElementById('pos-search');
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
    }

    // METHOD 3: Quick Entry
    openQuickEntry(prefilledBarcode = '') {
        // ... (Keep existing modal logic, but call API to save/add product)
        this.app.showNotification('Quick Entry', 'info');
        // Use existing modal logic from previous file but updated to use API
    }

    // Cart Management
    addProductToCart(product, quantity = 1) {
        const existingItem = this.cart.find(item => item.product.id == product.id || item.product[0] == (product.id || product[0]));
        const price = product.retail_price || product.selling_price || product.price || product[4] || 0;

        if (existingItem) {
            existingItem.quantity += quantity;
            existingItem.total = existingItem.quantity * existingItem.price;
            existingItem.original_total = existingItem.quantity * existingItem.price; // Update original total
        } else {
            this.cart.push({
                product: product,
                quantity: quantity,
                price: price,
                discount: 0,
                original_total: price * quantity, // Store original total before any discount
                total: price * quantity
            });
        }

        this.updateCartDisplay();
        this.app.showNotification(`Added ${product.name || product[1]}`, 'success');
    }

    updateCartQuantity(productId, change) {
        const item = this.cart.find(item => item.product.id == productId);
        if (!item) return;

        const newQuantity = item.quantity + change;
        if (newQuantity <= 0) {
            this.removeFromCart(productId);
        } else {
            item.quantity = newQuantity;
            item.total = item.price * newQuantity;
            item.original_total = item.price * newQuantity; // Update original total as well
            this.updateCartDisplay();
        }
    }

    removeFromCart(productId) {
        this.cart = this.cart.filter(item => item.product.id != productId);
        this.updateCartDisplay();
    }

    updateCartDisplay() {
        const cartItems = document.getElementById('cart-items');
        if (cartItems) {
            cartItems.innerHTML = this.cart.map(item => `
                <div class="cart-item">
                    <div class="cart-item-image">
                       ${(item.product.image || item.product.image_path) ?
                    `<img src="${item.product.image || item.product.image_path}" 
                                width="40" 
                                onerror="this.onerror=null; this.parentElement.innerHTML='📦'; this.style.display='none';">` :
                    '📦'}
                    </div>
                    <div class="cart-item-details">
                        <div class="cart-item-name">${item.product.name || item.product[1]}</div>
                        <div class="cart-item-price">${this.app.formatCurrency(item.price)} x ${item.quantity}</div>
                    </div>
                    <div class="cart-item-controls">
                        <button class="quantity-decrease" data-product-id="${item.product.id || item.product[0]}">-</button>
                        <span>${item.quantity}</span>
                        <button class="quantity-increase" data-product-id="${item.product.id || item.product[0]}">+</button>
                        <button class="remove-item" data-product-id="${item.product.id || item.product[0]}">&times;</button>
                    </div>
                    <div class="cart-item-total">${this.app.formatCurrency(item.total)}</div>
                </div>
            `).join('');
        }

        this.updateCartSummary();

        const cartCount = document.getElementById('cart-count');
        if (cartCount) {
            const count = this.cart.reduce((s, i) => s + i.quantity, 0);
            cartCount.textContent = count;
            cartCount.style.display = count > 0 ? 'block' : 'none';
        }
    }

    updateCartSummary() {
        const subtotal = this.cart.reduce((sum, item) => sum + item.total, 0);
        const tax = subtotal * 0.17;
        const total = subtotal + tax;

        const summaryElement = document.getElementById('cart-summary');
        if (summaryElement) {
            summaryElement.innerHTML = `
                <div class="cart-row"><span>Subtotal:</span><span>${this.app.formatCurrency(subtotal)}</span></div>
                <div class="cart-row"><span>GST (17%):</span><span>${this.app.formatCurrency(tax)}</span></div>
                <div class="cart-row total"><span>Total:</span><span>${this.app.formatCurrency(total)}</span></div>
            `;
        }

        const processBtn = document.getElementById('process-payment');
        if (processBtn) {
            processBtn.disabled = this.cart.length === 0;
            processBtn.textContent = `Pay ${this.app.formatCurrency(total)}`;
        }

        const checkoutBtn = document.getElementById('checkout-btn');
        if (checkoutBtn) {
            checkoutBtn.disabled = this.cart.length === 0;
            checkoutBtn.textContent = `Checkout ${this.app.formatCurrency(total)}`;
        }
    }

    async loadCustomers() {
        try {
            const response = await this.api.get('/customers?limit=1000');

            if (response && response.success) {
                const customers = response.customers || response.data || [];

                // Ensure all customers have proper structure
                return customers.map(customer => {
                    if (typeof customer === 'object' && customer !== null) {
                        return {
                            id: customer.id,
                            name: customer.full_name || customer.name || customer.customer_name || 'Unknown Customer',
                            phone: customer.phone || customer.mobile || customer.contact || 'No Phone',
                            credit_used: customer.credit_used || customer.current_balance || 0,
                            ...customer
                        };
                    }
                    return customer;
                });
            } else {
                console.error('Failed to load customers:', response);
                return [];
            }
        } catch (error) {
            console.error('Failed to load customers:', error);
            this.app.showNotification('Failed to load customers', 'error');
            return [];
        }
    }

    async showCreditPaymentModal() {
        try {
            // Load customers
            const customers = await this.loadCustomers();

            // Create modal elements
            const modalOverlay = document.createElement('div');
            modalOverlay.className = 'modal-overlay';
            modalOverlay.id = 'credit-payment-modal-overlay';

            const modal = document.createElement('div');
            modal.className = 'modal';

            // Header
            const header = document.createElement('div');
            header.className = 'modal-header';
            const title = document.createElement('h3');
            title.textContent = 'Credit Payment';
            const closeBtn = document.createElement('button');
            closeBtn.className = 'modal-close-btn';
            closeBtn.textContent = '�';
            closeBtn.onclick = () => window.app.screens.pos.closeCreditPaymentModal();
            header.appendChild(title);
            header.appendChild(closeBtn);

            // Body
            const body = document.createElement('div');
            body.className = 'modal-body';

            // Create customer selection with search
            body.innerHTML = `
                <div class="form-group">
                    <label for="credit-customer-search">Search Customer:</label>
                    <input type="text" id="credit-customer-search" class="input-field" placeholder="Search by name or phone...">
                </div>
                <div class="form-group">
                    <label for="credit-customer-select">Select Customer:</label>
                    <select id="credit-customer-select" class="input-field">
                        <option value="">Select Customer</option>
                    </select>
                </div>
                
                <!-- Option to pay specific sales or general amount -->
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="pay-specific-sales-checkbox" value=""> Pay for specific sales
                    </label>
                </div>
                
                <!-- General payment section (default) -->
                <div id="general-payment-section">
                    <div class="form-group">
                        <label for="credit-payment-amount">Payment Amount:</label>
                        <input type="number" id="credit-payment-amount" class="input-field" placeholder="Enter payment amount" step="0.01" min="0">
                    </div>
                </div>
                
                <!-- Specific sales section (hidden by default) -->
                <div id="specific-sales-section" style="display:none;">
                    <div class="form-group">
                        <label>Select Sales to Pay:</label>
                        <div id="pending-sales-list" class="pending-sales-container">
                            <!-- Sales will be loaded here -->
                        </div>
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="credit-payment-method">Payment Method:</label>
                    <select id="credit-payment-method" class="input-field">
                        <option value="cash">Cash</option>
                        <option value="card">Card</option>
                        <option value="bank_transfer">Bank Transfer</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="credit-payment-notes">Notes:</label>
                    <textarea id="credit-payment-notes" class="input-field" placeholder="Enter payment notes" rows="3"></textarea>
                </div>`;

            // Now populate customer select with options
            const customerSelectElement = body.querySelector('#credit-customer-select');
            if (customerSelectElement && customers.length > 0) {
                customers.forEach(customer => {
                    const option = document.createElement('option');
                    option.value = customer.id;
                    option.textContent = customer.name + ' (' + customer.phone + ') - Credit: ' + this.app.formatCurrency(customer.credit_used || 0);
                    option.selected = this.selectedCustomerId && this.selectedCustomerId == customer.id;
                    customerSelectElement.appendChild(option);
                });
            }

            // Add search functionality
            const searchInput = body.querySelector('#credit-customer-search');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    const searchTerm = e.target.value.toLowerCase();
                    const select = body.querySelector('#credit-customer-select');

                    // Clear current options except default
                    select.innerHTML = '<option value="">Select Customer</option>';

                    // Filter and add matching customers
                    customers.forEach(customer => {
                        const customerName = (customer.name || '').toLowerCase();
                        const customerPhone = (customer.phone || '').toLowerCase();

                        if (customerName.includes(searchTerm) || customerPhone.includes(searchTerm)) {
                            const option = document.createElement('option');
                            option.value = customer.id;
                            option.textContent = customer.name + ' (' + customer.phone + ') - Credit: ' + this.app.formatCurrency(customer.credit_used || 0);
                            option.selected = this.selectedCustomerId && this.selectedCustomerId == customer.id;
                            select.appendChild(option);
                        }
                    });
                });
            }

            // Footer
            const footer = document.createElement('div');
            footer.className = 'modal-footer';
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'btn btn-secondary';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.onclick = () => window.app.screens.pos.closeCreditPaymentModal();
            const payBtn = document.createElement('button');
            payBtn.className = 'btn btn-success';
            payBtn.textContent = 'Process Payment';
            payBtn.onclick = () => window.app.screens.pos.processCreditPayment();
            footer.appendChild(cancelBtn);
            footer.appendChild(payBtn);

            modal.appendChild(header);
            modal.appendChild(body);
            modal.appendChild(footer);
            modalOverlay.appendChild(modal);

            // Add modal to document
            document.body.appendChild(modalOverlay);
            modalOverlay.style.display = 'flex';

            // Add customer selection change handler to show current credit
            const customerSelect = body.querySelector('#credit-customer-select');
            if (customerSelect) {
                // If a customer was pre-selected (e.g., from customer screen), show notification
                if (this.selectedCustomerId) {
                    const preselectedCustomer = customers.find(c => c.id == this.selectedCustomerId);
                    if (preselectedCustomer) {
                        this.app.showNotification(preselectedCustomer.name + "'s current credit: " + this.app.formatCurrency(preselectedCustomer.credit_used || 0), 'info');
                    }
                }

                customerSelect.addEventListener('change', async () => {
                    const selectedCustomerId = parseInt(customerSelect.value);
                    if (selectedCustomerId) {
                        const selectedCustomer = customers.find(c => c.id == selectedCustomerId);
                        if (selectedCustomer) {
                            this.app.showNotification(selectedCustomer.name + "'s current credit: " + this.app.formatCurrency(selectedCustomer.credit_used || 0), 'info');

                            // Load pending credit sales for this customer
                            await this.loadPendingCreditSales(selectedCustomerId);
                        }
                    } else {
                        // Clear pending sales list when no customer is selected
                        const pendingSalesList = document.getElementById('pending-sales-list');
                        if (pendingSalesList) {
                            pendingSalesList.innerHTML = '';
                        }
                    }
                });
            }
            // Toggle between general payment and specific-sales UI when checkbox changes
            const specificSalesCheckbox = body.querySelector('#pay-specific-sales-checkbox');
            if (specificSalesCheckbox) {
                specificSalesCheckbox.addEventListener('change', (e) => {
                    const specificSection = document.getElementById('specific-sales-section');
                    const generalSection = document.getElementById('general-payment-section');
                    if (e.target.checked) {
                        if (specificSection) specificSection.style.display = 'block';
                        if (generalSection) generalSection.style.display = 'none';
                    } else {
                        if (specificSection) specificSection.style.display = 'none';
                        if (generalSection) generalSection.style.display = 'block';
                    }
                });
            }
        } catch (error) {
            console.error('Error showing credit payment modal:', error);
            this.app.showNotification('Error loading credit payment modal', 'error');
        }
    }

    closeCreditPaymentModal() {
        const modal = document.getElementById('credit-payment-modal-overlay');
        if (modal) {
            modal.remove();
        }
    }

    async processCreditPayment() {
        try {
            const customerId = parseInt(document.getElementById('credit-customer-select').value);
            const amount = parseFloat(document.getElementById('credit-payment-amount').value);
            const paymentMethod = document.getElementById('credit-payment-method').value;
            const notes = document.getElementById('credit-payment-notes').value;

            if (!customerId) {
                this.app.showNotification('Please select a customer', 'error');
                return;
            }

            // Check if specific sales are selected
            const specificSalesCheckbox = document.getElementById('pay-specific-sales-checkbox');
            let paymentData = {};

            if (specificSalesCheckbox && specificSalesCheckbox.checked) {
                // Process specific sales payment
                const selectedSales = [];
                let totalSelectedAmount = 0;
                document.querySelectorAll('input[name="selected-sales"]:checked').forEach(checkbox => {
                    selectedSales.push(parseInt(checkbox.value));
                    const amt = parseFloat(checkbox.getAttribute('data-amount')) || 0;
                    totalSelectedAmount += amt;
                });

                if (selectedSales.length === 0) {
                    this.app.showNotification('Please select at least one sale to pay', 'error');
                    return;
                }

                paymentData = {
                    sale_ids: selectedSales,
                    amount: parseFloat(totalSelectedAmount.toFixed(2)),
                    payment_method: paymentMethod,
                    notes: notes || 'Specific sales payment'
                };
            } else {
                // Process general payment
                if (!amount || amount <= 0) {
                    this.app.showNotification('Please enter a valid payment amount', 'error');
                    return;
                }

                paymentData = {
                    amount: amount,
                    payment_method: paymentMethod,
                    payment_type: 'credit_payment',
                    notes: notes || 'Credit payment received'
                };
            }

            this.app.showLoading('Processing credit payment...');

            const response = await this.api.post('/customer-payments/' + customerId + '/payments', paymentData);

            if (response.success) {
                this.app.showNotification('Credit payment processed successfully', 'success');
                this.closeCreditPaymentModal();

                // Update all relevant screens
                if (window.app.screens.dashboard) {
                    window.app.screens.dashboard.refresh();
                }
                if (window.app.screens.sales) {
                    window.app.screens.sales.refresh();
                }
                if (window.app.screens['credit-management']) {
                    window.app.screens['credit-management'].refresh();
                }

                // Also refresh the current screen if it's showing credit sales
                if (window.app.currentScreen === 'sales' || window.app.currentScreen === 'credit-management') {
                    // Force a data reload
                    setTimeout(() => {
                        if (window.app.screens[window.app.currentScreen]) {
                            window.app.screens[window.app.currentScreen].load();
                        }
                    }, 1000);
                }
            } else {
                throw new Error(response.message || 'Failed to process credit payment');
            }
        } catch (error) {
            console.error('Error processing credit payment:', error);
            this.app.showNotification('Error processing credit payment: ' + error.message, 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    clearCart() {
        if (this.cart.length > 0 && confirm('Clear cart?')) {
            this.cart = [];
            this.updateCartDisplay();
        }
    }

    async processPayment() {
        if (this.cart.length === 0) return;

        // Show payment method selection modal
        this.showPaymentModal();
    }

    async showPaymentModal() {
        // Calculate totals
        const subtotal = this.cart.reduce((sum, item) => sum + item.total, 0);
        const gstRate = window.shopSettings ? window.shopSettings.getSetting('gstRate') || 0.17 : 0.17;
        const tax = subtotal * gstRate;
        const total = subtotal + tax;

        // Create modal elements safely
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        modalOverlay.id = 'payment-modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'payment-modal';

        // Header
        const header = document.createElement('div');
        header.className = 'modal-header';
        const title = document.createElement('h3');
        title.textContent = 'Payment Method';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close-btn';
        closeBtn.textContent = '�';
        closeBtn.onclick = () => window.app.screens.pos.closePaymentModal();
        header.appendChild(title);
        header.appendChild(closeBtn);

        // Body with payment summary and inputs
        const body = document.createElement('div');
        body.className = 'modal-body';

        // Customer selection
        const customerSelect = document.createElement('div');
        customerSelect.className = 'customer-selection';

        // Load customers
        const customers = await this.loadCustomers();

        let customerOptions = '<option value="">Walk-in Customer (No Account)</option>';
        customers.forEach(customer => {
            const selected = (this.selectedCustomerId && this.selectedCustomerId == customer.id) ? 'selected' : '';
            const customerName = customer.name || customer.customer_name || customer.full_name || 'Unknown Customer';
            const customerPhone = customer.phone || customer.mobile || customer.contact || 'No Phone';
            customerOptions += '<option value="' + customer.id + '" ' + selected + '>' + customerName + ' (' + customerPhone + ')</option>';
        });

        customerSelect.innerHTML = `
            <div class="input-group">
                <label for="customer-search">Search Customer:</label>
                <input type="text" id="customer-search" class="form-control" placeholder="Search by name or phone...">
            </div>
            <div class="input-group">
                <label for="customer-select">Select Customer:</label>
                <select id="customer-select" class="form-control">
                    ${customerOptions}
                </select>
            </div>
        `;

        // Add search functionality to customer selection
        const searchInput = document.getElementById('customer-search');
        const selectElement = document.getElementById('customer-select');

        if (searchInput && selectElement) {
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();

                // Recreate all options based on search term
                selectElement.innerHTML = '<option value="">Walk-in Customer (No Account)</option>';

                customers.forEach(customer => {
                    const customerName = (customer.name || '').toLowerCase();
                    const customerPhone = (customer.phone || '').toLowerCase();

                    if (customerName.includes(searchTerm) || customerPhone.includes(searchTerm)) {
                        const option = document.createElement('option');
                        option.value = customer.id;
                        option.textContent = customer.name + ' (' + customer.phone + ')';
                        option.selected = this.selectedCustomerId && this.selectedCustomerId == customer.id;
                        selectElement.appendChild(option);
                    }
                });
            });
        }

        // Payment summary
        const summary = document.createElement('div');
        summary.className = 'payment-summary';

        const summaryRows = [
            ['Subtotal:', this.app.formatCurrency(subtotal)],
            ['GST (' + (gstRate * 100).toFixed(0) + '%):', this.app.formatCurrency(tax)],
            ['Total:', this.app.formatCurrency(total)]
        ];

        summaryRows.forEach(([label, value], index) => {
            const row = document.createElement('div');
            row.className = index === 2 ? 'summary-row total' : 'summary-row';
            const labelSpan = document.createElement('span');
            labelSpan.textContent = label;
            const valueSpan = document.createElement('span');
            valueSpan.textContent = value;
            row.appendChild(labelSpan);
            row.appendChild(valueSpan);
            summary.appendChild(row);
        });

        // Payment methods
        const methods = document.createElement('div');
        methods.className = 'payment-methods';

        const paymentMethods = [
            { id: 'cash', label: 'Cash', checked: true },
            { id: 'card', label: 'Card', checked: false },
            { id: 'credit', label: 'Credit', checked: false }
        ];

        paymentMethods.forEach(method => {
            const methodDiv = document.createElement('div');
            methodDiv.className = 'payment-method';
            const input = document.createElement('input');
            input.type = 'radio';
            input.id = method.id;
            input.name = 'payment-method';
            input.value = method.id;
            input.checked = method.checked;
            const label = document.createElement('label');
            label.setAttribute('for', method.id);
            label.textContent = method.label;
            methodDiv.appendChild(input);
            methodDiv.appendChild(label);
            methods.appendChild(methodDiv);
        });

        // Payment inputs
        const inputs = document.createElement('div');
        inputs.className = 'payment-inputs';

        const amountGroup = document.createElement('div');
        amountGroup.className = 'input-group';
        const amountLabel = document.createElement('label');
        amountLabel.setAttribute('for', 'amount-tendered');
        amountLabel.textContent = 'Amount Tendered:';
        const amountInput = document.createElement('input');
        amountInput.type = 'number';
        amountInput.id = 'amount-tendered';
        amountInput.value = total.toFixed(2);
        amountInput.step = '0.01';
        amountInput.min = total.toString();
        amountInput.placeholder = 'Enter amount';
        amountGroup.appendChild(amountLabel);
        amountGroup.appendChild(amountInput);

        const changeGroup = document.createElement('div');
        changeGroup.className = 'input-group';
        const changeLabel = document.createElement('label');
        changeLabel.setAttribute('for', 'change-amount');
        changeLabel.textContent = 'Change:';
        const changeInput = document.createElement('input');
        changeInput.type = 'text';
        changeInput.id = 'change-amount';
        changeInput.value = '0.00';
        changeInput.readOnly = true;
        changeGroup.appendChild(changeLabel);
        changeGroup.appendChild(changeInput);

        inputs.appendChild(amountGroup);
        inputs.appendChild(changeGroup);

        body.appendChild(customerSelect);
        body.appendChild(summary);
        body.appendChild(methods);
        body.appendChild(inputs);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = () => window.app.screens.pos.closePaymentModal();
        const completeBtn = document.createElement('button');
        completeBtn.className = 'btn btn-success';
        completeBtn.textContent = 'Complete Payment';
        completeBtn.onclick = () => window.app.screens.pos.completePayment();
        footer.appendChild(cancelBtn);
        footer.appendChild(completeBtn);

        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(footer);
        modalOverlay.appendChild(modal);

        // Add modal to document
        document.body.appendChild(modalOverlay);
        modalOverlay.style.display = 'flex';

        // Add event listeners
        amountInput.addEventListener('input', () => {
            const amountTendered = parseFloat(amountInput.value) || 0;
            const change = amountTendered - total;
            changeInput.value = change >= 0 ? this.app.formatCurrency(change) : '0.00';
        });

        // Trigger initial calculation
        amountInput.dispatchEvent(new Event('input'));
    }

    closePaymentModal() {
        const modal = document.getElementById('payment-modal-overlay');
        if (modal) {
            modal.remove();
        }
    }

    async completePayment() {
        try {
            const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;
            const amountTendered = parseFloat(document.getElementById('amount-tendered').value) || 0;

            // Validate payment
            const subtotal = this.cart.reduce((sum, item) => sum + item.total, 0);
            const gstRate = window.shopSettings ? window.shopSettings.getSetting('gstRate') || 0.17 : 0.17;
            const tax = subtotal * gstRate;
            const total = subtotal + tax;

            if (amountTendered < total) {
                this.app.showNotification('Amount tendered is less than total', 'error');
                return;
            }

            this.app.showLoading('Processing Payment...');

            // Calculate total discount amount from cart
            const totalOriginalSubtotal = this.cart.reduce((sum, item) => sum + (item.original_total || (item.price * item.quantity)), 0);
            const totalDiscount = Math.max(0, totalOriginalSubtotal - subtotal); // Ensure positive discount

            // Get selected customer from the dropdown
            const customerSelect = document.getElementById('customer-select');
            const selectedCustomerId = customerSelect ? parseInt(customerSelect.value) || null : null;

            // Validate credit sales for walk-in customers
            if (paymentMethod === 'credit' && !selectedCustomerId) {
                this.app.showNotification('Walk-in customers cannot get items on credit. Customer must be registered first.', 'error');
                this.app.hideLoading();
                return;
            }

            // Prepare payload matching backend expectations
            const saleData = {
                customer_id: selectedCustomerId, // Use selected customer
                total_amount: total,
                subtotal: subtotal,
                discount_amount: totalDiscount,
                gst_amount: tax,
                payment_type: paymentMethod,
                payment_status: paymentMethod === 'credit' ? 'pending' : 'completed',
                notes: '', // No notes by default
                items: this.cart.map(i => ({
                    product_id: i.product.id || i.product[0],
                    quantity: i.quantity,
                    unit_price: i.price,
                    total_price: i.quantity * i.price
                }))
            };

            const response = await this.api.post('/pos/transaction', saleData);
            if (response.success) {
                // Store payment details for receipt
                this.lastPaymentDetails = {
                    amount_tendered: amountTendered,
                    change_amount: amountTendered - total,
                    payment_method: paymentMethod,
                    timestamp: new Date()
                };

                this.app.showNotification('Sale completed!', 'success');
                this.cart = [];
                this.updateCartDisplay();
                this.closePaymentModal();
                this.refresh();

                // Print receipt
                this.printReceipt();

                // Update all relevant screens
                if (window.app.screens.dashboard) {
                    window.app.screens.dashboard.refresh();
                }
                if (window.app.screens.sales) {
                    window.app.screens.sales.refresh();
                }
                if (window.app.screens['credit-management']) {
                    window.app.screens['credit-management'].refresh();
                }

                // Also refresh the current screen if it's showing credit sales
                if (window.app.currentScreen === 'sales' || window.app.currentScreen === 'credit-management') {
                    // Force a data reload
                    setTimeout(() => {
                        if (window.app.screens[window.app.currentScreen]) {
                            window.app.screens[window.app.currentScreen].load();
                        }
                    }, 1000);
                }
            } else {
                throw new Error(response.message || 'Payment failed');
            }
        } catch (error) {
            console.error('Payment processing error:', error);
            this.app.showNotification('Payment failed: ' + (error.message || error), 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    closeAllModals() {
        // Helper to close modals
        document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    }

    // Hold sale functionality
    async holdSale() {
        if (this.cart.length === 0) {
            this.app.showNotification('Cannot hold an empty cart', 'error');
            return;
        }

        try {
            // Calculate totals
            const subtotal = this.cart.reduce((sum, item) => sum + item.total, 0);
            const gstRate = window.shopSettings ? window.shopSettings.getSetting('gstRate') || 0.17 : 0.17;
            const tax = subtotal * gstRate;
            const total = subtotal + tax;

            // Load customers to show in the selection modal
            const customers = await this.loadCustomers();

            // Show customer selection modal for hold sale
            this.showHoldSaleCustomerSelection(customers, total, subtotal, tax);
        } catch (error) {
            console.error('Error preparing to hold sale:', error);
            this.app.showNotification('Failed to prepare hold sale: ' + error.message, 'error');
        }
    }

    // Hold Sale Customer Selection Modal
    showHoldSaleCustomerSelection(customers, total, subtotal, tax) {
        // Create customer selection modal for hold sale
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        modalOverlay.id = 'hold-sale-customer-modal';

        const modal = document.createElement('div');
        modal.className = 'modal';

        // Header
        const header = document.createElement('div');
        header.className = 'modal-header';
        const title = document.createElement('h3');
        title.textContent = 'Select Customer for Hold Sale';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close-btn';
        closeBtn.textContent = '?';
        closeBtn.onclick = () => this.closeHoldSaleCustomerModal();
        header.appendChild(title);
        header.appendChild(closeBtn);

        // Body
        const body = document.createElement('div');
        body.className = 'modal-body';

        // Add customer search and selection
        body.innerHTML = `
        <div class="form-group">
            <label for="hold-customer-search">Search Customer:</label>
            <input type="text" id="hold-customer-search" class="input-field" placeholder="Search by name or phone...">
        </div>
        <div class="form-group">
            <label for="hold-customer-select">Select Customer:</label>
            <select id="hold-customer-select" class="input-field">
                <option value="">Walk-in Customer (Held Sale Only)</option>
            </select>
        </div>
        <div class="payment-summary">
            <div class="summary-row"><span>Subtotal:</span><span></span></div>
            <div class="summary-row"><span>GST:</span><span></span></div>
            <div class="summary-row total"><span>Total:</span><span></span></div>
        </div>
    `;

        // Populate customer select with options
        const customerSelectElement = body.querySelector('#hold-customer-select');
        if (customers.length > 0) {
            customers.forEach(customer => {
                const option = document.createElement('option');
                const customerName = customer.name || customer.customer_name || customer.full_name || 'Unknown Customer';
                const customerPhone = customer.phone || customer.mobile || customer.contact || 'No Phone';
                option.value = customer.id;
                option.textContent = customerName + ' (' + customerPhone + ')';
                customerSelectElement.appendChild(option);
            });
        }

        // Add search functionality
        const searchInput = body.querySelector('#hold-customer-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                // Clear current options except default
                customerSelectElement.innerHTML = '<option value="">Walk-in Customer (Held Sale Only)</option>';

                // Filter and add matching customers
                customers.forEach(customer => {
                    const customerName = (customer.name || '').toLowerCase();
                    const customerPhone = (customer.phone || '').toLowerCase();

                    if (customerName.includes(searchTerm) || customerPhone.includes(searchTerm)) {
                        const option = document.createElement('option');
                        const customerNameDisplay = customer.name || customer.customer_name || customer.full_name || 'Unknown Customer';
                        const customerPhoneDisplay = customer.phone || customer.mobile || customer.contact || 'No Phone';
                        option.value = customer.id;
                        option.textContent = customerNameDisplay + ' (' + customerPhoneDisplay + ')';
                        customerSelectElement.appendChild(option);
                    }
                });
            });
        }

        // Update payment summary with actual values
        const summaryRows = body.querySelectorAll('.summary-row');
        if (summaryRows.length >= 3) {
            summaryRows[0].querySelector('span:last-child').textContent = this.app.formatCurrency(subtotal);
            summaryRows[1].querySelector('span:last-child').textContent = this.app.formatCurrency(tax);
            summaryRows[2].querySelector('span:last-child').textContent = this.app.formatCurrency(total);
        }

        // Footer
        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = () => this.closeHoldSaleCustomerModal();
        const holdBtn = document.createElement('button');
        holdBtn.className = 'btn btn-warning';
        holdBtn.textContent = 'Hold Sale';
        holdBtn.onclick = () => this.processHoldSaleWithCustomer();
        footer.appendChild(cancelBtn);
        footer.appendChild(holdBtn);

        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(footer);
        modalOverlay.appendChild(modal);

        // Add modal to document
        document.body.appendChild(modalOverlay);
        modalOverlay.style.display = 'flex';
    }

    closeHoldSaleCustomerModal() {
        const modal = document.getElementById('hold-sale-customer-modal');
        if (modal) {
            modal.remove();
        }
    }

    async processHoldSaleWithCustomer() {
        try {
            const selectedCustomerId = parseInt(document.getElementById('hold-customer-select').value) || null;

            // Calculate totals again (as they were passed as parameters earlier)
            const subtotal = this.cart.reduce((sum, item) => sum + item.total, 0);
            const gstRate = window.shopSettings ? window.shopSettings.getSetting('gstRate') || 0.17 : 0.17;
            const tax = subtotal * gstRate;
            const total = subtotal + tax;

            // Prepare sale data
            const saleData = {
                ...(selectedCustomerId && { customer_id: selectedCustomerId }), // Only include customer_id if a customer is selected
                total_amount: total,
                subtotal: subtotal,
                discount_amount: 0, // No discount applied in this flow
                gst_amount: tax,
                payment_type: 'credit', // Use 'credit' for all held sales (valid type per CHECK constraint)
                payment_status: 'pending',
                notes: 'Sale held by cashier',
                hold_reason: 'Held by cashier',
                items: this.cart.map(i => ({
                    product_id: i.product.id || i.product[0],
                    quantity: i.quantity,
                    unit_price: i.price,
                    total_price: i.quantity * i.price
                }))
            };

            // Call the API to hold the sale
            const response = await this.api.post('/pos/hold-sale', saleData);

            if (response.success) {
                this.app.showNotification('Sale held successfully - Invoice: ' + response.invoice_number, 'success');

                // Clear the cart after holding the sale
                this.cart = [];
                this.updateCartDisplay();
            } else {
                throw new Error(response.message || 'Failed to hold sale');
            }

            this.closeHoldSaleCustomerModal();
        } catch (error) {
            console.error('Error processing hold sale:', error);
            this.app.showNotification('Failed to hold sale: ' + error.message, 'error');
        }
    }

    async showShopSettings() {
        // First try to get settings from API (database)
        let settings = null;

        try {
            const response = await this.app.api.get('/settings/shop');

            if (response.success && response.settings) {
                // Map API response fields to localStorage format
                settings = {
                    shopName: response.settings.shop_name || 'Auto Accessories Shop',
                    shopAddress: response.settings.shop_address || '123 Main Street, City',
                    shopPhone: response.settings.shop_phone || '+92-300-1234567',
                    shopEmail: response.settings.shop_email || 'info@autoaccessories.com',
                    taxNumber: response.settings.shop_tax_id || 'Tax ID: 123456789',
                    receiptMessage: response.settings.receipt_footer || 'Thank you for your business!',
                    currency: response.settings.currency || 'PKR',
                    // Try to preserve existing GST rate from localStorage if available, otherwise default to 0.17
                    gstRate: (window.shopSettings && window.shopSettings.getSetting('gstRate')) || 0.17
                };

                // Also update localStorage to keep them in sync
                if (window.shopSettings) {
                    window.shopSettings.saveSettings(settings);
                }
            }
        } catch (error) {
            console.warn('Could not fetch settings from API, using localStorage:', error);
        }

        // Fallback to localStorage if API fails
        if (!settings && window.shopSettings) {
            settings = window.shopSettings.getAllSettings();
        }

        // Final fallback to defaults
        if (!settings) {
            settings = {
                shopName: 'Auto Accessories Shop',
                shopAddress: '123 Main Street, City',
                shopPhone: '+92-300-1234567',
                shopEmail: 'info@autoaccessories.com',
                taxNumber: 'Tax ID: 123456789',
                receiptMessage: 'Thank you for your business!',
                gstRate: 0.17,
                currency: 'PKR'
            };
        }

        // Create modal elements safely
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        modalOverlay.id = 'shop-settings-modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'settings-modal';

        // Header
        const header = document.createElement('div');
        header.className = 'modal-header';
        const title = document.createElement('h3');
        title.textContent = 'Shop Settings';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close-btn';
        closeBtn.textContent = '�';
        closeBtn.onclick = () => window.app.screens.pos.closeShopSettings();
        header.appendChild(title);
        header.appendChild(closeBtn);

        // Body
        const body = document.createElement('div');
        body.className = 'modal-body';

        const form = document.createElement('div');
        form.className = 'settings-form';

        // Form fields
        const fields = [
            { id: 'shop-name-input', label: 'Shop Name:', type: 'text', value: settings.shopName, placeholder: 'Enter shop name' },
            { id: 'shop-address', label: 'Address:', type: 'text', value: settings.shopAddress, placeholder: 'Enter shop address' },
            { id: 'shop-phone', label: 'Phone:', type: 'text', value: settings.shopPhone, placeholder: 'Enter phone number' },
            { id: 'shop-email', label: 'Email:', type: 'email', value: settings.shopEmail, placeholder: 'Enter email' },
            { id: 'tax-number', label: 'Tax Number:', type: 'text', value: settings.taxNumber, placeholder: 'Enter tax number' },
            { id: 'receipt-message', label: 'Receipt Message:', type: 'text', value: settings.receiptMessage, placeholder: 'Enter receipt message' },
            { id: 'gst-rate', label: 'GST Rate (%):', type: 'number', value: settings.gstRate * 100, placeholder: 'Enter GST rate', step: '0.01', min: '0', max: '100' }
        ];

        fields.forEach(field => {
            const group = document.createElement('div');
            group.className = 'form-group';
            const label = document.createElement('label');
            label.setAttribute('for', field.id);
            label.textContent = field.label;
            const input = document.createElement('input');
            input.type = field.type;
            input.id = field.id;
            input.value = field.value;
            input.placeholder = field.placeholder;
            if (field.step) input.step = field.step;
            if (field.min) input.min = field.min;
            if (field.max) input.max = field.max;
            group.appendChild(label);
            group.appendChild(input);
            form.appendChild(group);
        });

        // Currency select
        const currencyGroup = document.createElement('div');
        currencyGroup.className = 'form-group';
        const currencyLabel = document.createElement('label');
        currencyLabel.setAttribute('for', 'currency');
        currencyLabel.textContent = 'Currency:';
        const currencySelect = document.createElement('select');
        currencySelect.id = 'currency';

        const currencies = [
            { value: 'PKR', label: 'PKR (Pakistani Rupee)' },
            { value: 'USD', label: 'USD (US Dollar)' },
            { value: 'EUR', label: 'EUR (Euro)' },
            { value: 'GBP', label: 'GBP (British Pound)' }
        ];

        currencies.forEach(currency => {
            const option = document.createElement('option');
            option.value = currency.value;
            option.textContent = currency.label;
            option.selected = settings.currency === currency.value;
            currencySelect.appendChild(option);
        });

        currencyGroup.appendChild(currencyLabel);
        currencyGroup.appendChild(currencySelect);
        form.appendChild(currencyGroup);

        body.appendChild(form);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = () => window.app.screens.pos.closeShopSettings();
        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn btn-primary';
        saveBtn.textContent = 'Save Settings';
        saveBtn.onclick = () => window.app.screens.pos.saveShopSettings();
        footer.appendChild(cancelBtn);
        footer.appendChild(saveBtn);

        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(footer);
        modalOverlay.appendChild(modal);

        // Add modal to document
        document.body.appendChild(modalOverlay);
        modalOverlay.style.display = 'flex';
    }

    closeShopSettings() {
        const modal = document.getElementById('shop-settings-modal-overlay');
        if (modal) {
            modal.remove();
        }
    }

    async saveShopSettings() {
        const settings = {
            shopName: document.getElementById('shop-name-input').value,
            shopAddress: document.getElementById('shop-address').value,
            shopPhone: document.getElementById('shop-phone').value,
            shopEmail: document.getElementById('shop-email').value,
            taxNumber: document.getElementById('tax-number').value,
            receiptMessage: document.getElementById('receipt-message').value,
            gstRate: parseFloat(document.getElementById('gst-rate').value) / 100,
            currency: document.getElementById('currency').value
        };

        console.log('Saving shop settings:', settings); // Debug log

        // Save to localStorage first
        if (window.shopSettings) {
            window.shopSettings.saveSettings(settings);
        }

        // Also save to database via API
        try {
            const apiSettings = {
                shop_name: settings.shopName,
                shop_address: settings.shopAddress,
                shop_phone: settings.shopPhone,
                shop_email: settings.shopEmail,
                ntn_number: settings.taxNumber,
                receipt_footer: settings.receiptMessage,
                currency_symbol: settings.currency,
                // Note: GST Rate is not saved to DB, only used locally
            };

            const response = await this.app.api.put('/settings/shop', apiSettings);
            console.log('Save response:', response); // Debug log

            if (response.success) {
                this.app.showNotification('Shop settings saved successfully to both local storage and database!', 'success');
            } else {
                this.app.showNotification('Settings saved locally but database update failed: ' + (response.detail || 'Unknown error'), 'warning');
            }
        } catch (error) {
            console.error('Error saving settings to API:', error);
            console.error('Error details:', error);
            this.app.showNotification('Settings saved locally but database sync failed: ' + error.message, 'warning');
        }

        this.closeShopSettings();
    }

    async showHeldSales() {
        try {
            this.app.showLoading('Loading held sales...');
            const response = await this.api.get('/pos/held-sales');

            if (response.success && response.sales && response.sales.length > 0) {
                this.displayHeldSalesModal(response.sales);
            } else {
                this.app.showNotification('No held sales found', 'info');
            }
        } catch (error) {
            console.error('Error loading held sales:', error);
            this.app.showNotification('Failed to load held sales: ' + error.message, 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    displayHeldSalesModal(heldSales) {
        // Create modal elements safely
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        modalOverlay.id = 'held-sales-modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'held-sales-modal';

        // Header
        const header = document.createElement('div');
        header.className = 'modal-header';
        const title = document.createElement('h3');
        title.textContent = 'Held Sales';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close-btn';
        closeBtn.textContent = '�';
        closeBtn.onclick = () => window.app.screens.pos.closeHeldSalesModal();
        header.appendChild(title);
        header.appendChild(closeBtn);

        // Body
        const body = document.createElement('div');
        body.className = 'modal-body';

        const salesList = document.createElement('div');
        salesList.className = 'held-sales-list';

        heldSales.forEach(sale => {
            const saleItem = document.createElement('div');
            saleItem.className = 'held-sale-item';

            const saleInfo = document.createElement('div');
            saleInfo.className = 'sale-info';

            const saleId = document.createElement('div');
            saleId.className = 'sale-id';
            saleId.textContent = 'Invoice: ' + (sale.invoice_number || 'N/A');

            const saleDate = document.createElement('div');
            saleDate.className = 'sale-date';
            saleDate.textContent = new Date(sale.created_at).toLocaleString();

            const saleTotal = document.createElement('div');
            saleTotal.className = 'sale-total';
            saleTotal.textContent = 'Total: ' + this.app.formatCurrency(sale.grand_total || 0);

            const saleItems = document.createElement('div');
            saleItems.className = 'sale-items';
            saleItems.textContent = 'Items: ' + (sale.total_items || sale.items_count || 0);

            saleInfo.appendChild(saleId);
            saleInfo.appendChild(saleDate);
            saleInfo.appendChild(saleTotal);
            saleInfo.appendChild(saleItems);

            const saleActions = document.createElement('div');
            saleActions.className = 'sale-actions';

            const resumeBtn = document.createElement('button');
            resumeBtn.className = 'btn btn-primary';
            resumeBtn.textContent = 'Resume';
            resumeBtn.onclick = () => window.app.screens.pos.resumeHeldSale(sale.id);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-danger';
            deleteBtn.textContent = 'Delete';
            deleteBtn.onclick = () => window.app.screens.pos.deleteHeldSale(sale.id);

            saleActions.appendChild(resumeBtn);
            saleActions.appendChild(deleteBtn);

            saleItem.appendChild(saleInfo);
            saleItem.appendChild(saleActions);
            salesList.appendChild(saleItem);
        });

        body.appendChild(salesList);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        const closeFooterBtn = document.createElement('button');
        closeFooterBtn.className = 'btn btn-secondary';
        closeFooterBtn.textContent = 'Close';
        closeFooterBtn.onclick = () => window.app.screens.pos.closeHeldSalesModal();
        footer.appendChild(closeFooterBtn);

        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(footer);
        modalOverlay.appendChild(modal);

        // Add modal to document
        document.body.appendChild(modalOverlay);
        modalOverlay.style.display = 'flex';
    }

    async resumeHeldSale(saleId) {
        try {
            this.app.showLoading('Loading held sale...');
            const response = await this.api.post('/pos/resume-sale/' + saleId);

            if (response.success) {
                // Clear current cart
                this.cart = [];

                // Add items from held sale to current cart
                response.items.forEach(item => {
                    const product = {
                        id: item.product_id,
                        name: item.product_name,
                        product_code: item.product_code,
                        price: item.unit_price,
                        retail_price: item.unit_price
                    };

                    // Add item to cart
                    const existingItem = this.cart.find(cartItem =>
                        cartItem.product.id == product.id
                    );

                    if (existingItem) {
                        existingItem.quantity += item.quantity;
                        existingItem.total = existingItem.quantity * existingItem.price;
                    } else {
                        this.cart.push({
                            product: product,
                            quantity: item.quantity,
                            price: item.unit_price,
                            discount: 0,
                            total: item.quantity * item.unit_price
                        });
                    }
                });

                this.updateCartDisplay();
                this.closeHeldSalesModal();
                this.app.showNotification('Held sale resumed successfully', 'success');
            } else {
                throw new Error(response.message || 'Failed to resume held sale');
            }
        } catch (error) {
            console.error('Error resuming held sale:', error);
            this.app.showNotification('Failed to resume held sale: ' + error.message, 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    closeHeldSalesModal() {
        const modal = document.getElementById('held-sales-modal-overlay');
        if (modal) {
            modal.remove();
        }
    }

    async deleteHeldSale(saleId) {
        if (!confirm('Are you sure you want to delete this held sale?')) return;

        try {
            this.app.showLoading('Deleting held sale...');
            const response = await this.api.delete('/pos/held-sale/' + saleId);

            if (response.success) {
                this.app.showNotification('Held sale cancelled successfully', 'success');
                // Close the modal and refresh the held sales list
                this.closeHeldSalesModal();
                // Reload held sales if we're viewing them
                if (document.getElementById('held-sales-modal-overlay')) {
                    this.showHeldSales();
                }
            } else {
                throw new Error(response.message || 'Failed to cancel held sale');
            }
        } catch (error) {
            console.error('Error deleting held sale:', error);
            this.app.showNotification('Failed to delete held sale: ' + error.message, 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    applyDiscount() {
        // Show discount modal instead of just notification
        this.showDiscountModal();
    }

    showDiscountModal() {
        // Create discount modal HTML
        const modalHtml = `
        <div class="modal-overlay" id="discount-modal-overlay">
            <div class="discount-modal">
                <div class="modal-header">
                    <h3>Apply Discount</h3>
                    <button class="modal-close-btn" onclick="window.app.screens.pos.closeDiscountModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="discount-form">
                        <div class="form-group">
                            <label for="discount-type">Discount Type:</label>
                            <select id="discount-type">
                                <option value="percentage">Percentage</option>
                                <option value="fixed">Fixed Amount</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="discount-value">Discount Value:</label>
                            <input type="number" id="discount-value" value="0" min="0" step="0.01" placeholder="Enter discount value">
                        </div>
                        <div class="form-group">
                            <label for="discount-reason">Reason (Optional):</label>
                            <input type="text" id="discount-reason" placeholder="Enter reason for discount">
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="window.app.screens.pos.closeDiscountModal()">Cancel</button>
                    <button class="btn btn-success" onclick="window.app.screens.pos.applyDiscountToCart()">Apply Discount</button>
                </div>
            </div>
        </div>`;

        // Add modal to document
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        // Ensure overlay is visible
        const discountOverlay = document.getElementById('discount-modal-overlay');
        if (discountOverlay) discountOverlay.style.display = 'flex';
    }

    closeDiscountModal() {
        const modal = document.getElementById('discount-modal-overlay');
        if (modal) {
            modal.remove();
        }
    }

    applyDiscountToCart() {
        const discountType = document.getElementById('discount-type').value;
        const discountValue = parseFloat(document.getElementById('discount-value').value) || 0;

        if (discountValue <= 0) {
            this.app.showNotification('Please enter a valid discount value', 'error');
            return;
        }

        // Calculate discount
        const subtotal = this.cart.reduce((sum, item) => sum + item.total, 0);
        let discountAmount = 0;

        if (discountType === 'percentage') {
            if (discountValue > 100) {
                this.app.showNotification('Percentage discount cannot exceed 100%', 'error');
                return;
            }
            discountAmount = (subtotal * discountValue) / 100;
        } else { // fixed amount
            discountAmount = Math.min(discountValue, subtotal); // Can't discount more than the total
        }

        // Apply discount to cart items proportionally
        const totalBeforeDiscount = subtotal;
        const discountRatio = (totalBeforeDiscount - discountAmount) / totalBeforeDiscount;

        this.cart.forEach(item => {
            // Store original total before discount
            if (item.original_total === undefined) {
                item.original_total = item.price * item.quantity;
            }

            item.discount = item.price * item.quantity * (1 - discountRatio); // Store discount per item
            item.total = item.price * item.quantity * discountRatio;
        });

        this.updateCartDisplay();
        this.app.showNotification('Discount of ' + this.app.formatCurrency(discountAmount) + ' applied', 'success');
        this.closeDiscountModal();
    }
    printReceipt() {
        if (this.cart.length === 0) {
            this.app.showNotification('Cart is empty', 'error');
            return;
        }

        // Create receipt content
        const receiptContent = this.generateReceiptContent();

        // Create a new window for printing
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Receipt</title>
                <style>
                    body { 
                        font-family: \'Courier New\', monospace; 
                        margin: 0; 
                        padding: 20px;
                        max-width: 300px;
                        background: white;
                    }
                    .receipt-header { 
                        text-align: center; 
                        margin-bottom: 15px; 
                        border-bottom: 1px dashed #000; 
                        padding-bottom: 10px; 
                    }
                    .receipt-title { 
                        font-size: 1.2em; 
                        font-weight: bold; 
                        margin: 0; 
                    }
                    .receipt-subtitle { 
                        font-size: 0.8em; 
                        margin: 5px 0; 
                    }
                    .receipt-details { 
                        font-size: 0.7em; 
                        margin: 5px 0; 
                    }
                    .items { 
                        margin: 10px 0; 
                    }
                    .item { 
                        display: flex; 
                        justify-content: space-between; 
                        margin-bottom: 5px; 
                        font-size: 0.8em; 
                    }
                    .item-name { 
                        flex: 1; 
                    }
                    .item-qty { 
                        width: 30px; 
                        text-align: right; 
                    }
                    .item-price { 
                        width: 60px; 
                        text-align: right; 
                    }
                    .total-section { 
                        margin-top: 10px; 
                        border-top: 1px solid #000; 
                        padding-top: 10px; 
                        font-weight: bold; 
                    }
                    .total-row { 
                        display: flex; 
                        justify-content: space-between; 
                    }
                    .thank-you { 
                        text-align: center; 
                        margin-top: 15px; 
                        font-style: italic; 
                    }
                    .receipt-footer { 
                        text-align: center; 
                        margin-top: 15px; 
                        font-size: 0.7em; 
                        border-top: 1px dashed #000; 
                        padding-top: 10px; 
                    }
                </style>
            </head>
            <body>
                ${receiptContent}
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();

        // Wait for content and images to load then print
        printWindow.onload = function () {
            const images = printWindow.document.getElementsByTagName('img');
            if (images.length > 0) {
                let loaded = 0;
                const checkPrint = () => {
                    loaded++;
                    if (loaded >= images.length) {
                        setTimeout(() => {
                            printWindow.print();
                            printWindow.close();
                        }, 500); // Extra delay for rendering
                    }
                };

                for (let i = 0; i < images.length; i++) {
                    if (images[i].complete) {
                        checkPrint();
                    } else {
                        images[i].onload = checkPrint;
                        images[i].onerror = checkPrint;
                    }
                }
            } else {
                printWindow.print();
                printWindow.close();
            }
        };
    }

    generateReceiptContent() {
        const subtotal = this.cart.reduce((sum, item) => sum + item.total, 0);
        const gstRate = window.shopSettings ? window.shopSettings.getSetting('gstRate') || 0.17 : 0.17;
        const tax = subtotal * gstRate;
        const total = subtotal + tax;

        // Get shop information from settings
        let logoPath = window.shopSettings ? window.shopSettings.getSetting('logo_path') : null;

        // Ensure logo path is absolute if it's relative
        if (logoPath && logoPath.startsWith('/') && this.api && this.api.baseURL) {
            const baseUrl = this.api.baseURL.endsWith('/') ? this.api.baseURL.slice(0, -1) : this.api.baseURL;
            logoPath = `${baseUrl}${logoPath}`;
        }

        console.log('[POS] Receipt Logo Path:', logoPath);

        const shopInfo = {
            name: window.shopSettings ? window.shopSettings.getSetting('shopName') : 'Auto Accessories Shop',
            address: window.shopSettings ? window.shopSettings.getSetting('shopAddress') : '123 Main Street, City',
            phone: window.shopSettings ? window.shopSettings.getSetting('shopPhone') : '+92-300-1234567',
            message: window.shopSettings ? window.shopSettings.getSetting('receiptMessage') : 'Thank you for your business!',
            taxNumber: window.shopSettings ? window.shopSettings.getSetting('taxNumber') : 'Tax ID: 123456789',
            logo_path: logoPath
        };

        // Get current date and time
        const now = new Date();
        const dateStr = now.toLocaleDateString();
        const timeStr = now.toLocaleTimeString();
        const receiptId = Math.floor(100000 + Math.random() * 900000);

        // Build receipt HTML
        return `
        <div class="receipt-container" style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 10px; max-width: 300px; margin: 0 auto; color: #000;">
            <div class="header" style="text-align: center; margin-bottom: 20px; border-bottom: 2px dashed #000; padding-bottom: 15px;">
                ${shopInfo.logo_path ? `<img src="${shopInfo.logo_path}" style="max-height: 60px; max-width: 80%; margin-bottom: 10px;">` : ''}
                <h2 style="margin: 0; font-size: 22px; font-weight: 800; text-transform: uppercase;">${shopInfo.name}</h2>
                <div class="info" style="font-size: 13px; margin: 5px 0;">${shopInfo.address}</div>
                <div class="info" style="font-size: 13px; margin: 5px 0;">Phone: ${shopInfo.phone}</div>
                <div class="info" style="font-size: 13px; margin: 5px 0; font-weight: bold;">${shopInfo.taxNumber}</div>
            </div>

            <div class="meta" style="margin-bottom: 15px; font-size: 13px; display: flex; justify-content: space-between;">
                <div>
                    <div><strong>Date:</strong> ${dateStr}</div>
                    <div><strong>Receipt #:</strong> ${receiptId}</div>
                    ${this.selectedCustomerId ? `<div><strong>Customer:</strong> #${this.selectedCustomerId}</div>` : ''}
                </div>
                <div style="text-align: right;">
                    <div><strong>Time:</strong> ${timeStr}</div>
                    <div><strong>Cashier:</strong> Admin</div>
                </div>
            </div>

            <div class="items-header" style="display: flex; border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 5px; font-weight: bold; font-size: 12px; text-transform: uppercase;">
                <div style="flex: 2;">Item</div>
                <div style="flex: 1; text-align: center;">Qty</div>
                <div style="flex: 1; text-align: right;">Price</div>
                <div style="flex: 1; text-align: right;">Total</div>
            </div>

            <div class="items-list" style="margin-bottom: 15px;">
                ${this.cart.map(item => `
                <div class="item-row" style="display: flex; margin-bottom: 8px; font-size: 13px; align-items: flex-start;">
                    <div style="flex: 2; padding-right: 5px; word-break: break-all;">
                        <span style="display: block; font-weight: 500;">${item.product.name}</span>
                        ${item.product.product_code ? `<span style="display: block; font-size: 11px; color: #555;">${item.product.product_code}</span>` : ''}
                    </div>
                    <div style="flex: 1; text-align: center;">${item.quantity}</div>
                    <div style="flex: 1; text-align: right;">${this.formatCompactCurrency(item.price)}</div>
                    <div style="flex: 1; text-align: right; font-weight: 500;">${this.formatCompactCurrency(item.total)}</div>
                </div>
                `).join('')}
            </div>

            <div class="totals" style="border-top: 2px dashed #000; padding-top: 10px; margin-bottom: 20px;">
                <div class="row" style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 5px;">
                    <span>Subtotal</span>
                    <span>${this.app.formatCurrency(subtotal)}</span>
                </div>
                <div class="row" style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 5px; color: #555;">
                    <span>GST/Tax (${(gstRate * 100).toFixed(0)}%)</span>
                    <span>${this.app.formatCurrency(tax)}</span>
                </div>
                <div class="row total" style="display: flex; justify-content: space-between; font-size: 18px; font-weight: 900; margin-top: 10px; border-top: 1px solid #000; padding-top: 10px;">
                    <span>GRAND TOTAL</span>
                    <span>${this.app.formatCurrency(total)}</span>
                </div>
            </div>

            ${this.lastPaymentDetails ? `
            <div class="payment-details" style="background: #f0f0f0; padding: 10px; border-radius: 4px; font-size: 13px; margin-bottom: 20px;">
                <div class="row" style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span>Payment Method:</span>
                    <span style="text-transform: capitalize; font-weight: bold;">${this.lastPaymentDetails.payment_method}</span>
                </div>
                <div class="row" style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span>Amount Tendered:</span>
                    <span>${this.app.formatCurrency(this.lastPaymentDetails.amount_tendered)}</span>
                </div>
                <div class="row" style="display: flex; justify-content: space-between; font-weight: bold;">
                    <span>Change Due:</span>
                    <span>${this.app.formatCurrency(this.lastPaymentDetails.change_amount)}</span>
                </div>
            </div>
            ` : ''}

            <div class="footer" style="text-align: center; font-size: 12px; margin-top: 30px; border-top: 1px dashed #ccc; padding-top: 15px;">
                <div style="margin-bottom: 10px; font-weight: bold; font-size: 14px;">${shopInfo.message}</div>
                <div style="margin-bottom: 5px;">NO RETURNS WITHOUT RECEIPT</div>
                <div style="margin-bottom: 5px;">NO RETURNS ON ELECTRONIC ITEMS</div>
                
                <div class="barcode" style="margin: 15px auto; height: 40px; background: repeating-linear-gradient(90deg, #000 0, #000 2px, #fff 2px, #fff 4px); width: 80%; opacity: 0.8;"></div>
                
                <div style="font-size: 10px; color: #888;">Powered by AutoAccessoriesPOS</div>
            </div>
        </div>
        `;
    }

    formatCompactCurrency(amount) {
        // Simplified currency formatter for tight receipt spaces
        return Number(amount).toLocaleString('en-PK');
    }
    addSelectedProduct() {
        if (this.selectedProduct) this.addProductToCart(this.selectedProduct);
    }

    async loadPendingCreditSales(customerId) {
        try {
            const response = await this.api.get(`/customer-payments/${customerId}/pending-credits`);

            if (response.success && response.pending_credits && response.pending_credits.length > 0) {
                const pendingSalesList = document.getElementById('pending-sales-list');
                if (pendingSalesList) {
                    // Create HTML for pending sales
                    pendingSalesList.innerHTML = response.pending_credits.map(sale => `
                        <div class="pending-sale-item">
                            <label>
                                <input type="checkbox" name="selected-sales" value="${sale.id}" onchange="window.app.screens.pos.updateSelectedSalesAmount()"> 
                                Invoice: ${sale.invoice_number} | Date: ${new Date(sale.created_at).toLocaleDateString()} | 
                                Amount: ${this.app.formatCurrency(sale.balance_due || sale.grand_total)} | 
                                Status: ${sale.payment_status}
                            </label>
                        </div>
                    `).join('');
                }

                // Show the specific sales section
                const specificSalesSection = document.getElementById('specific-sales-section');
                if (specificSalesSection) {
                    specificSalesSection.style.display = 'block';
                }
            } else {
                // Hide the specific sales section if no pending sales
                const specificSalesSection = document.getElementById('specific-sales-section');
                if (specificSalesSection) {
                    specificSalesSection.style.display = 'none';
                }

                // Show message if there are no pending sales
                const pendingSalesList = document.getElementById('pending-sales-list');
                if (pendingSalesList) {
                    pendingSalesList.innerHTML = '<p>No pending credit sales for this customer.</p>';
                }
            }
        } catch (error) {
            console.error('Error loading pending credit sales:', error);
            const pendingSalesList = document.getElementById('pending-sales-list');
            if (pendingSalesList) {
                pendingSalesList.innerHTML = '<p>Error loading pending sales. Please try again.</p>';
            }
        }
    }

    updateSelectedSalesAmount() {
        const checkboxes = document.querySelectorAll('input[name="selected-sales"]:checked');
        let totalAmount = 0;

        checkboxes.forEach(checkbox => {
            // In a real implementation, we would get the sale details to calculate the exact amount
            // For now, we'll just indicate that sales are selected
        });

        // Update UI to show selected sales count
        const generalPaymentSection = document.getElementById('general-payment-section');
        if (generalPaymentSection) {
            if (checkboxes.length > 0) {
                generalPaymentSection.style.display = 'none';
            } else {
                generalPaymentSection.style.display = 'block';
            }
        }
    }
}

// Load shop settings if not already loaded
if (!window.shopSettings) {
    // Create a script element to load shop settings
    const script = document.createElement('script');
    script.src = 'screens/pos/shop_settings.js';
    document.head.appendChild(script);
}

// Register class for app.js to instantiate
window.PosScreen = PosScreen;
// the application will instantiate the screen when loading via app.loadScreen().




