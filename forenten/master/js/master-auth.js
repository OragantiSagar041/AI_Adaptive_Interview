// master-auth.js
import { showMasterDashboard } from './master-dashboard.js';

document.addEventListener('DOMContentLoaded', () => {
    const role = sessionStorage.getItem('role');
    if (role !== 'master') {
        window.location.href = '../admin.html'; // Redirect unauthorized
        return;
    }
    
    // Load base components
    loadUIComponents().then(() => {
        showMasterDashboard();
    });
});

async function loadUIComponents() {
    // Fetches MasterSidebar.html and MasterHeader.html and injects them
}
