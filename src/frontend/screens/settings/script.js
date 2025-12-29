class SettingsScreen {
    constructor(app) {
        this.app = app;
    }

    init() {
        this.showTab('shop');
    }

    showTab(tab) {
        const content = document.getElementById('settings-content');
        
        switch(tab) {
            case 'shop':
                this.loadShopSettings();
                break;
            case 'users':
                this.loadUsersSettings();
                break;
            case 'printer':
                this.loadPrinterSettings();
                break;
            case 'backup':
                this.loadBackupSettings();
                break;
        }
    }

    async loadShopSettings() {
        const res = await this.app.api.get('/settings/shop');
        const s = res.settings || {};
        
        document.getElementById('settings-content').innerHTML = `
            <form onsubmit="app.screens.settings.saveShop(event)">
                <div class="form-group">
                    <label>Shop Name</label>
                    <input type="text" value="${s.shop_name || ''}" id="shop-name">
                </div>
                <div class="form-group">
                    <label>Phone</label>
                    <input type="text" value="${s.shop_phone || ''}" id="shop-phone">
                </div>
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" value="${s.shop_email || ''}" id="shop-email">
                </div>
                <div class="form-group">
                    <label>Address</label>
                    <textarea id="shop-address">${s.shop_address || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>GST Number</label>
                    <input type="text" value="${s.gst_number || ''}" id="gst-number">
                </div>
                <button type="submit" class="btn btn-primary">Save</button>
            </form>
        `;
    }

    async loadUsersSettings() {
        const res = await this.app.api.get('/users');
        const users = res.users || [];
        
        document.getElementById('settings-content').innerHTML = `
            <button class="btn btn-primary" onclick="app.screens.settings.addUser()">Add User</button>
            <table class="data-table" style="margin-top: 20px;">
                <thead>
                    <tr>
                        <th>Username</th>
                        <th>Full Name</th>
                        <th>Role</th>
                        <th>Active</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(u => `
                        <tr>
                            <td>${u[1]}</td>
                            <td>${u[3]}</td>
                            <td>${u[4]}</td>
                            <td>${u[5] ? 'Yes' : 'No'}</td>
                            <td>
                                <button class="btn-small" onclick="app.screens.settings.editUser(${u[0]})">Edit</button>
                                <button class="btn-small" onclick="app.screens.settings.deleteUser(${u[0]})">Delete</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    async loadPrinterSettings() {
        const res = await this.app.api.get('/settings/printer');
        const printers = res.printers || [];
        
        document.getElementById('settings-content').innerHTML = `
            <button class="btn btn-primary" onclick="app.screens.settings.addPrinter()">Add Printer</button>
            <table class="data-table" style="margin-top: 20px;">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Port</th>
                        <th>Default</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${printers.map(p => `
                        <tr>
                            <td>${p[1]}</td>
                            <td>${p[2]}</td>
                            <td>${p[3]}</td>
                            <td>${p[5] ? 'Yes' : 'No'}</td>
                            <td><button class="btn-small" onclick="app.screens.settings.editPrinter(${p[0]})">Edit</button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    async loadBackupSettings() {
        const res = await this.app.api.get('/settings/backup');
        const backups = res.backups || [];
        
        document.getElementById('settings-content').innerHTML = `
            <button class="btn btn-primary" onclick="app.screens.settings.createBackup()">Create Backup Now</button>
            <h3 style="margin-top: 20px;">Recent Backups</h3>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Size</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${backups.map(b => `
                        <tr>
                            <td>${b[3]?.substring(0, 10)}</td>
                            <td>${(b[2] || 0).toLocaleString()} KB</td>
                            <td><button class="btn-small" onclick="app.screens.settings.restoreBackup(${b[0]})">Restore</button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    async saveShop(e) {
        e.preventDefault();
        await this.app.api.put('/settings/shop', {
            shop_name: document.getElementById('shop-name').value,
            shop_phone: document.getElementById('shop-phone').value,
            shop_email: document.getElementById('shop-email').value,
            shop_address: document.getElementById('shop-address').value,
            gst_number: document.getElementById('gst-number').value
        });
        alert('Settings saved');
    }

    addUser() { alert('Add user (implement)'); }
    editUser(id) { alert('Edit user ' + id); }
    deleteUser(id) { alert('Delete user ' + id); }
    addPrinter() { alert('Add printer (implement)'); }
    editPrinter(id) { alert('Edit printer ' + id); }
    createBackup() { alert('Creating backup...'); }
    restoreBackup(id) { alert('Restoring backup ' + id); }
}
