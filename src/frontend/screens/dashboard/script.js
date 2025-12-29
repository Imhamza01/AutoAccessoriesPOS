// src/frontend/screens/dashboard/script.js
let dashboardCharts = {};
let dashboardData = {
    todaySales: 0,
    todayProfit: 0,
    totalProducts: 0,
    lowStockCount: 0,
    todayCustomers: 0,
    pendingCredit: 0
};

// Initialize dashboard when screen loads
function initDashboard() {
    console.log('Initializing Dashboard');
    refreshDashboard();
    
    // Update date
    const dateEl = document.getElementById('dashboardDate');
    if (dateEl) {
        const today = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateEl.textContent = today.toLocaleDateString('en-US', options);
    }
    
    // Set user info
    if (window.app && window.app.currentUser) {
        const userEl = document.getElementById('loggedInUser');
        if (userEl) {
            userEl.textContent = window.app.currentUser.full_name || 'User';
        }
    }
    
    // Auto-refresh every 5 minutes
    setInterval(refreshDashboard, 5 * 60 * 1000);
}

async function refreshDashboard() {
    console.log('Refreshing dashboard...');
    try {
        // Load all dashboard data in parallel
        await Promise.all([
            loadDashboardStats(),
            loadRecentSales(),
            loadLowStockItems(),
            initializeCharts()
        ]);
        
        // Update last updated time
        const timeEl = document.getElementById('lastUpdatedTime');
        if (timeEl) {
            const now = new Date();
            timeEl.textContent = now.toLocaleTimeString();
        }
    } catch (error) {
        console.error('Error refreshing dashboard:', error);
    }
}

async function loadDashboardStats() {
    try {
        // Fetch today's sales
        const today = new Date().toISOString().split('T')[0];
        const salesResponse = await fetch(`/api/sales?date=${today}`);
        const sales = await salesResponse.json();
        
        // Calculate totals
        let todaySales = 0;
        let todayCustomers = new Set();
        
        if (sales && sales.data) {
            sales.data.forEach(sale => {
                todaySales += sale.total_amount || 0;
                if (sale.customer_id) todayCustomers.add(sale.customer_id);
            });
        }
        
        dashboardData.todaySales = todaySales;
        dashboardData.todayCustomers = todayCustomers.size;
        
        // Update stat cards
        updateStatCard('todaySales', `₹${todaySales.toFixed(2)}`);
        updateStatCard('todayCustomers', todayCustomers.size.toString());
        
        // Fetch products data
        const productsResponse = await fetch('/api/products');
        const products = await productsResponse.json();
        
        let totalProducts = 0;
        let lowStockCount = 0;
        let totalValue = 0;
        
        if (products && products.data) {
            totalProducts = products.data.length;
            
            products.data.forEach(product => {
                if (product.stock < (product.min_stock || 10)) {
                    lowStockCount++;
                }
                totalValue += (product.stock * (product.selling_price || 0));
            });
        }
        
        dashboardData.totalProducts = totalProducts;
        dashboardData.lowStockCount = lowStockCount;
        
        updateStatCard('totalProducts', totalProducts.toString());
        updateStatCard('lowStockCount', lowStockCount.toString());
        
        // Calculate profit (simplified: assuming 30% margin)
        dashboardData.todayProfit = todaySales * 0.30;
        updateStatCard('todayProfit', `₹${dashboardData.todayProfit.toFixed(2)}`);
        
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

function updateStatCard(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = value;
    }
}

async function loadRecentSales() {
    try {
        const response = await fetch('/api/sales?limit=10');
        const data = await response.json();
        const tbody = document.getElementById('recentSalesBody');
        
        if (!tbody) return;
        
        if (!data.data || data.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No sales today</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.data.map(sale => `
            <tr>
                <td>${sale.invoice_no || 'N/A'}</td>
                <td>${sale.customer_name || 'Walk-in'}</td>
                <td>${sale.item_count || 0}</td>
                <td>₹${(sale.total_amount || 0).toFixed(2)}</td>
                <td>${new Date(sale.sale_date).toLocaleTimeString()}</td>
                <td><span class="status-badge ${sale.payment_status || 'pending'}">${sale.payment_status || 'Pending'}</span></td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading recent sales:', error);
    }
}

async function loadLowStockItems() {
    try {
        const response = await fetch('/api/products?low_stock=true');
        const data = await response.json();
        const tbody = document.getElementById('lowStockBody');
        
        if (!tbody) return;
        
        if (!data.data || data.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">All items in stock</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.data.slice(0, 10).map(product => `
            <tr>
                <td>${product.code || 'N/A'}</td>
                <td>${product.name || 'Unknown'}</td>
                <td>${product.stock || 0}</td>
                <td>${product.min_stock || 10}</td>
                <td><span class="status-badge danger">Low Stock</span></td>
                <td><button class="btn btn-small btn-primary" onclick="loadScreen('inventory')">Restock</button></td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading low stock items:', error);
    }
}

async function initializeCharts() {
    try {
        // Initialize Chart.js if available
        if (typeof Chart === 'undefined') {
            console.log('Chart.js not loaded, skipping chart initialization');
            return;
        }
        
        await Promise.all([
            initSalesTrendChart(),
            initTopProductsChart(),
            initCategoryChart(),
            initPaymentMethodChart()
        ]);
    } catch (error) {
        console.error('Error initializing charts:', error);
    }
}

async function initSalesTrendChart() {
    try {
        const canvas = document.getElementById('salesTrendChart');
        if (!canvas) return;
        
        // Get last 7 days sales
        const response = await fetch('/api/reports/daily-sales?days=7');
        const data = await response.json();
        
        const labels = [];
        const values = [];
        const today = new Date();
        
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            
            const dayData = data.data?.find(d => d.date === date.toISOString().split('T')[0]);
            values.push(dayData?.total || 0);
        }
        
        if (dashboardCharts.salesTrend) {
            dashboardCharts.salesTrend.destroy();
        }
        
        const ctx = canvas.getContext('2d');
        dashboardCharts.salesTrend = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Sales',
                    data: values,
                    borderColor: '#27ae60',
                    backgroundColor: 'rgba(39, 174, 96, 0.1)',
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#27ae60',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: value => '₹' + value.toFixed(0) } }
                }
            }
        });
    } catch (error) {
        console.error('Error initializing sales trend chart:', error);
    }
}

