// src/frontend/screens/dashboard/script.js

class DashboardScreen {
    constructor(app) {
        this.app = app;
        this.charts = {};
        this.data = {
            todaySales: 0,
            todayProfit: 0,
            totalProducts: 0,
            lowStockCount: 0,
            todayCustomers: 0,
            pendingCredit: 0
        };
    }

    init() {
        console.log('Initializing Dashboard');
        this.refresh();
        this.setupEventListeners();

        // Update date
        const dateEl = document.getElementById('dashboardDate');
        if (dateEl) {
            const today = new Date();
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            dateEl.textContent = today.toLocaleDateString('en-US', options);
        }

        // Set user info
        if (this.app.currentUser) {
            const userEl = document.getElementById('loggedInUser');
            if (userEl) {
                userEl.textContent = this.app.currentUser.full_name || 'User';
            }
        }

        // Auto-refresh every 5 minutes
        if (this.refreshInterval) clearInterval(this.refreshInterval);
        this.refreshInterval = setInterval(() => this.refresh(), 5 * 60 * 1000);
    }

    setupEventListeners() {
        // Bind Quick Sale button
        const quickSaleBtn = document.getElementById('quickSaleBtn');
        if (quickSaleBtn) {
            quickSaleBtn.addEventListener('click', () => {
                this.app.loadScreen('pos');
            });
        }

        // Bind Refresh button
        const refreshBtn = document.getElementById('refreshDashboardBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refresh();
            });
        }

        // Bind Reports button
        const reportsBtn = document.getElementById('reportsBtn');
        if (reportsBtn) {
            reportsBtn.addEventListener('click', () => {
                this.app.loadScreen('reports');
            });
        }

        // Bind View All Reports button
        const viewAllReportsBtn = document.getElementById('viewAllReportsBtn');
        if (viewAllReportsBtn) {
            viewAllReportsBtn.addEventListener('click', () => {
                this.app.loadScreen('reports');
            });
        }

        // Bind View All Sales button
        const viewAllSalesBtn = document.getElementById('viewAllSalesBtn');
        if (viewAllSalesBtn) {
            viewAllSalesBtn.addEventListener('click', () => {
                this.app.loadScreen('sales');
            });
        }

        // Bind Restock Inventory button
        const restockInventoryBtn = document.getElementById('restockInventoryBtn');
        if (restockInventoryBtn) {
            restockInventoryBtn.addEventListener('click', () => {
                this.app.loadScreen('inventory');
            });
        }
    }



    async refresh() {
        console.log('Refreshing dashboard...');
        try {
            await Promise.all([
                this.loadDashboardStats(),
                this.loadRecentSales(),
                this.loadLowStockItems(),
                this.initializeCharts()
            ]);

            // Update last updated time
            const timeEl = document.getElementById('lastUpdatedTime');
            if (timeEl) {
                timeEl.textContent = new Date().toLocaleTimeString();
            }
        } catch (error) {
            console.error('Error refreshing dashboard:', error);
        }
    }

    async loadDashboardStats() {
        try {
            // Get local date string in YYYY-MM-DD format
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const today = `${year}-${month}-${day}`;
            
            const sales = await this.app.api.get(`/sales/?start_date=${today}&end_date=${today}`);

            let todaySales = 0;
            let todayCustomers = new Set();

            let salesData = [];
            if (sales && sales.success === false) {
                // Handle API error response
                console.error('Sales API returned error:', sales);
                return; // Return early to avoid setting zero values
            } else if (Array.isArray(sales)) {
                salesData = sales;
            } else if (sales && sales.data) {
                salesData = sales.data;
            } else if (sales && sales.sales) {
                salesData = sales.sales;
            } else if (sales && Array.isArray(sales.sales)) {
                salesData = sales.sales;
            }

            salesData.forEach(sale => {
                // Ensure we're accessing the correct field names from the database
                let saleAmount = 0;
                if (typeof sale === 'object' && sale !== null) {
                    // Object format
                    saleAmount = (sale.grand_total !== undefined && sale.grand_total !== null ? sale.grand_total : 
                                sale.total_amount !== undefined && sale.total_amount !== null ? sale.total_amount : 
                                0);
                    
                    const customerId = (sale.customer_id !== undefined && sale.customer_id !== null) ? sale.customer_id : 
                                       (sale.customer !== undefined && sale.customer !== null) ? sale.customer : 
                                       null;
                    if (customerId && customerId !== 'Walk-in' && customerId !== 0 && customerId !== 'Walk-in Customer') {
                        todayCustomers.add(customerId);
                    }
                }
                
                todaySales += parseFloat(saleAmount) || 0;
            });

            this.data.todaySales = todaySales;
            this.data.todayCustomers = todayCustomers.size;

            this.updateStatCard('todaySales', this.app.formatCurrency(todaySales));
            this.updateStatCard('todayCustomers', todayCustomers.size.toString());

            // Products stats
            const productsRes = await this.app.api.get('/products?limit=1000');
            
            let productsList = [];
            if (productsRes && productsRes.success === false) {
                // Handle API error response
                console.error('Products API returned error:', productsRes);
                productsList = [];
            } else if (Array.isArray(productsRes)) {
                productsList = productsRes;
            } else if (productsRes && productsRes.data) {
                productsList = productsRes.data;
            } else if (productsRes && productsRes.products) {
                productsList = productsRes.products;
            } else if (productsRes && Array.isArray(productsRes.products)) {
                productsList = productsRes.products;
            }

            let totalProducts = productsList.length;
            let lowStockCount = 0;

            productsList.forEach(product => {
                // Handle object format
                let currentStock, minStock;
                if (typeof product === 'object' && product !== null) {
                    // Object format
                    currentStock = (product.current_stock !== undefined && product.current_stock !== null ? product.current_stock : 
                                product.stock !== undefined && product.stock !== null ? product.stock : 
                                0);
                    minStock = (product.min_stock !== undefined && product.min_stock !== null ? product.min_stock : 
                            10);
                } else {
                    // Fallback
                    currentStock = 0;
                    minStock = 10;
                }
                
                if (parseInt(currentStock) < parseInt(minStock)) lowStockCount++;
            });

            this.data.totalProducts = totalProducts;
            this.data.lowStockCount = lowStockCount;
            this.updateStatCard('totalProducts', totalProducts.toString());
            this.updateStatCard('lowStockCount', lowStockCount.toString());

            // Profit (30% assumption)
            this.data.todayProfit = todaySales * 0.30;
            this.updateStatCard('todayProfit', this.app.formatCurrency(this.data.todayProfit));

            // Pending Credit (Fetch customers and sum credit_used)
            const customersRes = await this.app.api.get('/customers?limit=1000');
            
            let customersList = [];
            if (customersRes && customersRes.success === false) {
                // Handle API error response
                console.error('Customers API returned error:', customersRes);
                customersList = [];
            } else if (Array.isArray(customersRes)) {
                customersList = customersRes;
            } else if (customersRes && customersRes.data) {
                customersList = customersRes.data;
            } else if (customersRes && customersRes.customers) {
                customersList = customersRes.customers;
            } else if (customersRes && Array.isArray(customersRes.customers)) {
                customersList = customersRes.customers;
            }
            


            let pendingCredit = 0;
            customersList.forEach(customer => {
                // Handle both object and array formats
                let creditUsed;
                if (typeof customer === 'object' && customer !== null) {
                    // Object format
                    creditUsed = (customer.credit_used !== undefined && customer.credit_used !== null ? customer.credit_used : 
                             customer.total_credit !== undefined && customer.total_credit !== null ? customer.total_credit : 
                             0);
                } else if (Array.isArray(customer)) {
                    // Array format - index based on actual schema
                    creditUsed = customer[8] || 0; // credit_used is likely at index 8
                } else {
                    // Fallback
                    creditUsed = 0;
                }
                pendingCredit += parseFloat(creditUsed) || 0;
            });

            this.data.pendingCredit = pendingCredit;
            this.updateStatCard('pendingCredit', this.app.formatCurrency(pendingCredit));

        } catch (error) {
            console.error('Error loading dashboard stats:', error);
            // Update with zero values on error to clear loading indicators
            this.updateStatCard('todaySales', this.app.formatCurrency(0));
            this.updateStatCard('todayCustomers', '0');
            this.updateStatCard('totalProducts', '0');
            this.updateStatCard('lowStockCount', '0');
            this.updateStatCard('todayProfit', this.app.formatCurrency(0));
            this.updateStatCard('pendingCredit', this.app.formatCurrency(0));
        }
    }

    updateStatCard(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        } else {
            console.warn(`Element with ID ${elementId} not found`);
        }
    }

    async loadRecentSales() {
        try {
            const sales = await this.app.api.get('/sales/?limit=10');
            const tbody = document.getElementById('recentSalesBody');

            if (!tbody) return;

            let salesList = [];
            if (sales && sales.success === false) {
                // Handle API error response
                console.error('Recent Sales API returned error:', sales);
                salesList = [];
            } else if (Array.isArray(sales)) {
                salesList = sales;
            } else if (sales && sales.data) {
                salesList = sales.data;
            } else if (sales && sales.sales) {
                salesList = sales.sales;
            } else if (sales && Array.isArray(sales.sales)) {
                salesList = sales.sales;
            }

            if (salesList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center">No sales today</td></tr>';
                return;
            }

            tbody.innerHTML = salesList.map(sale => {
                // Handle both object and array formats
                let invoiceNumber, customerName, totalItems, grandTotal, createdAt, paymentStatus;
                
                if (Array.isArray(sale)) {
                    // Array format - use indices
                    invoiceNumber = (sale[1] !== undefined && sale[1] !== null) ? sale[1] : 
                                  (sale[0] !== undefined && sale[0] !== null) ? sale[0] : 'N/A'; // invoice_number or id
                    customerName = (sale[4] !== undefined && sale[4] !== null) ? sale[4] : 'Walk-in'; // customer_name
                    totalItems = (sale[11] !== undefined && sale[11] !== null) ? sale[11] : 
                                (sale[5] !== undefined && sale[5] !== null) ? sale[5] : '-'; // total_items
                    grandTotal = (sale[22] !== undefined && sale[22] !== null) ? sale[22] : 
                                (sale[2] !== undefined && sale[2] !== null) ? sale[2] : 0; // grand_total
                    createdAt = (sale[37] !== undefined && sale[37] !== null) ? sale[37] : 
                                (sale[2] !== undefined && sale[2] !== null) ? sale[2] : new Date().toISOString(); // created_at
                    paymentStatus = (sale[28] !== undefined && sale[28] !== null) ? sale[28] : 
                                  (sale[26] !== undefined && sale[26] !== null) ? sale[26] : 'completed'; // payment_status
                } else {
                    // Object format
                    invoiceNumber = (sale.invoice_number !== undefined && sale.invoice_number !== null) ? sale.invoice_number : 
                                  (sale.invoice_no !== undefined && sale.invoice_no !== null) ? sale.invoice_no : 
                                  (sale.id !== undefined && sale.id !== null) ? sale.id : 'N/A';
                    customerName = (sale.customer_name !== undefined && sale.customer_name !== null) ? sale.customer_name : 
                                  (sale.customer && sale.customer.name) ? sale.customer.name : 
                                  'Walk-in';
                    totalItems = (sale.total_items !== undefined && sale.total_items !== null) ? sale.total_items : 
                                (sale.item_count !== undefined && sale.item_count !== null) ? sale.item_count : 
                                (sale.items_count !== undefined && sale.items_count !== null) ? sale.items_count : '-';
                    grandTotal = (sale.grand_total !== undefined && sale.grand_total !== null) ? sale.grand_total : 
                                (sale.total_amount !== undefined && sale.total_amount !== null) ? sale.total_amount : 0;
                    createdAt = (sale.created_at !== undefined && sale.created_at !== null) ? sale.created_at : 
                                (sale.sale_date !== undefined && sale.sale_date !== null) ? sale.sale_date : new Date().toISOString();
                    paymentStatus = (sale.payment_status !== undefined && sale.payment_status !== null) ? sale.payment_status : 'completed';
                }
                
                return `
                    <tr>
                        <td>${invoiceNumber || 'N/A'}</td>
                        <td>${customerName || 'Walk-in'}</td>
                        <td>${totalItems || '-'}</td>
                        <td>${this.app.formatCurrency(parseFloat(grandTotal) || 0)}</td>
                        <td>${new Date(createdAt).toLocaleTimeString()}</td>
                        <td><span class="status-badge ${paymentStatus}">${paymentStatus}</span></td>
                    </tr>
                `;
            }).join('');
        } catch (error) {
            console.error('Error loading recent sales:', error);
        }
    }

    async loadLowStockItems() {
        try {
            const products = await this.app.api.get('/products');
            const tbody = document.getElementById('lowStockBody');

            if (!tbody) return;

            let allProducts = [];
            if (products && products.success === false) {
                // Handle API error response
                console.error('Low Stock Products API returned error:', products);
                allProducts = [];
            } else if (Array.isArray(products)) {
                allProducts = products;
            } else if (products && products.data) {
                allProducts = products.data;
            } else if (products && products.products) {
                allProducts = products.products;
            } else if (products && Array.isArray(products.products)) {
                allProducts = products.products;
            }

            // Filter for low stock items
            const lowStockProducts = allProducts.filter(product => {
                // Handle both object and array formats
                let currentStock, minStock;
                if (Array.isArray(product)) {
                    // Array format - use indices
                    currentStock = (product[13] !== undefined && product[13] !== null) ? product[13] : 0; // current_stock
                    minStock = (product[14] !== undefined && product[14] !== null) ? product[14] : 10; // min_stock
                } else {
                    // Object format
                    currentStock = (product.current_stock !== undefined && product.current_stock !== null) ? product.current_stock : 
                                (product.stock !== undefined && product.stock !== null) ? product.stock : 0;
                    minStock = (product.min_stock !== undefined && product.min_stock !== null) ? product.min_stock : 10;
                }
                return parseInt(currentStock) < parseInt(minStock);
            }).slice(0, 10);

            if (lowStockProducts.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center">All items in stock</td></tr>';
                return;
            }

            tbody.innerHTML = lowStockProducts.map(product => {
                // Handle both object and array formats
                let productCode, productName, currentStock, minStock;
                
                if (Array.isArray(product)) {
                    // Array format - use indices
                    productCode = (product[2] !== undefined && product[2] !== null) ? product[2] : 
                                 (product[0] !== undefined && product[0] !== null) ? product[0] : 'N/A'; // product_code or id
                    productName = (product[3] !== undefined && product[3] !== null) ? product[3] : 
                                  (product[1] !== undefined && product[1] !== null) ? product[1] : 'Unknown'; // name
                    currentStock = (product[13] !== undefined && product[13] !== null) ? product[13] : 0; // current_stock
                    minStock = (product[14] !== undefined && product[14] !== null) ? product[14] : 10; // min_stock
                } else {
                    // Object format
                    productCode = (product.product_code !== undefined && product.product_code !== null) ? product.product_code : 
                                 (product.code !== undefined && product.code !== null) ? product.code : 'N/A';
                    productName = (product.name !== undefined && product.name !== null) ? product.name : 'Unknown';
                    currentStock = (product.current_stock !== undefined && product.current_stock !== null) ? product.current_stock : 
                                   (product.stock !== undefined && product.stock !== null) ? product.stock : 0;
                    minStock = (product.min_stock !== undefined && product.min_stock !== null) ? product.min_stock : 10;
                }
                
                return `
                    <tr>
                        <td>${productCode || 'N/A'}</td>
                        <td>${productName || 'Unknown'}</td>
                        <td>${currentStock || 0}</td>
                        <td>${minStock || 10}</td>
                        <td><span class="status-badge danger">Low Stock</span></td>
                        <td><button class="btn btn-small btn-primary btn-restock-item">Restock</button></td>
                    </tr>
                `;
            }).join('');
            
            // Bind restock buttons
            document.querySelectorAll('.btn-restock-item').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.app.loadScreen('inventory');
                });
            });
        } catch (error) {
            console.error('Error loading low stock items:', error);
        }
    }

    async initializeCharts() {
        if (typeof Chart === 'undefined') return;

        await Promise.all([
            this.initSalesTrendChart(),
            this.initTopProductsChart(),
            this.initCategoryChart(),
            this.initPaymentMethodChart()
        ]);
    }

    // Chart methods placeholder - implemented similar to functional version but attached to class
    async initSalesTrendChart() {
        const canvas = document.getElementById('salesTrendChart');
        if (!canvas) return;

        try {
            const data = await this.app.api.get('/reports/sales-summary?start_date=' + new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

            const labels = [];
            const values = [];
            const today = new Date();

            for (let i = 6; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

                const dateStr = date.toISOString().split('T')[0];
                const dayData = (data.daily_sales || []).find(d => {
                    // Handle different date formats
                    return (d.date === dateStr || d.date?.substring(0, 10) === dateStr);
                });
                values.push(dayData ? dayData.revenue : 0);
            }

            if (this.charts.salesTrend) this.charts.salesTrend.destroy();

            const ctx = canvas.getContext('2d');
            this.charts.salesTrend = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Sales',
                        data: values,
                        borderColor: '#27ae60',
                        backgroundColor: 'rgba(39, 174, 96, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: { responsive: true, plugins: { legend: { display: false } } }
            });
        } catch (e) {
            console.error('Sales chart error', e);
        }
    }

    async initTopProductsChart() {
        try {
            const canvas = document.getElementById('topProductsChart');
            if (!canvas) return;
            
            const data = await this.app.api.get('/reports/top-products?limit=5');

            let items = [];
            if (data && data.data) {
                items = data.data;
            } else if (data && data.top_products) {
                items = data.top_products;
            }
            
            const labels = items.map(p => p.name || p.product_name);
            const values = items.map(p => p.quantity_sold || p.qty_sold || 0);

            if (this.charts.topProducts) this.charts.topProducts.destroy();

            const ctx = canvas.getContext('2d');
            this.charts.topProducts = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Sold',
                        data: values,
                        backgroundColor: ['#3b82f6', '#27ae60', '#f59e0b', '#ef4444', '#8b5cf6']
                    }]
                },
                options: { responsive: true, plugins: { legend: { display: false } } }
            });
        } catch (e) { console.error(e); }
    }

    async initCategoryChart() {
        try {
            const canvas = document.getElementById('categoryChart');
            if (!canvas) return;
            
            const data = await this.app.api.get('/reports/sales-summary');

            // For category chart, we need to get sales by category
            // This would require a new endpoint, for now we'll simulate
            const labels = ['Brakes', 'Oil', 'Filters', 'Tires', 'Accessories'];
            const values = [30, 25, 20, 15, 10];

            if (this.charts.categoryChart) this.charts.categoryChart.destroy();

            const ctx = canvas.getContext('2d');
            this.charts.categoryChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: values,
                        backgroundColor: ['#3b82f6', '#27ae60', '#f59e0b', '#ef4444', '#8b5cf6']
                    }]
                },
                options: { responsive: true, plugins: { legend: { display: true } } }
            });
        } catch (e) { console.error(e); }
    }

    async initPaymentMethodChart() {
        try {
            const canvas = document.getElementById('paymentMethodChart');
            if (!canvas) return;
            
            // For payment method chart, we'll simulate data
            const labels = ['Cash', 'Credit', 'Debit', 'Mobile'];
            const values = [60, 20, 15, 5];

            if (this.charts.paymentMethodChart) this.charts.paymentMethodChart.destroy();

            const ctx = canvas.getContext('2d');
            this.charts.paymentMethodChart = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: labels,
                    datasets: [{
                        data: values,
                        backgroundColor: ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B']
                    }]
                },
                options: { responsive: true, plugins: { legend: { display: true } } }
            });
        } catch (e) { console.error(e); }
    }
}

window.DashboardScreen = DashboardScreen;

