// src/frontend/print_service.js
// ESC/POS thermal receipt printing — 80mm paper

// 80mm paper @ 12 dots/char = 42-48 chars printable width
// Use 42 for maximum compatibility with all ESC/POS printer variants
const COLS = 42;

function twoCol(left, right) {
    const l = String(left || '');
    const r = String(right || '');
    const available = COLS - r.length;
    if (available <= 0) return (l + ' ' + r).substring(0, COLS);
    return l.substring(0, available).padEnd(available) + r;
}

function centerText(str) {
    str = String(str || '');
    if (str.length >= COLS) return str.substring(0, COLS);
    const pad = Math.floor((COLS - str.length) / 2);
    return ' '.repeat(pad) + str;
}

const SEP_THICK = '='.repeat(COLS);
const SEP_THIN  = '-'.repeat(COLS);

const PrintService = {
    /**
     * Generate ESC/POS commands for thermal receipt printing
     * Routes to theme-specific generator based on receiptTheme
     * @param {Object} data - Receipt data
     * @returns {Promise<Uint8Array>} ESC/POS command bytes
     */
    async generateESCPOS(data) {
        const theme = data.receiptTheme || 'classic';
        
        // Route to theme-specific generator
        switch(theme) {
            case 'modern':
                return await this.generateModernESCPOS(data);
            case 'minimal':
                return await this.generateMinimalESCPOS(data);
            case 'classic':
            default:
                return await this.generateClassicESCPOS(data);
        }
    },

    async generateClassicESCPOS(data) {
        const encoder = new TextEncoder();
        let commands = [];
        const money = (n) => 'Rs.' + parseFloat(n || 0).toFixed(2);

        commands.push(0x1B, 0x40);
        commands.push(0x1B, 0x74, 0x00);
        commands.push(0x1B, 0x33, 0x18);

        if (data.logoPath && data.showLogo !== false) {
            try {
                const logoCommands = await this.imageToESCPOS(data.logoPath, 336);
                if (logoCommands && logoCommands.length > 0) {
                    commands.push(0x1B, 0x61, 0x01);
                    commands.push(...logoCommands);
                    commands.push(0x1B, 0x32);
                    commands.push(0x0A);
                }
            } catch (e) { console.error('[PrintService] Logo failed:', e); }
        }

        const fontSizeMap = {
            small:  { normal: [0x1B, 0x21, 0x00], title: [0x1B, 0x21, 0x10] },
            medium: { normal: [0x1B, 0x21, 0x00], title: [0x1B, 0x21, 0x30] },
            large:  { normal: [0x1B, 0x21, 0x08], title: [0x1B, 0x21, 0x38] }
        };
        const fs = fontSizeMap[data.fontSize || 'medium'] || fontSizeMap.medium;

        commands.push(0x1B, 0x61, 0x01);
        if (data.showHeader !== false && data.shopName) {
            commands.push(...fs.title);
            commands.push(0x1B, 0x45, 0x01);
            commands.push(...encoder.encode((data.shopName || '').toUpperCase() + '\n'));
            commands.push(0x1B, 0x45, 0x00);
            commands.push(...fs.normal);
        }
        if (data.copyLabel) {
            commands.push(...encoder.encode('*** ' + data.copyLabel + ' ***\n'));
        }
        if (data.shopAddress) commands.push(...encoder.encode(data.shopAddress + '\n'));
        if (data.shopPhone)   commands.push(...encoder.encode('Tel: ' + data.shopPhone + '\n'));
        if (data.taxNumber && data.showTaxId !== false) commands.push(...encoder.encode('NTN: ' + data.taxNumber + '\n'));
        if (data.gstNumber && data.showTaxId !== false) commands.push(...encoder.encode('GST: ' + data.gstNumber + '\n'));
        if (data.headerText) commands.push(...encoder.encode(data.headerText + '\n'));
        commands.push(...encoder.encode(SEP_THICK + '\n'));

        commands.push(0x1B, 0x61, 0x00);
        commands.push(...encoder.encode('Invoice: ' + (data.invoiceNo || 'N/A') + '\n'));
        commands.push(...encoder.encode('Date: ' + (data.date || '') + ' ' + (data.time || '') + '\n'));
        if (data.customer) commands.push(...encoder.encode('Customer: ' + data.customer + '\n'));
        if (data.payment_method) {
            const pmLabel = data.payment_method.toUpperCase() === 'CREDIT' ? '*** CREDIT SALE ***' : 'Payment: ' + data.payment_method.charAt(0).toUpperCase() + data.payment_method.slice(1);
            commands.push(...encoder.encode(pmLabel + '\n'));
        }
        commands.push(...encoder.encode(SEP_THIN + '\n'));

        commands.push(0x1B, 0x45, 0x01);
        // Column layout for 42 chars: Name(20) Qty(4) Price(9) Total(9)
        const itemHdr = 'Item'.padEnd(20) + 'Qty'.padStart(4) + 'Price'.padStart(9) + 'Total'.padStart(9);
        commands.push(...encoder.encode(itemHdr.substring(0, COLS) + '\n'));
        commands.push(0x1B, 0x45, 0x00);
        commands.push(...encoder.encode(SEP_THIN + '\n'));

        if (data.items && data.items.length > 0) {
            data.items.forEach(item => {
                const name  = String(item.name || 'Item').substring(0, 19).padEnd(20);
                const qty   = String(item.quantity || 1).padStart(4);
                const price = parseFloat(item.price || 0).toFixed(2).padStart(9);
                const total = parseFloat(item.total || 0).toFixed(2).padStart(9);
                commands.push(...encoder.encode((name + qty + price + total).substring(0, COLS) + '\n'));
                const fullName = String(item.name || 'Item');
                if (fullName.length > 19) {
                    commands.push(...encoder.encode('  ' + fullName.substring(19) + '\n'));
                }
            });
        }
        commands.push(...encoder.encode(SEP_THIN + '\n'));

        commands.push(0x1B, 0x61, 0x00);
        commands.push(...encoder.encode(twoCol('Subtotal:', money(data.subtotal)) + '\n'));
        if (parseFloat(data.discount || 0) > 0) {
            commands.push(...encoder.encode(twoCol('Discount:', '-' + money(data.discount)) + '\n'));
        }
        if (parseFloat(data.taxRate || 0) > 0) {
            const pct = (parseFloat(data.taxRate) * 100).toFixed(1);
            commands.push(...encoder.encode(twoCol('GST (' + pct + '%):', money(data.taxAmount)) + '\n'));
        }
        commands.push(...encoder.encode(SEP_THICK + '\n'));

        commands.push(0x1B, 0x45, 0x01);
        commands.push(0x1D, 0x42, 0x01);
        commands.push(...encoder.encode(twoCol('  TOTAL:', money(data.grandTotal) + '  ') + '\n'));
        commands.push(0x1D, 0x42, 0x00);
        commands.push(0x1B, 0x45, 0x00);
        commands.push(...encoder.encode(SEP_THICK + '\n'));

        if (data.amountPaid !== undefined) {
            commands.push(0x0A);
            commands.push(...encoder.encode(twoCol('Amount Paid:', money(data.amountPaid)) + '\n'));
            commands.push(...encoder.encode(twoCol('Change:', money(data.change)) + '\n'));
        }

        if (data.showBarcode !== false && data.invoiceNo) {
            commands.push(0x0A);
            commands.push(0x1B, 0x61, 0x01);
            commands.push(...encoder.encode('*' + data.invoiceNo + '*\n'));
            commands.push(...encoder.encode(data.invoiceNo + '\n'));
            commands.push(0x1B, 0x61, 0x00);
        }

        if (data.showFooter !== false) {
            commands.push(0x0A);
            commands.push(0x1B, 0x61, 0x01);
            commands.push(...encoder.encode(SEP_THIN + '\n'));
            if (data.footerMessage) commands.push(...encoder.encode(data.footerMessage + '\n'));
            if (data.terms) {
                commands.push(...encoder.encode(SEP_THIN + '\n'));
                commands.push(0x1B, 0x61, 0x00);
                commands.push(...encoder.encode(data.terms + '\n'));
                commands.push(0x1B, 0x61, 0x01);
            }
        }

        commands.push(0x0A);
        commands.push(0x1B, 0x45, 0x01);
        commands.push(...encoder.encode('** SHUKRIYA — THANK YOU **\n'));
        commands.push(0x1B, 0x45, 0x00);

        commands.push(0x0A, 0x0A, 0x0A, 0x0A, 0x0A);
        commands.push(0x1D, 0x56, 0x42, 0x28);

        console.log('[PrintService] Classic ESC/POS: ' + commands.length + ' bytes');
        return new Uint8Array(commands);
    },

    /**
     * MODERN THEME - Clean professional layout
     * Centered headers, structured sections
     */
    async generateModernESCPOS(data) {
        // Modern theme: cleaner column format, no === lines, uses --- separators
        // Visual difference from classic: different total label, centered header style
        const encoder = new TextEncoder();
        let commands = [];
        const money = (n) => 'Rs.' + parseFloat(n || 0).toFixed(2);
        
        commands.push(0x1B, 0x40);
        commands.push(0x1B, 0x74, 0x00);
        commands.push(0x1B, 0x33, 0x18);
        
        // Logo
        if (data.logoPath && data.showLogo !== false) {
            try {
                const logoCommands = await this.imageToESCPOS(data.logoPath, 336);
                if (logoCommands && logoCommands.length > 0) {
                    commands.push(0x1B, 0x61, 0x01);
                    commands.push(...logoCommands);
                    commands.push(0x1B, 0x32);
                    commands.push(0x0A);
                }
            } catch (e) { console.error('[PrintService] Logo failed:', e); }
        }
        
        const fontSizeMap = {
            small:  { normal: [0x1B, 0x21, 0x00], title: [0x1B, 0x21, 0x10] },
            medium: { normal: [0x1B, 0x21, 0x00], title: [0x1B, 0x21, 0x30] },
            large:  { normal: [0x1B, 0x21, 0x08], title: [0x1B, 0x21, 0x38] }
        };
        const fs = fontSizeMap[data.fontSize || 'medium'] || fontSizeMap.medium;
        
        // Modern header: centered, bold shop name, clean sub-lines
        commands.push(0x1B, 0x61, 0x01);  // Center
        if (data.showHeader !== false && data.shopName) {
            commands.push(...fs.title);
            commands.push(0x1B, 0x45, 0x01);
            commands.push(...encoder.encode((data.shopName || '').toUpperCase() + '\n'));
            commands.push(0x1B, 0x45, 0x00);
            commands.push(...fs.normal);
        }
        if (data.shopAddress) commands.push(...encoder.encode(data.shopAddress + '\n'));
        if (data.shopPhone)   commands.push(...encoder.encode(data.shopPhone + '\n'));
        if (data.taxNumber && data.showTaxId !== false) commands.push(...encoder.encode('NTN: ' + data.taxNumber + '\n'));
        if (data.gstNumber && data.showTaxId !== false) commands.push(...encoder.encode('GST: ' + data.gstNumber + '\n'));
        commands.push(...encoder.encode(SEP_THICK + '\n'));
        
        // Invoice info
        commands.push(0x1B, 0x61, 0x00);  // Left
        commands.push(...encoder.encode(twoCol('Invoice#:', data.invoiceNo || 'N/A') + '\n'));
        commands.push(...encoder.encode(twoCol('Date:', (data.date || '') + ' ' + (data.time || '')) + '\n'));
        if (data.customer) commands.push(...encoder.encode(twoCol('Customer:', data.customer) + '\n'));
        if (data.payment_method) {
            const pmLabel = data.payment_method.toUpperCase() === 'CREDIT' ? '*** CREDIT SALE ***' : 'Payment: ' + data.payment_method.charAt(0).toUpperCase() + data.payment_method.slice(1);
            commands.push(...encoder.encode(pmLabel + '\n'));
        }
        commands.push(...encoder.encode(SEP_THIN + '\n'));
        
        // Items
        commands.push(0x1B, 0x45, 0x01);
        const hdr = 'Description'.padEnd(20) + 'Qty'.padStart(4) + 'Price'.padStart(9) + 'Amt'.padStart(9);
        commands.push(...encoder.encode(hdr.substring(0, COLS) + '\n'));
        commands.push(0x1B, 0x45, 0x00);
        commands.push(...encoder.encode(SEP_THIN + '\n'));
        
        if (data.items && data.items.length > 0) {
            data.items.forEach(item => {
                const name  = String(item.name || 'Item').substring(0, 19).padEnd(20);
                const qty   = String(item.quantity || 1).padStart(4);
                const price = parseFloat(item.price || 0).toFixed(2).padStart(9);
                const total = parseFloat(item.total || 0).toFixed(2).padStart(9);
                commands.push(...encoder.encode((name + qty + price + total).substring(0, COLS) + '\n'));
            });
        }
        commands.push(...encoder.encode(SEP_THIN + '\n'));
        
        // Totals
        commands.push(...encoder.encode(twoCol('Subtotal:', money(data.subtotal)) + '\n'));
        if (parseFloat(data.discount || 0) > 0) {
            commands.push(...encoder.encode(twoCol('Discount:', '-' + money(data.discount)) + '\n'));
        }
        if (parseFloat(data.taxRate || 0) > 0) {
            const pct = (parseFloat(data.taxRate) * 100).toFixed(1);
            commands.push(...encoder.encode(twoCol('GST (' + pct + '%):', money(data.taxAmount)) + '\n'));
        }
        commands.push(...encoder.encode(SEP_THICK + '\n'));
        
        // Total — modern label "AMOUNT DUE"
        commands.push(0x1B, 0x45, 0x01);
        commands.push(0x1D, 0x42, 0x01);
        commands.push(...encoder.encode(twoCol('  AMOUNT DUE:', money(data.grandTotal) + '  ') + '\n'));
        commands.push(0x1D, 0x42, 0x00);
        commands.push(0x1B, 0x45, 0x00);
        commands.push(...encoder.encode(SEP_THICK + '\n'));
        
        if (data.amountPaid !== undefined) {
            commands.push(0x0A);
            commands.push(...encoder.encode(twoCol('Paid:', money(data.amountPaid)) + '\n'));
            commands.push(...encoder.encode(twoCol('Change:', money(data.change)) + '\n'));
        }
        
        if (data.showBarcode !== false && data.invoiceNo) {
            commands.push(0x0A);
            commands.push(0x1B, 0x61, 0x01);
            commands.push(...encoder.encode('*' + data.invoiceNo + '*\n'));
            commands.push(0x1B, 0x61, 0x00);
        }
        
        if (data.showFooter !== false) {
            commands.push(0x0A);
            commands.push(0x1B, 0x61, 0x01);
            commands.push(...encoder.encode(SEP_THIN + '\n'));
            if (data.footerMessage) commands.push(...encoder.encode(data.footerMessage + '\n'));
            if (data.terms) {
                commands.push(...encoder.encode(SEP_THIN + '\n'));
                commands.push(0x1B, 0x61, 0x00);
                commands.push(...encoder.encode(data.terms + '\n'));
                commands.push(0x1B, 0x61, 0x01);
            }
        }
        
        commands.push(0x0A);
        commands.push(0x1B, 0x45, 0x01);
        commands.push(...encoder.encode('- Thank You / Shukriya -\n'));
        commands.push(0x1B, 0x45, 0x00);
        
        commands.push(0x0A, 0x0A, 0x0A, 0x0A, 0x0A);
        commands.push(0x1D, 0x56, 0x42, 0x28);
        
        return new Uint8Array(commands);
    },

    /**
     * MINIMAL THEME - Ultra-clean, no heavy borders
     * Simple separators, clean spacing
     */
    async generateMinimalESCPOS(data) {
        // Minimal theme: 2-line item format, no separators except thin dashes,
        // clean readable layout without extra borders
        const encoder = new TextEncoder();
        let commands = [];
        const money = (n) => 'Rs.' + parseFloat(n || 0).toFixed(2);
        
        commands.push(0x1B, 0x40);
        commands.push(0x1B, 0x74, 0x00);
        commands.push(0x1B, 0x33, 0x18);
        
        // Logo
        if (data.logoPath && data.showLogo !== false) {
            try {
                const logoCommands = await this.imageToESCPOS(data.logoPath, 336);
                if (logoCommands && logoCommands.length > 0) {
                    commands.push(0x1B, 0x61, 0x01);
                    commands.push(...logoCommands);
                    commands.push(0x1B, 0x32);
                    commands.push(0x0A);
                }
            } catch (e) {}
        }
        
        const fontSizeMap = {
            small:  { normal: [0x1B, 0x21, 0x00], title: [0x1B, 0x21, 0x10] },
            medium: { normal: [0x1B, 0x21, 0x00], title: [0x1B, 0x21, 0x30] },
            large:  { normal: [0x1B, 0x21, 0x08], title: [0x1B, 0x21, 0x38] }
        };
        const fs = fontSizeMap[data.fontSize || 'medium'] || fontSizeMap.medium;
        
        // Minimal header: just shop name, no heavy separators
        commands.push(0x1B, 0x61, 0x01);
        if (data.showHeader !== false && data.shopName) {
            commands.push(...fs.title);
            commands.push(...encoder.encode((data.shopName || '') + '\n'));
            commands.push(...fs.normal);
        }
        if (data.shopAddress) commands.push(...encoder.encode(data.shopAddress + '\n'));
        if (data.shopPhone)   commands.push(...encoder.encode(data.shopPhone + '\n'));
        commands.push(...encoder.encode(SEP_THIN + '\n'));
        
        commands.push(0x1B, 0x61, 0x00);
        commands.push(...encoder.encode(twoCol('Invoice:', data.invoiceNo || 'N/A') + '\n'));
        commands.push(...encoder.encode('Date: ' + (data.date || '') + '\n'));
        if (data.customer) commands.push(...encoder.encode('Customer: ' + data.customer + '\n'));
        commands.push(...encoder.encode(SEP_THIN + '\n'));
        
        // Minimal items: 2 lines per item
        if (data.items && data.items.length > 0) {
            data.items.forEach(item => {
                const name = String(item.name || 'Item').substring(0, COLS);
                commands.push(...encoder.encode(name + '\n'));
                const detail = '  ' + (item.quantity || 1) + ' x ' +
                    parseFloat(item.price || 0).toFixed(2) + ' = ' +
                    parseFloat(item.total || 0).toFixed(2);
                commands.push(...encoder.encode(detail + '\n'));
            });
        }
        commands.push(...encoder.encode(SEP_THIN + '\n'));
        
        commands.push(...encoder.encode(twoCol('Subtotal:', money(data.subtotal)) + '\n'));
        if (parseFloat(data.discount || 0) > 0) {
            commands.push(...encoder.encode(twoCol('Discount:', '-' + money(data.discount)) + '\n'));
        }
        if (parseFloat(data.taxRate || 0) > 0) {
            const pct = (parseFloat(data.taxRate) * 100).toFixed(1);
            commands.push(...encoder.encode(twoCol('GST(' + pct + '%):', money(data.taxAmount)) + '\n'));
        }
        commands.push(...encoder.encode(SEP_THIN + '\n'));
        commands.push(0x1B, 0x45, 0x01);
        commands.push(...encoder.encode(twoCol('TOTAL:', money(data.grandTotal)) + '\n'));
        commands.push(0x1B, 0x45, 0x00);
        commands.push(...encoder.encode(SEP_THIN + '\n'));
        
        if (data.amountPaid !== undefined) {
            commands.push(0x0A);
            commands.push(...encoder.encode(twoCol('Paid:', money(data.amountPaid)) + '\n'));
            commands.push(...encoder.encode(twoCol('Change:', money(data.change)) + '\n'));
        }
        
        if (data.showFooter !== false) {
            commands.push(0x0A);
            commands.push(0x1B, 0x61, 0x01);
            if (data.footerMessage) commands.push(...encoder.encode(data.footerMessage + '\n'));
            if (data.terms) {
                commands.push(0x1B, 0x61, 0x00);
                commands.push(...encoder.encode(data.terms + '\n'));
                commands.push(0x1B, 0x61, 0x01);
            }
        }
        
        commands.push(0x0A);
        commands.push(...encoder.encode('Thank you.\n'));
        
        commands.push(0x0A, 0x0A, 0x0A, 0x0A, 0x0A);
        commands.push(0x1D, 0x56, 0x42, 0x28);
        
        return new Uint8Array(commands);
    },

    /**
     * Generate preview text for receipt preview dialog
     * This was missing - causing preview to not render!
     */
    generatePreviewText(data) {
        const COLS = 48;
        const sep = '='.repeat(COLS);
        const dash = '-'.repeat(COLS);
        const center = (str) => {
            str = String(str || '');
            const pad = Math.max(0, Math.floor((COLS - str.length) / 2));
            return ' '.repeat(pad) + str;
        };
        const money = (n) => 'Rs. ' + parseFloat(n || 0).toFixed(2);

        let lines = [];

        if (data.showLogo !== false && data.logoPath) {
            lines.push(center('[LOGO]'));
        }
        if (data.showHeader !== false) {
            lines.push(center((data.shopName || '').toUpperCase()));
            if (data.shopAddress) lines.push(center(data.shopAddress));
            if (data.shopPhone) lines.push(center('Tel: ' + data.shopPhone));
            if (data.taxNumber && data.showTaxId !== false) lines.push(center('NTN: ' + data.taxNumber));
            if (data.gstNumber && data.showTaxId !== false) lines.push(center('GST: ' + data.gstNumber));
        }
        lines.push(sep);
        lines.push('Invoice #: ' + (data.invoiceNo || 'N/A'));
        lines.push('Date: ' + (data.date || '') + ' ' + (data.time || ''));
        if (data.customer) lines.push('Customer: ' + data.customer);
        lines.push(dash);

        const hdr = 'Item'.padEnd(22) + 'Qty'.padStart(4) + '  ' + 'Price'.padStart(9) + '  ' + 'Total'.padStart(9);
        lines.push(hdr);
        lines.push(dash);

        (data.items || []).forEach(item => {
            const name = String(item.name || 'Unknown').substring(0, 21).padEnd(22);
            const qty = String(item.quantity || 1).padStart(4);
            const price = (parseFloat(item.price || 0).toFixed(2)).padStart(9);
            const total = (parseFloat(item.total || 0).toFixed(2)).padStart(9);
            lines.push(name + qty + '  ' + price + '  ' + total);
        });

        lines.push(dash);

        const rightRow = (label, val) => {
            return (label + val).padStart(COLS);
        };

        lines.push(rightRow('Subtotal:'.padEnd(20), 'Rs. ' + parseFloat(data.subtotal || 0).toFixed(2)));
        if (parseFloat(data.discount || 0) > 0)
            lines.push(rightRow('Discount:'.padEnd(20), '- ' + 'Rs. ' + parseFloat(data.discount).toFixed(2)));
        
        const taxRate = parseFloat(data.taxRate || 0);
        if (taxRate > 0) {
            const taxPct = (taxRate * 100).toFixed(1);
            lines.push(rightRow(('GST (' + taxPct + '%):').padEnd(20), 'Rs. ' + parseFloat(data.taxAmount || 0).toFixed(2)));
        }

        lines.push('');
        lines.push(sep);
        lines.push(rightRow('TOTAL:'.padEnd(20), 'Rs. ' + parseFloat(data.grandTotal || 0).toFixed(2)));
        lines.push(sep);

        if (data.amountPaid !== undefined) {
            lines.push('');
            lines.push(dash);
            lines.push(rightRow('Amount Paid:'.padEnd(20), 'Rs. ' + parseFloat(data.amountPaid || 0).toFixed(2)));
            lines.push(rightRow('Change:'.padEnd(20), 'Rs. ' + parseFloat(data.change || 0).toFixed(2)));
        }

        if (data.showBarcode !== false && data.invoiceNo) {
            lines.push('');
            lines.push(center('*' + data.invoiceNo + '*'));
        }

        if (data.showFooter !== false) {
            lines.push('');
            lines.push(dash);
            if (data.footerMessage) lines.push(center(data.footerMessage));
            if (data.terms) {
                lines.push('--------------------------------');
                lines.push(data.terms);
            }
        }

        lines.push('');
        lines.push(center('** THANK YOU — AAPKA SHUKRIYA **'));
        lines.push('');

        return lines.join('\n');
    },

    /**
     * Send ESC/POS commands to printer via backend API
     */
    async sendToPrinter(commands) {
        try {
            // CRITICAL: do NOT use spread (...commands) with btoa — stack overflows
            // on large receipts. Use a chunked loop instead.
            let binary = '';
            for (let i = 0; i < commands.length; i++) {
                binary += String.fromCharCode(commands[i]);
            }
            const base64Commands = btoa(binary);
            console.log(`[PrintService] sendToPrinter: ${commands.length} bytes → ${base64Commands.length} base64 chars`);
            const response = await fetch('/printers/print', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('access_token')
                },
                body: JSON.stringify({ commands: base64Commands })
            });
            
            if (!response.ok) return false;
            
            const result = await response.json();
            return result.success === true;
        } catch (error) {
            console.error('[PrintService] Print failed:', error);
            return false;
        }
    },

    /**
     * Convert image to ESC/POS bitmap
     */
    imageToESCPOS(imageUrl, maxWidth = 384) {
        return new Promise((resolve) => {
            try {
                const img = new Image();
                img.crossOrigin = 'Anonymous';
                
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        const scale = Math.min(1, maxWidth / img.width);
                        canvas.width = Math.round(img.width * scale);
                        // Width must be a multiple of 8 for ESC/POS byte alignment
                        canvas.width = Math.ceil(canvas.width / 8) * 8;
                        canvas.height = Math.round(img.height * scale);
                        
                        const ctx = canvas.getContext('2d');
                        // CRITICAL: fill white first — prevents transparent pixels
                        // from becoming black dots on thermal paper
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        
                        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        const pixels = imageData.data;
                        
                        const commands = [];
                        const totalHeight = canvas.height;
                        const bytesPerRow = canvas.width / 8; // exact — width is multiple of 8
                        const chunkSize = 255;

                        // ESC/POS raster bitmap (GS v 0) — correct chunking
                        for (let chunkStart = 0; chunkStart < totalHeight; chunkStart += chunkSize) {
                            const chunkHeight = Math.min(chunkSize, totalHeight - chunkStart);
                            commands.push(0x1D, 0x76, 0x30, 0x00);
                            commands.push(bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF);
                            commands.push(chunkHeight & 0xFF, (chunkHeight >> 8) & 0xFF);
                            for (let y = chunkStart; y < chunkStart + chunkHeight; y++) {
                                for (let byteIdx = 0; byteIdx < bytesPerRow; byteIdx++) {
                                    let byte = 0;
                                    for (let bit = 0; bit < 8; bit++) {
                                        const x = byteIdx * 8 + bit;
                                        const idx = (y * canvas.width + x) * 4;
                                        const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2], a = pixels[idx + 3];
                                        // Composite onto white: effective = alpha*pixel + (1-alpha)*255
                                        const effective = (a / 255) * ((r + g + b) / 3) + (1 - a / 255) * 255;
                                        if (effective < 160) byte |= (1 << (7 - bit));
                                    }
                                    commands.push(byte);
                                }
                            }
                        }
                        
                        commands.push(0x0A);
                        resolve(new Uint8Array(commands));
                    } catch (e) {
                        console.error('[PrintService] Image conversion error:', e);
                        resolve(null);
                    }
                };
                
                img.onerror = () => {
                    console.error('[PrintService] Failed to load image');
                    resolve(null);
                };
                
                img.src = imageUrl;
            } catch (e) {
                console.error('[PrintService] Image processing error:', e);
                resolve(null);
            }
        });
    },

    /**
     * Print receipt via HTML (fallback)
     */
    async printReceipt(receiptData, onDone) {
        const escPosCommands = await this.generateESCPOS(receiptData);
        const success = await this.sendToPrinter(escPosCommands);
        if (success && typeof onDone === 'function') {
            onDone();
        }
    },

    /**
     * Convert an image URL to a base64 data URI.
     * Renders at native resolution to prevent blur in PyWebView Chromium print.
     */
    imageToBase64DataURI(imageUrl) {
        return new Promise((resolve) => {
            if (!imageUrl || imageUrl.startsWith('data:')) { resolve(imageUrl); return; }
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                } catch (e) { resolve(imageUrl); }
            };
            img.onerror = () => resolve(imageUrl);
            img.src = imageUrl;
        });
    },

    /**
     * Print HTML content
     */
    printHTML(htmlContent, onDone) {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;width:80mm;height:auto;top:-9999px;left:-9999px;';
        document.body.appendChild(iframe);

        iframe.addEventListener('load', () => {
            try {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
                if (typeof onDone === 'function') onDone();
            } catch (e) {
                console.error('[PrintService] HTML print error:', e);
            }
            setTimeout(() => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 1000);
        });

        iframe.srcdoc = htmlContent;
    },

    /**
     * Escape HTML
     */
    escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
};

window.PrintService = PrintService;