async function initTopProductsChart() {
    try {
        const canvas = document.getElementById('topProductsChart');
        if (!canvas) return;
        
        const response = await fetch('/api/reports/top-products?limit=5');
        const data = await response.json();
        
        const labels = data.data?.map(p => p.product_name || 'Unknown') || [];
        const values = data.data?.map(p => p.quantity_sold || 0) || [];
        
        if (dashboardCharts.topProducts) {
            dashboardCharts.topProducts.destroy();
        }
        
        const ctx = canvas.getContext('2d');
        dashboardCharts.topProducts = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Quantity Sold',
                    data: values,
                    backgroundColor: ['#3b82f6', '#27ae60', '#f59e0b', '#ef4444', '#8b5cf6'],
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        });
    } catch (error) {
        console.error('Error initializing top products chart:', error);
    }
}

async function initCategoryChart() {
    try {
        const canvas = document.getElementById('categoryChart');
        if (!canvas) return;
        
        const response = await fetch('/api/reports/sales-by-category');
        const data = await response.json();
        
        const labels = data.data?.map(c => c.category_name || 'Unknown') || [];
        const values = data.data?.map(c => c.total_amount || 0) || [];
        
        if (dashboardCharts.category) {
            dashboardCharts.category.destroy();
        }
        
        const ctx = canvas.getContext('2d');
        dashboardCharts.category = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: ['#27ae60', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'],
                    borderColor: '#fff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: { callbacks: { label: ctx => '₹' + ctx.parsed } }
                }
            }
        });
    } catch (error) {
        console.error('Error initializing category chart:', error);
    }
}

async function initPaymentMethodChart() {
    try {
        const canvas = document.getElementById('paymentMethodChart');
        if (!canvas) return;
        
        const response = await fetch('/api/reports/payment-methods');
        const data = await response.json();
        
        const labels = data.data?.map(p => p.method_name || 'Unknown') || ['Cash', 'Card', 'Credit', 'Check'];
        const values = data.data?.map(p => p.count || 0) || [0, 0, 0, 0];
        
        if (dashboardCharts.paymentMethod) {
            dashboardCharts.paymentMethod.destroy();
        }
        
        const ctx = canvas.getContext('2d');
        dashboardCharts.paymentMethod = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: ['#27ae60', '#3b82f6', '#f59e0b', '#ef4444'],
                    borderColor: '#fff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { position: 'right' } }
            }
        });
    } catch (error) {
        console.error('Error initializing payment method chart:', error);
    }
}

function updateSalesChart(period) {
    // Update chart data based on period (week/month)
    console.log('Updating sales chart for period:', period);
    initSalesTrendChart();
}

function showDailySummary() {
    showNotification('info', 'Daily Summary', 'Generating daily summary...');
    loadScreen('reports');
}

function showExpenseModal() {
    showNotification('info', 'Add Expense', 'Opening expense form...');
    loadScreen('expenses');
}

function makeBackup() {
    showNotification('info', 'Backup', 'Creating backup...');
    
    fetch('/api/backup', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
            showNotification('success', 'Backup Complete', 'Database backup created successfully');
        })
        .catch(err => {
            console.error('Backup error:', err);
            showNotification('error', 'Backup Error', 'Failed to create backup');
        });
}

// Helper functions
function loadScreen(screenName) {
    if (window.app && window.app.loadScreen) {
        window.app.loadScreen(screenName);
    }
}

function showNotification(type, title, message) {
    if (window.app && window.app.showNotification) {
        window.app.showNotification(message, type);
    } else {
        console.log(`${title}: ${message}`);
        alert(`${title}\n${message}`);
    }
}