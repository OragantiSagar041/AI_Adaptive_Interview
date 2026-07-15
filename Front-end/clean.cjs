const fs = require('fs');
let code = fs.readFileSync('src/pages/superadmin/SuperDashboardPage.jsx', 'utf8');

code = code.replace(/bg-white text-slate-900 border-slate-200 shadow-sm bg-white text-slate-900 border-slate-200 shadow-sm/g, 'bg-white text-slate-900 border-slate-200 shadow-sm');
code = code.replace(/text-slate-500 text-slate-500/g, 'text-slate-500');

fs.writeFileSync('src/pages/superadmin/SuperDashboardPage.jsx', code);
