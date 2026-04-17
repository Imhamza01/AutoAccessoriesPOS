// src/frontend/receipt_themes.js
// Receipt visual themes for Auto Accessories POS
// Usage: window.ReceiptThemes['classic'].buildHTML(receiptData) => string

(function() {
    'use strict';

    // ── shared helpers ────────────────────────────────────────────────────────
    function esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
    function money(n) {
        return 'Rs. ' + parseFloat(n || 0).toFixed(2);
    }
    function pad(str, len, right) {
        str = String(str || '');
        if (str.length >= len) return str.substring(0, len);
        const p = ' '.repeat(len - str.length);
        return right ? p + str : str + p;
    }
    function logoTag(data) {
        const logoPath = data.logoPath;
        if (!logoPath) return '';
        let src;
        if (data.logoBase64) {
            src = data.logoBase64;
        } else if (logoPath.startsWith('http') || logoPath.startsWith('data:')) {
            src = logoPath;
        } else {
            const origin = (window.location.origin && window.location.origin !== 'null')
                ? window.location.origin
                : 'http://127.0.0.1:8000';
            const cleanPath = logoPath.replace(/^\/+/, '');
            src = origin + '/' + (cleanPath.includes('uploads/') ? cleanPath : 'uploads/' + cleanPath);
        }
        const widthMap = { small: '25mm', medium: '45mm', large: '65mm' };
        const maxW = widthMap[data.logoSize || 'medium'] || '45mm';
        return `<img src="${esc(src)}" class="logo" alt="Logo" style="max-width:${maxW};max-height:18mm;" onerror="this.style.display='none'">`;
    }
    function itemRows_classic(items) {
        return (items || []).map(it => {
            const name  = esc(it.name || 'Item');
            const qty   = String(it.quantity || 1);
            const price = parseFloat(it.price || 0).toFixed(2);
            const total = parseFloat(it.total || (it.quantity * it.price) || 0).toFixed(2);
            return `<tr>
                <td class="td-name">${name}</td>
                <td class="td-num">${qty}</td>
                <td class="td-num">${price}</td>
                <td class="td-num">${total}</td>
            </tr>`;
        }).join('');
    }
    function itemRows_modern(items) { return itemRows_classic(items); }
    function itemRows_minimal(items) { return itemRows_classic(items); }

    // ── BASE PAGE WRAPPER (ALL THEMES SHARE THIS) ─────────────────────────────
    function wrapPage(themeCSS, bodyHTML, fontSize) {
        // Map font size settings to actual pt values
        let baseFontSize = '8pt'; // default
        let smallFontSize = '7pt';
        let mediumFontSize = '8pt';
        let largeFontSize = '9pt';
        
        if (fontSize === 'small') {
            baseFontSize = '7pt';
            smallFontSize = '6.5pt';
            mediumFontSize = '7pt';
            largeFontSize = '8pt';
        } else if (fontSize === 'large') {
            baseFontSize = '9pt';
            smallFontSize = '8pt';
            mediumFontSize = '9pt';
            largeFontSize = '10pt';
        }
        
        return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width">
<title>Receipt</title>
<style>
@page {
    size: 80mm auto;
    margin: 0mm;
}
@media print {
    html, body {
        width: 80mm !important;
        max-width: 80mm !important;
        margin: 0 !important;
        padding: 2mm !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
    }
    .no-print { display: none !important; }
    table, tr, td, th, .totals-block, .totals-box { page-break-inside: avoid; }
}
*, *::before, *::after { box-sizing: border-box; }
html, body {
    width: 80mm;
    max-width: 80mm;
    overflow-x: hidden;
    margin: 0;
    padding: 3mm 2mm;
    background: #fff;
    color: #000;
    font-size: ${baseFontSize};
    line-height: 1.35;
    font-family: Arial, Helvetica, sans-serif;
}
img.logo {
    display: block;
    object-fit: contain;
    margin: 0 auto 2mm;
    image-rendering: -webkit-optimize-contrast;
    image-rendering: crisp-edges;
    image-rendering: pixelated;
}
table { width: 100%; border-collapse: collapse; }
/* Override font sizes in theme CSS with dynamic values */
.font-small { font-size: ${smallFontSize} !important; }
.font-medium { font-size: ${mediumFontSize} !important; }
.font-large { font-size: ${largeFontSize} !important; }
${themeCSS}
</style>
</head>
<body>${bodyHTML}</body></html>`;
    }

    // ════════════════════════════════════════════════════════════════════════════
    // THEME 1 — CLASSIC
    // Traditional Pakistani POS receipt look.
    // Courier monospace, === separators, left-aligned totals.
    // ════════════════════════════════════════════════════════════════════════════
    const CLASSIC_CSS = `
body { font-family: 'Courier New', Courier, monospace; font-size: 8pt; }
.shop-name { font-size: 11pt; font-weight: bold; text-align: center; text-transform: uppercase; }
.shop-sub  { text-align: center; font-size: 7.5pt; }
.sep-thick { border: none; border-top: 2px solid #000; margin: 2mm 0; }
.sep-thin  { border: none; border-top: 1px dashed #000; margin: 1.5mm 0; }
.info-row  { display: flex; justify-content: space-between; font-size: 7.5pt; }
thead tr th { font-weight: bold; font-size: 7.5pt; text-align: left; border-bottom: 1px solid #000; padding-bottom: 0.5mm; }
.td-name   { width: 48%; word-break: break-word; padding: 0.5mm 0; font-size: 7.5pt; }
.td-num    { width: 17%; text-align: right; padding: 0.5mm 0; font-size: 7.5pt; }
.totals-block { margin-top: 1mm; }
.total-row { display: flex; justify-content: space-between; font-size: 8pt; }
.grand-total { font-weight: bold; font-size: 10pt; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 1mm 0; margin: 1mm 0; }
.payment-row { font-size: 7.5pt; display: flex; justify-content: space-between; }
.footer { text-align: center; font-size: 7pt; margin-top: 3mm; }
.barcode-text { text-align: center; font-size: 9pt; letter-spacing: 2px; margin: 1.5mm 0; }
`;
    function buildClassic(d) {
        const logoHTML  = (d.showLogo !== false) ? logoTag(d) : '';
        const shopName  = esc(d.shopName || 'Auto Accessories Shop');
        const address   = esc(d.shopAddress || '');
        const phone     = esc(d.shopPhone || '');
        const ntn       = d.taxNumber  ? `<div class="shop-sub">${esc(d.taxNumber)}</div>` : '';
        const gst       = d.gstNumber  ? `<div class="shop-sub">${esc(d.gstNumber)}</div>` : '';
        const customer  = d.customer   ? `<div class="info-row"><span>Customer:</span><span>${esc(d.customer)}</span></div>` : '';
        const discount  = parseFloat(d.discount || 0) > 0
            ? `<div class="total-row"><span>Discount:</span><span>- ${money(d.discount)}</span></div>` : '';
        const tax       = parseFloat(d.taxRate || 0) > 0
            ? `<div class="total-row"><span>GST (${((d.taxRate||0)*100).toFixed(1)}%):</span><span>${money(d.taxAmount)}</span></div>` : '';
        const paidRows  = d.amountPaid !== undefined ? `
            <hr class="sep-thin">
            <div class="payment-row"><span>Amount Paid:</span><span>${money(d.amountPaid)}</span></div>
            <div class="payment-row"><span>Change:</span><span>${money(d.change)}</span></div>` : '';
        const barcodeHTML = (d.showBarcode !== false && d.invoiceNo)
            ? `<div class="barcode-text">*${esc(d.invoiceNo)}*</div>` : '';
        
        // Footer and terms
        let footerContent = '';
        if (d.showFooter !== false) {
            if (d.footerMessage) {
                footerContent += `<div class="footer">${esc(d.footerMessage)}</div>`;
            }
            if (d.terms) {
                footerContent += `<div class="footer" style="margin-top:1.5mm;border-top:1px dashed #000;padding-top:1.5mm">${esc(d.terms)}</div>`;
            }
        }
        const thankYou = `<div class="footer" style="font-weight:bold;margin-top:2mm">** THANK YOU — AAPKA SHUKRIYA **</div>`;
        const body = `
${logoHTML}
<div class="shop-name">${shopName}</div>
${address ? `<div class="shop-sub">${address}</div>` : ''}
${phone   ? `<div class="shop-sub">Tel: ${phone}</div>` : ''}
${ntn}${gst}
<hr class="sep-thick">
<div class="info-row"><span>Invoice #:</span><span>${esc(d.invoiceNo||'N/A')}</span></div>
<div class="info-row"><span>Date:</span><span>${esc(d.date||'')} ${esc(d.time||'')}</span></div>
${customer}
<hr class="sep-thin">
<table>
  <thead><tr>
    <th class="td-name">Item</th>
    <th class="td-num">Qty</th>
    <th class="td-num">Price</th>
    <th class="td-num">Total</th>
  </tr></thead>
  <tbody>${itemRows_classic(d.items)}</tbody>
</table>
<hr class="sep-thin">
<div class="totals-block">
  <div class="total-row"><span>Subtotal:</span><span>${money(d.subtotal)}</span></div>
  ${discount}
  ${tax}
  <div class="total-row grand-total"><span>TOTAL:</span><span>${money(d.grandTotal)}</span></div>
</div>
${paidRows}
<hr class="sep-thin">
${barcodeHTML}
${footerContent}
${thankYou}`;
        return wrapPage(CLASSIC_CSS, body, d.fontSize);
    }

    // ════════════════════════════════════════════════════════════════════════════
    // THEME 2 — MODERN
    // Clean sans-serif, header accent bar, shaded totals box.
    // ════════════════════════════════════════════════════════════════════════════
    const MODERN_CSS = `
body { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; }
.header-bar { background:#111; color:#fff; text-align:center; padding:3mm 2mm 2mm; margin:-2mm -1mm 2mm; }
.header-bar .shop-name { font-size: 11pt; font-weight: bold; letter-spacing: 1px; }
.header-bar .shop-sub  { font-size: 7pt; opacity: 0.85; margin-top: 0.5mm; }
.header-bar img.logo { border-radius: 2mm; margin-bottom: 1.5mm; filter: brightness(0) invert(1); }
.meta-grid  { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5mm; font-size: 7.5pt; margin-bottom: 2mm; }
.meta-label { color: #555; }
.meta-value { text-align: right; font-weight: 600; }
.sep { border: none; border-top: 1px solid #ddd; margin: 1.5mm 0; }
thead tr th { background: #f0f0f0; font-size: 7.5pt; padding: 1mm; text-align: left; }
.td-name { width: 48%; word-break: break-word; padding: 1mm 0.5mm; font-size: 7.5pt; }
.td-num  { width: 17%; text-align: right; padding: 1mm 0.5mm; font-size: 7.5pt; }
tbody tr:nth-child(even) td { background: #fafafa; }
.totals-box { background: #f7f7f7; border: 1px solid #e0e0e0; border-radius: 1.5mm; padding: 2mm; margin-top: 1.5mm; }
.total-row  { display: flex; justify-content: space-between; font-size: 8pt; padding: 0.3mm 0; }
.grand-total { font-size: 10pt; font-weight: bold; color: #111; border-top: 1.5px solid #111; padding-top: 1mm; margin-top: 0.5mm; }
.payment-row { display: flex; justify-content: space-between; font-size: 7.5pt; color: #444; padding: 0.3mm 0; }
.footer { text-align: center; font-size: 7pt; color: #666; margin-top: 3mm; }
.barcode-text { text-align: center; font-family: 'Courier New',monospace; font-size: 9pt; letter-spacing: 3px; margin: 1.5mm 0; }
.thank-you { text-align: center; font-size: 9pt; font-weight: bold; margin-top: 2mm; }
`;
    function buildModern(d) {
        const logoHTML  = (d.showLogo !== false) ? logoTag(d) : '';
        const shopName  = esc(d.shopName || 'Auto Accessories Shop');
        const address   = esc(d.shopAddress || '');
        const phone     = esc(d.shopPhone || '');
        const ntn       = d.taxNumber ? `<div class="shop-sub">${esc(d.taxNumber)}</div>` : '';
        const gst       = d.gstNumber ? `<div class="shop-sub">${esc(d.gstNumber)}</div>` : '';
        const customer  = d.customer  ? `<div class="meta-label">Customer</div><div class="meta-value">${esc(d.customer)}</div>` : '';
        const discount  = parseFloat(d.discount||0) > 0
            ? `<div class="total-row"><span>Discount</span><span>- ${money(d.discount)}</span></div>` : '';
        const tax       = parseFloat(d.taxRate||0) > 0
            ? `<div class="total-row"><span>GST (${((d.taxRate||0)*100).toFixed(1)}%)</span><span>${money(d.taxAmount)}</span></div>` : '';
        const paidRows  = d.amountPaid !== undefined ? `
            <hr class="sep">
            <div class="payment-row"><span>Paid</span><span>${money(d.amountPaid)}</span></div>
            <div class="payment-row"><span>Change</span><span>${money(d.change)}</span></div>` : '';
        const barcodeHTML = (d.showBarcode !== false && d.invoiceNo)
            ? `<div class="barcode-text">*${esc(d.invoiceNo)}*</div>` : '';
        
        // Footer and terms
        let footerContent = '';
        if (d.showFooter !== false) {
            if (d.footerMessage) {
                footerContent += `<div class="footer">${esc(d.footerMessage)}</div>`;
            }
            if (d.terms) {
                footerContent += `<div class="footer" style="margin-top:1.5mm;border-top:1px solid #ccc;padding-top:1.5mm">${esc(d.terms)}</div>`;
            }
        }
        const body = `
<div class="header-bar">
  ${logoHTML}
  <div class="shop-name">${shopName}</div>
  ${address ? `<div class="shop-sub">${address}</div>` : ''}
  ${phone   ? `<div class="shop-sub">${phone}</div>` : ''}
  ${ntn}${gst}
</div>
<div class="meta-grid">
  <div class="meta-label">Invoice #</div><div class="meta-value">${esc(d.invoiceNo||'N/A')}</div>
  <div class="meta-label">Date</div><div class="meta-value">${esc(d.date||'')} ${esc(d.time||'')}</div>
  ${customer}
</div>
<table>
  <thead><tr>
    <th class="td-name">Item</th>
    <th class="td-num">Qty</th>
    <th class="td-num">Price</th>
    <th class="td-num">Total</th>
  </tr></thead>
  <tbody>${itemRows_modern(d.items)}</tbody>
</table>
<div class="totals-box">
  <div class="total-row"><span>Subtotal</span><span>${money(d.subtotal)}</span></div>
  ${discount}
  ${tax}
  <div class="total-row grand-total"><span>TOTAL</span><span>${money(d.grandTotal)}</span></div>
</div>
${paidRows}
<hr class="sep">
${barcodeHTML}
${footerContent}
<div class="thank-you">✦ Thank You — Shukriya ✦</div>`;
        return wrapPage(MODERN_CSS, body, d.fontSize);
    }

    // ════════════════════════════════════════════════════════════════════════════
    // THEME 3 — MINIMAL
    // Ultra-clean, generous whitespace, prominent logo, no heavy borders.
    // ════════════════════════════════════════════════════════════════════════════
    const MINIMAL_CSS = `
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8pt; }
.shop-name { font-size: 11pt; font-weight: 700; text-align: center; margin-bottom: 0.5mm; }
.shop-sub  { text-align: center; font-size: 7.5pt; color: #444; }
.divider   { border: none; border-top: 0.5px solid #ccc; margin: 2mm 0; }
.divider-bold { border-top: 1.5px solid #000; }
.meta-row  { display: flex; justify-content: space-between; font-size: 7.5pt; margin: 0.4mm 0; }
.meta-key  { color: #666; }
.td-name   { width: 50%; word-break: break-word; padding: 0.8mm 0; font-size: 7.5pt; }
.td-num    { width: 16%; text-align: right; padding: 0.8mm 0; font-size: 7.5pt; }
thead th   { font-size: 7pt; text-transform: uppercase; color: #888; border-bottom: 0.5px solid #ccc; padding-bottom: 0.5mm; text-align: left; }
.total-row { display: flex; justify-content: space-between; font-size: 8pt; margin: 0.4mm 0; }
.grand-total { font-size: 10.5pt; font-weight: 700; margin: 1mm 0; }
.payment-row { display: flex; justify-content: space-between; font-size: 7.5pt; color: #555; margin: 0.3mm 0; }
.footer { text-align: center; font-size: 7pt; color: #888; margin-top: 3mm; }
.barcode-text { text-align: center; font-family: 'Courier New',monospace; font-size: 9pt; letter-spacing: 3px; margin: 2mm 0; }
.thank-you { text-align: center; font-size: 8.5pt; font-style: italic; margin-top: 2mm; color: #333; }
`;
    function buildMinimal(d) {
        const logoHTML  = (d.showLogo !== false) ? logoTag(d) : '';
        const shopName  = esc(d.shopName || 'Auto Accessories Shop');
        const address   = esc(d.shopAddress || '');
        const phone     = esc(d.shopPhone || '');
        const ntn       = d.taxNumber ? `<div class="shop-sub">${esc(d.taxNumber)}</div>` : '';
        const gst       = d.gstNumber ? `<div class="shop-sub">${esc(d.gstNumber)}</div>` : '';
        const customer  = d.customer
            ? `<div class="meta-row"><span class="meta-key">Customer</span><span>${esc(d.customer)}</span></div>` : '';
        const discount  = parseFloat(d.discount||0) > 0
            ? `<div class="total-row"><span class="meta-key">Discount</span><span>- ${money(d.discount)}</span></div>` : '';
        const tax       = parseFloat(d.taxRate||0) > 0
            ? `<div class="total-row"><span class="meta-key">GST (${((d.taxRate||0)*100).toFixed(1)}%)</span><span>${money(d.taxAmount)}</span></div>` : '';
        const paidRows  = d.amountPaid !== undefined ? `
            <hr class="divider">
            <div class="payment-row"><span>Paid</span><span>${money(d.amountPaid)}</span></div>
            <div class="payment-row"><span>Change</span><span>${money(d.change)}</span></div>` : '';
        const barcodeHTML = (d.showBarcode !== false && d.invoiceNo)
            ? `<div class="barcode-text">*${esc(d.invoiceNo)}*</div>` : '';
        
        // Footer and terms
        let footerContent = '';
        if (d.showFooter !== false) {
            if (d.footerMessage) {
                footerContent += `<div class="footer">${esc(d.footerMessage)}</div>`;
            }
            if (d.terms) {
                footerContent += `<div class="footer" style="margin-top:1.5mm;border-top:0.5px solid #ccc;padding-top:1.5mm">${esc(d.terms)}</div>`;
            }
        }
        const body = `
${logoHTML}
<div class="shop-name">${shopName}</div>
${address ? `<div class="shop-sub">${address}</div>` : ''}
${phone   ? `<div class="shop-sub">${phone}</div>` : ''}
${ntn}${gst}
<hr class="divider divider-bold">
<div class="meta-row"><span class="meta-key">Invoice</span><span>${esc(d.invoiceNo||'N/A')}</span></div>
<div class="meta-row"><span class="meta-key">Date &amp; Time</span><span>${esc(d.date||'')} ${esc(d.time||'')}</span></div>
${customer}
<hr class="divider">
<table>
  <thead><tr>
    <th class="td-name">Item</th>
    <th class="td-num">Qty</th>
    <th class="td-num">Price</th>
    <th class="td-num">Total</th>
  </tr></thead>
  <tbody>${itemRows_minimal(d.items)}</tbody>
</table>
<hr class="divider">
<div class="total-row"><span class="meta-key">Subtotal</span><span>${money(d.subtotal)}</span></div>
${discount}
${tax}
<hr class="divider divider-bold">
<div class="total-row grand-total"><span>TOTAL</span><span>${money(d.grandTotal)}</span></div>
${paidRows}
<hr class="divider">
${barcodeHTML}
${footerContent}
<div class="thank-you">Thank you for shopping with us.</div>`;
        return wrapPage(MINIMAL_CSS, body, d.fontSize);
    }

    // ── Exports ───────────────────────────────────────────────────────────────
    window.ReceiptThemes = {
        classic : { label: 'Classic (Traditional)',  buildHTML: buildClassic  },
        modern  : { label: 'Modern (Professional)',  buildHTML: buildModern   },
        minimal : { label: 'Minimal (Clean)',         buildHTML: buildMinimal  }
    };
    window.RECEIPT_THEME_DEFAULT = 'modern';
})();
