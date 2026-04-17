// src/frontend/receipt_renderer.js
(function() {
    'use strict';

    /**
     * Build a complete receipt HTML string using the active theme.
     * @param {Object} receiptData  — same structure as PrintService.printReceipt
     * @returns {string}  Full HTML document string
     */
    function buildReceiptHTML(receiptData) {
        const themes  = window.ReceiptThemes || {};
        // Priority: receiptData.receiptTheme > shopSettings.receiptTheme > default 'classic'
        const setting = receiptData.receiptTheme || 
            (window.shopSettings ? window.shopSettings.getSetting('receiptTheme') : null) || 
            'classic';
        const theme   = themes[setting] || themes['classic'] || themes[Object.keys(themes)[0]];

        if (!theme || typeof theme.buildHTML !== 'function') {
            console.error('[ReceiptRenderer] No valid theme found:', setting);
            // Return bare minimum fallback
            return `<!DOCTYPE html><html><body><pre>
${receiptData.shopName || 'POS'}
Invoice: ${receiptData.invoiceNo || 'N/A'}
Total: Rs. ${parseFloat(receiptData.grandTotal || 0).toFixed(2)}
</pre></body></html>`;
        }

        return theme.buildHTML(receiptData);
    }

    /**
     * Print a receipt using the selected theme via the HTML iframe path.
     * Falls back to raw ESC/POS if PrintService.sendToPrinter is available
     * and the user has enabled raw printing.
     * @param {Object}   receiptData
     * @param {function} [onDone]
     */
    async function printReceipt(receiptData, onDone) {
        // Build enriched receipt data from shopSettings
        const settings = window.shopSettings ? window.shopSettings.getAllSettings() : {};
        const enriched = Object.assign({
            shopName:      settings.shopName     || settings.shop_name,
            shopAddress:   settings.shopAddress  || settings.shop_address,
            shopPhone:     settings.shopPhone    || settings.shop_phone,
            taxNumber:     settings.taxNumber    || settings.ntn_number,
            gstNumber:     settings.gstNumber    || settings.gst_number,
            logoPath:      settings.logoPath     || settings.logo_path,
            footerMessage: settings.receiptMessage || settings.receipt_footer,
            showLogo:      settings.showLogo   !== false,
            showHeader:    settings.showHeader !== false,
            showFooter:    settings.showFooter !== false,
            showBarcode:   settings.showBarcode !== false
        }, receiptData);

        const useRaw = window.shopSettings
            ? window.shopSettings.getSetting('useRawPrint') !== false  // DEFAULT TRUE
            : true;

        // Try raw ESC/POS if explicitly enabled
        if (useRaw && window.PrintService && typeof window.PrintService.generateESCPOS === 'function') {
            try {
                const bytes = await window.PrintService.generateESCPOS(enriched);
                const ok    = await window.PrintService.sendToPrinter(bytes);
                if (ok) {
                    if (typeof onDone === 'function') onDone();
                    return;
                }
            } catch (e) {
                console.warn('[ReceiptRenderer] Raw print failed, falling back to HTML:', e);
            }
        }

        // HTML print path (primary for EXE/PyWebView builds)
        const html = buildReceiptHTML(enriched);
        if (window.PrintService && typeof window.PrintService.printHTML === 'function') {
            window.PrintService.printHTML(html, onDone);
        } else {
            console.error('[ReceiptRenderer] PrintService.printHTML not available');
        }
    }

    /**
     * Show a live on-screen preview of the receipt inside a modal.
     * @param {Object} receiptData
     */
    function previewReceipt(receiptData) {
        const settings = window.shopSettings ? window.shopSettings.getAllSettings() : {};
        const enriched = Object.assign({
            shopName:      settings.shopName    || settings.shop_name,
            shopAddress:   settings.shopAddress || settings.shop_address,
            shopPhone:     settings.shopPhone   || settings.shop_phone,
            taxNumber:     settings.taxNumber   || settings.ntn_number,
            gstNumber:     settings.gstNumber   || settings.gst_number,
            logoPath:      settings.logoPath    || settings.logo_path,
            footerMessage: settings.receiptMessage || settings.receipt_footer,
            showLogo:    true,
            showHeader:  true,
            showFooter:  true,
            showBarcode: true
        }, receiptData);

        const html = buildReceiptHTML(enriched);

        // Reuse or create preview modal
        let modal = document.getElementById('_receipt_preview_modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = '_receipt_preview_modal';
            modal.style.cssText = [
                'position:fixed','top:0','left:0','width:100%','height:100%',
                'background:rgba(0,0,0,0.65)','z-index:99999',
                'display:flex','align-items:center','justify-content:center'
            ].join(';');
            modal.innerHTML = `
<div style="background:#fff;border-radius:8px;padding:16px;
            max-height:90vh;display:flex;flex-direction:column;
            box-shadow:0 8px 32px rgba(0,0,0,0.35);">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
    <strong style="font-size:15px">Receipt Preview</strong>
    <button id="_receipt_preview_close"
      style="background:#e74c3c;color:#fff;border:none;border-radius:4px;
             padding:4px 12px;cursor:pointer;font-size:14px">✕ Close</button>
  </div>
  <iframe id="_receipt_preview_frame"
    style="width:96mm;min-height:200mm;border:1px solid #ddd;
           flex:1;overflow-y:auto;background:#fff;"></iframe>
  <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
    <button id="_receipt_preview_print"
      style="background:#27ae60;color:#fff;border:none;border-radius:4px;
             padding:8px 20px;cursor:pointer;font-size:14px">🖨 Print</button>
  </div>
</div>`;
            document.body.appendChild(modal);
            document.getElementById('_receipt_preview_close').onclick = () => { modal.style.display = 'none'; };
            document.getElementById('_receipt_preview_print').onclick = () => {
                printReceipt(receiptData);
                modal.style.display = 'none';
            };
        }

        const frame = document.getElementById('_receipt_preview_frame');
        frame.srcdoc = html;
        modal.style.display = 'flex';
    }

    window.ReceiptRenderer = {
        buildHTML    : buildReceiptHTML,
        printReceipt : printReceipt,
        preview      : previewReceipt
    };
})();
