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
                this.loadDashboardAnalytics(),
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
            console.log('[Dashboard] Starting loadDashboardStats...');
            
            // Get local date string in YYYY-MM-DD format
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const today = `${year}-${month}-${day}`;
            
            const salesResponse = await this.app.api.get(`/sales/?start_date=${today}&end_date=${today}`);
            
            // Debug logging
            console.log('[Dashboard] Sales API Response:', salesResponse);

            let todaySales = 0;
            let todayCustomers = new Set();

            // Handle API response properly
            if (salesResponse && salesResponse.success) {
                const salesData = salesResponse.sales || salesResponse.data || [];
                
                salesData.forEach(sale => {
                    // Handle both object and array formats
                    let saleAmount = 0;
                    let customerId = null;
                    
                    if (typeof sale === 'object' && sale !== null) {
                        saleAmount = sale.grand_total || sale.total_amount || 0;
                        customerId = sale.customer_id;
                    } else if (Array.isArray(sale)) {
                        saleAmount = sale[22] || sale[2] || 0; // grand_total or fallback
                        customerId = sale[1] || null; // customer_id
                    }
                    
                    todaySales += parseFloat(saleAmount) || 0;
                    if (customerId && customerId !== 'Walk-in' && customerId !== 0) {
                        todayCustomers.add(customerId);
                    }
                });
            } else {
                console.warn('Sales API returned no data or error:', salesResponse);
            }

            this.data.todaySales = todaySales;
            this.data.todayCustomers = todayCustomers.size;

            this.updateStatCard('todaySales', this.app.formatCurrency(todaySales));
            this.updateStatCard('todayCustomers', todayCustomers.size.toString());

            // Products stats
            const productsResponse = await this.app.api.get('/products?limit=1000');
            
            let totalProducts = 0;
            let lowStockCount = 0;
            
            if (productsResponse && productsResponse.success) {
                const productsList = productsResponse.products || productsResponse.data || [];
                totalProducts = productsList.length;

                productsList.forEach(product => {
                    let currentStock = 0;
                    let minStock = 10;
                    
                    if (typeof product === 'object' && product !== null) {
                        currentStock = product.current_stock || product.stock || 0;
                        minStock = product.min_stock || 10;
                    } else if (Array.isArray(product)) {
                        currentStock = product[13] || product[7] || 0; // current_stock
                        minStock = product[14] || 10; // min_stock
                    }
                    
                    if (parseInt(currentStock) < parseInt(minStock)) {
                        lowStockCount++;
                    }
                });
            } else {
                console.warn('Products API returned no data or error:', productsResponse);
            }

            this.data.totalProducts = totalProducts;
            this.data.lowStockCount = lowStockCount;
            this.updateStatCard('totalProducts', totalProducts.toString());
            this.updateStatCard('lowStockCount', lowStockCount.toString());

            // Profit (30% assumption)
            this.data.todayProfit = todaySales * 0.30;
            this.updateStatCard('todayProfit', this.app.formatCurrency(this.data.todayProfit));

            // Pending Credit
            try {
                const creditResponse = await this.app.api.get('/reports/pending-credit');
                
                let pendingCredit = 0;
                if (creditResponse && creditResponse.success) {
                    pendingCredit = creditResponse.total_pending_amount || 0;
                }
                
                this.data.pendingCredit = pendingCredit;
                this.updateStatCard('pendingCredit', this.app.formatCurrency(pendingCredit));
            } catch (error) {
                console.error('Error fetching pending credit:', error);
                this.data.pendingCredit = 0;
                this.updateStatCard('pendingCredit', this.app.formatCurrency(0));
            }

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

    async loadDashboardAnalytics() {
        try {
            const analytics = await this.app.api.get('/reports/dashboard-analytics');
            
            if (analytics && analytics.success) {
                const { today, yesterday, changes } = analytics;
                
                // Update performance metrics
                this.updatePerformanceMetric('sales', today.sales, yesterday.sales, changes.sales_percent);
                this.updatePerformanceMetric('customers', today.customers, yesterday.customers, changes.customers_percent);
                this.updatePerformanceMetric('avgBill', today.avg_bill, yesterday.avg_bill, changes.avg_bill_percent);
            }
        } catch (error) {
            console.error('Error loading dashboard analytics:', error);
            // Set default values on error
            this.updatePerformanceMetric('sales', 0, 0, 0);
            this.updatePerformanceMetric('customers', 0, 0, 0);
            this.updatePerformanceMetric('avgBill', 0, 0, 0);
        }
    }

    updatePerformanceMetric(type, todayValue, yesterdayValue, changePercent) {
        const isPositive = changePercent >= 0;
        const changeClass = isPositive ? 'positive' : 'negative';
        const changeIcon = isPositive ? '↗' : '↘';
        
        if (type === 'sales') {
            // Sales Today vs Yesterday
            const todayEl = document.getElementById('todaySalesAmount');
            const yesterdayEl = document.getElementById('yesterdaySales');
            const changeEl = document.getElementById('salesChange');
            const barEl = document.getElementById('salesBar');
            
            if (todayEl) todayEl.textContent = this.app.formatCurrency(todayValue);
            if (yesterdayEl) yesterdayEl.textContent = this.app.formatCurrency(yesterdayValue);
            if (changeEl) {
                changeEl.textContent = `${changeIcon} ${Math.abs(changePercent)}%`;
                changeEl.className = `performance-change ${changeClass}`;
            }
            if (barEl) {
                const percentage = Math.min(Math.abs(changePercent), 100);
                barEl.style.width = `${percentage}%`;
                barEl.className = `performance-bar-fill ${changeClass}`;
            }
        } else if (type === 'customers') {
            // Customer Growth
            const todayEl = document.getElementById('todayCustomersCount');
            const yesterdayEl = document.getElementById('yesterdayCustomers');
            const changeEl = document.getElementById('customersChange');
            const barEl = document.getElementById('customersBar');
            
            if (todayEl) todayEl.textContent = todayValue.toString();
            if (yesterdayEl) yesterdayEl.textContent = yesterdayValue.toString();
            if (changeEl) {
                changeEl.textContent = `${changeIcon} ${Math.abs(changePercent)}%`;
                changeEl.className = `performance-change ${changeClass}`;
            }
            if (barEl) {
                const percentage = Math.min(Math.abs(changePercent), 100);
                barEl.style.width = `${percentage}%`;
                barEl.className = `performance-bar-fill ${changeClass}`;
            }
        } else if (type === 'avgBill') {
            // Average Bill Value
            const avgBillEl = document.getElementById('avgBillValue');
            const changeEl = document.getElementById('avgBillChange');
            const barEl = document.getElementById('avgBillBar');
            
            if (avgBillEl) avgBillEl.textContent = this.app.formatCurrency(todayValue);
            if (changeEl) {
                changeEl.textContent = `${changeIcon} ${Math.abs(changePercent)}%`;
                changeEl.className = `performance-change ${changeClass}`;
            }
            if (barEl) {
                const percentage = Math.min(Math.abs(changePercent), 100);
                barEl.style.width = `${percentage}%`;
                barEl.className = `performance-bar-fill ${changeClass}`;
            }
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
            const response = await this.app.api.get('/sales/?limit=10');
            const tbody = document.getElementById('recentSalesBody');

            if (!tbody) return;

            let salesList = [];
            if (response && response.success) {
                salesList = response.sales || response.data || [];
            } else {
                console.warn('Recent Sales API returned no data or error:', response);
                salesList = [];
            }

            if (salesList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center">No sales today</td></tr>';
                return;
            }

            // Clear existing content
            tbody.innerHTML = '';
            
            salesList.forEach(sale => {
                // Handle both object and array formats
                let invoiceNumber, customerName, totalItems, grandTotal, createdAt, paymentStatus;
                
                if (typeof sale === 'object' && sale !== null) {
                    // Object format
                    invoiceNumber = sale.invoice_number || sale.invoice_no || sale.id || 'N/A';
                    customerName = sale.customer_name || (sale.customer && sale.customer.name) || 'Walk-in';
                    totalItems = sale.total_items || sale.item_count || sale.items_count || '-';
                    grandTotal = sale.grand_total || sale.total_amount || 0;
                    createdAt = sale.created_at || sale.sale_date || new Date().toISOString();
                    paymentStatus = sale.payment_status || 'completed';
                } else if (Array.isArray(sale)) {
                    // Array format - use indices
                    invoiceNumber = sale[1] || sale[0] || 'N/A';
                    customerName = sale[4] || 'Walk-in';
                    totalItems = sale[11] || sale[5] || '-';
                    grandTotal = sale[22] || sale[2] || 0;
                    createdAt = sale[37] || sale[2] || new Date().toISOString();
                    paymentStatus = sale[28] || sale[26] || 'completed';
                } else {
                    // Fallback
                    invoiceNumber = 'N/A';
                    customerName = 'Walk-in';
                    totalItems = '-';
                    grandTotal = 0;
                    createdAt = new Date().toISOString();
                    paymentStatus = 'completed';
                }
                
                // Create row element safely
                const row = document.createElement('tr');
                
                const cells = [
                    invoiceNumber || 'N/A',
                    customerName || 'Walk-in',
                    totalItems || '-',
                    this.app.formatCurrency(parseFloat(grandTotal) || 0),
                    new Date(createdAt).toLocaleTimeString(),
                    paymentStatus
                ];
                
                cells.forEach((cellData, index) => {
                    const cell = document.createElement('td');
                    if (index === 5) { // payment status cell
                        const span = document.createElement('span');
                        span.className = `status-badge ${paymentStatus}`;
                        span.textContent = cellData;
                        cell.appendChild(span);
                    } else {
                        cell.textContent = cellData;
                    }
                    row.appendChild(cell);
                });
                
                tbody.appendChild(row);
            });
        } catch (error) {
            console.error('Error loading recent sales:', error);
            const tbody = document.getElementById('recentSalesBody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center error">Error loading sales</td></tr>';
            }
        }
    }

    async loadLowStockItems() {
        try {
            const response = await this.app.api.get('/products');
            const tbody = document.getElementById('lowStockBody');

            if (!tbody) return;

            let allProducts = [];
            if (response && response.success) {
                allProducts = response.products || response.data || [];
            } else {
                console.warn('Low Stock Products API returned no data or error:', response);
                allProducts = [];
            }

            // Filter for low stock items
            const lowStockProducts = allProducts.filter(product => {
                // Handle both object and array formats
                let currentStock, minStock;
                if (typeof product === 'object' && product !== null) {
                    // Object format
                    currentStock = product.current_stock || product.stock || 0;
                    minStock = product.min_stock || 10;
                } else if (Array.isArray(product)) {
                    // Array format - use indices
                    currentStock = product[13] || 0; // current_stock
                    minStock = product[14] || 10; // min_stock
                } else {
                    currentStock = 0;
                    minStock = 10;
                }
                return parseInt(currentStock) < parseInt(minStock);
            }).slice(0, 10);

            if (lowStockProducts.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center">All items in stock</td></tr>';
                return;
            }

            // Clear existing content
            tbody.innerHTML = '';
            
            lowStockProducts.forEach(product => {
                // Handle both object and array formats
                let productCode, productName, currentStock, minStock;
                
                if (typeof product === 'object' && product !== null) {
                    // Object format
                    productCode = product.product_code || product.code || 'N/A';
                    productName = product.name || 'Unknown';
                    currentStock = product.current_stock || product.stock || 0;
                    minStock = product.min_stock || 10;
                } else if (Array.isArray(product)) {
                    // Array format - use indices
                    productCode = product[2] || product[0] || 'N/A'; // product_code or id
                    productName = product[3] || product[1] || 'Unknown'; // name
                    currentStock = product[13] || 0; // current_stock
                    minStock = product[14] || 10; // min_stock
                } else {
                    productCode = 'N/A';
                    productName = 'Unknown';
                    currentStock = 0;
                    minStock = 10;
                }
                
                // Create row element safely
                const row = document.createElement('tr');
                
                const cells = [
                    productCode || 'N/A',
                    productName || 'Unknown',
                    currentStock || 0,
                    minStock || 10,
                    'Low Stock', // status
                    '' // button cell
                ];
                
                cells.forEach((cellData, index) => {
                    const cell = document.createElement('td');
                    if (index === 4) { // status cell
                        const span = document.createElement('span');
                        span.className = 'status-badge danger';
                        span.textContent = cellData;
                        cell.appendChild(span);
                    } else if (index === 5) { // button cell
                        const button = document.createElement('button');
                        button.className = 'btn btn-small btn-primary btn-restock-item';
                        button.textContent = 'Restock';
                        button.addEventListener('click', () => {
                            this.app.loadScreen('inventory');
                        });
                        cell.appendChild(button);
                    } else {
                        cell.textContent = cellData;
                    }
                    row.appendChild(cell);
                });
                
                tbody.appendChild(row);
            });
        } catch (error) {
            console.error('Error loading low stock items:', error);
            const tbody = document.getElementById('lowStockBody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center error">Error loading products</td></tr>';
            }
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

    async updateSalesChart(period) {
        const canvas = document.getElementById('salesTrendChart');
        if (!canvas) return;

        try {
            let startDate;
            const endDate = new Date();
            
            if (period === 'week') {
                // Last 7 days
                startDate = new Date(endDate);
                startDate.setDate(startDate.getDate() - 6); // 6 days back to make 7 days total
            } else if (period === 'month') {
                // Last 30 days
                startDate = new Date(endDate);
                startDate.setDate(startDate.getDate() - 29); // 29 days back to make 30 days total
            }
            
            // Format dates as YYYY-MM-DD
            const startDateStr = startDate.toISOString().split('T')[0];
            const endDateStr = endDate.toISOString().split('T')[0];
            
            const data = await this.app.api.get(`/reports/sales-summary?start_date=${startDateStr}&end_date=${endDateStr}`);

            const labels = [];
            const values = [];
            
            // Generate date range based on selected period
            const dateRange = [];
            const currentDate = new Date(startDate);
            
            if (period === 'week') {
                // For week, add 7 days
                for (let i = 0; i < 7; i++) {
                    dateRange.push(new Date(currentDate));
                    currentDate.setDate(currentDate.getDate() + 1);
                }
            } else if (period === 'month') {
                // For month, add 30 days (or sample every 3-4 days to avoid overcrowding)
                for (let i = 0; i < 30; i++) {
                    dateRange.push(new Date(currentDate));
                    currentDate.setDate(currentDate.getDate() + 1);
                }
            }

            dateRange.forEach(date => {
                const dateStr = date.toISOString().split('T')[0];
                labels.push(date.toLocaleDateString('en-US', period === 'week' ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' }));
                
                const dayData = (data.daily_sales || []).find(d => {
                    return (d.date === dateStr || d.date?.substring(0, 10) === dateStr);
                });
                values.push(dayData ? dayData.revenue : 0);
            });

            // Update the chart
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
                options: { 
                    responsive: true, 
                    plugins: { 
                        legend: { display: false } 
                    },
                    scales: {
                        x: {
                            ticks: {
                                maxRotation: 45,
                                minRotation: 45
                            }
                        }
                    }
                }
            });
        } catch (e) {
            console.error('Update sales chart error:', e);
        }
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
            if (data && data.top_products) {
                items = data.top_products;
            }
            
            const labels = items.map(p => p.name || 'Unknown');
            const values = items.map(p => p.quantity_sold || 0);

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
            
            const data = await this.app.api.get('/reports/sales-by-category');

            let labels = [];
            let values = [];
            
            if (data && data.category_sales) {
                const categories = data.category_sales.slice(0, 5); // Top 5 categories
                labels = categories.map(cat => cat.category || 'Unknown');
                values = categories.map(cat => cat.revenue || 0);
            }

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
        } catch (e) { console.error('Category chart error:', e); }
    }

    async initPaymentMethodChart() {
        try {
            const canvas = document.getElementById('paymentMethodChart');
            if (!canvas) return;
            
            const data = await this.app.api.get('/reports/payment-methods');

            let labels = [];
            let values = [];
            
            if (data && data.payment_methods) {
                data.payment_methods.forEach(pm => {
                    labels.push(pm.method || 'Unknown');
                    values.push(pm.total_amount || 0);
                });
            }

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
        } catch (e) { console.error('Payment method chart error:', e); }
    }
}

window.DashboardScreen = DashboardScreen;

