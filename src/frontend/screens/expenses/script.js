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
            const response = await this.app.api.get('/expenses');
            this.expenses = response.expenses || [];
            this.renderExpenses();
        } catch (error) {
            console.error('Failed to load expenses:', error);
            this.app.showNotification('Failed to load expenses', 'error');
        }
    }

    renderExpenses() {
        const tbody = document.getElementById('expenses-table-body');
        if (!tbody) return;

        if (this.expenses.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No expenses found</td></tr>';
            return;
        }

        tbody.innerHTML = this.expenses.map(expense => `
            <tr>
                <td>${expense.date || expense[1]}</td>
                <td><span class="status-badge info">${expense.category || expense[2]}</span></td>
                <td>${expense.description || expense[3]}</td>
                <td>${this.app.formatCurrency(expense.amount || expense[4])}</td>
                <td>${expense.payment_method || expense[5] || '-'}</td>
                <td>
                    <button class="btn btn-small btn-danger" onclick="app.screens.expenses.deleteExpense(${expense.id || expense[0]})">Delete</button>
                </td>
            </tr>
        `).join('');
    }

    showAddExpenseModal() {
        document.getElementById('add-expense-modal').style.display = 'block';
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
            date: new Date().toISOString().split('T')[0] // Default to today
        };

        try {
            await this.app.api.post('/expenses', expenseData);
            this.app.showNotification('Expense saved successfully', 'success');
            this.closeModal();
            this.refresh();
        } catch (error) {
            console.error('Failed to save expense:', error);
            this.app.showNotification('Failed to save expense', 'error');
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
        const search = document.getElementById('expense-search').value.toLowerCase();
        // Implement filtering if needed, for now just re-render mock
        this.renderExpenses();
    }
}

window.ExpensesScreen = ExpensesScreen;
