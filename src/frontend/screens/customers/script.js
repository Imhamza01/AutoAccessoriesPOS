class CustomersScreen {
    constructor(app) {
        this.app = app;
        this.customers = [];
        this.filtered = [];
    }

    init() {
        this.load();
    }

    async load() {
        try {
            const res = await this.app.api.get('/customers');
            this.customers = res.customers || [];
            this.render();
        } catch (e) {
            console.error('Failed to load customers:', e);
        }
    }

    filter() {
        const search = document.getElementById('customer-search')?.value || '';
        this.filtered = this.customers.filter(c =>
            c[1]?.toLowerCase().includes(search) || c[2]?.includes(search)
        );
        this.render();
    }

    render() {
        const tbody = document.getElementById('customers-table');
        if (!tbody) return;

        if (this.filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty">No customers found</td></tr>';
            return;
        }

        tbody.innerHTML = this.filtered.map(c => `
            <tr>
                <td>${c[1]}</td>
                <td>${c[2]}</td>
                <td>${c[3]}</td>
                <td>${c[5]}</td>
                <td>${c[9]}</td>
                <td>${c[10]}</td>
                <td>
                    <button class="btn-small" onclick="app.screens.customers.edit(${c[0]})">Edit</button>
                    <button class="btn-small" onclick="app.screens.customers.delete(${c[0]})">Delete</button>
                </td>
            </tr>
        `).join('');
    }

    showAddModal() {
        // Show modal for adding customer
        alert('Add customer modal (implement later)');
    }

    edit(id) {
        alert(`Edit customer ${id}`);
    }

    delete(id) {
        if (confirm('Delete customer?')) {
            this.customers = this.customers.filter(c => c[0] !== id);
            this.render();
        }
    }
}
