class SalesScreen {
    constructor(app) {
        this.app = app;
        this.api = app.api;
        this.sales = [];
        this.filters = {
            start_date: null,
            end_date: null,
            status: null
        };
    }

    init() {
        console.log('[Sales] Initializing Sales Screen');
        console.log('[Sales] this.app:', this.app);
        console.log('[Sales] this.api:', this.api);
        console.log('[Sales] Init called!');  // Removed alert for better UX
        try {
            this.setupEventListeners();
            console.log('[Sales] ✓ Event listeners set up');
        } catch (e) {
            console.error('[Sales] Error setting up event listeners:', e);
        }
        
        try {
            this.load();
            console.log('[Sales] ✓ Load called');
        } catch (e) {
            console.error('[Sales] Error calling load:', e);
        }
    }

    refresh() {
        console.log('[Sales] Refreshing sales...');
        return this.load();
    }

    setupEventListeners() {
        // Filter inputs
        const startDateInput = document.getElementById('sales-start-date');
        if (startDateInput) {
            startDateInput.addEventListener('change', () => {
                this.filters.start_date = startDateInput.value;
                this.load();
            });
        }

        const endDateInput = document.getElementById('sales-end-date');
        if (endDateInput) {
            endDateInput.addEventListener('change', () => {
                this.filters.end_date = endDateInput.value;
                this.load();
            });
        }

        const statusSelect = document.getElementById('sales-status');
        if (statusSelect) {
            statusSelect.addEventListener('change', () => {
                this.filters.status = statusSelect.value || null;
                this.load();
            });
        }
    }

    async load() {
        console.log('[Sales] load() called with filters:', this.filters);
        
        try {
            // Build query string
            let url = '/sales/';
            const params = new URLSearchParams();
            if (this.filters.start_date) params.append('start_date', this.filters.start_date);
            if (this.filters.end_date) params.append('end_date', this.filters.end_date);
            if (this.filters.status) params.append('status', this.filters.status);
            
            if (params.toString()) {
                url += '?' + params.toString();
            }

            console.log('[Sales] Calling API:', url);
            const res = await this.api.get(url);
            console.log('[Sales] Response:', res);

            // Handle response
            if (!res) {
                console.warn('[Sales] No response received');
                this.sales = [];
            } else if (Array.isArray(res)) {
                console.log('[Sales] Got direct array response with', res.length, 'items');
                this.sales = res;
            } else if (res.sales && Array.isArray(res.sales)) {
                console.log('[Sales] Got response with sales wrapper, containing', res.sales.length, 'items');
                this.sales = res.sales;
            } else {
                console.warn('[Sales] Unexpected response format:', res);
                console.warn('[Sales] Response keys:', Object.keys(res || {}));
                this.sales = [];
            }

            console.log('[Sales] ✓ Loaded', this.sales.length, 'sales');
            this.render();
            this.updateSummary();
        } catch (e) {
            console.error('[Sales] ✗ Error loading sales:', e);
            const tbody = document.getElementById('sales-table');
            if (tbody) {
                const errorMessage = e.message || e;
                tbody.innerHTML = `<tr><td colspan="8" class="error-cell"><div>Error: ${errorMessage}</div><button class="btn btn-small" onclick="window.app.screens.sales.load()">Retry</button></td></tr>`;
            }
        }
    }

    normalizeSale(s) {
        if (!s) {
            return { id: null, invoiceNum: '', date: null, customer: null, items: 0, total: 0, payment: '', status: '' };
        }

        // Object format - this is what the API returns
        return {
            id: s.id || s.sale_id || null,
            invoiceNum: s.invoice_number || s.invoice_num || '',
            date: s.created_at || s.invoice_date || s.date || null,
            customer: s.customer_name || s.customer || (s.customer_id ? 'Customer ID: ' + s.customer_id : 'Walk-in'),
            items: s.total_items || s.items || 0,
            total: s.grand_total || s.total_amount || s.total || 0,
            payment: s.payment_method || s.payment_type || 'cash',
            status: s.sale_status || s.payment_status || s.status || 'completed'
        };
    }

    updateSummary() {
        console.log('[Sales] Updating summary for', this.sales.length, 'sales');
        const today = new Date().toISOString().split('T')[0];
        const normalized = this.sales.map(s => this.normalizeSale(s));
        const todaySales = normalized.filter(s => (s.date || '').toString().startsWith(today));
        const totalRevenue = todaySales.reduce((sum, s) => sum + (Number(s.total) || 0), 0);

        const todayEl = document.getElementById('today-revenue');
        const totalEl = document.getElementById('total-transactions');
        const avgEl = document.getElementById('avg-transaction');

        if (todayEl) {
            todayEl.textContent = `PKR ${totalRevenue.toLocaleString()}`;
        }
        if (totalEl) {
            totalEl.textContent = this.sales.length;
        }
        if (avgEl) {
            const avg = this.sales.length > 0 ? totalRevenue / this.sales.length : 0;
            avgEl.textContent = `PKR ${Math.floor(avg).toLocaleString()}`;
        }
    }

