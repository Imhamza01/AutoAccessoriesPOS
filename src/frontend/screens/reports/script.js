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
        (async () => {
            this.app.showNotification('Exporting Sales Report...', 'info');
            const startDate = document.getElementById('sales-start-date')?.value || null;
            const endDate = document.getElementById('sales-end-date')?.value || null;
            const params = new URLSearchParams();
            if (startDate) params.append('start_date', startDate);
            if (endDate) params.append('end_date', endDate);

            // Try server-side PDF first
            try {
                const res = await this.app.api.download('/reports/sales-pdf' + (params.toString() ? ('?' + params.toString()) : ''), `sales_report_${startDate||'all'}_${endDate||''}.pdf`);
                if (res && res.success) return; // downloaded successfully
            } catch (e) {
                console.warn('Server-side sales PDF failed, falling back to client:', e);
            }

            // Fallback: build client-side professional PDF
            try {
                // Fetch summary metrics
                const summaryRes = await this.app.api.get('/reports/sales-summary' + (params.toString() ? ('?' + params.toString()) : ''));
                const summary = summaryRes && summaryRes.metrics ? summaryRes.metrics : (summaryRes || {});

                // Fetch detailed sales (large limit to cover range)
                const salesRes = await this.app.api.get('/sales?' + new URLSearchParams({ skip: '0', limit: '10000', ...(startDate ? { start_date: startDate } : {}), ...(endDate ? { end_date: endDate } : {}) }).toString());
                const sales = (salesRes && salesRes.sales) ? salesRes.sales : (salesRes || []);

                await this.loadPdfLibraries();
                this.generateProfessionalPDFReport('Sales Report', { startDate, endDate, summary, sales });
            } catch (e) {
                console.error('Failed to export sales report (client):', e);
                this.generatePDFReport('Sales Report', this.getSalesReportData());
            }
        })();
    }
    
    exportInventoryReport() {
        (async () => {
            this.app.showNotification('Exporting Inventory Report...', 'info');
            try {
                const res = await this.app.api.download('/reports/inventory-pdf', 'inventory_valuation.pdf');
                if (!res.success) {
                    // fallback to client-side
                    this.generatePDFReport('Inventory Report', this.getInventoryReportData());
                }
            } catch (e) {
                console.error('Inventory PDF export failed:', e);
                this.generatePDFReport('Inventory Report', this.getInventoryReportData());
            }
        })();
    }
    
    exportGSTReport() {
        (async () => {
            this.app.showNotification('Exporting GST Report...', 'info');
            const startDate = document.getElementById('gst-start-date')?.value || null;
            const endDate = document.getElementById('gst-end-date')?.value || null;
            try {
                const params = new URLSearchParams();
                if (startDate) params.append('start_date', startDate);
                if (endDate) params.append('end_date', endDate);
                const res = await this.app.api.download('/reports/gst-pdf?' + params.toString(), 'gst_report.pdf');
                if (!res.success) this.generatePDFReport('GST Report', this.getGSTReportData());
            } catch (e) {
                console.error('GST PDF export failed:', e);
                this.generatePDFReport('GST Report', this.getGSTReportData());
            }
        })();
    }
    
    exportProfitLossReport() {
        (async () => {
            this.app.showNotification('Exporting Profit & Loss Report...', 'info');
            const startDate = document.getElementById('pl-start-date')?.value || null;
            const endDate = document.getElementById('pl-end-date')?.value || null;
            try {
                const params = new URLSearchParams();
                if (startDate) params.append('start_date', startDate);
                if (endDate) params.append('end_date', endDate);
                const res = await this.app.api.download('/reports/profit-loss-pdf?' + params.toString(), 'profit_loss_report.pdf');
                if (!res.success) this.generatePDFReport('Profit & Loss Report', this.getProfitLossReportData());
            } catch (e) {
                console.error('Profit/Loss PDF export failed:', e);
                this.generatePDFReport('Profit & Loss Report', this.getProfitLossReportData());
            }
        })();
    }
    
    // Helper methods to get report data
    getSalesReportData() {
        const el = document.getElementById('reports-content');
        if (!el) return 'No report data available.';
        return el.innerHTML || el.textContent || 'No report data available.';
    }
    
    getInventoryReportData() {
        const el = document.getElementById('reports-content');
        if (!el) return 'No report data available.';
        return el.innerHTML || el.textContent || 'No report data available.';
    }
    
    getGSTReportData() {
        const el = document.getElementById('reports-content');
        if (!el) return 'No report data available.';
        return el.innerHTML || el.textContent || 'No report data available.';
    }
    
    getProfitLossReportData() {
        const el = document.getElementById('reports-content');
        if (!el) return 'No report data available.';
        return el.innerHTML || el.textContent || 'No report data available.';
    }

    // Load jsPDF and autotable from CDN
    loadPdfLibraries() {
        if (window.jspdf && window.jspdf.jsPDF && window.jspdfAutoTableLoaded) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const libs = [
                { src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js' },
                { src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js' }
            ];

            let loaded = 0;
            libs.forEach(lib => {
                const s = document.createElement('script');
                s.src = lib.src;
                s.async = false;
                s.onload = () => {
                    loaded += 1;
                    if (loaded === libs.length) {
                        if (window.jspdf && window.jspdf.jsPDF) {
                            window.jspdfAutoTableLoaded = true;
                            return resolve();
                        }
                        if (window.jsPDF) {
                            window.jspdf = { jsPDF: window.jsPDF };
                            window.jspdfAutoTableLoaded = true;
                            return resolve();
                        }
                        window.jspdfAutoTableLoaded = true;
                        resolve();
                    }
                };
                s.onerror = (e) => reject(new Error('Failed to load PDF libraries: ' + lib.src));
                document.head.appendChild(s);
            });
        });
    }

    // Generate a professional PDF report using jsPDF + autoTable
    generateProfessionalPDFReport(title, payload) {
        try {
            const { startDate, endDate, summary, sales } = payload;
            const ShopName = (window.shopSettings && (window.shopSettings.getSetting('shopName') || window.shopSettings.getSetting('shop_name'))) || document.getElementById('shop-name')?.textContent || 'Auto Accessories POS';

            const { jsPDF } = window.jspdf || window.jspdf || { jsPDF: window.jsPDF };
            const doc = new jsPDF('p', 'pt', 'a4');
            const margin = 40;
            let y = margin;

            doc.setFontSize(18);
            doc.text(ShopName, doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
            y += 24;
            doc.setFontSize(12);
            const rangeText = startDate || endDate ? `From: ${startDate || '---'} To: ${endDate || '---'}` : `All Dates`;
            doc.text(rangeText, doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
            y += 20;
            doc.setFontSize(10);
            doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y);
            y += 16;

            // Summary block
            const totalRevenue = (summary && summary.total_revenue) || 0;
            const totalTransactions = (summary && summary.total_transactions) || (sales && sales.length) || 0;
            const totalGST = (summary && summary.total_gst) || 0;

            doc.setFontSize(11);
            doc.text(`Total Revenue: PKR ${Number(totalRevenue).toLocaleString()}`, margin, y);
            doc.text(`Total Transactions: ${totalTransactions}`, margin + 250, y);
            doc.text(`Total GST: PKR ${Number(totalGST).toLocaleString()}`, margin + 420, y);
            y += 18;

            // Table of sales
            const columns = [
                { header: 'Invoice', dataKey: 'invoice_number' },
                { header: 'Date', dataKey: 'created_at' },
                { header: 'Customer', dataKey: 'customer_name' },
                { header: 'Total', dataKey: 'grand_total' },
                { header: 'GST', dataKey: 'gst_amount' },
                { header: 'Payment', dataKey: 'payment_method' },
                { header: 'Status', dataKey: 'payment_status' },
                { header: 'Cashier', dataKey: 'cashier_name' }
            ];

            const rows = (sales || []).map(s => ({
                invoice_number: s.invoice_number || s.invoice || 'N/A',
                created_at: (s.created_at) ? new Date(s.created_at).toLocaleString() : '',
                customer_name: s.customer_name || s.customer || (s.customer_id ? `#${s.customer_id}` : 'Walk-in'),
                grand_total: (s.grand_total != null) ? `PKR ${Number(s.grand_total).toLocaleString()}` : 'PKR 0.00',
                gst_amount: (s.gst_amount != null) ? `PKR ${Number(s.gst_amount).toLocaleString()}` : 'PKR 0.00',
                payment_method: s.payment_method || s.payment_type || '',
                payment_status: s.payment_status || s.payment || '',
                cashier_name: s.cashier_name || s.cashier || ''
            }));

            // Use autoTable
            if (doc.autoTable) {
                doc.autoTable({
                    startY: y,
                    head: [columns.map(c => c.header)],
                    body: rows.map(r => columns.map(c => r[c.dataKey])),
                    styles: { fontSize: 9 },
                    headStyles: { fillColor: [22, 160, 133] },
                    theme: 'striped',
                    margin: { left: margin, right: margin }
                });
            } else if (window.jspdf && window.jspdfAutoTableLoaded && window.jspdfAutoTableLoaded !== undefined && window.jsPDF && window.jsPDF.autoTable) {
                // older global
                window.jsPDF.autoTable(doc, columns.map(c=>c.header), rows.map(r=>columns.map(c=>r[c.dataKey])), { startY: y, margin:{left:margin, right:margin} });
            } else {
                // Fallback: print a simple HTML window
                const content = rows.map(r => `${r.invoice_number} | ${r.created_at} | ${r.customer_name} | ${r.grand_total}`).join('\n');
                this.generatePDFReport(title, content);
                return;
            }

            // Save PDF
            doc.save(`${title.replace(/\s+/g,'_')}_${(startDate||'all')}_${(endDate||'')}.pdf`);
        } catch (e) {
            console.error('Failed to generate professional PDF:', e);
            this.app.showNotification('PDF generation failed, using fallback', 'warning');
            this.generatePDFReport(title, this.getSalesReportData());
        }
    }
    
    // PDF generation method (placeholder)
    generatePDFReport(title, data) {
        // Print the rendered report HTML in a new window and wait for load
        const reportWindow = window.open('', '_blank');
        const html = `<!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>${title}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; color: #000; }
                    .header { text-align: center; margin-bottom: 20px; }
                    .content { white-space: normal; }
                    @media print { body { margin: 10mm; } }
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
                <script>
                    function doPrint() {
                        try { window.focus(); setTimeout(function(){ window.print(); }, 250); }
                        catch(e){ console.error('Print failed', e); }
                    }
                    if (document.readyState === 'complete') doPrint(); else window.onload = doPrint;
                <\/script>
            </body>
            </html>`;

        reportWindow.document.open();
        reportWindow.document.write(html);
        reportWindow.document.close();
    }
}

window.ReportsScreen = ReportsScreen;
