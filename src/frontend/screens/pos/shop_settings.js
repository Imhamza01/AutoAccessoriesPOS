// Shop Settings Module (idempotent)
if (!window.ShopSettings) {
    window.ShopSettings = class {
        constructor() {
            this.settings = this.loadSettings();
        }

        loadSettings() {
            const saved = localStorage.getItem('shop_settings');
            if (saved) {
                try {
                    return JSON.parse(saved);
                } catch (e) {
                    console.warn('Invalid shop_settings in localStorage, resetting to defaults');
                }
            }

            // Default settings
            return {
                shopName: 'Auto Accessories Shop',
                shopAddress: '123 Main Street, City',
                shopPhone: '+92-300-1234567',
                shopEmail: 'info@autoaccessories.com',
                taxNumber: 'Tax ID: 123456789',
                receiptMessage: 'Thank you for your business!',
                gstRate: 0.17, // 17% GST
                currency: 'PKR',
                logoPath: null
            };
        }

        saveSettings(settings) {
            this.settings = {...this.settings, ...settings};
            localStorage.setItem('shop_settings', JSON.stringify(this.settings));
        }

        getSetting(key) {
            return this.settings[key];
        }

        getAllSettings() {
            return this.settings;
        }

        // Method to update receipt content with shop settings
        updateReceiptContent(receiptContent) {
            const settings = this.getAllSettings();

            return receiptContent
                .replace('{{shopName}}', settings.shopName)
                .replace('{{shopAddress}}', settings.shopAddress)
                .replace('{{shopPhone}}', settings.shopPhone)
                .replace('{{taxNumber}}', settings.taxNumber)
                .replace('{{receiptMessage}}', settings.receiptMessage);
        }
    };
}

// Create a global instance if missing (safe to call multiple times)
if (!window.shopSettings) {
    try {
        window.shopSettings = new window.ShopSettings();
    } catch (e) {
        console.warn('Failed to instantiate ShopSettings:', e);
    }
}