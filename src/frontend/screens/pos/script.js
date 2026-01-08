// src/frontend/screens/pos/script.js
/**
 * POS TERMINAL SCREEN
 * Production-ready version using real API
 */

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
            'Escape': () => this.closeAllModals(),
            'Enter': () => this.addSelectedProduct(),
        };
    }

    init() {
        console.log('Initializing POS Screen');
        this.loadCategories();
        this.loadProducts();
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
        // Search input
        const searchInput = document.getElementById('pos-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value;
                this.filterProducts();
            });

            searchInput.addEventListener('keydown', (e) => {
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
            });
        }

        // Category buttons (Delegation)
        const catContainer = document.getElementById('categories-container');
        if (catContainer) {
            catContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.category-btn');
                if (btn) {
                    this.selectCategory(btn.dataset.categoryId);
                }
            });
        }

        // Product cards (Delegation)
        const prodContainer = document.getElementById('products-container');
        if (prodContainer) {
            prodContainer.addEventListener('click', (e) => {
                const card = e.target.closest('.product-card');
                const addBtn = e.target.closest('.product-action-btn');

                if (addBtn) {
                    e.stopPropagation();
                    const productId = addBtn.dataset.productId;
                    const product = this.products.find(p => p.id == productId);
                    if (product) this.addProductToCart(product);
                    return;
                }

                if (card) {
                    this.selectProduct(card.dataset.productId);
                }
            });
        }

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

        // Set up action buttons after a short delay to ensure DOM is loaded
        setTimeout(() => {
            // Action buttons - ensure elements exist before binding
            const bindBtn = (id, fn) => {
                const btn = document.getElementById(id);
                if (btn) {
                    btn.addEventListener('click', fn.bind(this));
                } else {
                    console.warn(`Button with ID ${id} not found`);
                }
            };

            // Using arrow functions to preserve 'this' context
            bindBtn('process-payment', () => this.processPayment());
            bindBtn('clear-cart', () => this.clearCart());
            bindBtn('hold-sale', () => this.holdSale());
            bindBtn('apply-discount', () => this.applyDiscount());
            bindBtn('view-held-sales', () => this.showHeldSales());
            bindBtn('print-receipt', () => this.printReceipt());
            bindBtn('checkout-btn', () => this.processPayment());
            bindBtn('shop-settings', () => this.showShopSettings());
        }, 100);

        // Selection method buttons
        const methodBtns = document.querySelectorAll('.method-btn');
        methodBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectMethod(btn.dataset.method);
            });
        });
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

    async loadCategories() {
        try {
            const response = await this.api.get('/products/categories');
            if (response.success && response.categories) {
                this.categories = response.categories;
                this.renderCategories();
            }
        } catch (error) {
            console.error('Failed to load categories:', error);
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
    }

    async loadProducts(categoryId = null) {
        try {
            this.app.showLoading('Loading products...');
            let url = '/products';
            if (categoryId) url += `?category_id=${categoryId}`;

            const response = await this.api.get(url);
            if (response.success !== undefined) {
                // Handle response with success flag
                this.products = response.products || response.data || [];
            } else {
                // Handle direct array response
                this.products = response;
            }
            this.renderProducts();
        } catch (error) {
            console.error('Failed to load products:', error);
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
                    ${(product.image || product.image_path) ? `<img src="${product.image || product.image_path}" alt="${product.name || product[1]}">` : '📦'}
                </div>
                <div class="product-name" title="${product.name || product[1]}">
                    ${product.name || product[1] || 'N/A'}
                </div>
                <div class="product-code">${product.product_code || product.code || product[2] || 'N/A'}</div>
                <div class="product-price">${this.app.formatCurrency(product.retail_price || product.selling_price || product.price || product[4] || 0)}</div>
                <div class="product-stock">
                    Stock: ${product.current_stock || product.stock || product[7] || 0} ${(product.current_stock || product.stock || product[7] || 0) < 10 ? '⚠' : ''}
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

        const activeBtn = document.querySelector(`.category-btn[data-category-id="${categoryId || ''}"]`);
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
        const selectedCard = document.querySelector(`[data-product-id="${productId}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
        }
    }

    selectMethod(method) {
        document.querySelectorAll('.method-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = document.querySelector(`[data-method="${method}"]`);
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
                this.app.showNotification(`Found: ${response.product.name}`, 'success');
            } else {
                if (confirm(`Product ${barcode} not found. Create new?`)) {
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
                       ${(item.product.image || item.product.image_path) ? `<img src="${item.product.image || item.product.image_path}" width="40">` : '🛒'}
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

    showPaymentModal() {
        // Calculate totals
        const subtotal = this.cart.reduce((sum, item) => sum + item.total, 0);
        const gstRate = window.shopSettings ? window.shopSettings.getSetting('gstRate') || 0.17 : 0.17;
        const tax = subtotal * gstRate;
        const total = subtotal + tax;

        // Create payment modal HTML
        const modalHtml = `
        <div class="modal-overlay" id="payment-modal-overlay">
            <div class="payment-modal">
                <div class="modal-header">
                    <h3>Payment Method</h3>
                    <button class="modal-close-btn" onclick="window.app.screens.pos.closePaymentModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="payment-summary">
                        <div class="summary-row">
                            <span>Subtotal:</span>
                            <span>${this.app.formatCurrency(subtotal)}</span>
                        </div>
                        <div class="summary-row">
                            <span>GST (${(gstRate * 100).toFixed(0)}%):</span>
                            <span>${this.app.formatCurrency(tax)}</span>
                        </div>
                        <div class="summary-row total">
                            <span>Total:</span>
                            <span>${this.app.formatCurrency(total)}</span>
                        </div>
                    </div>
                    
                    <div class="payment-methods">
                        <div class="payment-method">
                            <input type="radio" id="cash" name="payment-method" value="cash" checked>
                            <label for="cash">Cash</label>
                        </div>
                        <div class="payment-method">
                            <input type="radio" id="card" name="payment-method" value="card">
                            <label for="card">Card</label>
                        </div>
                        <div class="payment-method">
                            <input type="radio" id="credit" name="payment-method" value="credit">
                            <label for="credit">Credit</label>
                        </div>
                    </div>
                    
                    <div class="payment-inputs">
                        <div class="input-group">
                            <label for="amount-tendered">Amount Tendered:</label>
                            <input type="number" id="amount-tendered" value="${total.toFixed(2)}" step="0.01" min="${total}" placeholder="Enter amount">
                        </div>
                        <div class="input-group">
                            <label for="change-amount">Change:</label>
                            <input type="text" id="change-amount" value="0.00" readonly>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="window.app.screens.pos.closePaymentModal()">Cancel</button>
                    <button class="btn btn-success" onclick="window.app.screens.pos.completePayment()">Complete Payment</button>
                </div>
            </div>
        </div>`;

        // Add modal to document
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        // Ensure the overlay becomes visible (modal-overlay CSS now hides overlays by default)
        const paymentOverlay = document.getElementById('payment-modal-overlay');
        if (paymentOverlay) paymentOverlay.style.display = 'flex';
        
        // Add event listeners
        const amountTenderedInput = document.getElementById('amount-tendered');
        const changeAmountInput = document.getElementById('change-amount');
        
        amountTenderedInput.addEventListener('input', () => {
            const amountTendered = parseFloat(amountTenderedInput.value) || 0;
            const change = amountTendered - total;
            changeAmountInput.value = change >= 0 ? this.app.formatCurrency(change) : '0.00';
        });
        
        // Trigger initial calculation
        amountTenderedInput.dispatchEvent(new Event('input'));
    }

    closePaymentModal() {
        const modal = document.getElementById('payment-modal-overlay');
        if (modal) {
            modal.remove();
        }
    }

    async completePayment() {
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
        try {
            // Calculate total discount amount from cart
            const totalOriginalSubtotal = this.cart.reduce((sum, item) => sum + (item.original_total || (item.price * item.quantity)), 0);
            const totalDiscount = Math.max(0, totalOriginalSubtotal - subtotal); // Ensure positive discount
            
            // Prepare payload matching backend expectations
            const saleData = {
                customer_id: null, // No customer selected by default
                total_amount: total,
                subtotal: subtotal,
                discount_amount: totalDiscount,
                gst_amount: tax,
                payment_type: paymentMethod,
                payment_status: 'completed',
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
            } else {
                throw new Error(response.message || 'Payment failed');
            }
        } catch (error) {
            console.error(error);
            this.app.showNotification('Payment failed', 'error');
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
            
            // Prepare sale data
            const saleData = {
                customer_id: null, // No customer selected by default
                total_amount: total,
                subtotal: subtotal,
                discount_amount: 0, // No discount applied in this flow
                gst_amount: tax,
                payment_type: 'credit', // Using credit for held sales
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
                this.app.showNotification(`Sale held successfully - Invoice: ${response.invoice_number}`, 'success');
                
                // Clear the cart after holding the sale
                this.cart = [];
                this.updateCartDisplay();
            } else {
                throw new Error(response.message || 'Failed to hold sale');
            }
        } catch (error) {
            console.error('Error holding sale:', error);
            this.app.showNotification('Failed to hold sale: ' + error.message, 'error');
        }
    }
    showShopSettings() {
        // Create settings modal HTML
        const settings = window.shopSettings ? window.shopSettings.getAllSettings() : {
            shopName: 'Auto Accessories Shop',
            shopAddress: '123 Main Street, City',
            shopPhone: '+92-300-1234567',
            shopEmail: 'info@autoaccessories.com',
            taxNumber: 'Tax ID: 123456789',
            receiptMessage: 'Thank you for your business!',
            gstRate: 0.17,
            currency: 'PKR'
        };
        
        const modalHtml = `
        <div class="modal-overlay" id="shop-settings-modal-overlay">
            <div class="settings-modal">
                <div class="modal-header">
                    <h3>Shop Settings</h3>
                    <button class="modal-close-btn" onclick="window.app.screens.pos.closeShopSettings()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="settings-form">
                        <div class="form-group">
                            <label for="shop-name">Shop Name:</label>
                            <input type="text" id="shop-name" value="${settings.shopName}" placeholder="Enter shop name">
                        </div>
                        <div class="form-group">
                            <label for="shop-address">Address:</label>
                            <input type="text" id="shop-address" value="${settings.shopAddress}" placeholder="Enter shop address">
                        </div>
                        <div class="form-group">
                            <label for="shop-phone">Phone:</label>
                            <input type="text" id="shop-phone" value="${settings.shopPhone}" placeholder="Enter phone number">
                        </div>
                        <div class="form-group">
                            <label for="shop-email">Email:</label>
                            <input type="email" id="shop-email" value="${settings.shopEmail}" placeholder="Enter email">
                        </div>
                        <div class="form-group">
                            <label for="tax-number">Tax Number:</label>
                            <input type="text" id="tax-number" value="${settings.taxNumber}" placeholder="Enter tax number">
                        </div>
                        <div class="form-group">
                            <label for="receipt-message">Receipt Message:</label>
                            <input type="text" id="receipt-message" value="${settings.receiptMessage}" placeholder="Enter receipt message">
                        </div>
                        <div class="form-group">
                            <label for="gst-rate">GST Rate (%):</label>
                            <input type="number" id="gst-rate" value="${settings.gstRate * 100}" step="0.01" min="0" max="100" placeholder="Enter GST rate">
                        </div>
                        <div class="form-group">
                            <label for="currency">Currency:</label>
                            <select id="currency">
                                <option value="PKR" ${settings.currency === 'PKR' ? 'selected' : ''}>PKR (Pakistani Rupee)</option>
                                <option value="USD" ${settings.currency === 'USD' ? 'selected' : ''}>USD (US Dollar)</option>
                                <option value="EUR" ${settings.currency === 'EUR' ? 'selected' : ''}>EUR (Euro)</option>
                                <option value="GBP" ${settings.currency === 'GBP' ? 'selected' : ''}>GBP (British Pound)</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="window.app.screens.pos.closeShopSettings()">Cancel</button>
                    <button class="btn btn-primary" onclick="window.app.screens.pos.saveShopSettings()">Save Settings</button>
                </div>
            </div>
        </div>`;

        // Add modal to document
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        // Ensure overlay is visible
        const shopOverlay = document.getElementById('shop-settings-modal-overlay');
        if (shopOverlay) shopOverlay.style.display = 'flex';
    }
    
    closeShopSettings() {
        const modal = document.getElementById('shop-settings-modal-overlay');
        if (modal) {
            modal.remove();
        }
    }
    
    saveShopSettings() {
        const settings = {
            shopName: document.getElementById('shop-name').value,
            shopAddress: document.getElementById('shop-address').value,
            shopPhone: document.getElementById('shop-phone').value,
            shopEmail: document.getElementById('shop-email').value,
            taxNumber: document.getElementById('tax-number').value,
            receiptMessage: document.getElementById('receipt-message').value,
            gstRate: parseFloat(document.getElementById('gst-rate').value) / 100,
            currency: document.getElementById('currency').value
        };
        
        if (window.shopSettings) {
            window.shopSettings.saveSettings(settings);
            this.app.showNotification('Shop settings saved successfully!', 'success');
        } else {
            this.app.showNotification('Error saving settings', 'error');
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
        // Create held sales modal HTML
        const modalHtml = `
        <div class="modal-overlay" id="held-sales-modal-overlay">
            <div class="held-sales-modal">
                <div class="modal-header">
                    <h3>Held Sales</h3>
                    <button class="modal-close-btn" onclick="window.app.screens.pos.closeHeldSalesModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="held-sales-list">
                        ${heldSales.map(sale => `
                            <div class="held-sale-item">
                                <div class="sale-info">
                                    <div class="sale-id">Invoice: ${sale.invoice_number}</div>
                                    <div class="sale-date">${new Date(sale.created_at).toLocaleString()}</div>
                                    <div class="sale-total">Total: ${this.app.formatCurrency(sale.grand_total)}</div>
                                    <div class="sale-items">Items: ${sale.total_items || sale.items_count || 0}</div>
                                </div>
                                <div class="sale-actions">
                                    <button class="btn btn-primary" onclick="window.app.screens.pos.resumeHeldSale(${sale.id})">Resume</button>
                                    <button class="btn btn-danger" onclick="window.app.screens.pos.deleteHeldSale(${sale.id})">Delete</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="window.app.screens.pos.closeHeldSalesModal()">Close</button>
                </div>
            </div>
        </div>`;

        // Add modal to document
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        // Ensure overlay is visible
        const heldSalesOverlay = document.getElementById('held-sales-modal-overlay');
        if (heldSalesOverlay) heldSalesOverlay.style.display = 'flex';
    }
    
    async resumeHeldSale(saleId) {
        try {
            this.app.showLoading('Loading held sale...');
            const response = await this.api.post(`/pos/resume-sale/${saleId}`);
            
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
            const response = await this.api.delete(`/pos/held-sale/${saleId}`);
            
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
        this.app.showNotification(`Discount of ${this.app.formatCurrency(discountAmount)} applied`, 'success');
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
                        font-family: 'Courier New', monospace; 
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
        
        // Wait for content to load then print
        printWindow.onload = function() {
            printWindow.print();
            printWindow.close();
        };
    }
    
    generateReceiptContent() {
        const subtotal = this.cart.reduce((sum, item) => sum + item.total, 0);
        const gstRate = window.shopSettings ? window.shopSettings.getSetting('gstRate') || 0.17 : 0.17;
        const tax = subtotal * gstRate; // Using configurable GST rate
        const total = subtotal + tax;
        
        // Get shop information from settings
        const shopInfo = {
            name: window.shopSettings ? window.shopSettings.getSetting('shopName') : 'Auto Accessories Shop',
            address: window.shopSettings ? window.shopSettings.getSetting('shopAddress') : '123 Main Street, City',
            phone: window.shopSettings ? window.shopSettings.getSetting('shopPhone') : '+92-300-1234567',
            message: window.shopSettings ? window.shopSettings.getSetting('receiptMessage') : 'Thank you for your business!',
            taxNumber: window.shopSettings ? window.shopSettings.getSetting('taxNumber') : 'Tax ID: 123456789'
        };
        
        // Get current date and time
        const now = new Date();
        const dateStr = now.toLocaleDateString();
        const timeStr = now.toLocaleTimeString();
        
        let receipt = `
            <div class="receipt-header">
                <div class="receipt-title">${shopInfo.name}</div>
                <div class="receipt-subtitle">${shopInfo.address}</div>
                <div class="receipt-details">Phone: ${shopInfo.phone}</div>
                <div class="receipt-details">${shopInfo.taxNumber}</div>
            </div>
            <div class="receipt-details">Date: ${dateStr} | Time: ${timeStr}</div>
            <div class="receipt-details">Receipt #: ${Math.floor(100000 + Math.random() * 900000)}</div>
            <div class="items">
        `;
        
        // Add items
        this.cart.forEach(item => {
            receipt += `
                <div class="item">
                    <span class="item-name">${item.product.name || item.product[1]}</span>
                    <span class="item-qty">${item.quantity}x</span>
                    <span class="item-price">${this.app.formatCurrency(item.price)}</span>
                </div>
            `;
        });
        
        receipt += `
            </div>
            <div class="total-section">
                <div class="total-row">
                    <span>Subtotal:</span>
                    <span>${this.app.formatCurrency(subtotal)}</span>
                </div>
                <div class="total-row">
                    <span>GST (${(gstRate * 100).toFixed(0)}%):</span>
                    <span>${this.app.formatCurrency(tax)}</span>
                </div>
                <div class="total-row">
                    <span>Total:</span>
                    <span>${this.app.formatCurrency(total)}</span>
                </div>
        `;
        
        // Add payment details if available
        if (this.lastPaymentDetails) {
            receipt += `
                <div class="total-row">
                    <span>Amount Paid:</span>
                    <span>${this.app.formatCurrency(this.lastPaymentDetails.amount_tendered)}</span>
                </div>
                <div class="total-row">
                    <span>Change:</span>
                    <span>${this.app.formatCurrency(this.lastPaymentDetails.change_amount)}</span>
                </div>
            `;
        }
        
        receipt += `
            </div>
            <div class="thank-you">${shopInfo.message}</div>
            <div class="receipt-footer">
                <div>This is a computer generated receipt</div>
                <div>Valid for warranty claims</div>
            </div>
        `;
        
        return receipt;
    }
    addSelectedProduct() {
        if (this.selectedProduct) this.addProductToCart(this.selectedProduct);
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
window.POS = window.POS || {}; window.POS.screens = window.POS.screens || {};
window.POS.screens.pos = PosScreen;

// Also register on app object to ensure availability
window.app = window.app || {}; window.app.screens = window.app.screens || {};
window.app.screens.pos = PosScreen;
