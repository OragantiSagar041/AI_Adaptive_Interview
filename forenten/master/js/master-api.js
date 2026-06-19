// master-api.js
const API_BASE = 'http://localhost:8000'; // Or configured env URL

export const MasterAPI = {
    getTenants: () => fetch(${API_BASE}/master/tenants, { headers: getAuthHeaders() }),
    getPlans: () => fetch(${API_BASE}/master/plans, { headers: getAuthHeaders() }),
    createTenant: (data) => fetch(${API_BASE}/master/create-tenant, { method: 'POST', body: JSON.stringify(data) }),
    updatePlan: (data) => fetch(${API_BASE}/master/update-plan, { method: 'POST', body: JSON.stringify(data) }),
    updateProfile: (data) => fetch(${API_BASE}/master/profile, { method: 'POST', body: JSON.stringify(data) }),
    changePassword: (data) => fetch(${API_BASE}/master/change-password, { method: 'POST', body: JSON.stringify(data) }),
    deleteTenant: (id) => fetch(${API_BASE}/master/delete-tenant, { method: 'POST', body: JSON.stringify({id}) }),
    toggleStatus: (id, status) => fetch(${API_BASE}/master/toggle-status, { method: 'POST', body: JSON.stringify({id, status}) })
};

function getAuthHeaders() {
    return { 'Authorization': Bearer , 'Content-Type': 'application/json' };
}
