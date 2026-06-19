import os

base_path = r'c:\Users\sagar\Downloads\mock-interview - Copy (3)\Front-end'
admin_file = os.path.join(base_path, 'admin.html')
login_file = os.path.join(base_path, 'login.html')
master_file = os.path.join(base_path, 'master.html')
super_admin_file = os.path.join(base_path, 'super_admin.html')

with open(admin_file, 'r', encoding='utf-8') as f:
    content = f.read()

# For login.html, we change login logic to redirect
login_content = content.replace(
    """// Switch to dashboard view
                    document.getElementById('loginSection').style.opacity = '0';
                    document.getElementById('loginSection').style.transform = 'scale(0.95)';
                    document.getElementById('loginSection').style.transition = 'all 0.3s ease';

                    setTimeout(() => {
                        document.getElementById('loginSection').classList.add('hidden');
                        document.getElementById('dashboardSection').classList.remove('hidden');
                        document.body.classList.add('dashboard-active'); // Enable full-screen layout

                        // Show Copilot only on Dashboard
                        const copilotFab = document.getElementById('copilotFab');
                        if (copilotFab) copilotFab.style.display = 'flex';

                        if (role === 'master') {
                            showMasterDashboard();
                            loadMasterTenants();
                        } else {
                            showTenantDashboardShell();
                            applyPlanRestrictions({
                                plan,
                                planKey,
                                capabilities: planCapabilities,
                                expiry: data.subscription_expiry || '',
                                daysRemaining: data.subscription_days_remaining,
                                warningMessage: data.subscription_warning_message || '',
                            });
                            loadDashboardSessions();
                            loadDashboardStats(); // Task 8
                        }
                    }, 300);""",
    """// Redirect based on role
                    if (role === 'master') {
                        window.location.href = 'master.html';
                    } else if (role === 'super_admin') {
                        window.location.href = 'super_admin.html';
                    } else {
                        window.location.href = 'admin.html';
                    }"""
)

# Modify DOMContentLoaded in login.html
login_content = login_content.replace(
    """document.getElementById('loginSection').classList.add('hidden');
                document.getElementById('dashboardSection').classList.remove('hidden');
                document.body.classList.add('dashboard-active');

                // Show Copilot only on Dashboard
                const copilotFab = document.getElementById('copilotFab');
                if (copilotFab) copilotFab.style.display = 'flex';

                if (adminRole === 'master') {
                    showMasterDashboard();
                    loadMasterTenants();
                    return;
                }

                applyPlanRestrictions({
                    plan: sessionStorage.getItem('subscriptionPlan') || 'Free Trial',
                    planKey: sessionStorage.getItem('subscriptionPlanKey') || 'trial',
                    capabilities: (() => {
                        try { return JSON.parse(sessionStorage.getItem('planCapabilities') || 'null'); } catch { return null; }
                    })(),
                    expiry: sessionStorage.getItem('subscriptionExpiry') || '',
                    daysRemaining: sessionStorage.getItem('subscriptionDaysRemaining'),
                    warningMessage: sessionStorage.getItem('subscriptionWarningMessage') || '',
                });

                switchView('overview');
                loadDashboardSessions();
                loadDashboardStats();""",
    """if (adminRole === 'master') {
                    window.location.href = 'master.html';
                } else if (adminRole === 'super_admin') {
                    window.location.href = 'super_admin.html';
                } else {
                    window.location.href = 'admin.html';
                }"""
)

with open(login_file, 'w', encoding='utf-8') as f:
    f.write(login_content)

# For dashboards
dashboard_base = content.replace(
    '<div id="loginSection">',
    '<div id="loginSection" class="hidden">'
)
dashboard_base = dashboard_base.replace(
    '<div id="dashboardSection" class="hidden">',
    '<div id="dashboardSection">'
)

# checkAuth change
dashboard_base = dashboard_base.replace(
    """const savedAdminId = sessionStorage.getItem('adminId');
            if (savedAdminId) {""",
    """const savedAdminId = sessionStorage.getItem('adminId');
            if (!savedAdminId) { window.location.href = 'login.html'; return; }
            if (savedAdminId) {"""
)

# Fix Super Admin bug in dashboard_base checkAuth
dashboard_base = dashboard_base.replace(
    """if (adminRole === 'master') {
                    showMasterDashboard();
                    loadMasterTenants();
                    return;
                }""",
    """if (adminRole === 'master') {
                    showMasterDashboard();
                    loadMasterTenants();
                    return;
                }
                
                if (adminRole === 'super_admin') {
                    const btn1 = document.getElementById('nav-btn-super_dashboard');
                    const btn2 = document.getElementById('nav-btn-team');
                    if (btn1) btn1.style.display = 'block';
                    if (btn2) btn2.style.display = 'block';
                }"""
)

# Logout change
dashboard_base = dashboard_base.replace(
    """document.getElementById('loginSection').classList.remove('hidden');
            document.getElementById('loginSection').style.opacity = '1';
            document.getElementById('loginSection').style.transform = 'scale(1)';
            document.getElementById('dashboardSection').classList.add('hidden');
            document.body.classList.remove('dashboard-active');
            document.getElementById('loginUsername').value = '';
            document.getElementById('loginPassword').value = '';""",
    """window.location.href = 'login.html';"""
)

with open(master_file, 'w', encoding='utf-8') as f:
    f.write(dashboard_base)
with open(super_admin_file, 'w', encoding='utf-8') as f:
    f.write(dashboard_base)
with open(admin_file, 'w', encoding='utf-8') as f:
    f.write(dashboard_base)

print('Successfully duplicated files')
