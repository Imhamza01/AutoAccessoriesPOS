const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'frontend', 'screens', 'pos', 'script.js');
let c = fs.readFileSync(filePath, 'utf8');

const before = (c.match(/\?\./g) || []).length;

// Fix all optional chaining
const replacements = [
    ["lastPaymentDetails?.amount_tendered", "(this.lastPaymentDetails && this.lastPaymentDetails.amount_tendered ? this.lastPaymentDetails.amount_tendered : 0)"],
    ["lastPaymentDetails?.payment_method", "(this.lastPaymentDetails && this.lastPaymentDetails.payment_method ? this.lastPaymentDetails.payment_method : 'cash')"],
    ["currentCustomer?.full_name", "(this.currentCustomer && this.currentCustomer.full_name ? this.currentCustomer.full_name : '')"],
    ["nameInput?.value", "(nameInput ? nameInput.value : '')"],
    ["qtyInput?.value", "(qtyInput ? qtyInput.value : '')"],
    ["priceInput?.value", "(priceInput ? priceInput.value : '')"],
    ["nameInput?.classList.add(", "if(nameInput){ nameInput.classList.add("],
    ["qtyInput?.classList.add(", "if(qtyInput){ qtyInput.classList.add("],
    ["priceInput?.classList.add(", "if(priceInput){ priceInput.classList.add("],
];

for (const [from, to] of replacements) {
    while (c.includes(from)) {
        c = c.replace(from, to);
    }
}

const after = (c.match(/\?\./g) || []).length;
fs.writeFileSync(filePath, c, 'utf8');
console.log('before:', before, 'after:', after, 'size:', c.length);
