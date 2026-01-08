class CustomersScreen {
    constructor(app) {
        this.app = app;
        this.customers = [];
        this.filtered = [];
    }

    init() {
        // Register for legacy callbacks
        if (this.app) {
            this.app.screens = this.app.screens || {};
            this.app.screens.customers = this;
        }
        this.load();
    }

    refresh() {
        this.load();
    }

    async load() {
        try {
            const res = await this.app.api.get('/customers');
            this.customers = res.customers || res || [];
            this.filtered = this.customers; // Initialize filtered with all customers
            this.render();
        } catch (e) {
            console.error('Failed to load customers:', e);
            const tbody = document.getElementById('customers-table');
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="error">Failed to load customers</td></tr>';
        }
    }

    filter() {
        const search = document.getElementById('customer-search')?.value || '';
        this.filtered = this.customers.filter(c =>
            (c.full_name || c.name || c[2] || '').toLowerCase().includes(search) || (c.phone || c[3] || '').includes(search)
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

        // Map fields correctly: customers table has full_name (index 2), phone (index 3), email (index 5), city (index 8)
        tbody.innerHTML = this.filtered.map(c => {
            const id = c.id || c[0];
            const name = c.full_name || c.name || c[2] || '';
            const phone = c.phone || c[3] || '';
            const email = c.email || c[5] || '';
            const city = c.city || c[8] || '';
            const creditLimit = c.credit_limit || c[11] || 0;
            const currentBalance = c.current_balance || c[12] || 0;
            return `
            <tr>
                <td>${name}</td>
                <td>${phone}</td>
                <td>${email}</td>
                <td>${city}</td>
                <td>PKR ${Number(creditLimit).toLocaleString()}</td>
                <td>PKR ${Number(currentBalance).toLocaleString()}</td>
                <td>
                    <button class="btn-small" onclick="app.screens.customers.edit(${id})">Edit</button>
                    <button class="btn-small" onclick="app.screens.customers.delete(${id})">Delete</button>
                </td>
            </tr>
        `;
        }).join('');
    }

    showAddModal() {
        document.getElementById('modal-title').textContent = 'Add Customer';
        document.getElementById('customer-id').value = '';
        document.getElementById('customer-name').value = '';
        document.getElementById('customer-phone').value = '';
        document.getElementById('customer-email').value = '';
        document.getElementById('customer-city').value = '';
        document.getElementById('customer-address').value = '';
        document.getElementById('customer-credit-limit').value = '0';

        document.getElementById('customer-modal').style.display = 'block';
    }

    closeModal() {
        document.getElementById('customer-modal').style.display = 'none';
    }

    async saveCustomer(e) {
        e.preventDefault();
        const id = document.getElementById('customer-id').value;
        const data = {
            name: document.getElementById('customer-name').value,
            phone: document.getElementById('customer-phone').value,
            email: document.getElementById('customer-email').value,
            city: document.getElementById('customer-city').value,
            address: document.getElementById('customer-address').value,
            credit_limit: parseFloat(document.getElementById('customer-credit-limit').value) || 0
        };

        try {
            if (id) {
                await this.app.api.put(`/customers/${id}`, data);
                this.app.showNotification('Customer updated successfully', 'success');
            } else {
                await this.app.api.post('/customers', data);
                this.app.showNotification('Customer added successfully', 'success');
            }
            this.closeModal();
            this.load();
        } catch (err) {
            console.error(err);
            this.app.showNotification('Failed to save customer', 'error');
        }
    }

    edit(id) {
        const customer = this.customers.find(c => (c.id || c[0]) === id);
        if (!customer) return;

        document.getElementById('modal-title').textContent = 'Edit Customer';
        document.getElementById('customer-id').value = customer.id || customer[0] || '';
        document.getElementById('customer-name').value = customer.name || customer[1] || '';
        document.getElementById('customer-phone').value = customer.phone || customer[2] || '';
        document.getElementById('customer-email').value = customer.email || customer[3] || '';
        document.getElementById('customer-address').value = customer.address || customer[4] || '';
        document.getElementById('customer-city').value = customer.city || customer[5] || '';
        document.getElementById('customer-credit-limit').value = customer.credit_limit || customer[9] || 0;

        document.getElementById('customer-modal').style.display = 'block';
    }

    async delete(id) {
        if (confirm('Are you sure you want to delete this customer?')) {
            try {
                await this.app.api.delete(`/customers/${id}`);
                this.app.showNotification('Customer deleted', 'success');
                this.load();
            } catch (err) {
                this.app.showNotification('Failed to delete customer', 'error');
            }
        }
    }
}

window.CustomersScreen = CustomersScreen;
