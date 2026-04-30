const fs = require('fs');
const path = require('path');

// Fix inventory debounce
const invPath = path.join(__dirname, 'src', 'frontend', 'screens', 'inventory', 'script.js');
let inv = fs.readFileSync(invPath, 'utf8');

inv = inv.replace(
    'return (...args) => {\r\n            clearTimeout(timeout);\r\n            timeout = setTimeout(() => func.apply(this, args), wait);\r\n        };',
    'var self = this;\r\n        return function() {\r\n            var args = arguments;\r\n            clearTimeout(timeout);\r\n            timeout = setTimeout(function() { func.apply(self, args); }, wait);\r\n        };'
);

// Also fix \n line endings variant
inv = inv.replace(
    'return (...args) => {\n            clearTimeout(timeout);\n            timeout = setTimeout(() => func.apply(this, args), wait);\n        };',
    'var self = this;\n        return function() {\n            var args = arguments;\n            clearTimeout(timeout);\n            timeout = setTimeout(function() { func.apply(self, args); }, wait);\n        };'
);

fs.writeFileSync(invPath, inv, 'utf8');
const remaining = (inv.match(/\.\.\.args/g) || []).length;
console.log('inventory ...args remaining:', remaining);

// Verify pos renderCategories is inside class
const posPath = path.join(__dirname, 'src', 'frontend', 'screens', 'pos', 'script.js');
const pos = fs.readFileSync(posPath, 'utf8');
const hasRenderCat = pos.includes('renderCategories()');
const hasLooseCode = pos.includes('const countByCategory = {};\n    this.products.forEach');
console.log('pos has renderCategories method:', hasRenderCat);
console.log('pos has loose countByCategory:', hasLooseCode);
console.log('pos ?. remaining:', (pos.match(/\?\./g) || []).length);
