// master-dashboard.js
import { MasterAPI } from './master-api.js';
import { renderCharts } from './master-charts.js';

export async function showMasterDashboard() {
    const contentArea = document.getElementById('main-content-area');
    const response = await fetch('components/MasterDashboard.html');
    if(contentArea && response.ok) {
        contentArea.innerHTML = await response.text();
    }
    await loadMasterTenants();
    renderCharts();
}

export async function loadMasterTenants() {
    try {
        const response = await MasterAPI.getTenants();
        const data = await response.json();
        renderMasterTenants(data);
    } catch(e) {
        console.error('Error loading tenants', e);
    }
}

export function renderMasterTenants(tenants) {
    // Populates the TenantTable.html partial with data
}
