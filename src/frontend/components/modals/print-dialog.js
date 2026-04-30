/**
 * Print Dialog Controller
 * Manages the print dialog UI and print operations
 */
const PrintDialog = {
    // Current receipt data
    receiptData: null,
    
    // Print settings
    settings: {
        printer: 'default',
        paperSize: '80mm',
        orientation: 'portrait',
        scale: 100,
        copies: 1,
        margins: true,
        showLogo: true,
        showHeader: true,
        showBarcode: true,
        showFooter: true,
        fontSize: 'medium',
        logoSize: 'medium',
        receiptTheme: 'classic'
    },

    // Preview zoom level
    zoomLevel: 100,

    /**
     * Open the print dialog with receipt data
     * @param {Object} receiptData - Receipt data to print
     */
    open(receiptData) {
        this.receiptData = receiptData;
        
        // Ensure logo path is absolute for PyWebView iframe compatibility
        if (this.receiptData && this.receiptData.logoPath) {
            const lp = this.receiptData.logoPath;
            if (!lp.startsWith('http') && !lp.startsWith('data:')) {
                const origin = (window.location.origin && window.location.origin !== 'null')
                    ? window.location.origin
                    : 'http://127.0.0.1:8000';
                const cleanPath = lp.replace(/^\/+/, '');
                this.receiptData.logoPath = origin + '/' + (cleanPath.includes('uploads/') ? cleanPath : 'uploads/' + cleanPath);
            }
        }
        
        this.loadSettings();
        this.updateUI();
        this.renderPreview();
        
        // Show dialog
        const dialog = document.getElementById('print-dialog');
        if (dialog) {
            dialog.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    },

    /**
     * Close the print dialog
     */
    close() {
        const dialog = document.getElementById('print-dialog');
        if (dialog) {
            dialog.style.display = 'none';
            document.body.style.overflow = '';
        }
    },

    /**
     * Load settings from receipt data and localStorage
     */
    loadSettings() {
        // 1. Start with saved preferences as defaults
        const saved = localStorage.getItem('printDialogSettings');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                Object.assign(this.settings, parsed);
            } catch (e) {
                console.warn('[PrintDialog] Failed to load saved settings:', e);
            }
        }

        // 2. Receipt data always overrides saved prefs (source of truth)
        if (this.receiptData) {
            if (this.receiptData.showLogo    !== undefined) this.settings.showLogo    = this.receiptData.showLogo;
            if (this.receiptData.showHeader  !== undefined) this.settings.showHeader  = this.receiptData.showHeader;
            if (this.receiptData.showFooter  !== undefined) this.settings.showFooter  = this.receiptData.showFooter;
            if (this.receiptData.showBarcode !== undefined) this.settings.showBarcode = this.receiptData.showBarcode;
            if (this.receiptData.fontSize)                 this.settings.fontSize    = this.receiptData.fontSize;
            if (this.receiptData.logoSize)                 this.settings.logoSize    = this.receiptData.logoSize;
            if (this.receiptData.receiptTheme)             this.settings.receiptTheme = this.receiptData.receiptTheme;
        }
    },

    /**
     * Save current settings to localStorage
     */
    saveSettings() {
        try {
            localStorage.setItem('printDialogSettings', JSON.stringify(this.settings));
        } catch (e) {
            console.warn('[PrintDialog] Failed to save settings:', e);
        }
    },

    /**
     * Update UI elements with current settings
     */
    updateUI() {
        // Update invoice number
        if (this.receiptData) {
            const invoiceEl = document.getElementById('print-invoice-number');
            if (invoiceEl) {
                invoiceEl.textContent = this.receiptData.invoiceNo || 'INV-00000000';
            }
        }

        // Update form fields
        const fields = {
            'print-printer-select': this.settings.printer,
            'print-paper-size': this.settings.paperSize,
            'print-font-size': this.settings.fontSize,
            'print-logo-size': this.settings.logoSize,
            'print-scale-slider': this.settings.scale,
            'print-copies': this.settings.copies
        };

        Object.entries(fields).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.value = value;
        });

        // Update checkboxes
        const checkboxes = {
            'print-margins': this.settings.margins,
            'print-show-logo': this.settings.showLogo,
            'print-show-header': this.settings.showHeader,
            'print-show-barcode': this.settings.showBarcode,
            'print-show-footer': this.settings.showFooter
        };

        Object.entries(checkboxes).forEach(([id, checked]) => {
            const el = document.getElementById(id);
            if (el) el.checked = checked;
            
            // Add event listeners to update settings when changed
            if (el) {
                el.onchange = (e) => {
                    const settingKey = id.replace('print-', '').replace(/-([a-z])/g, (g) => g[1].toUpperCase());
                    this.settings[settingKey] = e.target.checked;
                    this.saveSettings();
                    this.renderPreview();
                };
            }
        });

        // Update scale display
        const scaleValue = document.getElementById('print-scale-value');
        if (scaleValue) {
            scaleValue.textContent = this.settings.scale + '%';
        }

        // Update copies button text
        this.updateCopiesButtonText();

        // Update orientation buttons
        document.querySelectorAll('.orientation-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.orientation === this.settings.orientation);
        });

        // Update theme selector radio buttons
        document.querySelectorAll('input[name="receiptTheme"]').forEach(radio => {
            radio.checked = radio.value === this.settings.receiptTheme;
            // Add event listener for theme change
            radio.onchange = (e) => {
                this.settings.receiptTheme = e.target.value;
                this.saveSettings();
                this.renderPreview();
            };
        });

        // Update printer status
        this.updatePrinterStatus();
        
        // Add event listeners for other form fields
        this.attachEventListeners();
    },

    /**
     * Update printer status indicator
     */
    updatePrinterStatus() {
        const statusEl = document.getElementById('printer-status');
        if (!statusEl) return;

        const printer = this.settings.printer;
        if (printer === 'thermal') {
            statusEl.innerHTML = `
                <span class="status-dot status-ready"></span>
                <span class="status-text">Thermal printer ready</span>
            `;
        } else if (printer === 'browser') {
            statusEl.innerHTML = `
                <span class="status-dot status-ready"></span>
                <span class="status-text">Browser print dialog</span>
            `;
        } else {
            statusEl.innerHTML = `
                <span class="status-dot status-ready"></span>
                <span class="status-text">Default printer ready</span>
            `;
        }
    },

    /**
     * Attach event listeners to form fields
     */
    attachEventListeners() {
        // Printer selection
        const printerSelect = document.getElementById('print-printer-select');
        if (printerSelect) {
            printerSelect.onchange = (e) => {
                this.settings.printer = e.target.value;
                this.saveSettings();
                this.updatePrinterStatus();
            };
        }

        // Paper size
        const paperSize = document.getElementById('print-paper-size');
        if (paperSize) {
            paperSize.onchange = (e) => {
                this.settings.paperSize = e.target.value;
                this.saveSettings();
                this.renderPreview();
            };
        }

        // Font size
        const fontSize = document.getElementById('print-font-size');
        if (fontSize) {
            fontSize.onchange = (e) => {
                this.settings.fontSize = e.target.value;
                this.saveSettings();
                this.renderPreview();
            };
        }

        // Logo size
        const logoSize = document.getElementById('print-logo-size');
        if (logoSize) {
            logoSize.onchange = (e) => {
                this.settings.logoSize = e.target.value;
                this.saveSettings();
                this.renderPreview();
            };
        }

        // Scale slider
        const scaleSlider = document.getElementById('print-scale-slider');
        if (scaleSlider) {
            scaleSlider.oninput = (e) => {
                this.updateScale(e.target.value);
            };
        }

        // Margins checkbox
        const margins = document.getElementById('print-margins');
        if (margins) {
            margins.onchange = (e) => {
                this.settings.margins = e.target.checked;
                this.saveSettings();
            };
        }
    },

    /**
     * Set page orientation
     * @param {string} orientation - 'portrait' or 'landscape'
     */
    setOrientation(orientation) {
        this.settings.orientation = orientation;
        this.saveSettings();
        
        // Update button states
        document.querySelectorAll('.orientation-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.orientation === orientation);
        });

        this.renderPreview();
    },

    /**
     * Update scale value
     * @param {number} value - Scale percentage
     */
    updateScale(value) {
        this.settings.scale = parseInt(value);
        const scaleValue = document.getElementById('print-scale-value');
        if (scaleValue) {
            scaleValue.textContent = value + '%';
        }
        this.saveSettings();
    },

    /**
     * Change number of copies
     * @param {number} delta - Change amount (+1 or -1)
     */
    changeCopies(delta) {
        const input = document.getElementById('print-copies');
        if (!input) return;

        let value = parseInt(input.value) + delta;
        value = Math.max(1, Math.min(10, value));
        input.value = value;
        this.settings.copies = value;
        this.updateCopiesButtonText();
        this.saveSettings();
    },

    /**
     * Update copies from input
     * @param {number} value - Number of copies
     */
    updateCopies(value) {
        let num = parseInt(value);
        num = Math.max(1, Math.min(10, num));
        this.settings.copies = num;
        this.updateCopiesButtonText();
        this.saveSettings();
    },

    /**
     * Update the copies text on print button
     */
    updateCopiesButtonText() {
        const copiesText = document.getElementById('btn-copies-text');
        if (copiesText) {
            if (this.settings.copies > 1) {
                copiesText.textContent = `(${this.settings.copies}×)`;
            } else {
                copiesText.textContent = '';
            }
        }
    },

    /**
     * Zoom in on preview
     */
    zoomIn() {
        this.zoomLevel = Math.min(200, this.zoomLevel + 10);
        this.applyZoom();
    },

    /**
     * Zoom out on preview
     */
    zoomOut() {
        this.zoomLevel = Math.max(50, this.zoomLevel - 10);
        this.applyZoom();
    },

    /**
     * Reset zoom to 100%
     */
    resetZoom() {
        this.zoomLevel = 100;
        this.applyZoom();
    },

    /**
     * Apply zoom to preview
     */
    applyZoom() {
        const preview = document.getElementById('receipt-preview-content');
        if (preview) {
            preview.style.transform = `scale(${this.zoomLevel / 100})`;
            preview.style.transformOrigin = 'top center';
        }
    },

    /**
     * Render receipt preview using themed HTML
     */
    renderPreview() {
        const preview = document.getElementById('receipt-preview-content');
        if (!preview || !this.receiptData) return;

        // Show loading
        preview.innerHTML = `
            <div class="preview-loading">
                <div class="spinner"></div>
                <p>Generating receipt preview...</p>
            </div>
        `;

        // Generate receipt preview using ReceiptRenderer with themes
        setTimeout(async () => {
            try {
                // Enrich: dialog settings always win over receiptData
                const settings = window.shopSettings ? window.shopSettings.getAllSettings() : {};
                const enriched = Object.assign({}, this.receiptData, {
                    shopName:      settings.shopName     || settings.shop_name      || this.receiptData.shopName,
                    shopAddress:   settings.shopAddress  || settings.shop_address   || this.receiptData.shopAddress,
                    shopPhone:     settings.shopPhone    || settings.shop_phone     || this.receiptData.shopPhone,
                    taxNumber:     settings.taxNumber    || settings.ntn_number,
                    gstNumber:     settings.gstNumber    || settings.gst_number,
                    logoPath:      settings.logoPath     || settings.logo_path      || this.receiptData.logoPath,
                    footerMessage: settings.receiptMessage || settings.receipt_footer,
                    terms:         settings.receiptTerms  || settings.receipt_terms  || '',
                    receiptTheme:  this.settings.receiptTheme,
                    fontSize:      this.settings.fontSize,
                    logoSize:      this.settings.logoSize,
                    showLogo:      this.settings.showLogo !== false,
                    showHeader:    this.settings.showHeader !== false,
                    showFooter:    this.settings.showFooter !== false,
                    showBarcode:   this.settings.showBarcode !== false,
                    showTaxId:     settings.showTaxId !== false
                });

                // Pre-convert logo to base64 to prevent blur in PyWebView Chromium print
                if (enriched.logoPath && window.PrintService && typeof window.PrintService.imageToBase64DataURI === 'function') {
                    try {
                        enriched.logoBase64 = await window.PrintService.imageToBase64DataURI(enriched.logoPath);
                    } catch (e) { /* fallback to URL */ }
                }

                let previewHTML;
                // Use ReceiptRenderer to build themed HTML
                if (window.ReceiptRenderer && typeof window.ReceiptRenderer.buildHTML === 'function') {
                    previewHTML = window.ReceiptRenderer.buildHTML(enriched);
                } else if (window.ReceiptThemes && typeof window.ReceiptThemes[enriched.receiptTheme] === 'object') {
                    // Fallback: use theme directly
                    const theme = window.ReceiptThemes[enriched.receiptTheme] || window.ReceiptThemes['classic'];
                    if (theme && typeof theme.buildHTML === 'function') {
                        previewHTML = theme.buildHTML(enriched);
                    } else {
                        previewHTML = '<p style="color: red;">Theme not found</p>';
                    }
                } else {
                    // Last fallback: simple text
                    previewHTML = '<pre style="padding: 10px;">Preview not available</pre>';
                }
                
                // Render in iframe via srcdoc (works in PyWebView)
                preview.innerHTML = `
                    <iframe style="
                        width: 82mm;
                        min-height: 200mm;
                        border: 1px solid #ddd;
                        background: white;
                        overflow-y: auto;
                    "></iframe>
                `;
                
                const iframe = preview.querySelector('iframe');
                iframe.srcdoc = previewHTML;
                
            } catch (error) {
                console.error('[PrintDialog] Error rendering preview:', error);
                preview.innerHTML = `
                    <div class="preview-loading">
                        <p style="color: #e74c3c;">Error generating preview</p>
                        <small>${error.message}</small>
                    </div>
                `;
            }
        }, 100);
    },

    /**
     * Get paper width based on settings
     * @returns {string} CSS width value
     */
    getPaperWidth() {
        switch (this.settings.paperSize) {
            case '80mm':
                return '80mm';
            case '58mm':
                return '58mm';
            case 'a4':
                return '210mm';
            case 'letter':
                return '216mm';
            default:
                return '80mm';
        }
    },

    /**
     * Generate receipt HTML for preview
     * @returns {string} HTML string
     */
    generateReceiptHTML() {
        const data = this.receiptData;
        const settings = window.shopSettings ? window.shopSettings.getAllSettings() : {};
        
        // Font size mapping
        const fontSizeMap = {
            small: { body: '10px', header: '12px', title: '13px', info: '9px' },
            medium: { body: '11px', header: '14px', title: '16px', info: '10px' },
            large: { body: '12px', header: '16px', title: '18px', info: '11px' }
        };
        const sizes = fontSizeMap[this.settings.fontSize || 'medium'] || fontSizeMap.medium;

        // Logo size mapping
        const logoSizeMap = {
            small: '40px',
            medium: '60px',
            large: '80px'
        };
        const logoWidth = logoSizeMap[this.settings.logoSize || 'medium'] || '60px';

        let itemsHTML = '';
        if (data.items) {
            data.items.forEach(item => {
                const total = item.total || (item.price * item.quantity);
                itemsHTML += `
                <tr>
                    <td class="item-name">${this.escapeHtml(item.name)}</td>
                    <td class="qty">${item.quantity}</td>
                    <td class="price">${(item.price || 0).toFixed(2)}</td>
                    <td class="total">${total.toFixed(2)}</td>
                </tr>`;
            });
        }

        return `
        <div style="
            font-family: 'Courier New', monospace;
            font-size: ${sizes.body};
            padding: 3mm;
            line-height: 1.3;
            color: #000;
            background: #fff;
        ">
            ${this.settings.showLogo && data.logoPath ? `
            <div style="text-align: center; margin-bottom: 5px;">
                <img src="${data.logoPath}" style="max-width: ${logoWidth}; height: auto; display: block; margin: 0 auto;" 
                     onerror="this.style.display='none'">
            </div>
            ` : ''}
            
            ${this.settings.showHeader ? `
            <div style="text-align: center; font-weight: bold; font-size: ${sizes.title}; margin-bottom: 3px;">
                ${this.escapeHtml(data.shopName || 'Shop')}
            </div>
            ${data.shopAddress ? `<div style="text-align: center; font-size: ${sizes.info};">${this.escapeHtml(data.shopAddress)}</div>` : ''}
            ${data.shopPhone ? `<div style="text-align: center; font-size: ${sizes.info};">Ph: ${this.escapeHtml(data.shopPhone)}</div>` : ''}
            ${data.taxNumber ? `<div style="text-align: center; font-size: ${sizes.info};">NTN: ${this.escapeHtml(data.taxNumber)}</div>` : ''}
            ${data.gstNumber ? `<div style="text-align: center; font-size: ${sizes.info};">GST: ${this.escapeHtml(data.gstNumber)}</div>` : ''}
            ` : ''}
            
            ${data.headerText ? `<div style="text-align: center; font-size: ${sizes.info}; margin: 3px 0;">${this.escapeHtml(data.headerText)}</div>` : ''}
            
            <div style="border-top: 1px dashed #000; margin: 5px 0;"></div>
            
            <div style="font-size: ${sizes.info};">Invoice: ${this.escapeHtml(data.invoiceNo || '')}</div>
            <div style="font-size: ${sizes.info};">Date: ${this.escapeHtml(data.date || '')} ${this.escapeHtml(data.time || '')}</div>
            ${data.customer ? `<div style="font-size: ${sizes.info};">Customer: ${this.escapeHtml(data.customer)}</div>` : ''}
            
            <div style="border-top: 1px dashed #000; margin: 5px 0;"></div>
            
            <table style="width: 100%; border-collapse: collapse; margin: 5px 0;">
                <thead>
                    <tr style="border-bottom: 1px solid #000;">
                        <th style="text-align: left; padding: 2px; font-size: ${sizes.info};">Item</th>
                        <th style="text-align: center; padding: 2px; font-size: ${sizes.info};">Qty</th>
                        <th style="text-align: right; padding: 2px; font-size: ${sizes.info};">Price</th>
                        <th style="text-align: right; padding: 2px; font-size: ${sizes.info};">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHTML}
                </tbody>
            </table>
            
            <div style="border-top: 1px dashed #000; margin: 5px 0;"></div>
            
            <div style="margin: 5px 0;">
                <div style="display: flex; justify-content: space-between; padding: 2px 0;">
                    <span>Subtotal:</span><span>${(data.subtotal || 0).toFixed(2)}</span>
                </div>
                ${data.discount > 0 ? `
                <div style="display: flex; justify-content: space-between; padding: 2px 0;">
                    <span>Discount:</span><span>-${(data.discount || 0).toFixed(2)}</span>
                </div>
                ` : ''}
                <div style="display: flex; justify-content: space-between; padding: 2px 0;">
                    <span>Tax (${((data.taxRate || 0) * 100).toFixed(1)}%):</span><span>${(data.taxAmount || 0).toFixed(2)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 5px 0; font-size: ${sizes.title}; font-weight: bold; border-top: 2px solid #000; border-bottom: 2px solid #000; margin-top: 3px;">
                    <span>TOTAL:</span><span>${(data.grandTotal || 0).toFixed(2)}</span>
                </div>
            </div>
            
            ${data.amountPaid !== undefined ? `
            <div style="border-top: 1px dashed #000; margin: 5px 0;"></div>
            <div style="display: flex; justify-content: space-between; padding: 2px 0;">
                <span>Paid:</span><span>${(data.amountPaid || 0).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 2px 0;">
                <span>Change:</span><span>${(data.change || 0).toFixed(2)}</span>
            </div>
            ` : ''}
            
            ${this.settings.showBarcode ? `
            <div style="border-top: 1px dashed #000; margin: 5px 0;"></div>
            <div style="text-align: center; font-family: monospace; font-size: 24px; letter-spacing: 2px; margin: 10px 0;">
                *${data.invoiceNo}*
            </div>
            <div style="text-align: center; font-size: 9px; margin-top: 2px;">${data.invoiceNo}</div>
            ` : ''}
            
            ${this.settings.showFooter ? `
            <div style="border-top: 1px dashed #000; margin: 5px 0;"></div>
            ${data.footerMessage ? `<div style="text-align: center; margin: 5px 0;">${this.escapeHtml(data.footerMessage)}</div>` : ''}
            ${data.terms ? `<div style="font-size: 9px; margin-top: 5px; padding-top: 3px; border-top: 1px dashed #000;">${this.escapeHtml(data.terms)}</div>` : ''}
            ` : ''}
        </div>
        `;
    },

    /**
     * Escape HTML special characters
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(text));
        return div.innerHTML;
    },

    /**
     * Execute print operation
     */
    async print() {
        if (!this.receiptData) {
            console.error('[PrintDialog] No receipt data to print');
            return;
        }

        const printBtn = document.getElementById('print-btn');
        if (printBtn) {
            printBtn.disabled = true;
            printBtn.innerHTML = '<i class="icon">⏳</i> Printing...';
        }

        try {
            // Update receipt data with current settings
            const receiptData = {
                ...this.receiptData,
                fontSize: this.settings.fontSize,
                logoSize: this.settings.logoSize,
                receiptTheme: this.settings.receiptTheme,
                showLogo: this.settings.showLogo,
                showHeader: this.settings.showHeader,
                showBarcode: this.settings.showBarcode,
                showFooter: this.settings.showFooter
            };

            // Print multiple copies
            for (let i = 0; i < this.settings.copies; i++) {
                // ALWAYS use native ESC/POS printing for clean, non-blurry output
                // Never use browser print dialog for thermal receipts
                if (window.PrintService && typeof window.PrintService.generateESCPOS === 'function') {
                    try {
                        console.log('[PrintDialog] Using native ESC/POS printing (copy ' + (i + 1) + '/' + this.settings.copies + ')');
                        
                        // Enrich: dialog settings ALWAYS win — spread receiptData first,
                        // then overlay dialog settings so they cannot be overridden
                        const shopSettings = window.shopSettings ? window.shopSettings.getAllSettings() : {};
                        const enrichedReceipt = Object.assign({}, receiptData, {
                            shopName:      shopSettings.shopName      || shopSettings.shop_name      || receiptData.shopName,
                            shopAddress:   shopSettings.shopAddress   || shopSettings.shop_address   || receiptData.shopAddress,
                            shopPhone:     shopSettings.shopPhone     || shopSettings.shop_phone     || receiptData.shopPhone,
                            taxNumber:     shopSettings.taxNumber     || shopSettings.ntn_number,
                            gstNumber:     shopSettings.gstNumber     || shopSettings.gst_number,
                            logoPath:      shopSettings.logoPath      || shopSettings.logo_path      || receiptData.logoPath,
                            footerMessage: shopSettings.receiptMessage || shopSettings.receipt_footer,
                            terms:         shopSettings.receiptTerms  || shopSettings.receipt_terms  || '',
                            receiptTheme:  this.settings.receiptTheme,
                            fontSize:      this.settings.fontSize,
                            logoSize:      this.settings.logoSize,
                            showLogo:      this.settings.showLogo !== false,
                            showHeader:    this.settings.showHeader !== false,
                            showFooter:    this.settings.showFooter !== false,
                            showBarcode:   this.settings.showBarcode !== false,
                            showTaxId:     shopSettings.showTaxId !== false
                        });
                        
                        // Generate ESC/POS commands
                        const escPosCommands = await window.PrintService.generateESCPOS(enrichedReceipt);
                        console.log(`[PrintDialog] Generated ${escPosCommands.length} bytes ESC/POS commands`);
                        
                        // Send to printer via backend API
                        const success = await window.PrintService.sendToPrinter(escPosCommands);
                        
                        if (!success) {
                            console.error('[PrintDialog] Failed to send to printer');
                            if (window.app) {
                                window.app.showNotification('Print failed. Check printer connection.', 'error');
                            }
                            break;
                        }
                        
                        // Small delay between copies
                        if (i < this.settings.copies - 1) {
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    } catch (error) {
                        console.error('[PrintDialog] ESC/POS print error:', error);
                        if (window.app) {
                            window.app.showNotification('Print error: ' + error.message, 'error');
                        }
                        break;
                    }
                } else {
                    console.error('[PrintDialog] PrintService not available for native printing');
                    if (window.app) {
                        window.app.showNotification('Print service not available', 'error');
                    }
                    break;
                }
            }

            // Show success notification
            if (window.app) {
                window.app.showNotification('Receipt printed successfully!', 'success');
            }

            // Close dialog after short delay
            setTimeout(() => this.close(), 500);
        } catch (error) {
            console.error('[PrintDialog] Print error:', error);
            if (window.app) {
                window.app.showNotification('Print failed: ' + error.message, 'error');
            }
        } finally {
            if (printBtn) {
                printBtn.disabled = false;
                printBtn.innerHTML = '<i class="icon">🖨️</i> Print Receipt <span class="btn-copies" id="btn-copies-text"></span>';
                this.updateCopiesButtonText();
            }
        }
    },

    /**
     * Generate full HTML document for browser printing
     * Uses ReceiptRenderer to ensure print matches preview exactly
     * @param {Object} data - Receipt data
     * @returns {string} Full HTML document
     */
    generateFullHTML(data) {
        const settings = window.shopSettings ? window.shopSettings.getAllSettings() : {};
        // Dialog settings always win — same pattern as renderPreview() and print()
        const enriched = Object.assign({}, data, {
            shopName:      settings.shopName     || settings.shop_name      || data.shopName,
            shopAddress:   settings.shopAddress  || settings.shop_address   || data.shopAddress,
            shopPhone:     settings.shopPhone    || settings.shop_phone     || data.shopPhone,
            taxNumber:     settings.taxNumber    || settings.ntn_number,
            gstNumber:     settings.gstNumber    || settings.gst_number,
            logoPath:      settings.logoPath     || settings.logo_path      || data.logoPath,
            footerMessage: settings.receiptMessage || settings.receipt_footer,
            terms:         settings.receiptTerms  || settings.receipt_terms  || '',
            receiptTheme:  this.settings.receiptTheme,
            fontSize:      this.settings.fontSize,
            logoSize:      this.settings.logoSize,
            showLogo:      this.settings.showLogo !== false,
            showHeader:    this.settings.showHeader !== false,
            showFooter:    this.settings.showFooter !== false,
            showBarcode:   this.settings.showBarcode !== false,
            showTaxId:     settings.showTaxId !== false
        });

        if (window.ReceiptRenderer && typeof window.ReceiptRenderer.buildHTML === 'function') {
            try {
                return window.ReceiptRenderer.buildHTML(enriched);
            } catch (e) {
                console.error('[PrintDialog] ReceiptRenderer.buildHTML failed:', e);
            }
        }

        // Last-resort fallback
        const theme = (window.ReceiptThemes || {})[enriched.receiptTheme] || (window.ReceiptThemes || {})['classic'];
        if (theme && typeof theme.buildHTML === 'function') return theme.buildHTML(enriched);

        return `<!DOCTYPE html><html><body><pre style="font-family:monospace;font-size:8pt;width:80mm">
${enriched.shopName || ''}
Invoice: ${enriched.invoiceNo || 'N/A'}
Total: Rs. ${parseFloat(enriched.grandTotal || 0).toFixed(2)}
</pre></body></html>`;
    },

    /**
     * Print using browser print dialog
     * @param {string} html - HTML content to print
     */
    browserPrint(html) {
        return new Promise((resolve, reject) => {
            try {
                const iframe = document.createElement('iframe');
                iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;visibility:hidden;';
                document.body.appendChild(iframe);

                iframe.addEventListener('load', () => {
                    try {
                        iframe.contentWindow.focus();
                        iframe.contentWindow.print();
                        setTimeout(() => {
                            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
                            resolve();
                        }, 2000);
                    } catch (e) {
                        reject(e);
                    }
                });

                iframe.srcdoc = html;
            } catch (error) {
                reject(error);
            }
        });
    },

    /**
     * Save receipt as PDF
     */
    async saveAsPDF() {
        if (!this.receiptData) {
            console.error('[PrintDialog] No receipt data to save');
            return;
        }

        try {
            // Switch to browser print mode for PDF saving
            const html = this.generateFullHTML(this.receiptData);
            
            // Create a temporary link for download (if supported)
            // Otherwise, use browser print dialog where user can select "Save as PDF"
            await this.browserPrint(html);
            
            if (window.app) {
                window.app.showNotification('Use "Save as PDF" option in print dialog', 'info');
            }
        } catch (error) {
            console.error('[PrintDialog] Save as PDF error:', error);
            if (window.app) {
                window.app.showNotification('Failed to save PDF: ' + error.message, 'error');
            }
        }
    }
};

// Make globally available
window.PrintDialog = PrintDialog;
