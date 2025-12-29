class SalesScreen {
    constructor(app) {
        this.app = app;
        this.sales = [];
    }

    init() {
        this.load();
    }

    async load() {
        try {
            const res = await this.app.api.get('/sales');
            this.sales = res.sales || [];
            this.render();
            this.updateSummary();
        } catch (e) {
            console.error('Failed to load sales:', e);
        }
    }

    filter() {
        this.load();
    }

    updateSummary() {
        const today = new Date().toISOString().split('T')[0];
        const todaySales = this.sales.filter(s => s[1]?.startsWith(today));
        const totalRevenue = todaySales.reduce((sum, s) => sum + (s[2] || 0), 0);
        
        document.getElementById('today-revenue').textContent = `PKR ${totalRevenue.toLocaleString()}`;
        document.getElementById('total-transactions').textContent = this.sales.length;
        const avg = this.sales.length > 0 ? totalRevenue / this.sales.length : 0;
        document.getElementById('avg-transaction').textContent = `PKR ${avg.toLocaleString()}`;
    }

    render() {
        const tbody = document.getElementById('sales-table');
        if (!tbody) return;

        if (this.sales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty">No sales found</td></tr>';
            return;
        }

        tbody.innerHTML = this.sales.map((s, i) => `
            <tr>
                <td>#${s[0]}</td>
                <td>${s[1]?.substring(0, 10)}</td>
                <td>Customer ${s[2]}</td>
                <td>-</td>
                <td>PKR ${(s[3] || 0).toLocaleString()}</td>
                <td>${s[5]}</td>
                <td><span class="badge">${s[6]}</span></td>
                <td>
                    <button class="btn-small" onclick="app.screens.sales.viewDetails(${s[0]})">View</button>
                </td>
            </tr>
        `).join('');
    }

    viewDetails(id) {
        alert(`View sale ${id}`);
    }
}
