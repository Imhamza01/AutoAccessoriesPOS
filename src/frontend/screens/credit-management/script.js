class CreditManagementScreen {
    constructor(app) {
        this.app = app;
        this.api = app.api;
        this.creditSales = [];
        this.creditCustomers = [];
        this.creditPayments = [];
        this.currentTab = 'credit-sales';
        this.filters = {
            customer_id: null,
            status: null,
            date_from: null,
            date_to: null
        };
    }

    init() {
        console.log('[CreditManagement] Initializing Credit Management Screen');
        // Initialize on-screen debug panel for easier troubleshooting
        try {
            this._initDebugPanel();
        } catch (e) {
            console.warn('[CreditManagement] Failed to init debug panel', e);
        }

        // Mirror console logs into the debug panel for visibility
        try {
            const origLog = console.log.bind(console);
            const origError = console.error.bind(console);
            console.log = (...args) => {
                try { this._debugWrite(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')); } catch (e) {}
                origLog(...args);
            };
            console.error = (...args) => {
                try { this._debugWrite(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '), true); } catch (e) {}
                origError(...args);
            };
        } catch (e) {
            // ignore
        }

        try {
            this.setupEventListeners();
            this.loadInitialData();
        } catch (e) {
            console.error('[CreditManagement] Error initializing:', e);
        }
    }

    _initDebugPanel() {
        // Create a small collapsible debug panel inside the credit management screen
        const container = document.querySelector('#credit-management-screen') || document.querySelector('.credit-management-screen');
        if (!container) return;
        let panel = container.querySelector('#cm-debug');
        if (panel) return;
        panel = document.createElement('div');
        panel.id = 'cm-debug';
        panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;max-width:420px;max-height:300px;overflow:auto;background:rgba(0,0,0,0.75);color:#fff;padding:8px;border-radius:6px;font-size:12px;box-shadow:0 2px 10px rgba(0,0,0,0.2);';
        const header = document.createElement('div');
        header.style.cssText = 'font-weight:bold;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center';
        header.innerHTML = '<span>CreditMgmt Debug</span>';
        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'Clear';
        clearBtn.style.cssText = 'background:#eee;color:#000;border:none;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:11px';
        clearBtn.addEventListener('click', () => { body.innerHTML = ''; });
        header.appendChild(clearBtn);
        const body = document.createElement('div');
        body.id = 'cm-debug-body';
        body.style.cssText = 'max-height:240px;overflow:auto;white-space:pre-wrap';
        panel.appendChild(header);
        panel.appendChild(body);
        document.body.appendChild(panel);
        this._debugBody = body;
    }

    _debugWrite(text, isError = false) {
        try {
            if (!this._debugBody) return;
            const el = document.createElement('div');
            el.textContent = `${new Date().toLocaleTimeString()} - ${text}`;
            el.style.cssText = isError ? 'color:#ff8888;margin-bottom:6px' : 'color:#ccc;margin-bottom:6px';
            this._debugBody.appendChild(el);
            // keep scroll at bottom
            this._debugBody.scrollTop = this._debugBody.scrollHeight;
        } catch (e) {}
    }

    setupEventListeners() {
        // Tab switching
        const tabButtons = document.querySelectorAll('.tab-btn');
        console.log('[CreditManagement] Attaching tab listeners to', tabButtons.length, 'buttons');
        tabButtons.forEach(btn => {
            const tabName = btn.dataset.tab;
            btn.addEventListener('click', (e) => {
                try {
                    if (!tabName) {
                        console.warn('[CreditManagement] Tab button missing data-tab attribute');
                        return;
                    }
                    this.switchTab(tabName);
                } catch (err) {
                    console.error('[CreditManagement] Error handling tab click', err);
                }
            });
        });

        // Filter events (guard elements exist)
        const customerFilterEl = document.getElementById('customer-filter');
        if (customerFilterEl) {
            customerFilterEl.addEventListener('change', (e) => {
                this.filters.customer_id = e.target.value || null;
                this.loadDataByTab();
            });
        }

        const statusFilterEl = document.getElementById('status-filter');
        if (statusFilterEl) {
            statusFilterEl.addEventListener('change', (e) => {
                this.filters.status = e.target.value || null;
                this.loadDataByTab();
            });
        }

        const dateFromEl = document.getElementById('date-from');
        if (dateFromEl) {
            dateFromEl.addEventListener('change', (e) => {
                this.filters.date_from = e.target.value || null;
                this.loadDataByTab();
            });
        }

        const dateToEl = document.getElementById('date-to');
        if (dateToEl) {
            dateToEl.addEventListener('change', (e) => {
                this.filters.date_to = e.target.value || null;
                this.loadDataByTab();
            });
        }

        const applyFiltersBtn = document.getElementById('apply-filters');
        if (applyFiltersBtn) applyFiltersBtn.addEventListener('click', () => this.loadDataByTab());

        const resetFiltersBtn = document.getElementById('reset-filters');
        if (resetFiltersBtn) resetFiltersBtn.addEventListener('click', () => this.resetFilters());

        const refreshBtnEl = document.getElementById('refresh-btn');
        if (refreshBtnEl) refreshBtnEl.addEventListener('click', () => this.loadInitialData());

        // Reconcile button
        const reconcileBtn = document.getElementById('reconcile-btn');
        if (reconcileBtn) {
            reconcileBtn.addEventListener('click', async () => {
                if (!confirm('Recalculate and fix all customers\' balances from sales?')) return;
                try {
                    this.app.showLoading('Reconciling customer balances...');
                    const resp = await this.api.post('/customer-payments/reconcile/customers', {});
                    if (resp && resp.success) {
                        this.app.showNotification(`Reconciled ${resp.updated} customers`, 'success');
                        await this.loadInitialData();
                    } else {
                        this.app.showNotification('Reconciliation failed', 'error');
                    }
                } catch (e) {
                    console.error('Reconcile error:', e);
                    this.app.showNotification('Reconciliation failed: ' + (e.message || e), 'error');
                } finally {
                    this.app.hideLoading();
                }
            });
        }

        // Use delegated click handling on the screen container for action buttons
        const screenContainer = document.querySelector('.credit-management-screen');
        if (screenContainer) {
            screenContainer.addEventListener('click', (e) => {
                try {
                    const actionBtn = e.target.closest('button[data-action]');
                    if (actionBtn) {
                        const action = actionBtn.dataset.action;
                        const saleId = actionBtn.dataset.saleId;
                        if (action === 'process') {
                            return this.showProcessPaymentModal();
                        }
                        if (action === 'pay' && saleId) {
                            return this.processPaymentForSale(saleId);
                        }
                        if (action === 'view' && saleId) {
                            return this.viewSaleDetails(saleId);
                        }
                    }

                    // Also support legacy id-based button for direct Process Payment
                    const proc = e.target.closest('#process-payment-btn');
                    if (proc) {
                        return this.showProcessPaymentModal();
                    }
                } catch (err) {
                    console.error('[CreditManagement] Delegated click handler error:', err);
                }
            });
            console.log('[CreditManagement] Delegated click handler attached to screen container');
        } else {
            console.warn('[CreditManagement] credit-management screen container NOT found for delegation');
        }

        // History customer selector
        const historySelect = document.getElementById('history-customer-select');
        if (historySelect) {
            historySelect.addEventListener('change', (e) => {
                const customerId = e.target.value;
                if (customerId) {
                    this.loadCustomerHistory(customerId);
                }
            });
        } else {
            console.warn('[CreditManagement] history-customer-select NOT found in DOM');
        }
    }

    async loadInitialData() {
        try {
            // Load dashboard stats
            await this.loadDashboardStats();

            // Load customers for filters
            await this.loadCustomersForFilter();

            // Load initial data based on current tab
            await this.loadDataByTab();
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.app.showNotification('Error loading credit management data', 'error');
        }
    }

    async loadDashboardStats() {
        try {
            console.log('[CreditManagement] Requesting dashboard stats');
            const response = await this.api.get('/credit-management/credit-dashboard-stats');
            console.log('[CreditManagement] dashboard stats response:', response);
            
            if (response && response.success && response.stats) {
                document.getElementById('total-outstanding').textContent = this.app.formatCurrency(response.stats.total_outstanding_credit);
                document.getElementById('todays-credit').textContent = this.app.formatCurrency(response.stats.todays_pending_credit);
                document.getElementById('pending-sales').textContent = response.stats.total_pending_sales;
                document.getElementById('customers-credit').textContent = response.stats.customers_with_credit;
            }
        } catch (error) {
            console.error('Error loading dashboard stats:', error);
        }
    }

    async loadCustomersForFilter() {
        try {
            console.log('[CreditManagement] Requesting customers-with-credit for filters');
            const response = await this.api.get('/credit-management/customers-with-credit');
            console.log('[CreditManagement] customers-with-credit response:', response);
            
            if (response && response.success) {
                const customerFilter = document.getElementById('customer-filter');
                const historyCustomerSelect = document.getElementById('history-customer-select');

                // Cache customers for use by other actions
                this.creditCustomers = response.customers || [];

                // Clear existing options except the first one
                if (customerFilter) customerFilter.innerHTML = '<option value="">All Customers</option>';
                if (historyCustomerSelect) historyCustomerSelect.innerHTML = '<option value="">Select Customer</option>';

                response.customers.forEach(customer => {
                    const option = document.createElement('option');
                    option.value = customer.id;
                    option.textContent = `${customer.full_name} (${customer.phone || 'No Phone'})`;

                    if (customerFilter) customerFilter.appendChild(option.cloneNode(true));
                    if (historyCustomerSelect) historyCustomerSelect.appendChild(option.cloneNode(true));
                });

                // Also fetch ALL customers to populate history dropdown (even those without pending credit)
                try {
                    const allResp = await this.api.get('/customers?limit=1000');
                    if (allResp && Array.isArray(allResp)) {
                        // API may return array or object with customers
                        const allCustomers = allResp; // array
                        allCustomers.forEach(c => {
                            // avoid duplicates
                            if (!Array.from(historyCustomerSelect.options).some(o => o.value == c.id)) {
                                const opt = document.createElement('option');
                                opt.value = c.id;
                                opt.textContent = `${c.full_name || c.name || 'Customer'} (${c.phone || 'No Phone'})`;
                                historyCustomerSelect.appendChild(opt);
                            }
                        });
                    } else if (allResp && allResp.customers && Array.isArray(allResp.customers)) {
                        allResp.customers.forEach(c => {
                            if (!Array.from(historyCustomerSelect.options).some(o => o.value == c.id)) {
                                const opt = document.createElement('option');
                                opt.value = c.id;
                                opt.textContent = `${c.full_name || c.name || 'Customer'} (${c.phone || 'No Phone'})`;
                                historyCustomerSelect.appendChild(opt);
                            }
                        });
                    }
                } catch (e) {
                    console.warn('[CreditManagement] Failed to load all customers for history dropdown', e);
                }
            }
        } catch (error) {
            console.error('Error loading customers for filter:', error);
        }
    }

    async loadDataByTab() {
        switch (this.currentTab) {
            case 'credit-sales':
                await this.loadCreditSales();
                break;
            case 'credit-customers':
                await this.loadCreditCustomers();
                break;
            case 'credit-payments':
                await this.loadCreditPayments();
                break;
            case 'credit-history':
                // History tab doesn't load data initially, waits for customer selection
                break;
        }
    }

    async loadCreditSales() {
        try {
            const params = new URLSearchParams();
            if (this.filters.customer_id) params.append('customer_id', this.filters.customer_id);
            if (this.filters.status) params.append('status', this.filters.status);
            if (this.filters.date_from) params.append('start_date', this.filters.date_from);
            if (this.filters.date_to) params.append('end_date', this.filters.date_to);

            let url = '/credit-management/credit-sales';
            if (params.toString()) {
                url += '?' + params.toString();
            }

            console.log('[CreditManagement] Requesting credit-sales URL:', url);
            const response = await this.api.get(url);
            console.log('[CreditManagement] credit-sales response:', response);
            
            if (response && response.success) {
                this.creditSales = response.credit_sales;
                this.renderCreditSalesTable();
            }
        } catch (error) {
            console.error('Error loading credit sales:', error);
            this.app.showNotification('Error loading credit sales', 'error');
        }
    }

    renderCreditSalesTable() {
        console.log('[CreditManagement] renderCreditSalesTable called. creditSales length=', Array.isArray(this.creditSales) ? this.creditSales.length : typeof this.creditSales);
        const tbody = document.getElementById('credit-sales-table');
        if (!tbody) return;

        // Clear existing rows
        tbody.innerHTML = '';

        if (!Array.isArray(this.creditSales) || this.creditSales.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td colspan="7" class="empty-cell">
                    <div class="empty-icon">📋</div>
                    <div>No credit sales found</div>
                </td>
            `;
            tbody.appendChild(tr);
            return;
        }

        // Filter out sales without an associated customer (walk-in) from credit management
        this.creditSales.filter(sale => sale.customer_id).forEach(sale => {
            const tr = document.createElement('tr');

            const invoiceTd = document.createElement('td');
            invoiceTd.textContent = sale.invoice_number || 'N/A';

            const dateTd = document.createElement('td');
            dateTd.textContent = this.formatDate(sale.created_at);

            const customerTd = document.createElement('td');
            customerTd.textContent = sale.customer_name || 'Walk-in';

            const totalTd = document.createElement('td');
            totalTd.textContent = this.app.formatCurrency(sale.grand_total || 0);

            const balanceTd = document.createElement('td');
            balanceTd.textContent = this.app.formatCurrency(sale.balance_due || 0);

            const statusTd = document.createElement('td');
            const badge = document.createElement('span');
            badge.className = `badge badge-${this.getStatusColor(sale.payment_status)}`;
            badge.textContent = sale.payment_status || '';
            statusTd.appendChild(badge);

            const actionsTd = document.createElement('td');

            const payBtn = document.createElement('button');
            payBtn.className = 'btn btn-small btn-success';
            payBtn.textContent = 'Pay';
            payBtn.setAttribute('data-action', 'pay');
            payBtn.setAttribute('data-sale-id', sale.id);

            const viewBtn = document.createElement('button');
            viewBtn.className = 'btn btn-small btn-info';
            viewBtn.textContent = 'View';
            viewBtn.setAttribute('data-action', 'view');
            viewBtn.setAttribute('data-sale-id', sale.id);

            actionsTd.appendChild(payBtn);
            actionsTd.appendChild(document.createTextNode(' '));
            actionsTd.appendChild(viewBtn);

            tr.appendChild(invoiceTd);
            tr.appendChild(dateTd);
            tr.appendChild(customerTd);
            tr.appendChild(totalTd);
            tr.appendChild(balanceTd);
            tr.appendChild(statusTd);
            tr.appendChild(actionsTd);

            tbody.appendChild(tr);
        });
    }

    async loadCreditCustomers() {
        try {
            console.log('[CreditManagement] Requesting customers-with-credit (credit-customers tab)');
            const response = await this.api.get('/credit-management/customers-with-credit');
            console.log('[CreditManagement] credit-customers response:', response);
            
            if (response && response.success) {
                this.creditCustomers = response.customers;
                this.renderCreditCustomersTable();
            }
        } catch (error) {
            console.error('Error loading credit customers:', error);
            this.app.showNotification('Error loading credit customers', 'error');
        }
    }

    renderCreditCustomersTable() {
        console.log('[CreditManagement] renderCreditCustomersTable called. creditCustomers length=', Array.isArray(this.creditCustomers) ? this.creditCustomers.length : typeof this.creditCustomers);
        const tbody = document.getElementById('credit-customers-table');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (!Array.isArray(this.creditCustomers) || this.creditCustomers.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td colspan="7" class="empty-cell">
                    <div class="empty-icon">👥</div>
                    <div>No customers with credit found</div>
                </td>
            `;
            tbody.appendChild(tr);
            return;
        }

        this.creditCustomers.forEach(customer => {
            const tr = document.createElement('tr');

            const nameTd = document.createElement('td'); nameTd.textContent = customer.full_name || 'N/A';
            const phoneTd = document.createElement('td'); phoneTd.textContent = customer.phone || 'N/A';
            const emailTd = document.createElement('td'); emailTd.textContent = customer.email || 'N/A';
            const balanceTd = document.createElement('td'); balanceTd.textContent = this.app.formatCurrency(customer.current_balance || 0);
            const limitTd = document.createElement('td'); limitTd.textContent = this.app.formatCurrency(customer.credit_limit || 0);
            const pendingTd = document.createElement('td'); pendingTd.textContent = customer.pending_sales_count || 0;

            const actionsTd = document.createElement('td');
            const payBtn = document.createElement('button');
            payBtn.className = 'btn btn-small btn-success';
            payBtn.textContent = 'Pay';
            payBtn.addEventListener('click', () => {
                try {
                    this.processGeneralPayment(customer.id);
                } catch (err) {
                    console.error('Customer Pay button error:', err);
                }
            });

            const histBtn = document.createElement('button');
            histBtn.className = 'btn btn-small btn-info';
            histBtn.textContent = 'History';
            histBtn.addEventListener('click', () => {
                try {
                    this.viewCustomerCreditHistory(customer.id);
                } catch (err) {
                    console.error('History button error:', err);
                }
            });

            actionsTd.appendChild(payBtn);
            actionsTd.appendChild(document.createTextNode(' '));
            actionsTd.appendChild(histBtn);

            tr.appendChild(nameTd);
            tr.appendChild(phoneTd);
            tr.appendChild(emailTd);
            tr.appendChild(balanceTd);
            tr.appendChild(limitTd);
            tr.appendChild(pendingTd);
            tr.appendChild(actionsTd);

            tbody.appendChild(tr);
        });
    }

    async loadCreditPayments() {
        try {
            const params = new URLSearchParams();
            if (this.filters.customer_id) params.append('customer_id', this.filters.customer_id);
            if (this.filters.date_from) params.append('start_date', this.filters.date_from);
            if (this.filters.date_to) params.append('end_date', this.filters.date_to);

            let url = '/credit-management/credit-payments';
            if (params.toString()) {
                url += '?' + params.toString();
            }

            console.log('[CreditManagement] Requesting credit-payments URL:', url);
            const response = await this.api.get(url);
            console.log('[CreditManagement] credit-payments response:', response);
            
            if (response && response.success) {
                this.creditPayments = response.payments;
                this.renderCreditPaymentsTable();
            }
        } catch (error) {
            console.error('Error loading credit payments:', error);
            this.app.showNotification('Error loading credit payments', 'error');
        }
    }

    async loadCustomerPayments() {
        // Load payments from customer payments endpoint
        try {
            const response = await this.api.get('/reports/pending-credit'); // Using pending-credit for now
            
            // For now, we'll use a general payment history endpoint
            this.renderCreditPaymentsTable();
        } catch (error) {
            console.error('Error loading customer payments:', error);
        }
    }

    renderCreditPaymentsTable() {
        const tbody = document.getElementById('credit-payments-table');
        if (!tbody) return;

        if (!Array.isArray(this.creditPayments) || this.creditPayments.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-cell">
                        <div class="empty-icon">💰</div>
                        <div>Payment history coming soon</div>
                        <small>Use customer history tab to view payment details</small>
                    </td>
                </tr>
            `;
            return;
        }

        // Render payments
        tbody.innerHTML = '';
        this.creditPayments.forEach(p => {
            const tr = document.createElement('tr');

            const dateTd = document.createElement('td');
            dateTd.textContent = p.payment_date || p.created_at || '';

            const customerTd = document.createElement('td');
            customerTd.textContent = p.customer_name || (p.customer_id ? `#${p.customer_id}` : 'Walk-in');

            const amountTd = document.createElement('td');
            amountTd.textContent = this.app.formatCurrency(p.amount || 0);

            const methodTd = document.createElement('td');
            methodTd.textContent = p.payment_method || '';

            const typeTd = document.createElement('td');
            typeTd.textContent = p.payment_type || '';

            const receivedTd = document.createElement('td');
            receivedTd.textContent = p.received_by_name || '';

            const notesTd = document.createElement('td');
            notesTd.textContent = p.notes || '';

            tr.appendChild(dateTd);
            tr.appendChild(customerTd);
            tr.appendChild(amountTd);
            tr.appendChild(methodTd);
            tr.appendChild(typeTd);
            tr.appendChild(receivedTd);
            tr.appendChild(notesTd);

            tbody.appendChild(tr);
        });
    }

    switchTab(tabName) {
        // Update active tab button
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Show active tab pane
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.toggle('active', pane.id === tabName + '-tab');
        });

        this.currentTab = tabName;
        this.loadDataByTab();
    }

    resetFilters() {
        this.filters = {
            customer_id: null,
            status: null,
            date_from: null,
            date_to: null
        };

        document.getElementById('customer-filter').value = '';
        document.getElementById('status-filter').value = '';
        document.getElementById('date-from').value = '';
        document.getElementById('date-to').value = '';

        this.loadDataByTab();
    }

    formatDate(dateStr) {
        if (!dateStr) return 'N/A';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US');
        } catch {
            return dateStr;
        }
    }

    getStatusColor(status) {
        switch (status) {
            case 'paid': return 'success';
            case 'pending': return 'warning';
            case 'partial': return 'info';
            case 'cancelled': return 'danger';
            default: return 'secondary';
        }
    }

    showProcessPaymentModal() {
        // Show modal for processing general payment
        // If only one credit customer exists, open that customer's general payment modal.
        if (Array.isArray(this.creditCustomers) && this.creditCustomers.length === 1) {
            this.showGeneralPaymentModal(this.creditCustomers[0]);
            return;
        }

        // Otherwise show a simple modal that lets user pick a customer and enter amount
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'process-payment-modal';

        const optionsHtml = (Array.isArray(this.creditCustomers) && this.creditCustomers.length > 0)
            ? this.creditCustomers.map(c => `<option value="${c.id}">${c.full_name} (${this.app.formatCurrency(c.current_balance || 0)})</option>`).join('')
            : '<option value="">No customers</option>';

        modal.innerHTML = `
            <div class="modal" style="max-width:500px;">
                <div class="modal-header">
                    <h3>Process Payment</h3>
                    <button class="modal-close-btn" onclick="document.getElementById('process-payment-modal').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="general-payment-customer">Customer</label>
                        <select id="general-payment-customer" class="input-field">
                            <option value="">Select customer</option>
                            ${optionsHtml}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="general-payment-amount">Amount</label>
                        <input type="number" id="general-payment-amount" class="input-field" step="0.01" min="0" placeholder="Enter amount">
                    </div>
                    <div class="form-group">
                        <label for="general-payment-method">Method</label>
                        <select id="general-payment-method" class="input-field">
                            <option value="cash">Cash</option>
                            <option value="card">Card</option>
                            <option value="bank_transfer">Bank Transfer</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="general-payment-notes">Notes</label>
                        <textarea id="general-payment-notes" class="input-field" rows="3"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="document.getElementById('process-payment-modal').remove()">Cancel</button>
                    <button class="btn btn-success" id="submit-general-payment-btn">Process Payment</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        // Ensure modal is visible using the app's modal styles
        modal.style.display = 'flex';

        document.getElementById('submit-general-payment-btn').addEventListener('click', async () => {
            const customerId = document.getElementById('general-payment-customer').value;
            const amount = parseFloat(document.getElementById('general-payment-amount').value);
            const method = document.getElementById('general-payment-method').value;
            const notes = document.getElementById('general-payment-notes').value;

            if (!customerId) {
                this.app.showNotification('Please select a customer', 'error');
                return;
            }
            if (!amount || amount <= 0) {
                this.app.showNotification('Please enter a valid amount', 'error');
                return;
            }

            try {
                this.app.showLoading('Processing payment...');
                const payload = { customer_id: parseInt(customerId), amount: amount, payment_method: method, notes };
                const resp = await this.api.post('/credit-management/process-credit-payment', payload);
                if (resp && resp.success) {
                    this.app.showNotification('Payment processed successfully', 'success');
                    document.getElementById('process-payment-modal').remove();
                    await this.loadInitialData();
                } else {
                    this.app.showNotification((resp && (resp.error || resp.message)) || 'Failed to process payment', 'error');
                }
            } catch (e) {
                console.error('General payment error:', e);
                this.app.showNotification('Error processing payment', 'error');
            } finally {
                this.app.hideLoading();
            }
        });
    }

    async processPaymentForSale(saleId) {
        try {
            // Coerce saleId to number and find the sale in our data
            const id = Number(saleId);
            const sale = this.creditSales.find(s => s.id === id);
            if (!sale) {
                this.app.showNotification('Sale not found', 'error');
                return;
            }

            // Show payment modal for this specific sale
            this.showPaymentModalForSale(sale);
        } catch (error) {
            console.error('Error processing payment for sale:', error);
            this.app.showNotification('Error processing payment', 'error');
        }
    }

    async processGeneralPayment(customerId) {
        try {
            // Find customer in our data
            const customer = this.creditCustomers.find(c => c.id === customerId);
            if (!customer) {
                this.app.showNotification('Customer not found', 'error');
                return;
            }

            // Show general payment modal
            this.showGeneralPaymentModal(customer);
        } catch (error) {
            console.error('Error processing general payment:', error);
            this.app.showNotification('Error processing payment', 'error');
        }
    }

    showPaymentModalForSale(sale) {
        // Create payment modal for specific sale
        const modal = this.createPaymentModal({
            title: `Pay for Invoice #${sale.invoice_number}`,
            customerName: sale.customer_name || 'Walk-in Customer',
            currentBalance: (sale.balance_due && Number(sale.balance_due)) ? Number(sale.balance_due) : Number(sale.grand_total || 0),
            saleId: sale.id,
            customerId: sale.customer_id,
            isSpecificSale: true
        });
        
        document.body.appendChild(modal);
    }

    showGeneralPaymentModal(customer) {
        // Create payment modal for general payment
        const modal = this.createPaymentModal({
            title: `General Payment for ${customer.full_name}`,
            customerName: customer.full_name,
            currentBalance: customer.current_balance,
            customerId: customer.id,
            isSpecificSale: false
        });
        
        document.body.appendChild(modal);
    }

    createPaymentModal(options) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'payment-modal';
        modal.innerHTML = `
            <div class="modal" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>${options.title}</h3>
                    <button class="modal-close-btn" onclick="document.getElementById('payment-modal').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Customer: ${options.customerName}</label>
                    </div>
                    <div class="form-group">
                        <label>Current Balance: ${this.app.formatCurrency(options.currentBalance)}</label>
                    </div>
                    <div class="form-group">
                        <label for="payment-amount">Payment Amount:</label>
                        <input type="number" id="payment-amount" class="input-field" 
                               placeholder="Enter payment amount" step="0.01" min="0" 
                               value="${options.currentBalance}" max="${options.currentBalance}">
                    </div>
                    <div class="form-group">
                        <label for="payment-method">Payment Method:</label>
                        <select id="payment-method" class="input-field">
                            <option value="cash">Cash</option>
                            <option value="card">Card</option>
                            <option value="bank_transfer">Bank Transfer</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="payment-notes">Notes:</label>
                        <textarea id="payment-notes" class="input-field" 
                                  placeholder="Enter payment notes" rows="3"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="document.getElementById('payment-modal').remove()">
                        Cancel
                    </button>
                    <button class="btn btn-success" onclick="window.app.screens.creditManagement.submitPayment()">
                        Process Payment
                    </button>
                </div>
            </div>
        `;
        
        // Store options for later use
        modal.dataset.options = JSON.stringify(options);
        // Make modal visible using the shared modal CSS
        modal.style.display = 'flex';

        // Disable processing if sale has no associated customer (walk-in)
        try {
            const footerBtn = modal.querySelector('.modal-footer .btn-success');
            if (footerBtn) {
                if (!options.customerId) {
                    footerBtn.disabled = true;
                    footerBtn.title = 'Cannot process credit payment for sale without assigned customer';
                    const noteEl = modal.querySelector('.modal-body');
                    if (noteEl) {
                        const warn = document.createElement('div');
                        warn.style.cssText = 'color:#b33;margin-top:8px;font-weight:600';
                        warn.textContent = 'This sale does not have a customer assigned. Assign a customer to process a credit payment.';
                        noteEl.appendChild(warn);
                    }
                }
            }
        } catch (e) {}

        return modal;
    }

    async submitPayment() {
        try {
            const modal = document.getElementById('payment-modal');
            const options = JSON.parse(modal.dataset.options);
            
            const amount = parseFloat(document.getElementById('payment-amount').value);
            const method = document.getElementById('payment-method').value;
            const notes = document.getElementById('payment-notes').value;

            if (!amount || amount <= 0 || amount > options.currentBalance) {
                this.app.showNotification('Please enter a valid payment amount', 'error');
                return;
            }

            // Ensure sale has customer for credit processing
            if (!options.customerId) {
                this.app.showNotification('Cannot process credit payment: sale has no assigned customer. Assign a customer first.', 'error');
                return;
            }

            this.app.showLoading('Processing payment...');

            // Prepare payment data
            const paymentData = {
                customer_id: options.customerId,
                amount: amount,
                payment_method: method,
                notes: notes || `Payment for ${options.isSpecificSale ? `sale #${options.saleId}` : 'account'}`
            };

            // If it's for a specific sale, add the sale_id
            if (options.isSpecificSale) {
                paymentData.sale_ids = [options.saleId];
            }

            console.log('[CreditManagement] Submitting payment:', paymentData);
            const response = await this.api.post('/credit-management/process-credit-payment', paymentData);
            console.log('[CreditManagement] process-credit-payment response:', response);

            if (response && response.success) {
                this.app.showNotification('Payment processed successfully', 'success');
                modal.remove();
                // Refresh data
                await this.loadInitialData();
            } else {
                const msg = (response && (response.error || response.message)) || 'Failed to process payment';
                throw new Error(msg);
            }
        } catch (error) {
            console.error('Error submitting payment:', error);
            this.app.showNotification(error.message || 'Error processing payment', 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    viewSaleDetails(saleId) {
        (async () => {
            try {
                const id = Number(saleId);

                // Try find in local creditSales first
                let sale = this.creditSales.find(s => s.id === id);

                // If not found or missing details, fetch from API
                if (!sale || !sale.items) {
                    try {
                        const resp = await this.api.get(`/sales/${id}`);
                        // API might return { sale: {...} } or direct object
                        sale = resp && (resp.sale || resp) || sale;
                    } catch (e) {
                        console.error('[CreditManagement] Error fetching sale details:', e);
                    }
                }

                if (!sale) {
                    this.app.showNotification('Sale details not found', 'error');
                    return;
                }

                // If sales screen has a displaySaleDetailsModal, reuse it
                try {
                    if (window.app && window.app.screens && window.app.screens.sales && typeof window.app.screens.sales.displaySaleDetailsModal === 'function') {
                        return window.app.screens.sales.displaySaleDetailsModal(sale);
                    }
                } catch (e) {
                    console.warn('[CreditManagement] Unable to reuse sales screen modal:', e);
                }

                // Fallback: use generic sale-details-modal if available
                const titleEl = document.getElementById('sale-invoice-title');
                const contentEl = document.getElementById('sale-details-content');
                if (titleEl) titleEl.textContent = sale.invoice_number || sale.invoiceNum || `#${id}`;
                if (contentEl) contentEl.innerHTML = `<div style="padding:12px">Customer: ${sale.customer_name || 'N/A'}<br/>Total: ${this.app.formatCurrency(sale.grand_total || sale.total || 0)}</div>`;
                try { if (typeof openModal === 'function') openModal('sale-details-modal'); else document.getElementById('sale-details-modal').style.display = 'flex'; } catch (e) {}

            } catch (err) {
                console.error('[CreditManagement] viewSaleDetails error:', err);
                this.app.showNotification('Error showing sale details', 'error');
            }
        })();
    }

    viewCustomerCreditHistory(customerId) {
        // Switch to history tab and select the customer
        this.switchTab('credit-history');
        
        const customerSelect = document.getElementById('history-customer-select');
        customerSelect.value = customerId;
        
        // Trigger the change event to load history
        customerSelect.dispatchEvent(new Event('change'));
    }

    async loadCustomerHistory(customerId) {
        try {
            this.app.showLoading('Loading customer history...');
            
            const response = await this.api.get(`/credit-management/customer/${customerId}/credit-history`);

            if (response && response.success) {
                this.renderCustomerHistory(response);
            }
        } catch (error) {
            console.error('Error loading customer history:', error);
            this.app.showNotification('Error loading customer history', 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    renderCustomerHistory(historyData) {
        // Render sales history
        const salesTbody = document.getElementById('history-sales-table');
        if (salesTbody && historyData.sales) {
            if (historyData.sales.length === 0) {
                salesTbody.innerHTML = '<tr><td colspan="5" class="empty-cell">No sales found</td></tr>';
            } else {
                salesTbody.innerHTML = historyData.sales.map(sale => `
                    <tr>
                        <td>${sale.invoice_number || 'N/A'}</td>
                        <td>${this.formatDate(sale.created_at)}</td>
                        <td>${this.app.formatCurrency(sale.grand_total)}</td>
                        <td>${this.app.formatCurrency(sale.balance_due)}</td>
                        <td>
                            <span class="badge badge-${this.getStatusColor(sale.payment_status)}">
                                ${sale.payment_status}
                            </span>
                        </td>
                    </tr>
                `).join('');
            }
        }

        // Render payments history
        const paymentsTbody = document.getElementById('history-payments-table');
        if (paymentsTbody && historyData.payments) {
            if (historyData.payments.length === 0) {
                paymentsTbody.innerHTML = '<tr><td colspan="4" class="empty-cell">No payments found</td></tr>';
            } else {
                paymentsTbody.innerHTML = historyData.payments.map(payment => `
                    <tr>
                        <td>${this.formatDate(payment.payment_date)}</td>
                        <td>${this.app.formatCurrency(payment.amount)}</td>
                        <td>${payment.payment_method}</td>
                        <td>${payment.notes || ''}</td>
                    </tr>
                `).join('');
            }
        }
    }

    refresh() {
        this.loadInitialData();
    }
}

// NOTE: Do NOT auto-instantiate here — the app loader will instantiate the screen class.
// Removing duplicate DOMContentLoaded initializer to avoid race/duplicate instances.

// Ensure loader can find the class by attaching to `window` as expected
try {
    window.CreditManagementScreen = CreditManagementScreen;
} catch (e) {
    // ignore in non-browser environments
}

// Runtime sanity log to help diagnose missing handlers in some deployments
try {
    console.log('[CreditManagement] script executed; CreditManagementScreen available =', !!window.CreditManagementScreen);
    // Global delegated listener for quick diagnostics (non-invasive)
    window.addEventListener('click', (ev) => {
        try {
            const btn = ev.target.closest && ev.target.closest('button');
            if (!btn) return;
            if (btn.id === 'process-payment-btn' || btn.dataset && (btn.dataset.action || btn.dataset.saleId)) {
                console.log('[CreditManagement][DEBUG] Button clicked:', { id: btn.id, action: btn.dataset && btn.dataset.action, saleId: btn.dataset && btn.dataset.saleId });
            }
        } catch (err) {}
    }, true);
} catch (e) {}