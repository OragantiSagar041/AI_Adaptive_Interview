// master-subscribers.js
import { MasterAPI } from './master-api.js';

export async function showMasterSubscribers() {
    const contentArea = document.getElementById('main-content-area');
    const response = await fetch('components/MasterSubscribers.html');
    if(contentArea && response.ok) {
        contentArea.innerHTML = await response.text();
    }
}

export async function toggleTenantStatus(tenantId, newStatus) {
    await MasterAPI.toggleStatus(tenantId, newStatus);
}
