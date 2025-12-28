// src/frontend/screens/dashboard/script.js
/**
 * DASHBOARD SCREEN
 */

class DashboardScreen {
    constructor(app) {
        this.app = app;
        this.api = app.api;
        this.stats = {};
    }

    init() {
        console.log('Initializing Dashboard');
        this.loadDashboardData();
        this.setupEventListeners();
    }

    refresh() {
        this.loadDashboardData();
    }

    setupEventListeners() {
        // Refresh button
        const refreshBtn = document.getElementById('refresh-dashboard');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadDashboardData());
        }
        
        // Quick action buttons
        document.addEventListener('click', (e) => {
            const quickAction = e.target.closest('.quick-action');
            if (quickAction) {
                const action = quickAction.dataset.action;
                this.handleQuickAction(action);
            }
        });
    }

    async loadDashboardData() {
        this.app.showLoading('Loading dashboard...');
        
        try {
            // In a real app, these would come from API endpoints
            // For now, using mock data
            
            // Today's sales
            const todaySales = {
                total: 125000,
                count: 42,
                average: 2976,
                change: '+12.5%'
            };
            
            // Current stock status
            const stockStatus = {
                total_products: 456,
                low_stock: 23,
                out_of_stock: 8,
                value: 2450000
            };
            
            // Recent activities
            const recentActivities = [
                { type: 'sale', description: 'Sale #INV-00123 completed', time: '2 minutes ago', amount: 12500 },
                { type: 'purchase', description: 'Stock received from supplier', time: '1 hour ago', amount: 45000 },
                { type: 'customer', description: 'New customer registered', time: '3 hours ago' },
                { type: 'expense', description: 'Shop rent paid', time: '1 day ago', amount: 30000 },
                { type: 'sale', description: 'Credit sale to regular customer', time: '1 day ago', amount: 18500 },
            ];
            
            // Top selling products
            const topProducts = [
                { name: 'Engine Oil 5W-30', sales: 45, revenue: 67500 },
                { name: 'Brake Pads Set', sales: 32, revenue: 48000 },
                { name: 'Car Battery 60Ah', sales: 28, revenue: 112000 },
                { name: 'Air Filter', sales: 25, revenue: 12500 },
                { name: 'Spark Plugs (4)', sales: 22, revenue: 8800 },
            ];
            
            this.renderDashboard(todaySales, stockStatus, recentActivities, topProducts);
            
        } catch (error) {
            console.error('Dashboard load error:', error);
            this.app.showNotification('Failed to load dashboard data', 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    renderDashboard(todaySales, stockStatus, recentActivities, topProducts) {
        // Update stats cards
        this.updateStatCard('today-sales', todaySales.total, 'Today\'s Sales', todaySales.change, '💰');
        this.updateStatCard('total-products', stockStatus.total_products, 'Total Products', null, '📦');
        this.updateStatCard('low-stock', stockStatus.low_stock, 'Low Stock Items', 'Needs attention', '⚠️');
        this.updateStatCard('today-customers', todaySales.count, 'Today\'s Customers', null, '👥');
        
        // Render recent activities
        const activitiesContainer = document.getElementById('recent-activities');
        if (activitiesContainer) {
            activitiesContainer.innerHTML = recentActivities.map(activity => `
                <div class="activity-item ${activity.type}">
                    <div class="activity-icon">
                        ${this.getActivityIcon(activity.type)}
                    </div>
                    <div class="activity-details">
                        <div class="activity-desc">${activity.description}</div>
                        <div class="activity-time">${activity.time}</div>
                    </div>
                    ${activity.amount ? `
                        <div class="activity-amount ${activity.type === 'expense' ? 'text-danger' : 'text-success'}">
                            ${this.app.formatCurrency(activity.amount)}
                        </div>
                    ` : ''}
                </div>
            `).join('');
        }
        
        // Render top products
        const productsContainer = document.getElementById('top-products');
        if (productsContainer) {
            productsContainer.innerHTML = topProducts.map(product => `
                <div class="product-item">
                    <div class="product-info">
                        <div class="product-name">${product.name}</div>
                        <div class="product-sales">${product.sales} sales</div>
                    </div>
                    <div class="product-revenue text-success">
                        ${this.app.formatCurrency(product.revenue)}
                    </div>
                </div>
            `).join('');
        }
        
        // Update footer message
        const footerMessage = document.getElementById('footer-message');
        if (footerMessage) {
            const now = new Date();
            const hours = now.getHours();
            let greeting;
            
            if (hours < 12) greeting = 'Good morning';
            else if (hours < 17) greeting = 'Good afternoon';
            else greeting = 'Good evening';
            
            footerMessage.textContent = `${greeting}, ${this.app.currentUser?.full_name || 'User'}! Ready for business?`;
        }
    }

    updateStatCard(elementId, value, label, trend, icon) {
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = `
                <div class="stat-icon">${icon}</div>
                <div class="stat-content">
                    <div class="stat-label">${label}</div>
                    <div class="stat-value">${typeof value === 'number' ? this.app.formatCurrency(value) : value}</div>
                    ${trend ? `<div class="stat-trend">${trend}</div>` : ''}
                </div>
            `;
        }
    }

    getActivityIcon(type) {
        const icons = {
            'sale': '💰',
            'purchase': '📦',
            'customer': '👥',
            'expense': '💸',
            'stock': '📊',
            'system': '⚙️'
        };
        return icons[type] || '📝';
    }

    handleQuickAction(action) {
        switch(action) {
            case 'new-sale':
                this.app.loadScreen('pos');
                break;
            case 'add-product':
                this.app.showNotification('Product management would open here', 'info');
                break;
            case 'add-customer':
                this.app.showNotification('Customer management would open here', 'info');
                break;
            case 'quick-report':
                this.app.showNotification('Quick report generation', 'info');
                break;
        }
    }
}

// Register screen with main app
if (window.POS) {
    window.POS.screens.dashboard = DashboardScreen;
}