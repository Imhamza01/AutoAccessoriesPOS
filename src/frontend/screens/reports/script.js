class ReportsScreen {
    constructor(app) {
        this.app = app;
        this.currentTab = 'sales';
    }

    init() {
        this.showTab('sales');
    }

    showTab(tab) {
        this.currentTab = tab;
        const content = document.getElementById('reports-content');
        
        switch(tab) {
            case 'sales':
                this.loadSalesReport();
                break;
            case 'inventory':
                this.loadInventoryReport();
                break;
            case 'gst':
                this.loadGSTReport();
                break;
            case 'profit-loss':
                this.loadProfitLossReport();
                break;
        }
    }

    async loadSalesReport() {
        try {
            const res = await this.app.api.get('/reports/sales-summary');
            const m = res.metrics;
            document.getElementById('reports-content').innerHTML = `
                <div class="report-metrics">
                    <div class="metric-card">
                        <h3>Total Revenue</h3>
                        <p>PKR ${(m.total_revenue || 0).toLocaleString()}</p>
                    </div>
                    <div class="metric-card">
                        <h3>Transactions</h3>
                        <p>${m.total_transactions || 0}</p>
                    </div>
                    <div class="metric-card">
                        <h3>GST Collected</h3>
                        <p>PKR ${(m.total_gst || 0).toLocaleString()}</p>
                    </div>
                </div>
            `;
        } catch (e) {
            console.error('Failed to load sales report:', e);
        }
    }

    async loadInventoryReport() {
        const res = await this.app.api.get('/reports/inventory-valuation');
        document.getElementById('reports-content').innerHTML = `
            <div class="report-metrics">
                <div class="metric-card">
                    <h3>Total Stock Value</h3>
                    <p>PKR ${(res.total_inventory_value || 0).toLocaleString()}</p>
                </div>
                <div class="metric-card">
                    <h3>Total Units</h3>
                    <p>${res.total_units || 0}</p>
                </div>
            </div>
        `;
    }

    async loadGSTReport() {
        const res = await this.app.api.get('/reports/gst-report');
        document.getElementById('reports-content').innerHTML = `
            <div class="report-metrics">
                <div class="metric-card">
                    <h3>Total GST</h3>
                    <p>PKR ${(res.total_gst || 0).toLocaleString()}</p>
                </div>
            </div>
        `;
    }

    async loadProfitLossReport() {
        const res = await this.app.api.get('/reports/profit-loss');
        const data = res;
        document.getElementById('reports-content').innerHTML = `
            <div class="report-metrics">
                <div class="metric-card">
                    <h3>Revenue</h3>
                    <p>PKR ${(data.revenue || 0).toLocaleString()}</p>
                </div>
                <div class="metric-card">
                    <h3>Expenses</h3>
                    <p>PKR ${(data.expenses || 0).toLocaleString()}</p>
                </div>
                <div class="metric-card success">
                    <h3>Profit</h3>
                    <p>PKR ${(data.profit || 0).toLocaleString()}</p>
                </div>
                <div class="metric-card">
                    <h3>Margin</h3>
                    <p>${(data.profit_margin_percent || 0).toFixed(2)}%</p>
                </div>
            </div>
        `;
    }
}
