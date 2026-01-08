class ReportsScreen {
    constructor(app) {
        this.app = app;
        this.currentTab = 'sales';
    }

    init() {
        this.showTab('sales');
    }

    refresh() {
        this.showTab(this.currentTab || 'sales');
    }

    showTab(tab) {
        this.currentTab = tab;
        const content = document.getElementById('reports-content');

        switch (tab) {
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

    async loadSalesReport(startDate = null, endDate = null) {
        try {
            let url = '/reports/sales-summary';
            const params = new URLSearchParams();
            if (startDate) params.append('start_date', startDate);
            if (endDate) params.append('end_date', endDate);
            if (params.toString()) url += '?' + params.toString();
            
            const res = await this.app.api.get(url);
            
            let m = {};
            if (res && res.metrics) {
                m = res.metrics;
            } else {
                // Handle direct response format
                m = res;
            }
            
            document.getElementById('reports-content').innerHTML = `
                <div class="report-header">
                    <div class="report-filters">
                        <input type="date" id="sales-start-date" placeholder="Start Date">
                        <input type="date" id="sales-end-date" placeholder="End Date">
                        <button class="btn btn-primary" onclick="window.app.screens.reports.filterSalesReport()">Filter</button>
                        <button class="btn btn-success" onclick="window.app.screens.reports.exportSalesReport()">Export PDF</button>
                    </div>
                </div>
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
            
            // Set date values if provided
            if (startDate) document.getElementById('sales-start-date').value = startDate;
            if (endDate) document.getElementById('sales-end-date').value = endDate;
        } catch (e) {
            console.error('Failed to load sales report:', e);
            document.getElementById('reports-content').innerHTML = `<div class="error-message">Failed to load sales report: ${e.message || e}</div>`;
        }
    }

    async loadInventoryReport(startDate = null, endDate = null) {
        try {
            const res = await this.app.api.get('/reports/inventory-valuation');
            
            let data = {};
            if (res && res.data) {
                data = res.data;
            } else {
                data = res;
            }
            
            document.getElementById('reports-content').innerHTML = `
                <div class="report-header">
                    <div class="report-filters">
                        <input type="date" id="inventory-start-date" placeholder="Start Date">
                        <input type="date" id="inventory-end-date" placeholder="End Date">
                        <button class="btn btn-primary" onclick="window.app.screens.reports.filterInventoryReport()">Filter</button>
                        <button class="btn btn-success" onclick="window.app.screens.reports.exportInventoryReport()">Export PDF</button>
                    </div>
                </div>
                <div class="report-metrics">
                    <div class="metric-card">
                        <h3>Total Stock Value</h3>
                        <p>PKR ${(data.total_inventory_value || 0).toLocaleString()}</p>
                    </div>
                    <div class="metric-card">
                        <h3>Total Units</h3>
                        <p>${data.total_units || 0}</p>
                    </div>
                </div>
            `;
            
            // Set date values if provided
            if (startDate) document.getElementById('inventory-start-date').value = startDate;
            if (endDate) document.getElementById('inventory-end-date').value = endDate;
        } catch (e) {
            console.error('Failed to load inventory report:', e);
            document.getElementById('reports-content').innerHTML = `<div class="error-message">Failed to load inventory report: ${e.message || e}</div>`;
        }
    }

    async loadGSTReport(startDate = null, endDate = null) {
        try {
            let url = '/reports/gst-report';
            const params = new URLSearchParams();
            if (startDate) params.append('start_date', startDate);
            if (endDate) params.append('end_date', endDate);
            if (params.toString()) url += '?' + params.toString();
            
            const res = await this.app.api.get(url);
            
            let data = {};
            if (res && res.data) {
                data = res.data;
            } else {
                data = res;
            }
            
            document.getElementById('reports-content').innerHTML = `
                <div class="report-header">
                    <div class="report-filters">
                        <input type="date" id="gst-start-date" placeholder="Start Date">
                        <input type="date" id="gst-end-date" placeholder="End Date">
                        <button class="btn btn-primary" onclick="window.app.screens.reports.filterGSTReport()">Filter</button>
                        <button class="btn btn-success" onclick="window.app.screens.reports.exportGSTReport()">Export PDF</button>
                    </div>
                </div>
                <div class="report-metrics">
                    <div class="metric-card">
                        <h3>Total GST</h3>
                        <p>PKR ${(data.total_gst || 0).toLocaleString()}</p>
                    </div>
                </div>
            `;
            
            // Set date values if provided
            if (startDate) document.getElementById('gst-start-date').value = startDate;
            if (endDate) document.getElementById('gst-end-date').value = endDate;
        } catch (e) {
            console.error('Failed to load GST report:', e);
            document.getElementById('reports-content').innerHTML = `<div class="error-message">Failed to load GST report: ${e.message || e}</div>`;
        }
    }

    async loadProfitLossReport(startDate = null, endDate = null) {
        try {
            let url = '/reports/profit-loss';
            const params = new URLSearchParams();
            if (startDate) params.append('start_date', startDate);
            if (endDate) params.append('end_date', endDate);
            if (params.toString()) url += '?' + params.toString();
            
            const res = await this.app.api.get(url);
            
            let data = {};
            if (res && res.data) {
                data = res.data;
            } else {
                data = res;
            }
            
            document.getElementById('reports-content').innerHTML = `
                <div class="report-header">
                    <div class="report-filters">
                        <input type="date" id="pl-start-date" placeholder="Start Date">
                        <input type="date" id="pl-end-date" placeholder="End Date">
                        <button class="btn btn-primary" onclick="window.app.screens.reports.filterProfitLossReport()">Filter</button>
                        <button class="btn btn-success" onclick="window.app.screens.reports.exportProfitLossReport()">Export PDF</button>
                    </div>
                </div>
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
            
            // Set date values if provided
            if (startDate) document.getElementById('pl-start-date').value = startDate;
            if (endDate) document.getElementById('pl-end-date').value = endDate;
        } catch (e) {
            console.error('Failed to load profit/loss report:', e);
            document.getElementById('reports-content').innerHTML = `<div class="error-message">Failed to load profit/loss report: ${e.message || e}</div>`;
        }
    }
    // Filter methods
    filterSalesReport() {
        const startDate = document.getElementById('sales-start-date').value;
        const endDate = document.getElementById('sales-end-date').value;
        this.loadSalesReport(startDate, endDate);
    }
    
    filterInventoryReport() {
        const startDate = document.getElementById('inventory-start-date').value;
        const endDate = document.getElementById('inventory-end-date').value;
        this.loadInventoryReport(startDate, endDate);
    }
    
    filterGSTReport() {
        const startDate = document.getElementById('gst-start-date').value;
        const endDate = document.getElementById('gst-end-date').value;
        this.loadGSTReport(startDate, endDate);
    }
    
    filterProfitLossReport() {
        const startDate = document.getElementById('pl-start-date').value;
        const endDate = document.getElementById('pl-end-date').value;
        this.loadProfitLossReport(startDate, endDate);
    }
    
    // Export methods (placeholder - would use jsPDF or similar)
    exportSalesReport() {
        this.app.showNotification('Exporting Sales Report...', 'info');
        // In a real implementation, this would generate a PDF using jsPDF
        this.generatePDFReport('Sales Report', this.getSalesReportData());
    }
    
    exportInventoryReport() {
        this.app.showNotification('Exporting Inventory Report...', 'info');
        this.generatePDFReport('Inventory Report', this.getInventoryReportData());
    }
    
    exportGSTReport() {
        this.app.showNotification('Exporting GST Report...', 'info');
        this.generatePDFReport('GST Report', this.getGSTReportData());
    }
    
    exportProfitLossReport() {
        this.app.showNotification('Exporting Profit & Loss Report...', 'info');
        this.generatePDFReport('Profit & Loss Report', this.getProfitLossReportData());
    }
    
    // Helper methods to get report data
    getSalesReportData() {
        // In a real implementation, this would fetch the actual report data
        return 'Sales Report Data';
    }
    
    getInventoryReportData() {
        return 'Inventory Report Data';
    }
    
    getGSTReportData() {
        return 'GST Report Data';
    }
    
    getProfitLossReportData() {
        return 'Profit & Loss Report Data';
    }
    
    // PDF generation method (placeholder)
    generatePDFReport(title, data) {
        // This is a placeholder implementation
        // In a real implementation, you would use a library like jsPDF
        const reportWindow = window.open('', '_blank');
        reportWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${title}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    .header { text-align: center; margin-bottom: 20px; }
                    .content { white-space: pre-line; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>${title}</h1>
                    <p>Generated on: ${new Date().toLocaleString()}</p>
                </div>
                <div class="content">
                    ${data}
                </div>
            </body>
            </html>
        `);
        reportWindow.document.close();
        reportWindow.focus();
        reportWindow.print();
    }
}

window.ReportsScreen = ReportsScreen;