    render() {
        console.log('[Sales] render() called with', this.sales.length, 'sales');
        const tbody = document.getElementById('sales-table');
        if (!tbody) {
            console.warn('[Sales] tbody not found');
            return;
        }

        if (this.sales.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="empty-cell">
                        <div class="empty-icon">📊</div>
                        <div>No sales found</div>
                    </td>
                </tr>
            `;
            return;
        }

        const normalized = this.sales.map(s => this.normalizeSale(s));
        tbody.innerHTML = normalized.map(s => `
            <tr>
                <td>${this.escapeHtml(s.invoiceNum) || 'N/A'}</td>
                <td>${this.formatDate(s.date)}</td>
                <td>${this.escapeHtml(s.customer) || 'Walk-in'}</td>
                <td class="text-center">${s.items || 0}</td>
                <td class="text-right">PKR ${(Number(s.total) || 0).toLocaleString()}</td>
                <td>${this.escapeHtml(s.payment) || 'cash'}</td>
                <td><span class="badge badge-${s.status === 'completed' ? 'success' : 'warning'}">${this.escapeHtml(s.status) || 'N/A'}</span></td>
                <td class="text-center">
                    <button class="btn btn-small" onclick="window.app.screens.sales.viewDetails(${s.id || 0})">View</button>
                </td>
            </tr>
        `).join('');
    }

    formatDate(dateStr) {
        if (!dateStr) return 'N/A';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-PK');
        } catch {
            return dateStr;
        }
    }

    viewDetails(saleId) {
        console.log('[Sales] Viewing details for sale:', saleId);
        
        // Find the sale in our loaded data
        const sale = this.sales.find(s => s.id === saleId);
        if (!sale) {
            console.warn('[Sales] Sale not found in current data:', saleId);
            showAlert('Error', 'Sale details not found');
            return;
        }
        
        // Display the sale details in a modal
        this.displaySaleDetailsModal(sale);
    }

    displaySaleDetailsModal(sale) {
        const titleEl = document.getElementById('sale-invoice-title');
        const contentEl = document.getElementById('sale-details-content');
        
        if (titleEl) {
            titleEl.textContent = sale.invoice_number || sale.invoiceNum || 'N/A';
        }
        
        // Build detailed HTML
        const detailsHTML = `
            <div class="sale-details-container">
                <div class="details-section">
                    <h4>Invoice Information</h4>
                    <div class="details-grid">
                        <div class="detail-item">
                            <span class="label">Invoice #:</span>
                            <span class="value">${this.escapeHtml(sale.invoice_number || sale.invoiceNum || 'N/A')}</span>
                        </div>
                        <div class="detail-item">
                            <span class="label">Date:</span>
                            <span class="value">${this.formatDate(sale.created_at || sale.invoice_date || sale.date)}</span>
                        </div>
                        <div class="detail-item">
                            <span class="label">Time:</span>
                            <span class="value">${this.formatTime(sale.created_at || sale.invoice_date || sale.date)}</span>
                        </div>
                        <div class="detail-item">
                            <span class="label">Status:</span>
                            <span class="value"><span class="badge badge-${(sale.sale_status || sale.status || 'completed') === 'completed' ? 'success' : 'warning'}">${this.escapeHtml(sale.sale_status || sale.status || 'N/A')}</span></span>
                        </div>
                    </div>
                </div>

                <div class="details-section">
                    <h4>Customer Information</h4>
                    <div class="details-grid">
                        <div class="detail-item">
                            <span class="label">Name:</span>
                            <span class="value">${this.escapeHtml(sale.customer_name || sale.customer || 'Walk-in Customer')}</span>
                        </div>
                        <div class="detail-item">
                            <span class="label">Phone:</span>
                            <span class="value">${this.escapeHtml(sale.customer_phone || 'N/A')}</span>
                        </div>
                        <div class="detail-item">
                            <span class="label">CNIC:</span>
                            <span class="value">${this.escapeHtml(sale.customer_cnic || 'N/A')}</span>
                        </div>
                    </div>
                </div>

                <div class="details-section">
                    <h4>Transaction Summary</h4>
                    <div class="summary-table">
                        <div class="summary-row">
                            <span class="label">Items:</span>
                            <span class="value">${sale.total_items || sale.items || 0}</span>
                        </div>
                        <div class="summary-row">
                            <span class="label">Quantity:</span>
                            <span class="value">${sale.total_quantity || 0}</span>
                        </div>
                        <div class="summary-row">
                            <span class="label">Subtotal:</span>
                            <span class="value">PKR ${(Number(sale.subtotal) || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}</span>
                        </div>
                        <div class="summary-row">
                            <span class="label">Discount:</span>
                            <span class="value">-PKR ${(Number(sale.discount_amount) || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}</span>
                        </div>
                        <div class="summary-row">
                            <span class="label">GST (${sale.gst_rate || 17}%):</span>
                            <span class="value">PKR ${(Number(sale.gst_amount) || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}</span>
                        </div>
                        <div class="summary-row">
                            <span class="label">Shipping:</span>
                            <span class="value">PKR ${(Number(sale.shipping_charge) || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}</span>
                        </div>
                        <div class="summary-row">
                            <span class="label">Round Off:</span>
                            <span class="value">${sale.round_off >= 0 ? '+' : ''}PKR ${(Number(sale.round_off) || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}</span>
                        </div>
                        <div class="summary-row total">
                            <span class="label"><strong>Grand Total:</strong></span>
                            <span class="value"><strong>PKR ${(Number(sale.grand_total) || Number(sale.total) || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}</strong></span>
                        </div>
                        <div class="summary-row">
                            <span class="label">Amount Paid:</span>
                            <span class="value">PKR ${(Number(sale.amount_paid) || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}</span>
                        </div>
                        <div class="summary-row">
                            <span class="label">Balance Due:</span>
                            <span class="value">PKR ${(Number(sale.balance_due) || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                </div>

                <div class="details-section">
                    <h4>Payment Information</h4>
                    <div class="details-grid">
                        <div class="detail-item">
                            <span class="label">Payment Method:</span>
                            <span class="value">${this.escapeHtml(sale.payment_method || sale.payment || 'cash')}</span>
                        </div>
                        <div class="detail-item">
                            <span class="label">Payment Status:</span>
                            <span class="value"><span class="badge badge-${(sale.payment_status || 'paid') === 'paid' ? 'success' : 'warning'}">${this.escapeHtml(sale.payment_status || 'paid')}</span></span>
                        </div>
                        <div class="detail-item">
                            <span class="label">Sale Type:</span>
                            <span class="value">${this.escapeHtml(sale.sale_type || 'retail')}</span>
                        </div>
                        <div class="detail-item">
                            <span class="label">Cashier:</span>
                            <span class="value">${this.escapeHtml(sale.cashier_name || 'N/A')}</span>
                        </div>
                    </div>
                </div>

                ${sale.notes ? `
                <div class="details-section">
                    <h4>Notes</h4>
                    <div class="notes-content">
                        ${this.escapeHtml(sale.notes)}
                    </div>
                </div>
                ` : ''}
            </div>

            <style>
                .sale-details-container {
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }

                .details-section {
                    border: 1px solid #ecf0f1;
                    border-radius: 0.375rem;
                    padding: 1rem;
                }

                .details-section h4 {
                    margin: 0 0 1rem 0;
                    padding-bottom: 0.75rem;
                    border-bottom: 2px solid #3498db;
                    color: #2c3e50;
                    font-size: 0.95rem;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .details-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1rem;
                }

                .detail-item {
                    display: flex;
                    justify-content: space-between;
                    padding: 0.5rem 0;
                    border-bottom: 1px solid #f8f9fa;
                }

                .detail-item:last-child {
                    border-bottom: none;
                }

                .detail-item .label {
                    font-weight: 500;
                    color: #7f8c8d;
                    min-width: 120px;
                }

                .detail-item .value {
                    color: #2c3e50;
                    font-weight: 500;
                    text-align: right;
                    flex: 1;
                }

                .summary-table {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }

                .summary-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 0.75rem;
                    background: #f8f9fa;
                    border-radius: 0.25rem;
                }

                .summary-row.total {
                    background: #ecf0f1;
                    font-size: 1.1rem;
                    padding: 1rem;
                    border: 2px solid #3498db;
                }

                .summary-row .label {
                    font-weight: 500;
                    color: #7f8c8d;
                }

                .summary-row .value {
                    color: #2c3e50;
                    font-weight: 500;
                    text-align: right;
                }

                .notes-content {
                    background: #f8f9fa;
                    padding: 1rem;
                    border-radius: 0.375rem;
                    border-left: 3px solid #3498db;
                    line-height: 1.5;
                    color: #2c3e50;
                }

                .badge {
                    padding: 0.25rem 0.75rem;
                    border-radius: 0.25rem;
                    font-size: 0.8rem;
                    font-weight: 600;
                }

                .badge-success {
                    background: #d5f4e6;
                    color: #27ae60;
                }

                .badge-warning {
                    background: #ffeaa7;
                    color: #d63031;
                }

                @media (max-width: 768px) {
                    .details-grid {
                        grid-template-columns: 1fr;
                    }
                }
            </style>
        `;
        
        if (contentEl) {
            contentEl.innerHTML = detailsHTML;
        }

        // Prefer global openModal if available, otherwise fall back to directly showing the modal
        try {
            if (typeof openModal === 'function') {
                openModal('sale-details-modal');
                return;
            }
        } catch (e) {
            // ignore and fallback to DOM
        }

        // Silent DOM fallback if openModal isn't available
        const modal = document.getElementById('sale-details-modal');
        if (modal) modal.style.display = 'flex';
    }

    formatTime(dateStr) {
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            return date.toLocaleTimeString('en-PK');
        } catch {
            return dateStr;
        }
    }

    printSale() {
        console.log('[Sales] Print sale functionality - to be implemented');
        showAlert('Coming Soon', 'Print functionality will be available soon');
    }

    filter() {
        console.log('[Sales] Filter button clicked');
        this.load();
    }
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div'); 
        div.textContent = text; 
        return div.innerHTML;
    }
}

// Export to window
window.SalesScreen = SalesScreen;


