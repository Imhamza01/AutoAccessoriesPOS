class ExpensesScreen {
    constructor(app) {
        this.app = app;
        this.expenses = [];
    }

    init() {
        console.log('Initializing Expenses Screen');
        this.refresh();
    }

    async refresh() {
        try {
            // Build query with date filters if set
            const params = new URLSearchParams({ limit: 500, skip: 0 });
            const startDate = document.getElementById('expense-start-date')?.value;
            const endDate = document.getElementById('expense-end-date')?.value;
            const category = document.getElementById('expense-category-filter')?.value;
            if (startDate) params.append('start_date', startDate);
            if (endDate) params.append('end_date', endDate);
            if (category) params.append('category', category);

            const response = await this.app.api.get(`/expenses?${params.toString()}`);

            if (response && response.success) {
                this.expenses = response.expenses || [];
            } else {
                this.expenses = [];
            }
            this.renderExpenses();
        } catch (error) {
            console.error('Failed to load expenses:', error);
            this.expenses = [];
            this.renderExpenses();
            this.app.showNotification('Failed to load expenses', 'error');
        }
    }

    renderExpenses(expenses) {
        const data = expenses || this.expenses;  // ← use passed array or default
        const tbody = document.getElementById('expenses-table-body');
        if (!tbody) return;

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No expenses found</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(expense => `
            <tr>
                <td>${expense.date || expense.expense_date || ''}</td>
                <td><span class="status-badge info">${expense.category || ''}</span></td>
                <td>${expense.description || ''}</td>
                <td>${this.app.formatCurrency(expense.amount || 0)}</td>
                <td>${expense.payment_method || '-'}</td>
                <td>
                    <button class="btn btn-small btn-danger"
                        onclick="app.screens.expenses.deleteExpense(${expense.id})">
                        Delete
                    </button>
                </td>
            </tr>
        `).join('');
    }

    showAddExpenseModal() {
        document.getElementById('add-expense-modal').style.display = 'block';
        // Set default date to today
        const dateInput = document.querySelector('#add-expense-form input[name="date"]');
        if (dateInput) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }
    }

    closeModal() {
        document.getElementById('add-expense-modal').style.display = 'none';
        document.getElementById('add-expense-form').reset();
    }

    async handleSaveExpense(event) {
        event.preventDefault();
        const formData = new FormData(event.target);
        const expenseData = {
            category: formData.get('category'),
            amount: parseFloat(formData.get('amount')),
            description: formData.get('description'),
            reference: formData.get('reference'),
            date: formData.get('date') || new Date().toISOString().split('T')[0],
            payment_method: formData.get('payment_method') || 'cash',
            paid_to: formData.get('paid_to') || ''
        };

        try {
            await this.app.api.post('/expenses', expenseData);
            this.app.showNotification('Expense saved successfully', 'success');
            this.closeModal();
            this.refresh();
        } catch (error) {
            console.error('Failed to save expense:', error);
            this.app.showNotification('Failed to save expense: ' + (error.message || 'Unknown error'), 'error');
        }
    }

    async deleteExpense(id) {
        if (confirm('Are you sure you want to delete this expense?')) {
            try {
                await this.app.api.delete(`/expenses/${id}`);
                this.app.showNotification('Expense deleted', 'success');
                this.refresh();
            } catch (error) {
                this.app.showNotification('Failed to delete expense', 'error');
            }
        }
    }

    filterExpenses() {
        const search = (document.getElementById('expense-search')?.value || '').toLowerCase().trim();

        if (!search) {
            this.renderExpenses(this.expenses);
            return;
        }

        const filtered = this.expenses.filter(e => {
            const category = (e.category || '').toLowerCase();
            const description = (e.description || '').toLowerCase();
            const paidTo = (e.paid_to || '').toLowerCase();
            const reference = (e.reference || e.reference_number || '').toLowerCase();
            return category.includes(search) ||
                   description.includes(search) ||
                   paidTo.includes(search) ||
                   reference.includes(search);
        });

        this.renderExpenses(filtered);
    }
}

window.ExpensesScreen = ExpensesScreen;
