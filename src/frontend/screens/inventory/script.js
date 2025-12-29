class InventoryScreen {
    constructor(app) {
        this.app = app;
        this.products = [];
    }

    init() {
        this.load();
    }

    async load() {
        try {
            const res = await this.app.api.get('/inventory/stock');
            this.products = res.products || [];
            this.render();
            this.showAlerts();
        } catch (e) {
            console.error('Failed to load inventory:', e);
        }
    }

    showAlerts() {
        const alerts = document.getElementById('stock-alerts');
        const lowStock = this.products.filter(p => p[7] && p[7] <= p[8]);
        const outOfStock = this.products.filter(p => p[7] === 0);

        let html = '';
        if (outOfStock.length > 0) {
            html += `<div class="alert alert-danger">⚠️ ${outOfStock.length} products out of stock</div>`;
        }
        if (lowStock.length > 0) {
            html += `<div class="alert alert-warning">⚠️ ${lowStock.length} products low stock</div>`;
        }

        alerts.innerHTML = html;
    }

    render() {
        const tbody = document.getElementById('inventory-table');
        if (!tbody) return;

        if (this.products.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No products</td></tr>';
            return;
        }

        tbody.innerHTML = this.products.map(p => {
            let status = 'In Stock';
            if (p[7] === 0) status = 'Out of Stock';
            else if (p[7] <= p[8]) status = 'Low Stock';

            return `
                <tr>
                    <td>${p[2]}</td>
                    <td>${p[3]}</td>
                    <td>${p[7]}</td>
                    <td>${p[8]}</td>
                    <td><span class="badge">${status}</span></td>
                    <td>
                        <button class="btn-small" onclick="app.screens.inventory.adjust(${p[0]})">Adjust</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    adjust(id) {
        const qty = prompt('Enter quantity change:');
        if (qty) {
            alert(`Adjusted product ${id} by ${qty}`);
            this.load();
        }
    }
}
