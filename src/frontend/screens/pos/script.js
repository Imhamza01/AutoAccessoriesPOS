// src/frontend/screens/pos/script.js
/**
 * POS TERMINAL SCREEN
 * With 3 product selection methods:
 * 1. Barcode scanner
 * 2. Product search and category browsing
 * 3. Quick product entry by code
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
                    this.addProductToCart(this.products[0]);
                }
            });
        }

        // Category buttons
        document.addEventListener('click', (e) => {
            const categoryBtn = e.target.closest('.category-btn');
            if (categoryBtn) {
                const categoryId = categoryBtn.dataset.categoryId;
                this.selectCategory(categoryId);
                
                // Update active state
                document.querySelectorAll('.category-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                categoryBtn.classList.add('active');
            }
        });

        // Product cards
        document.addEventListener('click', (e) => {
            const productCard = e.target.closest('.product-card');
            if (productCard) {
                const productId = productCard.dataset.productId;
                this.selectProduct(productId);
            }
            
            const addBtn = e.target.closest('.product-action-btn');
            if (addBtn) {
                const productId = addBtn.dataset.productId;
                const product = this.products.find(p => p.id == productId);
                if (product) {
                    this.addProductToCart(product);
                }
            }
        });

        // Cart controls
        document.addEventListener('click', (e) => {
            const increaseBtn = e.target.closest('.quantity-increase');
            if (increaseBtn) {
                const productId = increaseBtn.dataset.productId;
                this.updateCartQuantity(productId, 1);
            }
            
            const decreaseBtn = e.target.closest('.quantity-decrease');
            if (decreaseBtn) {
                const productId = decreaseBtn.dataset.productId;
                this.updateCartQuantity(productId, -1);
            }
            
            const removeBtn = e.target.closest('.remove-item');
            if (removeBtn) {
                const productId = removeBtn.dataset.productId;
                this.removeFromCart(productId);
            }
        });

        // Action buttons
        const processPaymentBtn = document.getElementById('process-payment');
        if (processPaymentBtn) {
            processPaymentBtn.addEventListener('click', () => this.processPayment());
        }
        
        const clearCartBtn = document.getElementById('clear-cart');
        if (clearCartBtn) {
            clearCartBtn.addEventListener('click', () => this.clearCart());
        }
        
        const holdSaleBtn = document.getElementById('hold-sale');
        if (holdSaleBtn) {
            holdSaleBtn.addEventListener('click', () => this.holdSale());
        }
        
        const printReceiptBtn = document.getElementById('print-receipt');
        if (printReceiptBtn) {
            printReceiptBtn.addEventListener('click', () => this.printReceipt());
        }

        // Selection method buttons
        const methodBtns = document.querySelectorAll('.method-btn');
        methodBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const method = btn.dataset.method;
                this.selectMethod(method);
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
            // In a real app, this would come from an API
            // For now, using mock data
            this.categories = [
                { id: 1, name: 'Engine Parts', count: 45 },
                { id: 2, name: 'Electrical', count: 32 },
                { id: 3, name: 'Body Parts', count: 28 },
                { id: 4, name: 'Interior', count: 56 },
                { id: 5, name: 'Exterior', count: 39 },
                { id: 6, name: 'Audio/Video', count: 22 },
                { id: 7, name: 'Tyres & Wheels', count: 18 },
                { id: 8, name: 'Oils & Lubricants', count: 27 },
            ];
            
            this.renderCategories();
            
        } catch (error) {
            console.error('Failed to load categories:', error);
            this.app.showNotification('Failed to load categories', 'error');
        }
    }

    renderCategories() {
        const container = document.getElementById('categories-container');
        if (!container) return;
        
        container.innerHTML = this.categories.map(category => `
            <button class="category-btn" data-category-id="${category.id}">
                <span>${category.name}</span>
                <span class="category-count">${category.count}</span>
            </button>
        `).join('');
        
        // Select first category by default
        if (this.categories.length > 0 && !this.currentCategory) {
            this.selectCategory(this.categories[0].id);
            const firstBtn = container.querySelector('.category-btn');
            if (firstBtn) firstBtn.classList.add('active');
        }
    }

    async loadProducts(categoryId = null) {
        try {
            // In a real app, this would come from an API
            // For now, using mock data
            this.products = this.generateMockProducts(categoryId);
            this.renderProducts();
            
        } catch (error) {
            console.error('Failed to load products:', error);
            this.app.showNotification('Failed to load products', 'error');
        }
    }

    generateMockProducts(categoryId = null) {
        const products = [];
        const categories = [
            'Engine Parts', 'Electrical', 'Body Parts', 'Interior', 
            'Exterior', 'Audio/Video', 'Tyres & Wheels', 'Oils & Lubricants'
        ];
        
        const brands = ['Toyota', 'Honda', 'Suzuki', 'Mitsubishi', 'Hyundai', 'Nissan'];
        
        for (let i = 1; i <= 50; i++) {
            const categoryIndex = categoryId ? (categoryId - 1) : Math.floor(Math.random() * categories.length);
            const price = Math.floor(Math.random() * 5000) + 100;
            const stock = Math.floor(Math.random() * 50);
            
            products.push({
                id: i,
                code: `PROD${String(i).padStart(4, '0')}`,
                name: `${brands[i % brands.length]} ${categories[categoryIndex]} Part ${i}`,
                description: `High quality ${categories[categoryIndex].toLowerCase()} for all vehicle types`,
                price: price,
                cost: price * 0.6,
                stock: stock,
                category_id: categoryId || (categoryIndex + 1),
                category: categories[categoryIndex],
                brand: brands[i % brands.length],
                barcode: `890123456789${String(i).padStart(2, '0')}`,
                image: null,
                has_serial: i % 5 === 0,
                gst_rate: 17,
                min_sale_price: price * 0.8,
            });
        }
        
        return products;
    }

    renderProducts() {
        const container = document.getElementById('products-container');
        if (!container) return;
        
        const productsToShow = this.searchQuery 
            ? this.products.filter(p => 
                p.name.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
                p.code.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
                p.barcode.includes(this.searchQuery))
            : this.products;
        
        container.innerHTML = productsToShow.map(product => `
            <div class="product-card" data-product-id="${product.id}">
                <div class="product-image">
                    ${product.image ? `<img src="${product.image}" alt="${product.name}">` : '🚗'}
                </div>
                <div class="product-name" title="${product.name}">
                    ${product.name.length > 30 ? product.name.substring(0, 30) + '...' : product.name}
                </div>
                <div class="product-code">${product.code}</div>
                <div class="product-price">${this.app.formatCurrency(product.price)}</div>
                <div class="product-stock">
                    Stock: ${product.stock} ${product.stock < 10 ? '⚠' : ''}
                </div>
                <button class="product-action-btn" 
                        data-product-id="${product.id}"
                        ${product.stock <= 0 ? 'disabled' : ''}>
                    ${product.stock <= 0 ? 'Out of Stock' : 'Add to Cart'}
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
        
        // Update category title
        const category = this.categories.find(c => c.id == categoryId);
        const categoryTitle = document.getElementById('category-title');
        if (categoryTitle && category) {
            categoryTitle.textContent = category.name;
        }
    }

    selectProduct(productId) {
        this.selectedProduct = this.products.find(p => p.id == productId);
        // Highlight selected product
        document.querySelectorAll('.product-card').forEach(card => {
            card.classList.remove('selected');
        });
        const selectedCard = document.querySelector(`[data-product-id="${productId}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
        }
    }

    selectMethod(method) {
        // Update active method button
        document.querySelectorAll('.method-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = document.querySelector(`[data-method="${method}"]`);
        if (activeBtn) activeBtn.classList.add('active');
        
        // Show appropriate interface
        switch(method) {
            case 'scanner':
                this.openScanner();
                break;
            case 'search':
                this.focusSearch();
                break;
            case 'quick':
                this.openQuickEntry();
                break;
        }
    }

    // METHOD 1: Barcode Scanner
    async openScanner() {
        this.app.showLoading('Initializing scanner...');
        
        try {
            // Check if browser supports camera API
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Camera API not supported in this browser');
            }
            
            // Create scanner modal
            const modalHtml = `
                <div class="scanner-modal">
                    <div class="scanner-header">
                        <h3>Barcode Scanner</h3>
                        <button class="modal-close" onclick="POS.screens.pos.closeScanner()">&times;</button>
                    </div>
                    <div class="scanner-video-container">
                        <video id="scanner-video" autoplay playsinline></video>
                        <div class="scanner-overlay"></div>
                    </div>
                    <div class="scanner-result" id="scanner-result">
                        Point camera at barcode
                    </div>
                    <div class="scanner-actions">
                        <button class="btn btn-secondary" onclick="POS.screens.pos.closeScanner()">
                            Cancel
                        </button>
                        <button class="btn btn-primary" onclick="POS.screens.pos.manualBarcodeEntry()">
                            Manual Entry
                        </button>
                    </div>
                </div>
            `;
            
            this.showModal(modalHtml);
            
            // Initialize camera
            const video = document.getElementById('scanner-video');
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });
            
            video.srcObject = stream;
            this.isScannerActive = true;
            
            // Start barcode detection (simplified - in real app use a library like Quagga.js)
            this.startBarcodeDetection(video);
            
        } catch (error) {
            console.error('Scanner error:', error);
            this.app.showNotification(`Scanner error: ${error.message}`, 'error');
            this.showManualBarcodeEntry();
        } finally {
            this.app.hideLoading();
        }
    }

    startBarcodeDetection(video) {
        // This is a simplified version
        // In a real app, you would use a barcode scanning library
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        const checkBarcode = () => {
            if (!this.isScannerActive) return;
            
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Simplified barcode detection
            // In reality, you would use:
            // 1. Quagga.js for browser-based scanning
            // 2. Or a backend API for more accurate detection
            
            requestAnimationFrame(checkBarcode);
        };
        
        checkBarcode();
    }

    closeScanner() {
        this.isScannerActive = false;
        
        // Stop camera stream
        const video = document.getElementById('scanner-video');
        if (video && video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
        }
        
        this.closeModal();
    }

    showManualBarcodeEntry() {
        const barcode = prompt('Enter barcode manually:');
        if (barcode) {
            this.handleBarcodeScanned(barcode);
        }
    }

    manualBarcodeEntry() {
        this.closeScanner();
        this.showManualBarcodeEntry();
    }

    async handleBarcodeScanned(barcode) {
        this.app.showLoading('Looking up product...');
        
        try {
            // In a real app, search product by barcode via API
            const product = this.products.find(p => p.barcode === barcode);
            
            if (product) {
                this.addProductToCart(product);
                this.app.showNotification(`Product found: ${product.name}`, 'success');
            } else {
                // Product not found, offer to create new
                const createNew = confirm(`Product with barcode ${barcode} not found. Create new product?`);
                if (createNew) {
                    this.openQuickEntry(barcode);
                }
            }
            
        } catch (error) {
            console.error('Barcode lookup error:', error);
            this.app.showNotification('Failed to lookup product', 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    // METHOD 2: Product Search and Category Browsing
    focusSearch() {
        const searchInput = document.getElementById('pos-search');
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
    }

    // METHOD 3: Quick Product Entry
    openQuickEntry(prefilledBarcode = '') {
        const modalHtml = `
            <div class="quick-entry-modal">
                <div class="modal-header">
                    <h3 class="modal-title">Quick Product Entry</h3>
                    <button class="modal-close" onclick="POS.screens.pos.closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="quick-entry-form" class="quick-entry-form">
                        <div class="form-row">
                            <label>Product Code:</label>
                            <input type="text" id="quick-code" class="input-field" 
                                   placeholder="Enter product code" required>
                        </div>
                        <div class="form-row">
                            <label>Barcode:</label>
                            <input type="text" id="quick-barcode" class="input-field" 
                                   value="${prefilledBarcode}" 
                                   placeholder="Enter barcode">
                        </div>
                        <div class="form-row">
                            <label>Product Name:</label>
                            <input type="text" id="quick-name" class="input-field" 
                                   placeholder="Enter product name" required>
                        </div>
                        <div class="form-row">
                            <label>Price:</label>
                            <input type="number" id="quick-price" class="input-field" 
                                   placeholder="0.00" step="0.01" min="0" required>
                        </div>
                        <div class="form-row">
                            <label>Quantity:</label>
                            <input type="number" id="quick-quantity" class="input-field" 
                                   value="1" min="1" max="100" required>
                        </div>
                        <div class="form-row">
                            <label>Category:</label>
                            <select id="quick-category" class="input-field">
                                ${this.categories.map(cat => 
                                    `<option value="${cat.id}">${cat.name}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div id="quick-entry-error" class="text-danger" style="display: none;"></div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="POS.screens.pos.closeModal()">
                        Cancel
                    </button>
                    <button class="btn btn-primary" onclick="POS.screens.pos.addQuickProduct()">
                        Add to Cart
                    </button>
                </div>
            </div>
        `;
        
        this.showModal(modalHtml);
        
        // Auto-focus on code field
        setTimeout(() => {
            const codeInput = document.getElementById('quick-code');
            if (codeInput) codeInput.focus();
        }, 100);
    }

    async addQuickProduct() {
        const code = document.getElementById('quick-code').value.trim();
        const barcode = document.getElementById('quick-barcode').value.trim();
        const name = document.getElementById('quick-name').value.trim();
        const price = parseFloat(document.getElementById('quick-price').value);
        const quantity = parseInt(document.getElementById('quick-quantity').value);
        const categoryId = parseInt(document.getElementById('quick-category').value);
        const errorElement = document.getElementById('quick-entry-error');
        
        // Validation
        if (!code || !name || isNaN(price) || price <= 0 || isNaN(quantity) || quantity <= 0) {
            errorElement.textContent = 'Please fill all required fields with valid values';
            errorElement.style.display = 'block';
            return;
        }
        
        try {
            // In a real app, you would save this as a new product or find existing
            const product = {
                id: Date.now(), // Temporary ID
                code: code,
                barcode: barcode || code,
                name: name,
                price: price,
                cost: price * 0.7,
                stock: 999, // Assume unlimited stock for quick entry
                category_id: categoryId,
                category: this.categories.find(c => c.id === categoryId)?.name || 'Other',
                is_quick_entry: true,
            };
            
            // Add to cart with specified quantity
            for (let i = 0; i < quantity; i++) {
                this.addProductToCart(product);
            }
            
            this.closeModal();
            this.app.showNotification(`Added ${quantity} × ${name} to cart`, 'success');
            
        } catch (error) {
            console.error('Quick entry error:', error);
            errorElement.textContent = `Error: ${error.message}`;
            errorElement.style.display = 'block';
        }
    }

    // Cart Management
    addProductToCart(product, quantity = 1) {
        // Check if product already in cart
        const existingItem = this.cart.find(item => item.product.id === product.id);
        
        if (existingItem) {
            // Update quantity
            existingItem.quantity += quantity;
        } else {
            // Add new item
            this.cart.push({
                product: product,
                quantity: quantity,
                price: product.price,
                discount: 0,
                total: product.price * quantity
            });
        }
        
        this.updateCartDisplay();
        this.app.showNotification(`Added ${product.name} to cart`, 'success');
        
        // Play sound effect
        this.playAddToCartSound();
    }

    updateCartQuantity(productId, change) {
        const item = this.cart.find(item => item.product.id === productId);
        if (!item) return;
        
        const newQuantity = item.quantity + change;
        
        if (newQuantity <= 0) {
            this.removeFromCart(productId);
        } else {
            item.quantity = newQuantity;
            item.total = item.price * newQuantity;
            this.updateCartDisplay();
        }
    }

    removeFromCart(productId) {
        this.cart = this.cart.filter(item => item.product.id !== productId);
        this.updateCartDisplay();
        this.app.showNotification('Item removed from cart', 'info');
    }

    updateCartDisplay() {
        // Update cart items list
        const cartItems = document.getElementById('cart-items');
        if (cartItems) {
            cartItems.innerHTML = this.cart.map(item => `
                <div class="cart-item">
                    <div class="cart-item-image">
                        ${item.product.image ? `<img src="${item.product.image}" alt="${item.product.name}">` : '🚗'}
                    </div>
                    <div class="cart-item-details">
                        <div class="cart-item-name">
                            ${item.product.name}
                        </div>
                        <div class="cart-item-price">
                            ${this.app.formatCurrency(item.price)} each
                        </div>
                    </div>
                    <div class="cart-item-controls">
                        <button class="quantity-btn quantity-decrease" 
                                data-product-id="${item.product.id}">-</button>
                        <span class="quantity-display">${item.quantity}</span>
                        <button class="quantity-btn quantity-increase" 
                                data-product-id="${item.product.id}">+</button>
                        <button class="remove-item" 
                                data-product-id="${item.product.id}"
                                style="margin-left: 10px; color: #DC2626; background: none; border: none; cursor: pointer;">
                            ✗
                        </button>
                    </div>
                    <div class="cart-item-total">
                        ${this.app.formatCurrency(item.total)}
                    </div>
                </div>
            `).join('');
        }
        
        // Update cart summary
        this.updateCartSummary();
        
        // Update cart count in header
        const cartCount = document.getElementById('cart-count');
        if (cartCount) {
            const totalItems = this.cart.reduce((sum, item) => sum + item.quantity, 0);
            cartCount.textContent = totalItems;
            cartCount.style.display = totalItems > 0 ? 'block' : 'none';
        }
    }

    updateCartSummary() {
        const subtotal = this.cart.reduce((sum, item) => sum + item.total, 0);
        const tax = subtotal * 0.17; // 17% GST
        const total = subtotal + tax;
        
        const summaryElement = document.getElementById('cart-summary');
        if (summaryElement) {
            summaryElement.innerHTML = `
                <div class="cart-row">
                    <span>Subtotal:</span>
                    <span>${this.app.formatCurrency(subtotal)}</span>
                </div>
                <div class="cart-row">
                    <span>GST (17%):</span>
                    <span>${this.app.formatCurrency(tax)}</span>
                </div>
                <div class="cart-row total">
                    <span>Total:</span>
                    <span>${this.app.formatCurrency(total)}</span>
                </div>
            `;
        }
        
        // Update process payment button
        const processBtn = document.getElementById('process-payment');
        if (processBtn) {
            processBtn.disabled = this.cart.length === 0;
            processBtn.textContent = `Process Payment (${this.app.formatCurrency(total)})`;
        }
    }

    clearCart() {
        if (this.cart.length === 0) return;
        
        if (confirm('Are you sure you want to clear the cart?')) {
            this.cart = [];
            this.updateCartDisplay();
            this.app.showNotification('Cart cleared', 'info');
        }
    }

    async processPayment() {
        if (this.cart.length === 0) {
            this.app.showNotification('Cart is empty', 'warning');
            return;
        }
        
        this.app.showLoading('Processing payment...');
        
        try {
            // In a real app, this would call the payment processing API
            // For now, simulate API call
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Create sale record
            const saleData = {
                items: this.cart,
                subtotal: this.cart.reduce((sum, item) => sum + item.total, 0),
                tax: 0, // Calculated in backend
                total: this.cart.reduce((sum, item) => sum + item.total, 0) * 1.17,
                customer_id: null,
                payment_method: 'cash',
                cashier_id: this.app.currentUser.id,
            };
            
            // Show payment modal
            this.showPaymentModal(saleData);
            
        } catch (error) {
            console.error('Payment processing error:', error);
            this.app.showNotification('Failed to process payment', 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    showPaymentModal(saleData) {
        const modalHtml = `
            <div class="modal" style="width: 500px;">
                <div class="modal-header">
                    <h3 class="modal-title">Payment</h3>
                    <button class="modal-close" onclick="POS.screens.pos.closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="payment-summary">
                        <h4>Order Summary</h4>
                        <div class="payment-details">
                            <div class="payment-row">
                                <span>Subtotal:</span>
                                <span>${this.app.formatCurrency(saleData.subtotal)}</span>
                            </div>
                            <div class="payment-row">
                                <span>GST (17%):</span>
                                <span>${this.app.formatCurrency(saleData.subtotal * 0.17)}</span>
                            </div>
                            <div class="payment-row total">
                                <span>Total Amount:</span>
                                <span>${this.app.formatCurrency(saleData.total)}</span>
                            </div>
                        </div>
                        
                        <div class="payment-methods">
                            <h4>Select Payment Method</h4>
                            <div class="method-options">
                                <label class="method-option">
                                    <input type="radio" name="payment-method" value="cash" checked>
                                    <span>Cash</span>
                                </label>
                                <label class="method-option">
                                    <input type="radio" name="payment-method" value="card">
                                    <span>Card</span>
                                </label>
                                <label class="method-option">
                                    <input type="radio" name="payment-method" value="credit">
                                    <span>Credit (Udhaar)</span>
                                </label>
                                <label class="method-option">
                                    <input type="radio" name="payment-method" value="mixed">
                                    <span>Mixed Payment</span>
                                </label>
                            </div>
                        </div>
                        
                        <div id="cash-payment" class="payment-section">
                            <h4>Cash Payment</h4>
                            <div class="form-group">
                                <label>Amount Received:</label>
                                <input type="number" id="cash-received" class="input-field" 
                                       value="${saleData.total.toFixed(2)}" 
                                       step="0.01" min="0">
                            </div>
                            <div id="cash-change" class="payment-change">
                                Change: <span id="change-amount">0.00</span>
                            </div>
                        </div>
                        
                        <div id="customer-section" class="payment-section">
                            <h4>Customer Information (Optional)</h4>
                            <div class="form-group">
                                <label>Customer Phone:</label>
                                <input type="text" id="customer-phone" class="input-field" 
                                       placeholder="Enter phone number">
                            </div>
                            <button class="btn btn-secondary btn-small" onclick="POS.screens.pos.searchCustomer()">
                                Search Customer
                            </button>
                        </div>
                    </div>
                    <div id="payment-error" class="text-danger" style="display: none;"></div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="POS.screens.pos.closeModal()">
                        Cancel
                    </button>
                    <button class="btn btn-success" onclick="POS.screens.pos.completePayment()">
                        Complete Sale
                    </button>
                </div>
            </div>
        `;
        
        this.showModal(modalHtml);
        
        // Set up cash payment calculations
        const cashReceivedInput = document.getElementById('cash-received');
        if (cashReceivedInput) {
            cashReceivedInput.addEventListener('input', () => {
                const received = parseFloat(cashReceivedInput.value) || 0;
                const change = received - saleData.total;
                const changeElement = document.getElementById('change-amount');
                if (changeElement) {
                    changeElement.textContent = this.app.formatCurrency(Math.max(0, change));
                }
            });
        }
        
        // Show/hide payment sections based on selected method
        const methodInputs = document.querySelectorAll('input[name="payment-method"]');
        methodInputs.forEach(input => {
            input.addEventListener('change', () => {
                this.updatePaymentSections(input.value);
            });
        });
    }

    updatePaymentSections(method) {
        const cashSection = document.getElementById('cash-payment');
        if (cashSection) {
            cashSection.style.display = method === 'cash' || method === 'mixed' ? 'block' : 'none';
        }
    }

    async completePayment() {
        const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;
        const cashReceived = parseFloat(document.getElementById('cash-received')?.value) || 0;
        const customerPhone = document.getElementById('customer-phone')?.value;
        const errorElement = document.getElementById('payment-error');
        
        // Validation
        if (paymentMethod === 'cash' && cashReceived < this.cart.reduce((sum, item) => sum + item.total, 0) * 1.17) {
            errorElement.textContent = 'Cash received is less than total amount';
            errorElement.style.display = 'block';
            return;
        }
        
        try {
            this.app.showLoading('Completing sale...');
            
            // In a real app, this would call the sales API
            // Create sale record
            const sale = {
                items: this.cart,
                payment_method: paymentMethod,
                cash_received: paymentMethod === 'cash' ? cashReceived : 0,
                customer_phone: customerPhone,
                cashier: this.app.currentUser.full_name,
                timestamp: new Date().toISOString(),
                invoice_number: `INV${Date.now().toString().slice(-6)}`,
            };
            
            // Simulate API delay
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Clear cart
            this.cart = [];
            this.updateCartDisplay();
            
            this.closeModal();
            
            // Show success and print receipt
            this.app.showNotification('Sale completed successfully!', 'success');
            
            // Auto-print receipt if printer is configured
            setTimeout(() => {
                this.printReceipt(sale);
            }, 500);
            
        } catch (error) {
            console.error('Payment completion error:', error);
            errorElement.textContent = `Error: ${error.message}`;
            errorElement.style.display = 'block';
        } finally {
            this.app.hideLoading();
        }
    }

    holdSale() {
        if (this.cart.length === 0) {
            this.app.showNotification('Cart is empty', 'warning');
            return;
        }
        
        const saleName = prompt('Enter name for this hold (optional):');
        if (saleName === null) return; // User cancelled
        
        // In a real app, save to database
        const heldSale = {
            name: saleName || `Hold ${new Date().toLocaleTimeString()}`,
            items: [...this.cart],
            timestamp: new Date().toISOString(),
            cashier: this.app.currentUser.full_name,
        };
        
        // Save to localStorage for demo
        const heldSales = JSON.parse(localStorage.getItem('held_sales') || '[]');
        heldSales.push(heldSale);
        localStorage.setItem('held_sales', JSON.stringify(heldSales));
        
        // Clear cart
        this.cart = [];
        this.updateCartDisplay();
        
        this.app.showNotification(`Sale held as "${heldSale.name}"`, 'success');
    }

    applyDiscount() {
        if (this.cart.length === 0) {
            this.app.showNotification('Cart is empty', 'warning');
            return;
        }
        
        const discountType = prompt('Discount type:\n1. Percentage (e.g., 10%)\n2. Amount (e.g., 100)\n3. Clear discount');
        if (!discountType) return;
        
        let discountValue;
        
        switch(discountType) {
            case '1':
                const percent = parseFloat(prompt('Enter percentage discount:'));
                if (isNaN(percent) || percent < 0 || percent > 100) {
                    this.app.showNotification('Invalid percentage', 'error');
                    return;
                }
                discountValue = percent;
                break;
                
            case '2':
                const amount = parseFloat(prompt('Enter discount amount:'));
                if (isNaN(amount) || amount < 0) {
                    this.app.showNotification('Invalid amount', 'error');
                    return;
                }
                discountValue = amount;
                break;
                
            case '3':
                // Clear discounts
                this.cart.forEach(item => item.discount = 0);
                this.updateCartDisplay();
                this.app.showNotification('Discounts cleared', 'info');
                return;
                
            default:
                this.app.showNotification('Invalid option', 'error');
                return;
        }
        
        // Apply discount to selected item or all items
        const applyTo = prompt('Apply to:\n1. All items\n2. Selected item');
        
        if (applyTo === '1') {
            this.cart.forEach(item => {
                if (discountType === '1') {
                    item.discount = (item.price * discountValue / 100) * item.quantity;
                } else {
                    item.discount = discountValue / this.cart.length;
                }
                item.total = (item.price * item.quantity) - item.discount;
            });
        } else if (applyTo === '2' && this.selectedProduct) {
            const item = this.cart.find(item => item.product.id === this.selectedProduct.id);
            if (item) {
                if (discountType === '1') {
                    item.discount = (item.price * discountValue / 100) * item.quantity;
                } else {
                    item.discount = discountValue;
                }
                item.total = (item.price * item.quantity) - item.discount;
            }
        }
        
        this.updateCartDisplay();
        this.app.showNotification('Discount applied', 'success');
    }

    async printReceipt(sale = null) {
        if (!sale && this.cart.length === 0) {
            this.app.showNotification('Nothing to print', 'warning');
            return;
        }
        
        try {
            // In a real app, this would send print command to receipt printer
            // For now, show print dialog with receipt HTML
            
            const receiptHtml = this.generateReceiptHtml(sale);
            const printWindow = window.open('', '_blank');
            printWindow.document.write(receiptHtml);
            printWindow.document.close();
            printWindow.focus();
            
            // Auto-print after a delay
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 500);
            
            this.app.showNotification('Receipt sent to printer', 'success');
            
        } catch (error) {
            console.error('Print error:', error);
            this.app.showNotification('Failed to print receipt', 'error');
        }
    }

    generateReceiptHtml(sale) {
        if (!sale) {
            // Generate from current cart
            sale = {
                invoice_number: `INV${Date.now().toString().slice(-6)}`,
                items: this.cart,
                subtotal: this.cart.reduce((sum, item) => sum + item.total, 0),
                tax: this.cart.reduce((sum, item) => sum + item.total, 0) * 0.17,
                total: this.cart.reduce((sum, item) => sum + item.total, 0) * 1.17,
                cashier: this.app.currentUser.full_name,
                timestamp: new Date().toISOString(),
            };
        }
        
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Receipt</title>
                <style>
                    body { font-family: monospace; font-size: 12px; margin: 0; padding: 10px; }
                    .receipt { width: 280px; margin: 0 auto; }
                    .header { text-align: center; margin-bottom: 10px; }
                    .shop-name { font-weight: bold; font-size: 16px; }
                    .shop-address { font-size: 10px; margin-bottom: 5px; }
                    .divider { border-top: 1px dashed #000; margin: 10px 0; }
                    .item-row { display: flex; justify-content: space-between; margin: 3px 0; }
                    .item-name { flex: 2; }
                    .item-qty { text-align: center; flex: 1; }
                    .item-price { text-align: right; flex: 1; }
                    .total-row { font-weight: bold; border-top: 2px solid #000; padding-top: 5px; }
                    .footer { text-align: center; margin-top: 20px; font-size: 10px; }
                </style>
            </head>
            <body>
                <div class="receipt">
                    <div class="header">
                        <div class="shop-name">Auto Accessories Shop</div>
                        <div class="shop-address">Main Market, Lahore</div>
                        <div>Phone: +92 300 1234567</div>
                    </div>
                    
                    <div class="divider"></div>
                    
                    <div>
                        <div>Invoice: ${sale.invoice_number}</div>
                        <div>Date: ${new Date(sale.timestamp).toLocaleString()}</div>
                        <div>Cashier: ${sale.cashier}</div>
                    </div>
                    
                    <div class="divider"></div>
                    
                    <div>
                        ${sale.items.map(item => `
                            <div class="item-row">
                                <div class="item-name">${item.product.name.substring(0, 20)}</div>
                                <div class="item-qty">${item.quantity} × ${item.price.toFixed(2)}</div>
                                <div class="item-price">${(item.total).toFixed(2)}</div>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div class="divider"></div>
                    
                    <div>
                        <div class="item-row">
                            <div>Subtotal:</div>
                            <div>${sale.subtotal.toFixed(2)}</div>
                        </div>
                        <div class="item-row">
                            <div>GST (17%):</div>
                            <div>${sale.tax.toFixed(2)}</div>
                        </div>
                        <div class="item-row total-row">
                            <div>TOTAL:</div>
                            <div>${sale.total.toFixed(2)}</div>
                        </div>
                    </div>
                    
                    <div class="divider"></div>
                    
                    <div class="footer">
                        <div>Thank you for your business!</div>
                        <div>Returns within 7 days with receipt</div>
                        <div>*** RECEIPT ***</div>
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    searchCustomer() {
        const phone = document.getElementById('customer-phone')?.value;
        if (!phone) {
            this.app.showNotification('Please enter phone number', 'warning');
            return;
        }
        
        // In a real app, search customer by phone via API
        // For demo, show mock customer
        const customer = {
            name: 'John Doe',
            phone: phone,
            credit_limit: 50000,
            current_balance: 15000,
            customer_type: 'retail',
        };
        
        if (customer) {
            const useCustomer = confirm(`Customer found: ${customer.name}\nCredit Limit: ${this.app.formatCurrency(customer.credit_limit)}\nCurrent Balance: ${this.app.formatCurrency(customer.current_balance)}\n\nUse this customer?`);
            if (useCustomer) {
                this.app.showNotification(`Customer selected: ${customer.name}`, 'success');
            }
        } else {
            const createNew = confirm(`Customer not found. Create new customer with phone ${phone}?`);
            if (createNew) {
                // In real app, open customer creation form
                this.app.showNotification('Customer creation would open here', 'info');
            }
        }
    }

    addSelectedProduct() {
        if (this.selectedProduct) {
            this.addProductToCart(this.selectedProduct);
        }
    }

    closeAllModals() {
        this.closeModal();
        this.closeScanner();
    }

    showModal(html) {
        const modalContainer = document.getElementById('modal-container');
        if (modalContainer) {
            modalContainer.innerHTML = `<div class="modal-overlay">${html}</div>`;
        }
    }

    closeModal() {
        const modalContainer = document.getElementById('modal-container');
        if (modalContainer) {
            modalContainer.innerHTML = '';
        }
    }

    playAddToCartSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 523.25; // C5 note
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.1);
        } catch (error) {
            // Sound is optional
        }
    }
}

// Register screen with main app
if (window.POS) {
    window.POS.screens.pos = PosScreen;
}