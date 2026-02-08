// src/frontend/screens/users/script.js

class UsersScreen {
    constructor(app) {
        this.app = app;
        this.users = [];
    }

    init() {
        this.app.screens = this.app.screens || {};
        this.app.screens.users = this;
        this.load();
    }

    async load() {
        try {
            const res = await this.app.api.get('/auth/users');
            if (res && res.success) {
                this.users = res.users || res.data || [];
            } else {
                this.users = [];
            }
            this.render();
        } catch (e) {
            console.error('Users load error', e);
            const tbody = document.getElementById('users-table');
            if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="error">Failed to load users</td></tr>';
        }
    }

    render() {
        const tbody = document.getElementById('users-table');
        if (!tbody) return;
        if (!this.users || this.users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty">No users found</td></tr>';
            return;
        }

        tbody.innerHTML = this.users.map(u => {
            const id = u.id || u[0];
            const username = u.username || u[1] || '';
            const full = u.full_name || u[2] || '';
            const role = u.role || u[3] || '';
            const status = u.status || u[4] || '';
            return `<tr>
                <td>${username}</td>
                <td>${full}</td>
                <td>${role}</td>
                <td>${status}</td>
                <td>
                    <button class="btn-small" onclick="app.screens.users.edit(${id})">Edit</button>
                </td>
            </tr>`;
        }).join('');
    }

    showAddUserModal() {
        document.getElementById('user-modal-title').textContent = 'Add User';
        document.getElementById('user-id').value = '';
        document.getElementById('user-username').value = '';
        document.getElementById('user-fullname').value = '';
        document.getElementById('user-role').value = 'shop_boy';
        document.getElementById('user-status').value = 'active';
        document.getElementById('user-modal').style.display = 'block';
    }

    closeModal() { // alias for inline handlers
        document.getElementById('user-modal').style.display = 'none';
    }

    async saveUser(e) {
        e.preventDefault();
        const id = document.getElementById('user-id').value;
        const payload = {
            username: document.getElementById('user-username').value,
            full_name: document.getElementById('user-fullname').value,
            role: document.getElementById('user-role').value,
            status: document.getElementById('user-status').value
        };
        try {
            if (id) await this.app.api.put(`/auth/users/${id}`, payload);
            else await this.app.api.post('/auth/users', payload);
            document.getElementById('user-modal').style.display = 'none';
            this.load();
        } catch (err) {
            console.error('Failed save user', err);
            this.app.showNotification('Failed to save user', 'error');
        }
    }

    edit(id) {
        const user = this.users.find(u => (u.id || u[0]) === id);
        if (!user) return;
        document.getElementById('user-modal-title').textContent = 'Edit User';
        document.getElementById('user-id').value = user.id || user[0] || '';
        document.getElementById('user-username').value = user.username || user[1] || '';
        document.getElementById('user-fullname').value = user.full_name || user[2] || '';
        document.getElementById('user-role').value = user.role || user[3] || 'shop_boy';
        document.getElementById('user-status').value = user.status || user[4] || 'active';
        document.getElementById('user-modal').style.display = 'block';
    }
}

window.UsersScreen = UsersScreen;
