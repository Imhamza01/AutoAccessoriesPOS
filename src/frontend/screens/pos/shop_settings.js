// Shop Settings Module
class ShopSettings {
    constructor() {
        this.settings = this.loadSettings();
    }
    
    loadSettings() {
        const saved = localStorage.getItem('shop_settings');
        if (saved) {
            return JSON.parse(saved);
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
}

// Create a global instance
window.shopSettings = new ShopSettings();