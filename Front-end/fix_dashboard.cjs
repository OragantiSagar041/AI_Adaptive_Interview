const fs = require('fs');
let code = fs.readFileSync('src/pages/superadmin/SuperDashboardPage.jsx', 'utf8');

// Replace Tooltip colors
code = code.replace(/var\(--color-card\)/g, '#ffffff');
code = code.replace(/var\(--color-border\)/g, '#e2e8f0');
code = code.replace(/var\(--color-foreground\)/g, '#0f172a');
code = code.replace(/var\(--color-muted-foreground\)/g, '#64748b');

// Replace utility classes
code = code.replace(/text-muted-foreground/g, 'text-slate-500');
code = code.replace(/text-foreground/g, 'text-slate-900');
code = code.replace(/bg-card/g, 'bg-white text-slate-900 border-slate-200');
code = code.replace(/bg-secondary\/60/g, 'bg-slate-100');
code = code.replace(/ring-border/g, 'ring-slate-200');

// Fix Cards without explicit classNames
code = code.replace(/<Card>/g, '<Card className=\"bg-white text-slate-900 border-slate-200 shadow-sm\">');

// Fix Cards that already have classNames
code = code.replace(/<Card className=\"(.*?)\">/g, '<Card className=\"$1 bg-white text-slate-900 border-slate-200 shadow-sm\">');

// Fix table headers which might be inheriting text color
code = code.replace(/<TableHead>/g, '<TableHead className=\"text-slate-500\">');
code = code.replace(/<TableHead className=\"(.*?)\">/g, '<TableHead className=\"$1 text-slate-500\">');

fs.writeFileSync('src/pages/superadmin/SuperDashboardPage.jsx', code);
