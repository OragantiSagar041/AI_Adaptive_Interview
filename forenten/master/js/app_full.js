

        const FRONTEND_BASE = window.location.origin;

        // Global Fetch Interceptor to attach JWT token
        const originalFetch = window.fetch;
        window.fetch = async function () {
            let [resource, config] = arguments;
            if (!config) config = {};

            const token = sessionStorage.getItem('adminToken');
            if (token && resource.toString().startsWith(API_BASE)) {
                if (!config.headers) config.headers = {};
                if (config.headers instanceof Headers) {
                    config.headers.append('Authorization', 'Bearer ' + token);
                } else if (Array.isArray(config.headers)) {
                    config.headers.push(['Authorization', 'Bearer ' + token]);
                } else {
                    config.headers['Authorization'] = 'Bearer ' + token;
                }
            }
            return originalFetch(resource, config);
        };

        /**
         * Convert a datetime-local input value (local ISO, no timezone) to a UTC ISO
         * string. Pass-through if already has Z/offset, or if empty.
         */
        function toUtcIso(localDatetimeValue) {
            if (!localDatetimeValue) return '';
            if (localDatetimeValue.endsWith('Z') || localDatetimeValue.includes('+')) return localDatetimeValue;
            const d = new Date(localDatetimeValue);  // browser interprets as LOCAL time
            if (isNaN(d.getTime())) return localDatetimeValue;
            return d.toISOString();
        }

        function escapeHtml(unsafe) {
            return (unsafe || "").toString()
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        let adminId = null;
        let adminEmail = "";
        let adminName = "";
        let adminRole = sessionStorage.getItem('adminRole') || 'tenant';
        let masterTenantData = [];
        const PLAN_CAPABILITY_FALLBACK = {
            trial: {
                single_interview: true,
                bulk_interviews: false,
                resume_parsing: true,
                export_sessions: false,
                live_monitoring: false,
                deactivated_candidates: false,
                detailed_analytics: false,
            },
            basic: {
                single_interview: true,
                bulk_interviews: false,
                resume_parsing: true,
                export_sessions: true,
                live_monitoring: false,
                deactivated_candidates: true,
                detailed_analytics: true,
            },
            advance: {
                single_interview: true,
                bulk_interviews: true,
                resume_parsing: true,
                export_sessions: true,
                live_monitoring: true,
                deactivated_candidates: true,
                detailed_analytics: true,
            },
            owner: {
                single_interview: true,
                bulk_interviews: true,
                resume_parsing: true,
                export_sessions: true,
                live_monitoring: true,
                deactivated_candidates: true,
                detailed_analytics: true,
            },
        };
        let currentPlanKey = sessionStorage.getItem('subscriptionPlanKey') || 'trial';
        let currentPlanLabel = sessionStorage.getItem('subscriptionPlan') || 'Free Trial';
        let currentPlanCapabilities = (() => {
            try {
                const stored = JSON.parse(sessionStorage.getItem('planCapabilities') || 'null');
                return stored || PLAN_CAPABILITY_FALLBACK[currentPlanKey] || PLAN_CAPABILITY_FALLBACK.trial;
            } catch {
                return PLAN_CAPABILITY_FALLBACK[currentPlanKey] || PLAN_CAPABILITY_FALLBACK.trial;
            }
        })();

        // ── Task 6: Pagination State ──
        let currentPage = 1;
        const PAGE_SIZE = 20;
        let allFilteredSessions = []; // Holds current filtered data for pagination

        function normalizePlanKey(plan) {
            const value = String(plan || '').trim().toLowerCase();
            if (value === 'free trial' || value === 'trial') return 'trial';
            if (value === 'basic') return 'basic';
            if (value === 'advance' || value === 'advanced') return 'advance';
            if (value === 'owner' || value === 'master') return 'owner';
            return 'trial';
        }

        function getPlanCapabilities(plan, capabilities) {
            const planKey = normalizePlanKey(plan);
            return capabilities || PLAN_CAPABILITY_FALLBACK[planKey] || PLAN_CAPABILITY_FALLBACK.trial;
        }

        function showSubscriptionBanner(message) {
            const banner = document.getElementById('subscriptionAlertBanner');
            if (!message) {
                banner.classList.add('hidden');
                banner.textContent = '';
                return;
            }
            banner.textContent = message;
            banner.classList.remove('hidden');
        }

        function applyPlanRestrictions(planPayload = {}) {
            currentPlanKey = normalizePlanKey(planPayload.planKey || planPayload.plan || currentPlanKey);
            currentPlanLabel = planPayload.planLabel || planPayload.plan || currentPlanLabel || 'Free Trial';
            currentPlanCapabilities = getPlanCapabilities(currentPlanKey, planPayload.capabilities);

            sessionStorage.setItem('subscriptionPlanKey', currentPlanKey);
            sessionStorage.setItem('subscriptionPlan', currentPlanLabel);
            sessionStorage.setItem('planCapabilities', JSON.stringify(currentPlanCapabilities));
            if (planPayload.expiry) sessionStorage.setItem('subscriptionExpiry', planPayload.expiry);
            if (planPayload.warningMessage !== undefined) sessionStorage.setItem('subscriptionWarningMessage', planPayload.warningMessage || '');
            if (planPayload.credits !== undefined && planPayload.credits !== null) {
                sessionStorage.setItem('subscriptionCredits', String(planPayload.credits));
            }

            const planBadge = document.getElementById('subscriptionPlanBadge');
            if (planBadge) {
                const remainingText = planPayload.credits != null ? (planPayload.credits >= 1000000 ? ' &bull; Unlimited credits' : ` &bull; ${planPayload.credits} credits left`) : '';
                const upgradeBtn = ` <button onclick="openUpgradeModal()" title="Buy Credits" style="background: none; border: none; cursor: pointer; color: inherit; margin-left: 5px;"><i class="fas fa-plus-circle"></i></button>`;
                planBadge.innerHTML = `<i class="fas fa-layer-group"></i> ${currentPlanLabel}${remainingText}${upgradeBtn}`;
                planBadge.style.display = 'inline-flex';
                planBadge.style.alignItems = 'center';
            }

            showSubscriptionBanner(planPayload.warningMessage || sessionStorage.getItem('subscriptionWarningMessage') || '');

            const bulkTab = document.getElementById('tab-bulk');
            if (bulkTab) bulkTab.style.display = currentPlanCapabilities.bulk_interviews ? '' : 'none';
            if (!currentPlanCapabilities.bulk_interviews && document.getElementById('panel-bulk') && document.getElementById('panel-bulk').style.display !== 'none') {
                switchCreateTab('single');
            }

            const deactivatedNav = document.getElementById('nav-btn-deactivated');
            if (deactivatedNav) deactivatedNav.style.display = currentPlanCapabilities.deactivated_candidates ? '' : 'none';

            const ongoingCard = document.getElementById('ongoingInterviewsCard');
            if (ongoingCard) ongoingCard.style.display = currentPlanCapabilities.live_monitoring ? '' : 'none';

            document.querySelectorAll('[onclick^="exportCurrentStatus"]').forEach((button) => {
                button.style.display = currentPlanCapabilities.export_sessions ? '' : 'none';
            });

            if (!currentPlanCapabilities.live_monitoring) {
                closeLiveResultsModal();
            }

            if (!currentPlanCapabilities.deactivated_candidates) {
                const deactivatedView = document.getElementById('view-deactivated');
                if (deactivatedView && !deactivatedView.classList.contains('hidden')) {
                    switchView('overview');
                }
            }
        }

        function showPlanUpgradeMessage(featureName, requiredPlan) {
            showToast(`${featureName} is available on the ${requiredPlan} plan. Please upgrade to continue.`, 'error');
        }

        function showMasterDashboard() {
            document.getElementById('dashboardSection')?.classList.add('master-mode');
            const tabContainer = document.querySelector('.tab-container');
            if (tabContainer) tabContainer.style.display = 'none';
            document.getElementById('tenantSidebarNav')?.classList.add('hidden');
            document.getElementById('masterSidebarNav')?.classList.remove('hidden');
            document.querySelectorAll('#masterSidebarNav .nav-btn').forEach(btn => btn.classList.remove('active'));
            document.getElementById('master-nav-dashboard')?.classList.add('active');
            document.querySelectorAll('.view-panel').forEach(panel => panel.classList.add('hidden'));
            const masterSection = document.getElementById('masterDashboardSection');
            if (masterSection) masterSection.classList.remove('hidden');
            const title = document.getElementById('consoleTitle');
            if (title) title.textContent = 'Master Console';
            const planBadge = document.getElementById('subscriptionPlanBadge');
            if (planBadge) {
                planBadge.innerHTML = '<i class="fas fa-crown"></i> Master';
                planBadge.style.display = 'inline-flex';
            }
            showSubscriptionBanner('');
        }

        function showTenantDashboardShell() {
            document.getElementById('dashboardSection')?.classList.remove('master-mode');
            const tabContainer = document.querySelector('.tab-container');
            if (tabContainer) tabContainer.style.display = '';
            document.getElementById('tenantSidebarNav')?.classList.remove('hidden');
            document.getElementById('masterSidebarNav')?.classList.add('hidden');
            const masterSection = document.getElementById('masterDashboardSection');
            if (masterSection) masterSection.classList.add('hidden');
            const title = document.getElementById('consoleTitle');
            if (title) title.textContent = 'Super Admin Console';

            // Explicitly switch to the overview tab so the dashboard isn't blank
            if (typeof switchView === 'function') {
                switchView('overview');
            }
        }

        function showMasterAdminView(viewId) {
            document.getElementById('dashboardSection')?.classList.remove('master-mode');
            const tabContainer = document.querySelector('.tab-container');
            if (tabContainer) tabContainer.style.display = '';
            document.getElementById('tenantSidebarNav')?.classList.add('hidden');
            document.getElementById('masterSidebarNav')?.classList.remove('hidden');

            // Handle sidebar active states
            document.querySelectorAll('#masterSidebarNav .nav-btn').forEach(btn => btn.classList.remove('active'));
            const activeBtn = document.getElementById('nav-master-' + viewId);
            if (activeBtn) activeBtn.classList.add('active');

            const masterSection = document.getElementById('masterDashboardSection');
            if (masterSection) masterSection.classList.add('hidden');
            const title = document.getElementById('consoleTitle');
            if (title) title.textContent = 'Master Console';
            switchView(viewId);
        }

        function scrollToCreateTenant() {
            showMasterDashboard();
            const section = document.getElementById('inlineCreateTenantSection');
            if (section) {
                section.scrollIntoView({ behavior: 'smooth', block: 'center' });
                section.style.ring = "2px solid #2563eb";
                setTimeout(() => section.style.ring = "none", 2000);
            }
        }

        function clearCreateTenantForm() {
            document.getElementById('tenantUsername').value = '';
            document.getElementById('tenantEmail').value = '';
            document.getElementById('tenantPassword').value = '';
            document.getElementById('tenantPlan').value = 'trial';
        }

        function togglePasswordVisibility(id) {
            const input = document.getElementById(id);
            if (!input) return;
            const icon = input.nextElementSibling?.querySelector('i');
            if (input.type === 'password') {
                input.type = 'text';
                if (icon) icon.className = 'fas fa-eye-slash';
            } else {
                input.type = 'password';
                if (icon) icon.className = 'fas fa-eye';
            }
        }

        function formatTenantDate(value) {
            if (!value) return 'No expiry';
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return value;
            return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' });
        }

        function tenantStatusBadge(t) {
            const status = t.status || (t.login_enabled === false ? 'blocked' : (t.is_expired ? 'expired' : 'active'));
            const label = status === 'blocked' ? 'Deactivated' : status.charAt(0).toUpperCase() + status.slice(1);
            return `<span class="master-status ${status === 'blocked' ? 'blocked' : status === 'expired' ? 'expired' : 'active'}"><i class="fas fa-circle" style="font-size:0.42rem;"></i>${label}</span>`;
        }

        async function loadMasterTenants() {
            const body = document.getElementById('masterTenantsBody');
            if (!body || !adminId) return;
            body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:1.5rem;color:var(--text-muted);">Loading admins...</td></tr>';
            try {
                const res = await fetch(`${API_BASE}/master/companies?master_id=${encodeURIComponent(adminId)}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Failed to load admins');
                masterTenantData = data.data || [];
                renderMasterTenants();
            } catch (err) {
                body.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:1.5rem;color:var(--danger);">${escapeHtml(err.message)}</td></tr>`;
            }
        }

        function renderMasterTenants() {
            const body = document.getElementById('masterTenantsBody');
            if (!body) return;

            const tenants = Array.isArray(masterTenantData) ? masterTenantData : [];
            const total = tenants.length;
            const active = tenants.filter(t => t.status === 'active').length;
            const expired = tenants.filter(t => t.status === 'expired').length;
            const members = tenants.reduce((sum, t) => sum + Number(t.member_count || 0), 0);

            document.getElementById('masterTotalCompanies').textContent = total;
            document.getElementById('masterActivePlans').textContent = active;
            document.getElementById('masterExpiredPlans').textContent = expired;
            document.getElementById('masterTotalMembers').textContent = members;

            const search = (document.getElementById('masterTenantSearch')?.value || '').trim().toLowerCase();
            const filtered = tenants.filter(t => {
                const haystack = `${t.username || ''} ${t.email || ''} ${t.subscription_plan_label || ''}`.toLowerCase();
                return !search || haystack.includes(search);
            });

            if (!filtered.length) {
                body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:#64748b;">No matching admin accounts found.</td></tr>';
                return;
            }

            body.innerHTML = filtered.map(t => {
                const plan = t.subscription_plan_label || t.subscription_plan || 'Trial';
                const days = t.days_remaining == null ? '' : `${t.days_remaining} day${Number(t.days_remaining) === 1 ? '' : 's'} left`;
                const loginEnabled = t.login_enabled !== false;
                const initial = String(t.username || t.email || 'A').trim().charAt(0).toUpperCase();
                return `
                    <tr>
                        <td>
                            <div class="master-company-cell">
                                <span class="master-avatar">${escapeHtml(initial)}</span>
                                <div>
                                    <div style="font-weight:900;color:#0f172a;">${escapeHtml(t.username || 'Admin')}</div>
                                    <div class="master-muted">${escapeHtml(t.email || '-')}</div>
                                </div>
                            </div>
                        </td>
                        <td>
                            <div style="font-weight:900;color:#1e293b;">${escapeHtml(plan)}</div>
                            <div class="master-muted">${escapeHtml(days)}</div>
                        </td>
                        <td>${tenantStatusBadge(t)}</td>
                        <td>
                            <div style="font-weight:900;color:#0f172a;">${Number(t.member_count || 0)}</div>
                            <div class="master-muted">${Number(t.completed_sessions || 0)} completed / ${Number(t.started_sessions || 0)} live</div>
                        </td>
                        <td>${formatTenantDate(t.subscription_start)}</td>
                        <td>${formatTenantDate(t.subscription_expiry)}</td>
                        <td style="white-space:nowrap;">
                            <button class="master-icon-btn" onclick='openUpdateTenant(${JSON.stringify(t.id)}, ${JSON.stringify(t.subscription_plan || 'trial')})' title="Extend plan" style="color:#2563eb;"><i class="fas fa-calendar-plus"></i></button>
                            <button class="master-icon-btn" onclick='toggleTenantLogin(${JSON.stringify(t.id)}, ${loginEnabled})' title="${loginEnabled ? 'Deactivate admin login' : 'Reactivate admin login'}" style="color:${loginEnabled ? '#f59e0b' : '#10b981'};"><i class="fas fa-power-off"></i></button>
                            <button class="master-icon-btn" onclick='deleteTenant(${JSON.stringify(t.id)}, ${JSON.stringify(t.username || '')})' title="Delete admin" style="color:#e11d48;"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        function showCreateTenantModal() {
            document.getElementById('createTenantModal').classList.remove('hidden');
        }

        function closeCreateTenantModal() {
            document.getElementById('createTenantModal').classList.add('hidden');
        }

        async function submitCreateTenant() {
            let company_name = '';
            if (document.getElementById('tenantCompany') && document.getElementById('tenantCompany').value.trim()) {
                company_name = document.getElementById('tenantCompany').value.trim();
            } else if (document.getElementById('tenantCompanyModal') && document.getElementById('tenantCompanyModal').value.trim()) {
                company_name = document.getElementById('tenantCompanyModal').value.trim();
            }
            if (!company_name) company_name = document.getElementById('tenantUsername').value.trim();
            const username = document.getElementById('tenantUsername').value.trim();
            const password = document.getElementById('tenantPassword').value;
            const email = document.getElementById('tenantEmail').value.trim();
            const subscription_plan = document.getElementById('tenantPlan').value;
            if (!username || !password || !email || !company_name) {
                showToast('Please fill company name, username, password, and email.', 'error');
                return;
            }
            try {
                const res = await fetch(`${API_BASE}/master/companies?master_id=${encodeURIComponent(adminId)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ company_name, username, password, email, subscription_plan })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Create failed');
                closeCreateTenantModal();
                ['tenantCompany', 'tenantUsername', 'tenantPassword', 'tenantEmail'].forEach(id => {
                    if (document.getElementById(id)) document.getElementById(id).value = '';
                });
                showToast('Admin account created.', 'success');
                loadMasterTenants();
            } catch (err) {
                showToast(err.message, 'error');
            }
        }

        function openUpdateTenant(id, plan) {
            document.getElementById('updateTenantId').value = id;
            document.getElementById('updateTenantPlan').value = normalizePlanKey(plan);
            document.getElementById('updateTenantDays').value = '0';
            document.getElementById('updateTenantModal').classList.remove('hidden');
        }

        async function submitUpdateTenant() {
            const tenantId = document.getElementById('updateTenantId').value;
            const subscription_plan = document.getElementById('updateTenantPlan').value;
            const add_days = Number(document.getElementById('updateTenantDays').value || 0);
            try {
                const res = await fetch(`${API_BASE}/master/companies/${encodeURIComponent(tenantId)}?master_id=${encodeURIComponent(adminId)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ subscription_plan, add_days })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Update failed');
                document.getElementById('updateTenantModal').classList.add('hidden');
                showToast(add_days > 0 ? `Plan extended by ${add_days} day(s).` : 'Plan updated.', 'success');
                loadMasterTenants();
            } catch (err) {
                showToast(err.message, 'error');
            }
        }

        async function toggleTenantLogin(tenantId, currentlyEnabled) {
            const action = currentlyEnabled ? 'deactivate' : 'reactivate';
            if (!confirm(`Are you sure you want to ${action} this admin account?`)) return;
            try {
                const res = await fetch(`${API_BASE}/master/companies/${encodeURIComponent(tenantId)}/login?master_id=${encodeURIComponent(adminId)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ login_enabled: !currentlyEnabled })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Status update failed');
                showToast(`Admin account ${currentlyEnabled ? 'deactivated' : 'reactivated'}.`, 'success');
                loadMasterTenants();
            } catch (err) {
                showToast(err.message, 'error');
            }
        }

        async function deleteTenant(tenantId, username) {
            if (!confirm(`Delete company account "${username}" and all its interview sessions? This cannot be undone.`)) return;
            try {
                const res = await fetch(`${API_BASE}/master/companies/${encodeURIComponent(tenantId)}?master_id=${encodeURIComponent(adminId)}`, { method: 'DELETE' });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Delete failed');
                showToast('Admin account deleted.', 'success');
                loadMasterTenants();
            } catch (err) {
                showToast(err.message, 'error');
            }
        }

        function normalizeFrontendUrl(url) {
            if (!url) return '';

            const trimmed = String(url).trim();
            const frontendBase = FRONTEND_BASE.replace(/\/+$/, '');

            if (/^https?:\/\//i.test(trimmed)) {
                const duplicateBase = `${frontendBase}${frontendBase}`;
                if (trimmed.startsWith(duplicateBase)) {
                    return trimmed.slice(frontendBase.length);
                }
                return trimmed;
            }

            const relative = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
            return `${frontendBase}${relative}`;
        }

        function focusLoginForm() {
            const loginCard = document.getElementById('loginCard');
            const usernameInput = document.getElementById('username');

            if (loginCard) {
                loginCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            setTimeout(() => {
                if (usernameInput) usernameInput.focus();
            }, 250);
        }

        function initLoginHero() {
            document.querySelectorAll('.login-rise').forEach((element) => {
                const delay = Number(element.dataset.delay || 0);
                const duration = Number(element.dataset.duration || 800);
                element.style.transitionDuration = `${duration}ms`;
                setTimeout(() => {
                    element.classList.add('is-visible');
                }, delay);
            });
        }

        document.addEventListener('DOMContentLoaded', () => {
            initLoginHero();

            // Check for existing session
            const savedAdminId = sessionStorage.getItem('adminId');
            if (!savedAdminId) { window.location.href = 'login.html'; return; }
            if (savedAdminId) {
                adminId = savedAdminId;
                adminEmail = sessionStorage.getItem('adminEmail') || "";
                adminRole = sessionStorage.getItem('adminRole') || "tenant";
                document.getElementById('adminName').textContent = sessionStorage.getItem('adminName') || "Admin";
                document.getElementById('adminEmailInput').value = adminEmail;

                document.getElementById('loginSection').classList.add('hidden');
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
                
                if (adminRole === 'super_admin') {
                    const btn1 = document.getElementById('nav-btn-super_dashboard');
                    const btn2 = document.getElementById('nav-btn-team');
                    if (btn1) btn1.style.display = 'block';
                    if (btn2) btn2.style.display = 'block';

                    // Setup Admin Filter for Overview
                    const filterContainer = document.getElementById('superAdminFilterContainer');
                    const filterSelect = document.getElementById('superAdminFilter');
                    if (filterContainer && filterSelect) {
                        filterContainer.style.display = 'flex';
                        const savedToken = sessionStorage.getItem('adminToken');
                        if (savedToken) {
                            fetch(`${API_BASE}/super-admin/admins`, {
                                headers: { 'Authorization': `Bearer ${savedToken}` }
                            }).then(r => r.json()).then(resData => {
                                if (resData.data) {
                                    let optionsHtml = '<option value="">All Admins</option>';
                                    resData.data.forEach(admin => {
                                        optionsHtml += `<option value="${admin.id}">${admin.name || admin.username}</option>`;
                                    });
                                    filterSelect.innerHTML = optionsHtml;
                                }
                            }).catch(err => console.error('Failed to load admins for filter', err));
                        }
                    }
                }

                applyPlanRestrictions({
                    plan: sessionStorage.getItem('subscriptionPlan') || 'Free Trial',
                    planKey: sessionStorage.getItem('subscriptionPlanKey') || 'trial',
                    capabilities: JSON.parse(sessionStorage.getItem('planCapabilities') || '{}'),
                    expiry: sessionStorage.getItem('subscriptionExpiry'),
                    credits: sessionStorage.getItem('subscriptionCredits'),
                    warningMessage: sessionStorage.getItem('subscriptionWarningMessage') || '',
                });

                if (adminRole === 'super_admin') {
                    switchView('super_dashboard');
                    loadSuperAdminDashboard();
                } else {
                    switchView('overview');
                    loadDashboardSessions();
                    loadDashboardStats();
                }
            }
        });

        // --- PASSWORD TOGGLE ---
        function togglePassword() {
            const pwInput = document.getElementById('password');
            const eyeOpen = document.getElementById('eyeOpen');
            const eyeClosed = document.getElementById('eyeClosed');

            if (pwInput.type === 'password') {
                pwInput.type = 'text';
                eyeOpen.style.display = 'none';
                eyeClosed.style.display = 'block';
            } else {
                pwInput.type = 'password';
                eyeOpen.style.display = 'block';
                eyeClosed.style.display = 'none';
            }
        }

        // --- ENTER KEY SUPPORT ---
        document.getElementById('password').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') login();
        });
        document.getElementById('username').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') document.getElementById('password').focus();
        });

        // --- LOGIN ---
        async function login() {
            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('loginError');
            const loginBtn = document.getElementById('loginBtn');

            if (!username || !password) {
                errorDiv.textContent = "Please enter both username and password.";
                errorDiv.classList.remove('hidden');
                return;
            }

            loginBtn.disabled = true;
            loginBtn.innerHTML = '<span class="spinner"></span> Signing in...';
            errorDiv.classList.add('hidden');

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            try {
                const response = await fetch(`${API_BASE}/admin/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ username, password }),
                    signal: controller.signal
                });

                clearTimeout(timeout);

                if (response.ok) {
                    const data = await response.json();

                    if (data.status === 'expired' || data.status === 'blocked') {
                        errorDiv.textContent = data.message || "Your subscription has expired.";
                        errorDiv.classList.remove('hidden');
                        loginBtn.disabled = false;
                        loginBtn.innerHTML = 'Sign in to Dashboard';
                        return;
                    }

                    adminId = data.admin_id || data.master_id;
                    adminEmail = data.email || "";
                    adminName = data.username || username;
                    const role = data.role || "tenant";
                    const plan = data.subscription_plan || "Free Trial";
                    const planKey = data.subscription_plan_key || normalizePlanKey(plan);
                    const planCapabilities = getPlanCapabilities(planKey, data.plan_capabilities || null);

                    // Persist session
                    if (data.token) {
                        sessionStorage.setItem('adminToken', data.token);
                    }
                    sessionStorage.setItem('adminId', adminId);
                    sessionStorage.setItem('adminEmail', adminEmail);
                    sessionStorage.setItem('adminName', adminName);
                    sessionStorage.setItem('adminRole', role);
                    adminRole = role; // Update global variable
                    currentPlanKey = planKey;
                    currentPlanLabel = plan;
                    currentPlanCapabilities = planCapabilities;
                    sessionStorage.setItem('subscriptionPlan', plan);
                    sessionStorage.setItem('subscriptionPlanKey', planKey);
                    sessionStorage.setItem('planCapabilities', JSON.stringify(planCapabilities));
                    sessionStorage.setItem('subscriptionExpiry', data.subscription_expiry || '');
                    sessionStorage.setItem('subscriptionCredits', data.credits ?? '');
                    sessionStorage.setItem('subscriptionWarningMessage', data.subscription_warning_message || '');

                    const companyName = data.company_name || "";
                    sessionStorage.setItem('adminCompany', companyName);

                    document.getElementById('adminName').textContent = adminName;
                    document.getElementById('adminEmailInput').value = adminEmail;
                    document.getElementById('adminUsernameInput').value = adminName;
                    document.getElementById('adminCompanyInput').value = companyName;

                    // Update global state and UI
                    currentTenantId = adminId;
                    currentRole = role;
                    const sidebarName = document.getElementById('sidebarAdminName');
                    if (sidebarName) sidebarName.textContent = adminName;

                    const sidebarRole = document.getElementById('sidebarAdminRole');
                    if (sidebarRole) sidebarRole.textContent = (role === 'master' ? 'Master Admin' : 'Admin') + ' (' + plan + ')';

                    // Show / Hide master elements
                    if (role === "master") {
                        document.getElementById('tenantSidebarNav').style.display = 'none';
                        document.getElementById('masterSidebarNav').style.display = 'block';
                        const navBtn = document.getElementById('nav-btn-master-plans');
                        if (navBtn) navBtn.style.display = 'block';
                    } else {
                        document.getElementById('tenantSidebarNav').style.display = 'block';
                        document.getElementById('masterSidebarNav').style.display = 'none';
                        if (role === "super_admin") {
                            document.getElementById('nav-btn-super_dashboard').style.display = 'block';
                            document.getElementById('nav-btn-team').style.display = 'block';
                            
                            // Setup Admin Filter for Overview
                            const filterContainer = document.getElementById('superAdminFilterContainer');
                            const filterSelect = document.getElementById('superAdminFilter');
                            if (filterContainer && filterSelect) {
                                filterContainer.style.display = 'flex';
                                // Fetch admins to populate dropdown
                                fetch(`${API_BASE}/super-admin/admins`, {
                                    headers: { 'Authorization': `Bearer ${data.token}` }
                                }).then(r => r.json()).then(resData => {
                                    if (resData.data) {
                                        let optionsHtml = '<option value="">All Admins</option>';
                                        resData.data.forEach(admin => {
                                            optionsHtml += `<option value="${admin.id}">${admin.name || admin.username}</option>`;
                                        });
                                        filterSelect.innerHTML = optionsHtml;
                                    }
                                }).catch(err => console.error('Failed to load admins for filter', err));
                            }
                        }
                    }

                    // Switch to dashboard view
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
                    }, 300);

                } else {
                    errorDiv.textContent = "Invalid username or password.";
                    errorDiv.classList.remove('hidden');
                    // Shake animation
                    const card = document.querySelector('.login-card');
                    card.style.animation = 'none';
                    void card.offsetWidth;
                    card.style.animation = 'shake 0.4s ease';
                }
            } catch (error) {
                console.error("Login catch block error:", error);
                if (error.name === 'AbortError') {
                    errorDiv.textContent = "Request timed out. Server may be starting up — try again.";
                } else if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
                    errorDiv.textContent = "Cannot connect to server. Please check if backend is running (or accept the self-signed cert).";
                } else {
                    errorDiv.textContent = "An unexpected error occurred: " + error.message;
                }
                errorDiv.classList.remove('hidden');
            } finally {
                loginBtn.disabled = false;
                loginBtn.innerHTML = 'Sign In';
            }
        }

        function removeResume() {
            document.getElementById('resumeFile').value = '';
            document.getElementById('resumeText').value = '';
            document.getElementById('fileLabel').textContent = 'Click to upload or drag and drop';
            const removeBtn = document.getElementById('removeResumeBtn');
            if (removeBtn) removeBtn.classList.add('hidden');
            document.getElementById('fileStatus').innerHTML = '';
        }

        // --- LOGOUT ---
        function logout() {
            sessionStorage.removeItem('adminId');
            sessionStorage.removeItem('adminEmail');
            sessionStorage.removeItem('adminName');
            sessionStorage.removeItem('adminRole');
            sessionStorage.removeItem('subscriptionPlan');
            sessionStorage.removeItem('subscriptionPlanKey');
            sessionStorage.removeItem('planCapabilities');
            sessionStorage.removeItem('subscriptionExpiry');
            sessionStorage.removeItem('subscriptionCredits');
            sessionStorage.removeItem('subscriptionWarningMessage');
            location.reload();
        }

        // --- FILE HANDLING with Drag & Drop ---
        const dropZone = document.getElementById('fileDropZone');

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = 'var(--primary)';
            dropZone.style.background = 'rgba(99, 102, 241, 0.08)';
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.style.borderColor = 'var(--border)';
            dropZone.style.background = 'var(--bg-input)';
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = 'var(--border)';
            dropZone.style.background = 'var(--bg-input)';

            const files = e.dataTransfer.files;
            if (files.length > 0) {
                document.getElementById('resumeFile').files = files;
                handleFileSelect();
            }
        });

        async function handleFileSelect() {
            const fileInput = document.getElementById('resumeFile');
            const file = fileInput.files[0];
            const statusDiv = document.getElementById('fileStatus');
            const textArea = document.getElementById('resumeText');
            const fileLabel = document.getElementById('fileLabel');

            if (!file) return;

            fileLabel.innerHTML = `<span class="file-name">${file.name}</span>`;
            statusDiv.innerHTML = '<span class="file-status loading">⏳ Parsing resume...</span>';
            textArea.value = "";

            const formData = new FormData();
            formData.append('file', file);

            try {
                const response = await fetch(`${API_BASE}/admin/parse-resume`, {
                    method: 'POST',
                    body: formData
                });

                if (response.ok) {
                    const data = await response.json();
                    textArea.value = data.text;

                    // Populate name and email if found
                    if (data.name) document.getElementById('candidateName').value = data.name;
                    if (data.email) {
                        document.getElementById('candidateEmail').value = data.email;
                        checkCandidateExists();
                    }

                    statusDiv.innerHTML = '<span class="file-status success">✅ Parsed successfully</span>';
                    const removeBtn = document.getElementById('removeResumeBtn');
                    if (removeBtn) removeBtn.classList.remove('hidden');
                    triggerAtsIfReady();
                } else {
                    statusDiv.innerHTML = '<span class="file-status error">❌ Failed to parse file</span>';
                }
            } catch (error) {
                console.error(error);
                statusDiv.innerHTML = '<span class="file-status error">❌ Error parsing file</span>';
            }
        }



        async function handleJdFileSelect() {
            const fileInput = document.getElementById('jdFile');
            const file = fileInput.files[0];
            const statusDiv = document.getElementById('jdFileStatus');
            const textArea = document.getElementById('jobDescription');

            if (!file) return;

            statusDiv.innerHTML = `<span class="file-status loading">⏳ Parsing <b>${file.name}</b>...</span>`;
            textArea.value = "";

            const formData = new FormData();
            formData.append('file', file);

            try {
                const response = await fetch(`${API_BASE}/admin/parse-resume`, {
                    method: 'POST',
                    body: formData
                });

                if (response.ok) {
                    const data = await response.json();
                    textArea.value = data.text;
                    statusDiv.innerHTML = '<span class="file-status success">✅ Parsed successfully</span>';
                    triggerAtsIfReady();
                } else {
                    statusDiv.innerHTML = '<span class="file-status error">❌ Failed to parse file</span>';
                }
            } catch (error) {
                console.error(error);
                statusDiv.innerHTML = '<span class="file-status error">❌ Server connection error</span>';
            }
        }

        async function handleBulkJdFileSelect() {
            const fileInput = document.getElementById('bulkJdFile');
            const file = fileInput.files[0];
            const statusDiv = document.getElementById('bulkJdFileStatus');
            const textArea = document.getElementById('bulkJobDescription');

            if (!file) return;

            statusDiv.innerHTML = `<span class="file-status loading">⏳ Parsing <b>${file.name}</b>...</span>`;
            textArea.value = "";

            const formData = new FormData();
            formData.append('file', file);

            try {
                const response = await fetch(`${API_BASE}/admin/parse-resume`, {
                    method: 'POST',
                    body: formData
                });

                if (response.ok) {
                    const data = await response.json();
                    textArea.value = data.text;
                    statusDiv.innerHTML = '<span class="file-status success">✅ Parsed successfully</span>';
                } else {
                    statusDiv.innerHTML = '<span class="file-status error">❌ Failed to parse file</span>';
                }
            } catch (error) {
                console.error(error);
                statusDiv.innerHTML = '<span class="file-status error">❌ Server connection error</span>';
            }
        }

        async function handleGenericFileSelect(inputId, labelId, statusId, textAreaId, typeName) {
            const fileInput = document.getElementById(inputId);
            const file = fileInput.files[0];
            const statusDiv = document.getElementById(statusId);
            const textArea = document.getElementById(textAreaId);

            if (!file) return;

            statusDiv.innerHTML = `<span class="file-status loading">⏳ Parsing <b>${file.name}</b>...</span>`;
            textArea.value = "";

            const formData = new FormData();
            formData.append('file', file);

            try {
                const response = await fetch(`${API_BASE}/admin/parse-resume`, {
                    method: 'POST',
                    body: formData
                });

                if (response.ok) {
                    const data = await response.json();
                    textArea.value = data.text;
                    statusDiv.innerHTML = '<span class="file-status success">✅ Parsed successfully</span>';
                } else {
                    statusDiv.innerHTML = '<span class="file-status error">❌ Failed to parse file</span>';
                }
            } catch (error) {
                console.error(error);
                statusDiv.innerHTML = '<span class="file-status error">❌ Server connection error</span>';
            }
        }

        // --- ATS SCORE LOGIC ---
        let atsDebounceTimeout;
        function triggerAtsIfReady() {
            clearTimeout(atsDebounceTimeout);
            atsDebounceTimeout = setTimeout(() => {
                const resume = document.getElementById('resumeText').value.trim();
                const jd = document.getElementById('jobDescription').value.trim();
                if (resume && jd) {
                    calculateAtsScore();
                }
            }, 1500);
        }

        async function calculateAtsScore() {
            const resume = document.getElementById('resumeText').value.trim();
            const jd = document.getElementById('jobDescription').value.trim();

            if (!resume || !jd) {
                return;
            }

            const btn = document.getElementById('atsBtn');
            const resultsDiv = document.getElementById('atsResults');

            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
            btn.disabled = true;

            // Show loading state in the results div
            resultsDiv.style.display = 'block';
            document.getElementById('atsScoreCircle').textContent = '...';
            document.getElementById('atsScoreCircle').style.background = '#94a3b8';
            document.getElementById('atsSummary').innerHTML = '<span style="color: #64748b;"><i class="fas fa-spinner fa-spin"></i> Analyzing ATS match score...</span>';
            document.getElementById('atsMatchedSkills').innerHTML = '';
            document.getElementById('atsMissingSkills').innerHTML = '';

            try {
                const response = await fetch(`${API_BASE}/admin/ats-score`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ resume_text: resume, jd_text: jd })
                });

                if (response.ok) {
                    const data = await response.json();

                    resultsDiv.style.display = 'block';

                    const scoreCircle = document.getElementById('atsScoreCircle');
                    scoreCircle.textContent = `${data.score}%`;

                    if (data.score >= 75) {
                        scoreCircle.style.background = 'linear-gradient(135deg, #22c55e, #16a34a)';
                    } else if (data.score >= 50) {
                        scoreCircle.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
                    } else {
                        scoreCircle.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
                    }

                    document.getElementById('atsSummary').textContent = data.summary || '';

                    const matchedDiv = document.getElementById('atsMatchedSkills');
                    matchedDiv.innerHTML = (data.matched_skills || []).map(s => `<span style="display:inline-block; background:white; padding:2px 6px; border-radius:4px; margin:2px; font-size:0.7rem; border:1px solid #e5e7eb;">${s}</span>`).join('') || 'None identified';

                    const missingDiv = document.getElementById('atsMissingSkills');
                    missingDiv.innerHTML = (data.missing_skills || []).map(s => `<span style="display:inline-block; background:white; padding:2px 6px; border-radius:4px; margin:2px; font-size:0.7rem; border:1px solid #e5e7eb;">${s}</span>`).join('') || 'None identified';

                } else {
                    showToast("Failed to calculate ATS score.", "error");
                }
            } catch (error) {
                console.error(error);
                showToast("Server connection error while calculating score.", "error");
            } finally {
                btn.innerHTML = 'Calculate Match';
                btn.disabled = false;
            }
        }

        // --- CREATE SESSION ---
        async function checkCandidateExists() {
            const email = document.getElementById('candidateEmail').value.trim();
            if (!email || !email.includes('@')) return;

            try {
                const response = await fetch(`${API_BASE}/admin/candidate/check?email=${encodeURIComponent(email)}`);
                if (!response.ok) return;

                const data = await response.json();
                if (data.exists && data.resume_text) {
                    const modal = document.getElementById('candidateExistsModal');
                    const nameSpan = document.getElementById('candidateExistsName');
                    const confirmBtn = document.getElementById('candidateExistsConfirmBtn');

                    nameSpan.textContent = data.candidate_name || email;

                    confirmBtn.onclick = function () {
                        document.getElementById('candidateName').value = data.candidate_name || '';
                        document.getElementById('resumeText').value = data.resume_text;
                        showToast('Candidate details auto-filled.', 'success');
                        triggerAtsIfReady();
                        modal.classList.add('hidden');
                    };

                    modal.classList.remove('hidden');
                }
            } catch (err) {
                console.error("Error checking candidate:", err);
            }
        }

        function toggleCaseStudyCount() {
            const type = document.getElementById('interviewType').value;
            document.getElementById('caseStudyCountGroup').style.display = type === 'Non-Technical' ? 'block' : 'none';
        }

        function handleLanguageChange() {
            const lang = document.getElementById('interviewLanguage').value;
            const typeSelect = document.getElementById('interviewType');
            const technicalOption = Array.from(typeSelect.options).find(opt => opt.value === 'Technical');

            if (lang !== 'English') {
                technicalOption.disabled = true;
                if (typeSelect.value === 'Technical') {
                    typeSelect.value = 'Normal';
                    alert("Coding round is currently restricted to English language interviews. Switching to Normal interview type.");
                }
            } else {
                technicalOption.disabled = false;
            }
            toggleCaseStudyCount();
        }

        function handleBulkLanguageChange() {
            const lang = document.getElementById('bulkInterviewLanguage').value;
            const typeSelect = document.getElementById('bulkInterviewType');
            const technicalOption = Array.from(typeSelect.options).find(opt => opt.value === 'Technical');

            if (lang !== 'English') {
                technicalOption.disabled = true;
                if (typeSelect.value === 'Technical') {
                    typeSelect.value = 'Normal';
                    alert("Coding round is currently restricted to English language interviews. Switching to Normal interview type.");
                }
            } else {
                technicalOption.disabled = false;
            }
            toggleBulkCaseStudyCount();
        }

        async function createSession() {
            const name = document.getElementById('candidateName').value.trim();
            const email = document.getElementById('candidateEmail').value.trim();
            const resume = document.getElementById('resumeText').value.trim();
            const jd = document.getElementById('jobDescription').value.trim();
            const customQuestions = document.getElementById('customQuestions').value.trim();
            const aiInstructions = document.getElementById('aiInstructions').value.trim();
            const duration = parseInt(document.getElementById('interviewDuration').value) || 30;
            const interviewType = document.getElementById('interviewType').value;
            const industryType = document.getElementById('industryType').value;
            const recordVideo = document.getElementById('recordVideo').checked;
            const scheduleStart = document.getElementById('scheduleStart').value;
            const scheduleEnd = document.getElementById('scheduleEnd').value;
            const createBtn = document.getElementById('createBtn');

            // HR Screening Preferences
            const hrScreening = {
                work_mode: document.getElementById('askWorkMode').checked ? document.querySelector('input[name="workModeType"]:checked').value : "",
                location: document.getElementById('askLocation').checked ? document.querySelector('input[name="locationType"]:checked').value : "",
                ask_bond: document.getElementById('askBond').checked
            };

            if (!name || !email || !resume || !jd) {
                showToast("Please scroll up and fill in all required fields (Name, Email, Resume, Job Description).", "error");
                return;
            }

            if (duration < 5 || duration > 120) {
                showToast("Interview Duration must be between 5 and 120 minutes.", "error");
                return;
            }

            if (scheduleStart) {
                const start = new Date(scheduleStart);
                if (start < new Date()) {
                    showToast("Schedule Start time cannot be in the past.", "error");
                    return;
                }
                if (scheduleEnd && new Date(scheduleEnd) <= start) {
                    showToast("Schedule End time must be after the Start time.", "error");
                    return;
                }
            }

            createBtn.disabled = true;
            createBtn.innerHTML = '<span class="spinner"></span> Creating Interview...';

            try {
                const response = await fetch(`${API_BASE}/admin/create-session`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        candidate_name: name,
                        candidate_email: email,
                        resume_text: resume,
                        job_description: jd,
                        admin_id: adminId,
                        interview_duration: duration,
                        interview_type: interviewType,
                        industry: industryType,
                        language: document.getElementById('interviewLanguage').value,
                        record_video: recordVideo,
                        custom_email_html: window._customEmailHtml || "",
                        scheduled_start: toUtcIso(scheduleStart),
                        scheduled_end: toUtcIso(scheduleEnd),
                        hr_screening: hrScreening,
                        custom_questions: customQuestions,
                        ai_instructions: aiInstructions,
                        case_study_count: interviewType === 'Non-Technical' ? parseInt(document.getElementById('caseStudyCount').value) || 3 : 0
                    })
                });

                if (response.ok) {
                    const data = await response.json();

                    if (data.email_scheduled && data.email_send_at) {
                        const sendAt = new Date(data.email_send_at).toLocaleString('en-IN', {
                            year: 'numeric',
                            month: 'short',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                        });
                        showToast(`Link created. Invitation will be sent to ${email} at ${sendAt}.`, "success");
                    } else if (data.email_sent) {
                        showToast(`Link created & email sent to ${email}!`, "success");
                    } else {
                        showToast(`Link created, but email failed to send.`, "warning");
                    }

                    addSessionToUI(name, data.link_url, data.link_id);

                    // Clear form
                    document.getElementById('candidateName').value = '';
                    document.getElementById('candidateEmail').value = '';
                    if (typeof removeResume === 'function') removeResume();
                    document.getElementById('jobDescription').value = '';
                    document.getElementById('scheduleStart').value = '';
                    document.getElementById('scheduleEnd').value = '';
                    window._customEmailHtml = ""; // Reset custom email
                    document.getElementById('askWorkMode').checked = false;
                    document.getElementById('askLocation').checked = false;
                    document.getElementById('askBond').checked = false;
                    document.getElementById('workModeOptions').style.display = 'none';
                    document.getElementById('locationOptions').style.display = 'none';

                } else {
                    const errData = await response.json().catch(() => ({}));
                    console.error("422 Error details:", errData);
                    let errMsg = errData.detail || "Failed to create session.";
                    if (Array.isArray(errMsg)) {
                        errMsg = errMsg.map(e => `${e.loc.join('.')}: ${e.msg}`).join(', ');
                    }
                    showToast(errMsg, "error");
                }
            } catch (error) {
                console.error(error);
                showToast("Server connection failed.", "error");
            } finally {
                createBtn.disabled = false;
                createBtn.innerHTML = '<i class="fas fa-bolt"></i> Generate Interview Link';
            }
        }

        // --- ADD SESSION TO UI ---
        function addSessionToUI(name, relativeUrl, id) {
            const fullUrl = normalizeFrontendUrl(relativeUrl);
            const list = document.getElementById('linksList');
            const secondaryAction = currentPlanCapabilities.live_monitoring
                ? `<button class="btn-copy" style="background: var(--primary); color: white;" onclick="viewResults('${id}')"><i class="fas fa-eye"></i> Live Results</button>`
                : `<button class="btn-copy" style="background: rgba(245,158,11,0.12); color: #92400e; border: 1px solid rgba(245,158,11,0.28);" onclick="showPlanUpgradeMessage('Live monitoring', 'Advance')">Upgrade</button>`;

            // Remove empty state placeholder
            const emptyState = list.querySelector('.empty-state');
            if (emptyState) emptyState.remove();

            const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            const item = document.createElement('div');
            item.className = 'session-item';
            item.innerHTML = `
                <div class="session-item-header">
                    <div class="candidate-name"><span class="dot"></span>${escapeHtml(name)}</div>
                    <div class="timestamp">${now}</div>
                </div>
                <div class="link-display">${fullUrl}</div>
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <button class="btn-copy" onclick="copyLink(this, '${fullUrl}')"><i class="fas fa-copy"></i> Copy Link</button>
                    ${secondaryAction}
                </div>
            `;
            list.prepend(item);
        }

        // --- COPY LINK ---
        function copyLink(btn, url) {
            navigator.clipboard.writeText(url).then(() => {
                btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                btn.classList.add('copied');
                setTimeout(() => {
                    btn.innerHTML = '<i class="fas fa-copy"></i> Copy Link';
                    btn.classList.remove('copied');
                }, 2000);
            });
        }

        // --- TOAST NOTIFICATIONS ---
        function showToast(message, type = "success") {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.innerHTML = `${type === 'success' ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-circle-exclamation"></i>'} ${message}`;
            container.appendChild(toast);

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(30px)';
                toast.style.transition = 'all 0.3s ease';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        // --- DASHBOARD LAYOUT LOGIC ---
        function switchView(viewId) {
            document.querySelectorAll('.view-panel').forEach(p => p.classList.add('hidden'));
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

            document.getElementById('view-' + viewId).classList.remove('hidden');

            // Activate button
            const btn = document.getElementById('nav-btn-' + viewId);
            if (btn) btn.classList.add('active');

            if (viewId === 'overview' || viewId === 'qualified' || viewId === 'unqualified' || viewId === 'deactivated') {
                if (!window._lastFetchedSessions) {
                    loadDashboardSessions();
                } else {
                    // Re-render current data to ensure UI is up to date
                    const filterStatus = document.getElementById('filterStatus') ? document.getElementById('filterStatus').value : '';
                    renderDashboardTable(window._lastFetchedSessions, filterStatus, false);
                }
                loadDashboardStats(); // Task 8
                if (viewId === 'overview') document.getElementById('nav-btn-results').style.display = 'none';
            }
            if (viewId === 'settings') {
                document.getElementById('adminEmailInput').value = adminEmail;
            }
            if (viewId === 'team') {
                loadTeamManagement();
                loadCreditRequests();
            }
        }

        async function updateProfile() {
            const newEmail = document.getElementById('adminEmailInput').value;
            const newUsername = document.getElementById('adminUsernameInput').value;
            const newCompany = document.getElementById('adminCompanyInput').value;
            const oldPassword = document.getElementById('adminOldPasswordInput').value;
            const newPassword = document.getElementById('adminNewPasswordInput').value;
            const confirmPassword = document.getElementById('adminConfirmPasswordInput').value;
            const btn = document.getElementById('updateProfileBtn');

            if (newPassword && newPassword !== confirmPassword) {
                showToast('❌ Passwords do not match.', 'error');
                return;
            }

            if (newPassword && !oldPassword) {
                showToast('❌ Old password is required to set a new password.', 'error');
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> Updating...';

            const payload = { admin_id: adminId };
            if (newEmail) payload.email = newEmail;
            if (newUsername) payload.username = newUsername;
            if (newCompany) payload.company_name = newCompany;
            if (oldPassword) payload.old_password = oldPassword;
            if (newPassword) payload.new_password = newPassword;

            try {
                const res = await fetch(`${API_BASE}/admin/profile`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();

                if (res.ok) {
                    if (data.updated_fields) {
                        if (data.updated_fields.email) adminEmail = data.updated_fields.email;
                        if (data.updated_fields.username) {
                            sessionStorage.setItem('adminName', data.updated_fields.username);
                            document.getElementById('adminName').textContent = data.updated_fields.username;
                            const sidebarName = document.getElementById('sidebarAdminName');
                            if (sidebarName) sidebarName.textContent = data.updated_fields.username;
                        }
                        if (data.updated_fields.company_name) {
                            sessionStorage.setItem('adminCompany', data.updated_fields.company_name);
                        }
                    }

                    // Clear password fields
                    document.getElementById('adminOldPasswordInput').value = '';
                    document.getElementById('adminNewPasswordInput').value = '';
                    document.getElementById('adminConfirmPasswordInput').value = '';

                    showToast('Profile updated successfully!', 'success');
                } else {
                    showToast(`Failed: ${data.detail || data.message}`, 'error');
                }
            } catch (e) {
                showToast('Connection error.', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = 'Update Profile';
            }
        }

        async function loadDashboardSessions() {
            if (!adminId || window._isFetchingSessions) return;
            window._isFetchingSessions = true;
            const tbody = document.getElementById('dashboardTableBody');
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);"><span class="spinner" style="border-color:var(--primary); border-bottom-color:transparent; width:20px; height:20px;"></span> Loading...</td></tr>';

            const startDate = document.getElementById('filterStartDate').value;
            const endDate = document.getElementById('filterEndDate').value;

            if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
                showToast("Enter valid date range (End date cannot be before Start date)", "error");
                window._isFetchingSessions = false;
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--danger);">Invalid date range selected. Please enter a valid range.</td></tr>';
                return;
            }

            const sortBy = document.getElementById('sortBy').value;
            const filterStatus = document.getElementById('filterStatus') ? document.getElementById('filterStatus').value : '';

            let url = `${API_BASE}/admin/sessions?sort_by=${sortBy}&deactivated=all`;
            
            const superAdminFilter = document.getElementById('superAdminFilter');
            if (superAdminFilter && superAdminFilter.value) {
                url += `&admin_id=${superAdminFilter.value}`;
            }

            if (startDate) url += `&start_date=${startDate}`;
            if (endDate) url += `&end_date=${endDate}`;

            try {
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    window._lastFetchedSessions = data.sessions; // Cache for live search
                    renderDashboardTable(data.sessions, filterStatus);
                } else {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--danger);">Failed to load sessions.</td></tr>';
                }
            } catch (e) {
                console.error(e);
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--danger);">Error connecting to server.</td></tr>';
            } finally {
                window._isFetchingSessions = false;
            }
        }

        async function toggleSessionActive(linkId, currentlyDeactivated) {
            if (!currentPlanCapabilities.deactivated_candidates) {
                showPlanUpgradeMessage('Deactivated candidate controls', 'Basic');
                return;
            }
            const action = currentlyDeactivated ? 'activate' : 'deactivate';
            const confirmMsg = `Are you sure you want to ${action} this interview link? ${currentlyDeactivated ? 'The candidate will be able to access the interview again.' : 'The candidate will no longer be able to access the interview.'}`;

            if (!confirm(confirmMsg)) return;

            try {
                const res = await fetch(`${API_BASE}/admin/sessions/${encodeURIComponent(linkId)}/${currentlyDeactivated ? 'activate' : 'deactivate'}`, {
                    method: 'POST'
                });
                if (res.ok) {
                    showToast(`Session ${action}d successfully`, "success");
                    loadDashboardSessions();
                } else {
                    showToast(`Failed to ${action} session`, "error");
                }
            } catch (error) {
                console.error(`Error ${action}ing session:`, error);
                showToast(`Error ${action}ing session`, "error");
            }
        }

        // --- RESCHEDULE INTERVIEW ---
        let currentRescheduleLinkId = null;

        function openRescheduleModal(linkId, candidateName) {
            currentRescheduleLinkId = linkId;
            document.getElementById('rescheduleCandidateName').textContent = `For ${candidateName}`;

            // Set default to 24 hours from now
            const tomorrow = new Date();
            tomorrow.setHours(tomorrow.getHours() + 24);
            const localIso = new Date(tomorrow.getTime() - (tomorrow.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            document.getElementById('newExpiryInput').value = localIso;

            document.getElementById('rescheduleModal').classList.remove('hidden');
        }

        function closeRescheduleModal() {
            document.getElementById('rescheduleModal').classList.add('hidden');
            currentRescheduleLinkId = null;
        }

        async function submitReschedule() {
            if (!currentRescheduleLinkId) return;
            const newExpiry = document.getElementById('newExpiryInput').value;
            if (!newExpiry) {
                showToast('Please select a valid expiration date', 'error');
                return;
            }

            const btn = document.getElementById('rescheduleSubmitBtn');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';

            try {
                const formData = new FormData();
                // Convert local datetime-local value to ISO UTC for backend
                const isoExpiry = new Date(newExpiry).toISOString();
                formData.append('new_expiry', isoExpiry);

                const response = await fetch(`${API_BASE}/admin/sessions/${currentRescheduleLinkId}/reschedule`, {
                    method: 'POST',
                    body: formData
                });

                if (response.ok) {
                    showToast('Interview rescheduled and invitation email re-sent!', 'success');
                    closeRescheduleModal();
                    loadDashboardSessions(); // Refresh table
                } else {
                    const err = await response.json();
                    showToast('Failed: ' + (err.detail || 'Server error'), 'error');
                }
            } catch (e) {
                console.error(e);
                showToast('Network error while rescheduling', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }

        async function deleteSession(linkId) {
            if (!confirm("Are you sure you want to delete this candidate's interview session? This cannot be undone.")) return;

            try {
                const res = await fetch(`${API_BASE}/admin/sessions/${linkId}`, { method: 'DELETE' });
                if (res.ok) {
                    showToast("Session deleted successfully", "success");
                    loadDashboardSessions();
                } else {
                    showToast("Failed to delete session", "error");
                }
            } catch (error) {
                showToast("Server error deleting session", "error");
            }
        }

        function toggleSelectAll(master) {
            const checkboxes = document.querySelectorAll('#dashboardTableBody .session-checkbox');
            checkboxes.forEach(cb => cb.checked = master.checked);
            updateBulkDeleteBtn();
        }

        function toggleSelectAllItems(type, master) {
            let selector = '';
            if (type === 'qualified') selector = '#qualifiedTableBody .session-checkbox';
            else if (type === 'unqualified') selector = '#unqualifiedTableBody .session-checkbox';
            else if (type === 'deactivated') selector = '#deactivatedTableBody .session-checkbox';

            const checkboxes = document.querySelectorAll(selector);
            checkboxes.forEach(cb => cb.checked = master.checked);
            updateTableBulkDeleteBtn(type);
        }

        function updateBulkDeleteBtn() {
            const checked = document.querySelectorAll('#dashboardTableBody .session-checkbox:checked').length;
            const btn = document.getElementById('bulkDeleteBtn');
            if (btn) {
                btn.style.display = checked > 0 ? 'inline-block' : 'none';
                if (checked > 0) {
                    btn.innerHTML = `<i class="fas fa-trash-alt"></i> Delete Selected (${checked})`;
                }
            }
        }

        function updateTableBulkDeleteBtn(type) {
            let selector = '';
            let btnId = '';
            if (type === 'qualified') {
                selector = '#qualifiedTableBody .session-checkbox:checked';
                btnId = 'bulkDeleteQualifiedBtn';
            } else if (type === 'unqualified') {
                selector = '#unqualifiedTableBody .session-checkbox:checked';
                btnId = 'bulkDeleteUnqualifiedBtn';
            } else if (type === 'deactivated') {
                selector = '#deactivatedTableBody .session-checkbox:checked';
                btnId = 'bulkDeleteDeactivatedBtn';
            }

            const checked = document.querySelectorAll(selector).length;
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.style.display = checked > 0 ? 'inline-block' : 'none';
                if (checked > 0) {
                    btn.innerHTML = `<i class="fas fa-trash-alt"></i> Delete Selected (${checked})`;
                }
            }
        }

        async function deleteSelectedSessions(source = 'dashboard') {
            let selector = '#dashboardTableBody .session-checkbox:checked';
            let btnId = 'bulkDeleteBtn';

            if (source === 'qualified') {
                selector = '#qualifiedTableBody .session-checkbox:checked';
                btnId = 'bulkDeleteQualifiedBtn';
            } else if (source === 'unqualified') {
                selector = '#unqualifiedTableBody .session-checkbox:checked';
                btnId = 'bulkDeleteUnqualifiedBtn';
            } else if (source === 'deactivated') {
                selector = '#deactivatedTableBody .session-checkbox:checked';
                btnId = 'bulkDeleteDeactivatedBtn';
            }

            const checkedBoxes = document.querySelectorAll(selector);
            const linkIds = Array.from(checkedBoxes).map(cb => cb.value);

            if (linkIds.length === 0) return;
            if (!confirm(`Are you sure you want to delete ${linkIds.length} selected interview sessions? This cannot be undone.`)) return;

            const btn = document.getElementById(btnId);
            const originalHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner" style="width:14px; height:14px; border-width:2px; margin-right:5px;"></span> Deleting...';

            let successCount = 0;
            let failCount = 0;

            try {
                const promises = linkIds.map(id =>
                    fetch(`${API_BASE}/admin/sessions/${id}`, { method: 'DELETE' })
                        .then(res => { if (res.ok) successCount++; else failCount++; })
                        .catch(() => failCount++)
                );

                await Promise.all(promises);

                if (successCount > 0) {
                    showToast(`Deleted ${successCount} sessions successfully`, "success");
                    loadDashboardSessions(source === 'deactivated');
                }
                if (failCount > 0) {
                    showToast(`Failed to delete ${failCount} sessions`, "error");
                }
            } catch (error) {
                showToast("Error during bulk deletion", "error");
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
                if (source === 'dashboard') updateBulkDeleteBtn();
                else updateTableBulkDeleteBtn(source);
            }
        }

        // FIX #2: Cross-validate date filters to prevent negative/inverted ranges
        function syncDateFilters(changedField) {
            const startEl = document.getElementById('filterStartDate');
            const endEl = document.getElementById('filterEndDate');
            const startVal = startEl.value;
            const endVal = endEl.value;

            if (changedField === 'start' && startVal) {
                // Set min on End date so it can't go before Start
                endEl.min = startVal;
                // If End date is set and is now before Start, auto-correct it
                if (endVal && endVal < startVal) {
                    endEl.value = startVal;
                    showToast('End date adjusted to match start date', 'info');
                }
            } else if (changedField === 'end' && endVal) {
                // Set max on Start date so it can't go after End
                startEl.max = endVal;
                // If Start date is set and is now after End, auto-correct it
                if (startVal && startVal > endVal) {
                    startEl.value = endVal;
                    showToast('Start date adjusted to match end date', 'info');
                }
            }
        }

        function clearFilters() {
            const startEl = document.getElementById('filterStartDate');
            const endEl = document.getElementById('filterEndDate');
            startEl.value = '';
            startEl.removeAttribute('max');
            endEl.value = '';
            endEl.removeAttribute('min');
            document.getElementById('searchCandidate').value = '';
            document.getElementById('sortBy').value = 'score';
            if (document.getElementById('filterStatus')) document.getElementById('filterStatus').value = '';
            loadDashboardSessions();
        }

        // Helper to re-render without network request for live search
        function renderCurrentSessions() {
            const filterStatus = document.getElementById('filterStatus') ? document.getElementById('filterStatus').value : '';
            if (window._lastFetchedSessions) {
                renderDashboardTable(window._lastFetchedSessions, filterStatus);
            }
        }

        function filterByCardStatus(status) {
            const statusSelect = document.getElementById('filterStatus');
            if (statusSelect) {
                statusSelect.value = status;
                renderCurrentSessions();
            }
        }

        function handleVideoError(videoElem) {
            const container = videoElem.parentElement;
            const errorMsg = container.querySelector('#videoErrorMsg') || container.querySelector('.video-error-msg');
            if (errorMsg) {
                videoElem.style.display = 'none';
                errorMsg.style.display = 'block';
            }
            console.error("Video failed to load:", videoElem.querySelector('source')?.src);
        }

        async function downloadRecording(url, filename, btnEl) {
            if (!url) return;
            const originalText = btnEl ? btnEl.innerHTML : '';
            if (btnEl) btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading...';
            try {
                const resp = await fetch(url);
                if (!resp.ok) throw new Error('Network error');
                const blob = await resp.blob();
                const objectUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = objectUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
            } catch (e) {
                console.error('Download failed, opening in new tab:', e);
                window.open(url, '_blank');
            } finally {
                if (btnEl) btnEl.innerHTML = originalText;
            }
        }


        function renderDashboardTable(sessions, filterStatus, resetPagination = true) {
            if (resetPagination) currentPage = 1;
            const tbody = document.getElementById('dashboardTableBody');
            const qualifiedBody = document.getElementById('qualifiedTableBody');
            const unqualifiedBody = document.getElementById('unqualifiedTableBody');

            // Reset select all checkbox
            const selectAllCheck = document.getElementById('selectAllCheckbox');
            if (selectAllCheck) selectAllCheck.checked = false;
            const selectAllQual = document.getElementById('selectAllQualified');
            if (selectAllQual) selectAllQual.checked = false;
            const selectAllUnqual = document.getElementById('selectAllUnqualified');
            if (selectAllUnqual) selectAllUnqual.checked = false;

            updateBulkDeleteBtn();
            updateTableBulkDeleteBtn('qualified');
            updateTableBulkDeleteBtn('unqualified');

            if (!sessions || sessions.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">No sessions found.</td></tr>';
                document.getElementById('paginationInfo').textContent = '';
                document.getElementById('prevPageBtn').disabled = true;
                document.getElementById('nextPageBtn').disabled = true;
                return;
            }

            let qualHtml = '';
            let unqualHtml = '';

            const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));

            const searchVal = document.getElementById('searchCandidate')?.value.toLowerCase() || '';
            const canViewDetailedAnalytics = !!currentPlanCapabilities.detailed_analytics;
            const canUseLiveMonitoring = !!currentPlanCapabilities.live_monitoring;
            const canManageDeactivated = !!currentPlanCapabilities.deactivated_candidates;

            // Build filtered list
            allFilteredSessions = [];
            sessions.forEach(s => {
                // Live Search Filter
                if (searchVal) {
                    const name = (s.candidate_name || "").toLowerCase();
                    const email = (s.candidate_email || "").toLowerCase();
                    if (!name.includes(searchVal) && !email.includes(searchVal)) {
                        return;
                    }
                }

                let currentStatus = (s.status || 'pending').toLowerCase();
                if (currentStatus === 'pending' && s.expires_at) {
                    let expiryStr = s.expires_at;
                    if (expiryStr && !expiryStr.endsWith('Z') && !expiryStr.includes('+')) {
                        expiryStr += 'Z';
                    }
                    if (new Date() > new Date(expiryStr)) {
                        currentStatus = 'expired';
                    }
                }

                // --- Build qualified/unqualified/deactivated tables (Regardless of status filter) ---
                let utcDateStr = s.created_at;
                if (utcDateStr && !utcDateStr.endsWith('Z') && !utcDateStr.includes('+')) {
                    utcDateStr += 'Z';
                }
                const dateObj = new Date(utcDateStr);
                const dateStr = dateObj.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true });

                let scoreText = '—';
                if (currentStatus === 'completed' && s.avg_score != null) {
                    const color = s.avg_score >= 60 ? 'var(--accent)' : 'var(--danger)';
                    scoreText = `<span style="color:${color}; font-weight:700;">${s.avg_score.toFixed(1)}/100</span>`;
                }

                if (s.decision === 'selected') {
                    const selectedNameCell = canViewDetailedAnalytics
                        ? `<a href="javascript:void(0)" onclick="openLiveResults('${escapeHtml(s.link_id)}', '${escapeHtml(s.candidate_name).replace(/'/g, "\\'")}')" style="color: var(--primary-light); text-decoration: none; border-bottom: 1px dashed var(--primary-light);">${escapeHtml(s.candidate_name)}</a>`
                        : escapeHtml(s.candidate_name);
                    const selectedAction = canViewDetailedAnalytics
                        ? `<button class="btn-copy" onclick="openLiveResults('${s.link_id}', '${s.candidate_name.replace(/'/g, "\\'")}')" style="background:#10b981; color:white; border:none; padding:0.4rem 0.8rem; font-size:0.75rem; border-radius:6px; cursor:pointer; font-weight:600;"><i class="fas fa-eye"></i> View</button>`
                        : `<button class="btn-copy" onclick="showPlanUpgradeMessage('Detailed result analytics', 'Basic')" style="background:rgba(245,158,11,0.12); color:#92400e; border:1px solid rgba(245,158,11,0.28); padding:0.4rem 0.8rem; font-size:0.75rem; border-radius:6px; cursor:pointer;">Upgrade</button>`;
                    qualHtml += `<tr>
                            <td style="padding-left: 1.5rem;"><input type="checkbox" class="session-checkbox" value="${s.link_id}" onclick="updateTableBulkDeleteBtn('qualified')" style="cursor: pointer;"></td>
                            <td style="font-weight: 500;">${selectedNameCell}${s.candidate_id ? `<div style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal; margin-top: 2px;">${escapeHtml(s.candidate_id)}</div>` : ''}</td>
                            <td>${dateStr}</td>
                            <td>${scoreText}</td>
                            <td style="text-align: right;">${selectedAction}</td>
                        </tr>`;
                }
                if (s.decision === 'rejected') {
                    const rejectedNameCell = canViewDetailedAnalytics
                        ? `<a href="javascript:void(0)" onclick="openLiveResults('${escapeHtml(s.link_id)}', '${escapeHtml(s.candidate_name).replace(/'/g, "\\'")}')" style="color: var(--text-muted); text-decoration: none; border-bottom: 1px dashed var(--text-muted);">${escapeHtml(s.candidate_name)}</a>`
                        : escapeHtml(s.candidate_name);
                    const rejectedAction = canViewDetailedAnalytics
                        ? `<button class="btn-copy" onclick="openLiveResults('${s.link_id}', '${s.candidate_name.replace(/'/g, "\\'")}')" style="background:var(--danger); color:white; border:none; padding:0.4rem 0.8rem; font-size:0.75rem; border-radius:6px; cursor:pointer;"><i class="fas fa-eye"></i> View</button>`
                        : `<button class="btn-copy" onclick="showPlanUpgradeMessage('Detailed result analytics', 'Basic')" style="background:rgba(245,158,11,0.12); color:#92400e; border:1px solid rgba(245,158,11,0.28); padding:0.4rem 0.8rem; font-size:0.75rem; border-radius:6px; cursor:pointer;">Upgrade</button>`;
                    unqualHtml += `<tr>
                            <td style="padding-left: 1.5rem;"><input type="checkbox" class="session-checkbox" value="${s.link_id}" onclick="updateTableBulkDeleteBtn('unqualified')" style="cursor: pointer;"></td>
                            <td style="font-weight: 500;">${rejectedNameCell}${s.candidate_id ? `<div style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal; margin-top: 2px;">${escapeHtml(s.candidate_id)}</div>` : ''}</td>
                            <td>${dateStr}</td>
                            <td>${scoreText}</td>
                            <td style="text-align: right;">${rejectedAction}</td>
                        </tr>`;
                }
                // --- Apply Status Filter for Overview Table only ---
                const filterStatusLower = (filterStatus || "").toLowerCase();
                if (filterStatusLower && filterStatusLower !== currentStatus) {
                    return;
                }

                if (s.is_deactivated) return; // Already handled above

                allFilteredSessions.push({ ...s, _computedStatus: currentStatus });
            });

            // Task 6: Apply pagination
            const totalItems = allFilteredSessions.length;
            const totalPages = Math.ceil(totalItems / PAGE_SIZE);
            if (currentPage > totalPages) currentPage = totalPages;
            if (currentPage < 1) currentPage = 1;

            const startIdx = (currentPage - 1) * PAGE_SIZE;
            const endIdx = Math.min(startIdx + PAGE_SIZE, totalItems);
            const pageItems = allFilteredSessions.slice(startIdx, endIdx);

            // Render paginated rows
            let mainHtml = '';
            pageItems.forEach(s => {
                const currentStatus = s._computedStatus;

                // Fix naive UTC parse bug to ensure correct IST conversion
                let utcDateStr = s.created_at;
                if (utcDateStr && !utcDateStr.endsWith('Z') && !utcDateStr.includes('+')) {
                    utcDateStr += 'Z';
                }
                const dateObj = new Date(utcDateStr);
                const dateStr = dateObj.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true });

                let statusClass = 'pending';
                if (currentStatus === 'started') statusClass = 'started';
                if (currentStatus === 'completed') statusClass = 'completed';
                if (currentStatus === 'expired') statusClass = 'pending';

                let statusLabel = currentStatus.toUpperCase();
                if (currentStatus === 'expired') statusLabel = 'NOT ATTENDED';
                if (s.is_deactivated) {
                    statusClass = 'pending';
                    statusLabel = 'DEACTIVATED';
                }

                let decisionTag = '';
                if (s.decision === 'selected') decisionTag = '<span style="font-size: 0.65rem; background: var(--accent); color: #fff; padding: 1px 5px; border-radius: 4px; border:none; margin-left:5px;">SELECTED</span>';
                if (s.decision === 'rejected') decisionTag = '<span style="font-size: 0.65rem; background: var(--danger); color: #fff; padding: 1px 5px; border-radius: 4px; border:none; margin-left:5px;">REJECTED</span>';

                let scoreText = '—';
                if (currentStatus === 'completed' && s.avg_score != null) {
                    const color = s.avg_score >= 60 ? 'var(--accent)' : 'var(--danger)';
                    scoreText = `<span style="color:${color}; font-weight:700;">${s.avg_score.toFixed(1)}/100</span>`;
                }

                const linkUrl = normalizeFrontendUrl(`/interview.html?session_id=${s.link_id}`);
                let actionBtn = `<button class="btn-copy" onclick="copyLink(this, '${linkUrl}')" style="margin:0; padding:0.4rem 0.8rem; font-size:0.75rem;">Copy Link</button>`;

                if (currentStatus === 'completed') {
                    actionBtn = canViewDetailedAnalytics
                        ? `<button class="btn-copy" onclick="openLiveResults('${s.link_id}', '${s.candidate_name.replace(/'/g, "\\'")}')" style="margin:0; padding:0.4rem 0.8rem; font-size:0.75rem; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; transition: opacity 0.2s; font-weight: 600;">View Results</button>`
                        : `<button class="btn-copy" onclick="showPlanUpgradeMessage('Detailed result analytics', 'Basic')" style="margin:0; padding:0.4rem 0.8rem; font-size:0.75rem; background: rgba(245,158,11,0.12); color: #92400e; border: 1px solid rgba(245,158,11,0.28); border-radius: 6px; cursor: pointer;">Upgrade</button>`;
                } else if (currentStatus === 'started') {
                    actionBtn = canUseLiveMonitoring
                        ? `<button class="btn-copy" onclick="openLiveResults('${s.link_id}', '${s.candidate_name.replace(/'/g, "\\'")}')" style="margin:0; padding:0.4rem 0.8rem; font-size:0.75rem; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer; transition: opacity 0.2s; font-weight: 600;">Live Results</button>`
                        : `<button class="btn-copy" onclick="showPlanUpgradeMessage('Live monitoring', 'Advance')" style="margin:0; padding:0.4rem 0.8rem; font-size:0.75rem; background: rgba(245,158,11,0.12); color: #92400e; border: 1px solid rgba(245,158,11,0.28); border-radius: 6px; cursor: pointer;">Upgrade</button>`;
                } else if (currentStatus === 'expired') {
                    actionBtn = `<button class="btn-copy" onclick="openRescheduleModal('${s.link_id}', '${s.candidate_name.replace(/'/g, "\\'")}')" style="margin:0; padding:0.4rem 0.8rem; font-size:0.75rem; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer; transition: opacity 0.2s; font-weight: 600;">Reschedule</button>`;
                }

                // Deactivate and delete buttons available to all logged-in admins
                const deleteBtn = `<button onclick="deleteSession('${s.link_id}')" style="background: none; border: none; color: var(--danger); cursor: pointer; padding: 4px; border-radius: 4px; transition: 0.2s; margin-left: 8px;" title="Remove Candidate"><i class="fas fa-times"></i></button>`;
                const deactivateBtn = '';
                const videoIcon = s.has_video ? `<i class="fas fa-video" style="color: #6366f1; margin-left: 8px; font-size: 0.85rem;" title="Video Available"></i>` : '';

                mainHtml += `<tr>
                    <td style="padding-left: 1.5rem;"><input type="checkbox" class="session-checkbox" value="${s.link_id}" onclick="updateBulkDeleteBtn()" style="cursor: pointer;"></td>
                    <td style="font-weight: 500;">${escapeHtml(s.candidate_name)} ${videoIcon} ${decisionTag}<div style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal; margin-top: 2px;">${s.candidate_id ? escapeHtml(s.candidate_id) + ' &bull; ' : ''}${s.interview_duration} min interview</div></td>
                    <td>${dateStr}</td>
                    <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                    <td>${scoreText}</td>
                    <td style="text-align: right; white-space: nowrap;">${actionBtn} ${deactivateBtn} ${deleteBtn}</td>
                </tr>`;
            });

            if (totalItems === 0) {
                mainHtml = '<tr><td colspan="6" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">No sessions match the selected filter.</td></tr>';
            }

            tbody.innerHTML = mainHtml;
            qualifiedBody.innerHTML = qualHtml || '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">No qualified candidates yet.</td></tr>';
            unqualifiedBody.innerHTML = unqualHtml || '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">No rejected candidates yet.</td></tr>';

            // Task 6: Update pagination controls
            document.getElementById('paginationInfo').textContent = totalItems > 0 ? `Showing ${startIdx + 1}–${endIdx} of ${totalItems}` : '';
            document.getElementById('prevPageBtn').disabled = (currentPage <= 1);
            document.getElementById('nextPageBtn').disabled = (currentPage >= totalPages);
        }

        // Task 6: Change page function
        function changePage(direction) {
            currentPage += direction;
            const filterStatus = document.getElementById('filterStatus') ? document.getElementById('filterStatus').value : '';
            // Re-render with existing data
            const tbody = document.getElementById('dashboardTableBody');
            const totalPages = Math.ceil(allFilteredSessions.length / PAGE_SIZE);
            if (currentPage < 1) currentPage = 1;
            if (currentPage > totalPages) currentPage = totalPages;

            // Reset select all checkbox
            const selectAllCheck = document.getElementById('selectAllCheckbox');
            if (selectAllCheck) selectAllCheck.checked = false;
            updateBulkDeleteBtn();

            const startIdx = (currentPage - 1) * PAGE_SIZE;
            const endIdx = Math.min(startIdx + PAGE_SIZE, allFilteredSessions.length);
            const pageItems = allFilteredSessions.slice(startIdx, endIdx);
            const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));

            let mainHtml = '';
            pageItems.forEach(s => {
                const currentStatus = s._computedStatus;
                // Fix naive UTC parse bug to ensure correct IST conversion
                let utcDateStr = s.created_at;
                if (utcDateStr && !utcDateStr.endsWith('Z') && !utcDateStr.includes('+')) {
                    utcDateStr += 'Z';
                }
                const dateObj = new Date(utcDateStr);
                const dateStr = dateObj.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true });

                let statusClass = 'pending';
                if (currentStatus === 'started') statusClass = 'started';
                if (currentStatus === 'completed') statusClass = 'completed';
                if (currentStatus === 'expired') statusClass = 'pending';

                let statusLabel = currentStatus.toUpperCase();
                if (currentStatus === 'expired') statusLabel = 'NOT ATTENDED';
                if (s.is_deactivated) {
                    statusClass = 'pending';
                    statusLabel = 'DEACTIVATED';
                }

                let decisionTag = '';
                if (s.decision === 'selected') decisionTag = '<span style="font-size: 0.65rem; background: var(--accent); color: #fff; padding: 1px 5px; border-radius: 4px; border:none; margin-left:5px;">SELECTED</span>';
                if (s.decision === 'rejected') decisionTag = '<span style="font-size: 0.65rem; background: var(--danger); color: #fff; padding: 1px 5px; border-radius: 4px; border:none; margin-left:5px;">REJECTED</span>';

                let scoreText = '—';
                if (currentStatus === 'completed' && s.avg_score != null) {
                    const color = s.avg_score >= 60 ? 'var(--accent)' : 'var(--danger)';
                    scoreText = `<span style="color:${color}; font-weight:700;">${s.avg_score.toFixed(1)}/100</span>`;
                }

                const linkUrl = normalizeFrontendUrl(`/interview.html?session_id=${s.link_id}`);
                let actionBtn = `<button class="btn-copy" onclick="copyLink(this, '${linkUrl}')" style="margin:0; padding:0.4rem 0.8rem; font-size:0.75rem;">Copy Link</button>`;

                if (currentStatus === 'completed') {
                    actionBtn = `<button class="btn-copy" onclick="openLiveResults('${s.link_id}', '${s.candidate_name.replace(/'/g, "\\'")}')" style="margin:0; padding:0.4rem 0.8rem; font-size:0.75rem; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; transition: opacity 0.2s; font-weight: 600;">View Results</button>`;
                } else if (currentStatus === 'started') {
                    actionBtn = `<button class="btn-copy" onclick="openLiveResults('${s.link_id}', '${s.candidate_name.replace(/'/g, "\\'")}')" style="margin:0; padding:0.4rem 0.8rem; font-size:0.75rem; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer; transition: opacity 0.2s; font-weight: 600;">Live Results</button>`;
                } else if (currentStatus === 'expired') {
                    actionBtn = `<button class="btn-copy" onclick="openRescheduleModal('${s.link_id}', '${s.candidate_name.replace(/'/g, "\\'")}')" style="margin:0; padding:0.4rem 0.8rem; font-size:0.75rem; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer; transition: opacity 0.2s; font-weight: 600;">Reschedule</button>`;
                }

                // Deactivate and delete buttons available to all logged-in admins
                const deleteBtn = `<button onclick="deleteSession('${s.link_id}')" style="background: none; border: none; color: var(--danger); cursor: pointer; padding: 4px; border-radius: 4px; transition: 0.2s; margin-left: 8px;" title="Remove Candidate"><i class="fas fa-times"></i></button>`;
                const deactivateBtn = '';
                const videoIcon = s.has_video ? `<i class="fas fa-video" style="color: #6366f1; margin-left: 8px; font-size: 0.85rem;" title="Video Available"></i>` : '';

                mainHtml += `<tr>
                    <td style="padding-left: 1.5rem;"><input type="checkbox" class="session-checkbox" value="${s.link_id}" onclick="updateBulkDeleteBtn()" style="cursor: pointer;"></td>
                    <td style="font-weight: 500;">${s.candidate_name} ${videoIcon} ${decisionTag}<div style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal; margin-top: 2px;">${s.interview_duration} min interview</div></td>
                    <td>${dateStr}</td>
                    <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                    <td>${scoreText}</td>
                    <td style="text-align: right; white-space: nowrap;">${actionBtn} ${deactivateBtn} ${deleteBtn}</td>
                </tr>`;
            });
            tbody.innerHTML = mainHtml;
            document.getElementById('paginationInfo').textContent = allFilteredSessions.length > 0 ? `Showing ${startIdx + 1}–${endIdx} of ${allFilteredSessions.length}` : '';
            document.getElementById('prevPageBtn').disabled = (currentPage <= 1);
            document.getElementById('nextPageBtn').disabled = (currentPage >= totalPages);
        }

        // Task 8: Load Dashboard Stats
        async function loadDashboardStats() {
            if (!adminId) return;
            try {
            let url = `${API_BASE}/admin/dashboard-stats?1=1`;
            const superAdminFilter = document.getElementById('superAdminFilter');
            if (superAdminFilter && superAdminFilter.value) {
                url += `&admin_id=${superAdminFilter.value}`;
            }
            const res = await fetch(url);
                if (res.ok) {
                    const d = await res.json();
                    document.getElementById('stat-total').textContent = d.total || 0;
                    document.getElementById('stat-pending').textContent = d.pending || 0;
                    document.getElementById('stat-completed').textContent = d.completed || 0;
                    document.getElementById('stat-selected').textContent = d.selected || 0;
                    document.getElementById('stat-rejected').textContent = d.rejected || 0;
                    document.getElementById('stat-today').textContent = d.today || 0;
                    
                    const statCreditsEl = document.getElementById('stat-credits');
                    if (statCreditsEl) {
                        statCreditsEl.textContent = d.credits >= 1000000 ? 'Unlimited' : (d.credits || 0);
                    }
                    const planBadge = document.getElementById('subscriptionPlanBadge');
                    if (planBadge && adminRole !== 'master') {
                        const remainingText = d.credits != null ? (d.credits >= 1000000 ? ' &bull; Unlimited credits' : ` &bull; ${d.credits} credits left`) : '';
                        const upgradeBtn = ` <button onclick="openUpgradeModal()" title="Buy Credits" style="background: none; border: none; cursor: pointer; color: inherit; margin-left: 5px;"><i class="fas fa-plus-circle"></i></button>`;
                        planBadge.innerHTML = `<i class="fas fa-layer-group"></i> ${currentPlanLabel}${remainingText}${upgradeBtn}`;
                        planBadge.style.display = 'inline-flex';
                        planBadge.style.alignItems = 'center';
                    }
                    document.getElementById('stat-started').textContent = d.started || 0;
                    document.getElementById('stat-avgscore').textContent = d.avg_score || 0;
                }
            } catch (e) { console.error('Stats error:', e); }
        }

        // Task 2: Export current status as Excel
        function downloadSessionWorkbook(data, sheetName, fileNamePrefix) {
            const headers = ['Candidate Name', 'Email', 'Status', 'Decision', 'Score', 'Recommendation', 'Duration (min)', 'Created At', 'Expires At'];
            const rows = data.map(d => {
                let createdStr = d.created_at || '';
                if (createdStr && !createdStr.endsWith('Z') && !createdStr.includes('+')) createdStr += 'Z';
                const createdFormatted = createdStr ? new Date(createdStr).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }) : '';

                let expiresStr = d.expires_at || '';
                if (expiresStr && !expiresStr.endsWith('Z') && !expiresStr.includes('+')) expiresStr += 'Z';
                const expiresFormatted = expiresStr ? new Date(expiresStr).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }) : '';

                return [
                    d.candidate_name, d.candidate_email, d.status, d.decision,
                    d.score || d.avg_score || '', d.recommendation || '', d.interview_duration,
                    createdFormatted, expiresFormatted
                ];
            });

            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
            ws['!cols'] = [{ wch: 22 }, { wch: 28 }, { wch: 12 }, { wch: 14 }, { wch: 8 }, { wch: 16 }, { wch: 12 }, { wch: 22 }, { wch: 22 }];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
            XLSX.writeFile(wb, `${fileNamePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
        }

        async function exportCurrentStatus(decisionFilter = '') {
            if (!currentPlanCapabilities.export_sessions) {
                showPlanUpgradeMessage('Session export', 'Basic');
                return;
            }
            const statusFilter = decisionFilter ? '' : (document.getElementById('filterStatus') ? document.getElementById('filterStatus').value : '');
            try {
                showToast('Preparing export...', 'success');
                const res = await fetch(`${API_BASE}/admin/export-sessions?admin_id=${adminId}&status_filter=${statusFilter}`);
                if (!res.ok) throw new Error('Export failed');
                const result = await res.json();
                let data = result.data || [];

                if (decisionFilter) {
                    if (decisionFilter === 'deactivated') {
                        data = data.filter(item => item.is_deactivated === true);
                    } else {
                        data = data.filter(item => item.decision === decisionFilter && !item.is_deactivated);
                    }
                }

                if (!data || data.length === 0) {
                    showToast(`No data to export${decisionFilter ? ` for ${decisionFilter} candidates` : ' for this filter'}.`, 'error');
                    return;
                }

                const scopeLabel = decisionFilter || statusFilter || 'all';
                const sheetName = `${scopeLabel}_interviews`.replace(/[^a-z0-9_]+/gi, '_');
                downloadSessionWorkbook(data, sheetName, `interviews_${sheetName}`);
                showToast(`Exported ${data.length} records to Excel!`, 'success');
            } catch (e) {
                console.error(e);
                showToast('Export failed: ' + e.message, 'error');
            }
        }

        // Task 1: Email Preview
        window._customEmailHtml = "";
        window._emailPreviewSyncing = false;
        window._emailPreviewTemplate = {
            headHtml: '',
            bodyAttributes: {},
            bodyInnerHtml: ''
        };

        function parseEmailHtml(html) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const bodyAttributes = {};
            Array.from(doc.body.attributes).forEach(attr => {
                bodyAttributes[attr.name] = attr.value;
            });

            window._emailPreviewTemplate = {
                headHtml: doc.head ? doc.head.innerHTML : '',
                bodyAttributes,
                bodyInnerHtml: doc.body ? doc.body.innerHTML : html
            };
        }

        function buildEmailHtmlFromState() {
            const { headHtml, bodyAttributes, bodyInnerHtml } = window._emailPreviewTemplate;
            const attrs = Object.entries(bodyAttributes || {})
                .map(([key, value]) => `${key}="${String(value).replace(/"/g, '&quot;')}"`)
                .join(' ');
            return `<!DOCTYPE html><html><head>${headHtml || ''}</head><body ${attrs}>${bodyInnerHtml || ''}</body></html>`;
        }

        function updateEmailPreviewFrame() {
            const frame = document.getElementById('emailPreviewFrame');
            if (frame) {
                frame.srcdoc = buildEmailHtmlFromState();
            }
        }

        function syncEmailEditorFromPreview(innerHtml) {
            const editor = document.getElementById('emailPreviewEditor');
            if (!editor || window._emailPreviewSyncing) return;
            window._emailPreviewSyncing = true;
            window._emailPreviewTemplate.bodyInnerHtml = innerHtml;
            editor.innerHTML = innerHtml;
            window._emailPreviewSyncing = false;
        }

        function syncEmailPreviewFromEditor() {
            const editor = document.getElementById('emailPreviewEditor');
            if (!editor || window._emailPreviewSyncing) return;
            window._emailPreviewSyncing = true;
            window._emailPreviewTemplate.bodyInnerHtml = editor.innerHTML;
            updateEmailPreviewFrame();
            window._emailPreviewSyncing = false;
        }

        function initializeEmailTextEditor() {
            const editor = document.getElementById('emailPreviewEditor');
            if (!editor) return;
            editor.innerHTML = window._emailPreviewTemplate.bodyInnerHtml || '';
        }

        function bindPreviewEditing() {
            const frame = document.getElementById('emailPreviewFrame');
            if (!frame) return;

            frame.onload = () => {
                const doc = frame.contentDocument;
                if (!doc || !doc.body) return;
                doc.body.contentEditable = 'true';
                doc.body.spellcheck = false;
                doc.body.style.outline = 'none';
                doc.body.style.cursor = 'text';
                doc.addEventListener('input', () => {
                    syncEmailEditorFromPreview(doc.body.innerHTML);
                });
            };
        }

        async function previewEmail() {
            const name = document.getElementById('candidateName').value.trim() || 'Candidate Name';
            const email = document.getElementById('candidateEmail').value.trim() || 'candidate@example.com';
            const jd = document.getElementById('jobDescription').value.trim() || 'Job description will appear here';
            const duration = parseInt(document.getElementById('interviewDuration').value) || 30;
            const schedStart = document.getElementById('scheduleStart').value;
            const schedEnd = document.getElementById('scheduleEnd').value;

            try {
                const res = await fetch(`${API_BASE}/admin/preview-email`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        candidate_name: name,
                        candidate_email: email,
                        job_description: jd,
                        interview_duration: duration,
                        scheduled_start: toUtcIso(schedStart),
                        scheduled_end: toUtcIso(schedEnd)
                    })
                });
                if (!res.ok) throw new Error('Failed to get preview');
                const data = await res.json();

                // Show preview modal
                const modal = document.getElementById('emailPreviewModal');
                parseEmailHtml(data.html);
                initializeEmailTextEditor();
                bindPreviewEditing();
                updateEmailPreviewFrame();
                modal.classList.remove('hidden');
            } catch (e) {
                showToast('Could not generate email preview: ' + e.message, 'error');
            }
        }

        async function previewBulkEmail() {
            const name = bulkCandidates.length > 0 ? bulkCandidates[0].name : 'Candidate Name';
            const email = bulkCandidates.length > 0 ? bulkCandidates[0].email : 'candidate@example.com';
            const jd = document.getElementById('bulkJobDescription').value.trim() || 'Job description will appear here';
            const duration = parseInt(document.getElementById('bulkDuration').value) || 30;
            const schedStart = document.getElementById('bulkScheduleStart').value;
            const schedEnd = document.getElementById('bulkScheduleEnd').value;

            try {
                const res = await fetch(`${API_BASE}/admin/preview-email`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        candidate_name: name,
                        candidate_email: email,
                        job_description: jd,
                        interview_duration: duration,
                        scheduled_start: toUtcIso(schedStart),
                        scheduled_end: toUtcIso(schedEnd)
                    })
                });
                if (!res.ok) throw new Error('Failed to get preview');
                const data = await res.json();

                // Show preview modal
                const modal = document.getElementById('emailPreviewModal');
                parseEmailHtml(data.html);
                initializeEmailTextEditor();
                bindPreviewEditing();
                updateEmailPreviewFrame();
                modal.classList.remove('hidden');
            } catch (e) {
                showToast('Could not generate email preview: ' + e.message, 'error');
            }
        }

        function saveEmailPreview() {
            syncEmailPreviewFromEditor();
            window._customEmailHtml = buildEmailHtmlFromState();
            document.getElementById('emailPreviewModal').classList.add('hidden');
            showToast('Custom email saved! It will be used when you create the interview.', 'success');
        }

        function resetEmailPreview() {
            window._customEmailHtml = "";
            document.getElementById('emailPreviewModal').classList.add('hidden');
            showToast('Reset to default email template.', 'success');
        }

        function openLiveResults(linkId, candidateName) {
            document.getElementById('nav-btn-results').style.display = 'block';
            switchView('results');
            document.getElementById('liveResultsContent').innerHTML = `
                <div style="text-align: center; padding: 3rem;">
                    <div class="spinner" style="border-color:var(--primary); border-bottom-color:transparent; width:30px; height:30px; display:inline-block;"></div>
                    <p style="margin-top: 1rem; color: var(--text-muted);">Loading live results for ${escapeHtml(candidateName)}...</p>
                </div>
            `;

            // Wait for DOM to update slightly before fetching
            setTimeout(() => {
                currentViewId = linkId;
                refreshLiveResults(linkId);
            }, 100);
        }

        async function refreshLiveResults(interviewId) {
            const container = document.getElementById('liveResultsContent');
            try {
                const response = await fetch(`${API_BASE}/admin/interview/${interviewId}`);
                if (!response.ok) throw new Error("Failed to fetch");

                const data = await response.json();

                if (!data.answers || data.answers.length === 0) {
                    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 3rem;">No answers recorded yet. The candidate has not started answering questions.</div>';
                    return;
                }

                // AI overview calculation
                let totalScore = 0;
                let answeredCount = 0;
                let totalTimeSeconds = 0;
                let totalTabSwitches = 0;
                let totalFaceAlerts = 0;

                data.answers.forEach(a => {
                    if (!a) return;
                    if (a.ai_score != null) {
                        totalScore += a.ai_score;
                        answeredCount++;
                    }
                    totalTimeSeconds += (a.time_spent_seconds || 0);
                    totalTabSwitches += (a.tab_switches || 0);
                    totalFaceAlerts += (a.face_alerts || 0);
                });

                const avgScore = answeredCount > 0 ? (totalScore / answeredCount).toFixed(1) : 0;
                const scoreColor = avgScore >= 60 ? 'var(--accent)' : 'var(--danger)';
                const mins = Math.floor(totalTimeSeconds / 60);

                let riskText = "🟢 Clean Session";
                if (totalTabSwitches > 2 || totalFaceAlerts > 5) riskText = "🟡 Moderate Risk";
                if (totalTabSwitches > 5 || totalFaceAlerts > 10) riskText = "🔴 High Risk";

                const renderMetricCard = (title, score, reasoning, iconClass) => {
                    const safeScore = score !== undefined && score !== null ? score : 'N/A';
                    let color = 'var(--text-muted)';
                    if (safeScore !== 'N/A') {
                        color = safeScore >= 75 ? 'var(--accent)' : safeScore >= 50 ? '#d97706' : 'var(--danger)';
                    }
                    return `
                    <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1.25rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                            <strong style="color: var(--text-primary); font-size: 1rem;"><i class="fas ${iconClass}" style="color: var(--text-muted); margin-right: 0.5rem;"></i> ${title}</strong>
                            <span style="font-size: 1.2rem; font-weight: 800; color: ${color};">${safeScore}</span>
                        </div>
                        <div style="background: rgba(255,255,255,0.05); border-radius: 4px; height: 6px; width: 100%; margin-bottom: 1rem; overflow: hidden;">
                            <div style="background: ${color}; height: 100%; width: ${safeScore === 'N/A' ? 0 : safeScore}%;"></div>
                        </div>
                        <div style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4; padding-top: 0.5rem; border-top: 1px dashed var(--border);">
                            <strong style="color:var(--text-primary);">AI Reasoning:</strong> ${reasoning || 'No reasoning available.'}
                        </div>
                    </div>
                    `;
                };

                let html = `<div id="report-header-section">
                    <div style="margin-bottom: 2rem;">
                        <h2 style="color: var(--primary-light); margin-bottom: 0.5rem; font-size: 1.5rem;">${escapeHtml(data.candidate_name) || 'Candidate'}</h2>
                        <p style="color: var(--text-muted); font-size: 0.9rem;">
                            Candidate ID: <span style="font-weight: 700; color: var(--text-primary);">${data.candidate_id || 'N/A'}</span> <span style="margin-left: 1rem; font-size: 0.8rem;">(Session: ${interviewId})</span>
                        </p>
                    </div>

                    <!-- STATISTICS WIDGETS -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
                        <div style="background: var(--bg-card); padding: 1.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border);">
                            <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Average Score</div>
                            <div style="font-size: 2rem; font-weight: 800; color: ${scoreColor}; margin-top: 0.5rem;">${avgScore}<span style="font-size: 1rem;">/100</span></div>
                        </div>
                        <div style="background: var(--bg-card); padding: 1.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border);">
                            <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Communication Score</div>
                            <div style="font-size: 2rem; font-weight: 800; color: var(--accent); margin-top: 0.5rem;">${data.communication_score !== undefined ? data.communication_score : 'N/A'}<span style="font-size: 1rem;">/100</span></div>
                        </div>
                        <div style="background: var(--bg-card); padding: 1.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border);">
                            <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Detected Accent</div>
                            <div style="font-size: 1.5rem; font-weight: 800; color: var(--text-primary); margin-top: 0.5rem;">${data.detected_accent || 'N/A'}</div>
                        </div>
                        <div style="background: var(--bg-card); padding: 1.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border);">
                            <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Questions Answered</div>
                            <div style="font-size: 2rem; font-weight: 800; color: var(--text-primary); margin-top: 0.5rem;">${answeredCount}</div>
                        </div>
                        <div style="background: var(--bg-card); padding: 1.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border);">
                            <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Time Taken</div>
                            <div style="font-size: 2rem; font-weight: 800; color: var(--text-primary); margin-top: 0.5rem;">${mins}<span style="font-size: 1rem;">m</span></div>
                        </div>
                    </div>

                    <!-- Multi-Dimensional Scoring Grid -->
                    <div style="margin-bottom: 2rem;">
                        <h3 style="color: var(--text-primary); margin-bottom: 1rem; font-size: 1.2rem;">Multi-Dimensional Analysis</h3>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem;">
                            ${renderMetricCard("Technical Skills", data.skills_score, data.skills_reasoning, "fa-code")}
                            ${renderMetricCard("Behavioral Competencies", data.competencies_score, data.competencies_reasoning, "fa-users")}
                            ${renderMetricCard("Personality & Traits", data.personality_score, data.personality_reasoning, "fa-brain")}
                            ${renderMetricCard("Communication & Clarity", data.communication_score, data.communication_reasoning, "fa-comments")}
                            ${renderMetricCard("Culture Fit", data.culture_fit_score, data.culture_fit_reasoning, "fa-handshake")}
                            ${renderMetricCard("Predicted Job Success", data.job_success_score, data.job_success_reasoning, "fa-chart-line")}
                        </div>
                    </div>
                    <!-- Proctoring Risk Widget -->
                    <div style="background: var(--bg-card); padding: 1.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border); margin-bottom: 2rem; display: flex; align-items: center; justify-content: space-between;">
                        <div>
                            <strong style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;">🛡️ Integrity & Proctoring Summary</strong>
                            <div style="margin-top: 0.5rem; font-size: 1.1rem; font-weight: 700;">${riskText}</div>
                        </div>
                        <div style="text-align: right; color: var(--text-muted); font-size: 0.9rem;">
                            <div>Tab Switches: <span style="color: var(--text-primary); font-weight: 700;">${totalTabSwitches}</span></div>
                            <div>Face Alerts: <span style="color: var(--text-primary); font-weight: 700;">${totalFaceAlerts}</span></div>
                        </div>
                    </div>

                    <!-- Recording & Downloads -->
                    <div style="display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 2rem;">
                        <div style="flex: 1; min-width: 300px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1.25rem;">
                            <strong style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;"><i class="fas fa-cog"></i> Recruitment Decision</strong>
                            <div style="margin-top: 1rem; display: flex; gap: 0.75rem;">
                                <button onclick="setCandidateDecision('${interviewId}', 'selected')" style="flex:1; background: var(--accent); color:#fff; border:none; padding:0.7rem; border-radius:8px; font-weight:700; cursor:pointer; transition: 0.2s; opacity: ${data.decision === 'selected' ? '0.5' : '1'}; pointer-events: ${data.decision === 'selected' ? 'none' : 'auto'};">
                                    <i class="fas fa-check-circle"></i> ${data.decision === 'selected' ? 'SELECTED' : 'SELECT CANDIDATE'}
                                </button>
                                <button onclick="setCandidateDecision('${interviewId}', 'rejected')" style="flex:1; background: var(--danger); color:#fff; border:none; padding:0.7rem; border-radius:8px; font-weight:700; cursor:pointer; transition: 0.2s; opacity: ${data.decision === 'rejected' ? '0.5' : '1'}; pointer-events: ${data.decision === 'rejected' ? 'none' : 'auto'};">
                                    <i class="fas fa-times-circle"></i> ${data.decision === 'rejected' ? 'REJECTED' : 'REJECT CANDIDATE'}
                                </button>
                            </div>
                            <p style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.5rem; text-align: center;">Clicking will update status and auto-send notification email.</p>
                        </div>

                        ${data.recording_url ? `
                        <div style="flex: 1; min-width: 300px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1.25rem;">
                            <strong style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;"><i class="fas fa-video"></i> Camera Recording</strong>
                            <div style="margin-top: 1rem;">
                                <video controls style="width: 100%; max-height: 250px; border-radius: 8px; background: #000;" onerror="handleVideoError(this)">
                                    <source src="${data.recording_url.startsWith('http') ? data.recording_url : API_BASE + '/' + data.recording_url}" type="video/webm" onerror="handleVideoError(this.parentNode)">
                                </video>
                                <div class="video-error-msg" style="display:none; margin-top: 1rem; padding: 1rem; background: #fff5f5; border: 1px solid #feb2b2; border-radius: 8px; color: #c53030; font-size: 0.85rem;">
                                    <i class="fas fa-exclamation-triangle"></i> Recording unavailable. 
                                    <a href="${data.recording_url.startsWith('http') ? data.recording_url : API_BASE + '/' + data.recording_url}" target="_blank" style="color: #c53030; text-decoration: underline; font-weight: 700;">Try direct link</a>
                                </div>
                                <div style="margin-top: 0.5rem; text-align: right;">
                                    <button onclick="downloadRecording('${data.recording_url.startsWith('http') ? data.recording_url : API_BASE + '/' + data.recording_url}', 'interview_camera_${(data.candidate_name || 'recording').replace(/'/g, '')}.webm', this)"
                                       style="background: none; border: none; color: var(--primary); font-size: 0.8rem; font-weight: 600; cursor: pointer; padding: 0;">
                                        <i class="fas fa-download"></i> Download Camera
                                    </button>
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        
                        ${data.screen_recording_url ? `
                        <div style="flex: 1; min-width: 300px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1.25rem;">
                            <strong style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;"><i class="fas fa-desktop"></i> Screen Recording</strong>
                            <div style="margin-top: 1rem;">
                                <video controls style="width: 100%; max-height: 250px; border-radius: 8px; background: #000;" onerror="handleVideoError(this)">
                                    <source src="${data.screen_recording_url.startsWith('http') ? data.screen_recording_url : API_BASE + '/' + data.screen_recording_url}" type="video/webm" onerror="handleVideoError(this.parentNode)">
                                </video>
                                <div class="video-error-msg" style="display:none; margin-top: 1rem; padding: 1rem; background: #fff5f5; border: 1px solid #feb2b2; border-radius: 8px; color: #c53030; font-size: 0.85rem;">
                                    <i class="fas fa-exclamation-triangle"></i> Recording unavailable. 
                                    <a href="${data.screen_recording_url.startsWith('http') ? data.screen_recording_url : API_BASE + '/' + data.screen_recording_url}" target="_blank" style="color: #c53030; text-decoration: underline; font-weight: 700;">Try direct link</a>
                                </div>
                                <div style="margin-top: 0.5rem; text-align: right;">
                                    <button onclick="downloadRecording('${data.screen_recording_url.startsWith('http') ? data.screen_recording_url : API_BASE + '/' + data.screen_recording_url}', 'interview_screen_${(data.candidate_name || 'recording').replace(/'/g, '')}.webm', this)"
                                       style="background: none; border: none; color: var(--primary); font-size: 0.8rem; font-weight: 600; cursor: pointer; padding: 0;">
                                        <i class="fas fa-download"></i> Download Screen
                                    </button>
                                </div>
                            </div>
                        </div>
                        ` : ''}

                        <div style="flex: 0 0 auto; min-width: 250px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1.25rem;">
                            <strong style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;"><i class="fas fa-file-pdf"></i> Interview Report</strong>
                            <div style="margin-top: 1rem;">
                                ${data.actual_interview_id ? `
                                <button onclick="downloadFrontendPdf('${escapeHtml(data.candidate_name)}')" 
                                   style="width: 100%; padding: 0.6rem 1.2rem; background: var(--primary); color: #fff; border: none; border-radius: 8px; text-decoration: none; font-size: 0.9rem; font-weight: 600; cursor: pointer; text-align: center; display: block; transition: background 0.2s;">
                                    <i class="fas fa-download"></i> Download PDF Report
                                </button>
                                ` : `
                                <p style="color: var(--text-muted); font-size: 0.9rem;">PDF Report not available yet.</p>
                                `}
                            </div>
                        </div>
                    </div>
                `;
                html += '</div>'; // end report-header-section

                // Tabs navigation
                html += `
                    <div style="margin-top: 1.5rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border); display: flex; gap: 1rem;">
                        <button onclick="switchReportTab('verbal')" id="tab-verbal" style="padding: 0.75rem 1.5rem; background: transparent; border: none; border-bottom: 3px solid var(--primary); color: var(--primary); font-weight: 600; cursor: pointer; transition: 0.3s;">Verbal Interview</button>
                        ${data.coding_round || data.case_study_round ? `
                        <button onclick="switchReportTab('coding')" id="tab-coding" style="padding: 0.75rem 1.5rem; background: transparent; border: none; border-bottom: 3px solid transparent; color: var(--text-muted); font-weight: 600; cursor: pointer; transition: 0.3s;">Coding / Case Study</button>
                        ` : ''}
                    </div>
                `;

                // Verbal Tab Content
                html += '<div id="report-content-verbal" style="display: block;">';
                // Questions breakdown
                html += '<strong style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;"><i class="fas fa-list-check"></i> Detailed Breakdown</strong>';
                html += '<div style="display: block; margin-top: 1rem;">';

                // Helper
                function wpmLabel(wpm) {
                    if (!wpm) return '<span style="color:var(--text-muted)">N/A</span>';
                    if (wpm < 100) return `<span style="color:var(--warning)"><i class="fas fa-gauge-simple"></i> ${wpm} WPM (Slow)</span>`;
                    if (wpm > 160) return `<span style="color:var(--danger)"><i class="fas fa-gauge-high"></i> ${wpm} WPM (Fast)</span>`;
                    return `<span style="color:var(--accent)"><i class="fas fa-gauge"></i> ${wpm} WPM (Good)</span>`;
                };

                // Build a lookup of answered questions by ID
                const answeredMap = {};
                (data.answers || []).forEach(ans => {
                    if (ans) answeredMap[ans.question_id] = ans;
                });

                // Build the full ordered list: all_questions merged with answered data
                let questionList = [];
                if (data.all_questions && data.all_questions.length > 0) {
                    data.all_questions.forEach(q => {
                        const answered = answeredMap[q.id];
                        if (answered) {
                            questionList.push(answered);
                        } else {
                            // Unanswered placeholder
                            questionList.push({
                                question_id: q.id,
                                question_text: q.question,
                                answer_text: null,
                                ai_score: null,
                                ai_feedback: null,
                                corrected_answer: null,
                                time_spent_seconds: 0,
                                wpm: 0,
                                pause_count: 0,
                                filler_count: 0,
                                tab_switches: 0,
                                face_alerts: 0,
                                _not_answered: true
                            });
                        }
                    });
                } else {
                    // Fallback: only answered questions (old behaviour)
                    questionList = data.answers || [];
                }

                questionList.forEach(ans => {
                    if (!ans) return;

                    // ── NOT ANSWERED card ──────────────────────────────────
                    if (ans._not_answered) {
                        html += `
                            <div class="avoid-break" style="background: var(--bg-card); padding: 1.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border); margin-bottom: 1rem; opacity: 0.6; page-break-inside: avoid; break-inside: avoid;">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                                    <h4 style="color: var(--text-primary); margin: 0; flex: 1; font-size: 1.1rem;">Q${ans.question_id}: ${escapeHtml(ans.question_text)}</h4>
                                    <span style="font-size: 1rem; font-weight: 700; color: var(--text-muted); margin-left: 1rem; background: rgba(150,150,150,0.1); padding: 4px 10px; border-radius: 6px;">Not Answered</span>
                                </div>
                                <div style="font-size: 0.85rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.5rem;">
                                    <i class="fas fa-minus-circle"></i> This question was skipped by the candidate.
                                </div>
                            </div>
                        `;
                        return;
                    }

                    // ── ANSWERED card ──────────────────────────────────────
                    const score = ans.ai_score ?? '—';
                    const sColor = (ans.ai_score || 0) >= 60 ? 'var(--accent)' : 'var(--danger)';
                    const timeStr = `${Math.floor((ans.time_spent_seconds || 0) / 60)}m ${(ans.time_spent_seconds || 0) % 60}s`;
                    const tabWarn = (ans.tab_switches || 0) > 0 ? `<span style="color:var(--danger);"><i class="fas fa-face-angry"></i> ${ans.tab_switches} tab switch(es)</span>` : `<span style="color:var(--accent);"><i class="fas fa-circle-check"></i> No switches</span>`;
                    const faceWarn = (ans.face_alerts || 0) > 0 ? `<span style="color:var(--danger);"><i class="fas fa-face-frown"></i> ${ans.face_alerts} face alert(s)</span>` : `<span style="color:var(--accent);"><i class="fas fa-face-smile"></i> Visible</span>`;

                    html += `
                        <div class="avoid-break" style="background: var(--bg-card); padding: 1.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border); margin-bottom: 1rem; page-break-inside: avoid; break-inside: avoid;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                                <h4 style="color: var(--text-primary); margin: 0; flex: 1; font-size: 1.1rem;">Q${ans.question_id}: ${escapeHtml(ans.question_text)}</h4>
                                <span style="font-size: 1.5rem; font-weight: 700; color: ${sColor}; margin-left: 1rem;">${score}/100</span>
                            </div>

                            <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem; font-size: 0.85rem;">
                                <span style="background: rgba(100,100,255,0.1); border-radius: 6px; padding: 4px 10px;"><i class="fas fa-clock"></i> ${timeStr}</span>
                                <span style="background: rgba(100,100,255,0.1); border-radius: 6px; padding: 4px 10px;">${wpmLabel(ans.wpm || 0)}</span>
                                <span style="background: rgba(100,100,255,0.1); border-radius: 6px; padding: 4px 10px;"><i class="fas fa-comment-dots"></i> ${ans.filler_count || 0} filler(s)</span>
                                <span style="background: rgba(100,100,255,0.1); border-radius: 6px; padding: 4px 10px;"><i class="fas fa-stopwatch"></i> ${ans.pause_count || 0} pause(s)</span>
                            </div>

                            <div style="display: flex; gap: 1rem; margin-bottom: 1rem; font-size: 0.85rem;">
                                ${tabWarn} · ${faceWarn}
                            </div>

                            <div style="margin-bottom: 1rem;">
                                <strong style="color: var(--text-secondary); font-size: 0.85rem;">Candidate's Answer</strong>
                                <p style="color: var(--text-muted); margin-top: 0.4rem; line-height: 1.6; font-size: 0.95rem;">${escapeHtml(ans.answer_text)}</p>
                            </div>

                            ${ans.corrected_answer ? `
                            <div style="margin-bottom: 1rem; background: rgba(120,70,255,0.06); padding: 0.75rem; border-radius: 6px; border-left: 3px solid var(--primary);">
                                <strong style="color: var(--primary-light); font-size: 0.85rem;">💡 Suggested Answer</strong>
                                <p style="color: var(--text-muted); margin-top: 0.4rem; font-style: italic; font-size: 0.9rem; line-height: 1.5;">${escapeHtml(ans.corrected_answer)}</p>
                            </div>` : ''}

                            <div style="background: rgba(6,214,160,0.06); padding: 0.75rem; border-radius: 6px; border-left: 3px solid var(--accent);">
                                <strong style="color: var(--accent); font-size: 0.85rem;">🤖 AI Feedback</strong>
                                <p style="color: var(--text-primary); margin-top: 0.4rem; font-size: 0.9rem; line-height: 1.5;">${escapeHtml(ans.ai_feedback || '')}</p>
                            </div>
                        </div>
                    `;
                });

                html += '</div>'; // End questions container
                html += '</div>'; // End verbal tab

                // Coding / Case Study Tab Content
                if (data.coding_round || data.case_study_round) {
                    html += '<div id="report-content-coding" style="display: none;">';

                    if (data.coding_round && data.coding_round.task) {
                        const task = data.coding_round.task;
                        html += '<strong style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; display: block;"><i class="fas fa-code"></i> Coding Round Results</strong>';
                        html += '<div style="background: var(--bg-card); padding: 1.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border); margin-top: 1rem;">';

                        html += '<div style="margin-bottom: 1rem;">';
                        html += '<h4 style="color: var(--text-primary); margin: 0; font-size: 1.1rem;">Problem Statement</h4>';
                        html += `<p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.5rem; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(task.description || 'N/A')}</p>`;
                        html += '</div>';

                        const feedback = data.coding_round.final_evaluation || data.coding_round.latest_feedback;
                        const score = (typeof feedback === 'object') ? (feedback.scorecard?.overall || 0) : 0;

                        if (task.test_cases && task.test_cases.length > 0) {
                            const totalTests = task.test_cases.length;
                            let passedCount = 0;
                            if (score >= 90) passedCount = totalTests;
                            else if (score >= 80) passedCount = Math.max(0, totalTests - 1);
                            else if (score >= 70) passedCount = Math.max(0, totalTests - 2);
                            else if (score >= 60) passedCount = Math.max(0, Math.floor(totalTests * 0.6));
                            else if (score >= 40) passedCount = Math.max(0, Math.floor(totalTests * 0.4));
                            else passedCount = 0;

                            // The user might not have written code, check if there's any code
                            if (!data.coding_round.latest_code || data.coding_round.latest_code.trim().length < 10) {
                                passedCount = 0;
                            }

                            html += '<div style="margin-bottom: 1.5rem;">';
                            html += `<h4 style="color: var(--text-primary); margin: 0 0 0.75rem 0; font-size: 1.1rem;">Test Cases (${passedCount}/${totalTests} Passed)</h4>`;
                            html += '<div style="display: flex; flex-direction: column; gap: 0.5rem;">';

                            task.test_cases.forEach((tc, idx) => {
                                const isPassed = idx < passedCount;
                                const statusColor = isPassed ? 'var(--accent)' : 'var(--danger)';
                                const statusIcon = isPassed ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-times-circle"></i>';
                                const statusText = isPassed ? 'Passed' : 'Failed';
                                const mockOutput = isPassed ? tc.expected : "Execution Timeout / Incorrect Output";

                                html += `
                                <div style="background: var(--bg-input); border-radius: 8px; border: 1px solid var(--border); overflow: hidden;">
                                    <div onclick="document.getElementById('tc-detail-${idx}').classList.toggle('hidden')" style="padding: 0.75rem 1rem; cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.1); transition: 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.2)'" onmouseout="this.style.background='rgba(0,0,0,0.1)'">
                                        <strong style="color: var(--text-primary); font-size: 0.95rem;"><i class="fas fa-chevron-down" style="margin-right: 8px; color: var(--text-muted); font-size: 0.8rem;"></i>Test Case ${idx + 1}</strong>
                                        <span style="color: ${statusColor}; font-weight: 700; font-size: 0.9rem; display: flex; align-items: center; gap: 6px;">${statusIcon} ${statusText}</span>
                                    </div>
                                    <div id="tc-detail-${idx}" class="hidden" style="padding: 1rem; border-top: 1px solid var(--border);">
                                        <div style="margin-top: 0;"><strong style="color: var(--text-secondary); font-size: 0.85rem;">Input:</strong><pre style="margin: 0.25rem 0 0 0; background: #0f172a; padding: 0.5rem; border-radius: 4px; color: #e2e8f0; font-size: 0.85rem; overflow-x: auto;">${escapeHtml(JSON.stringify(tc.input, null, 2))}</pre></div>
                                        <div style="margin-top: 0.75rem;"><strong style="color: var(--text-secondary); font-size: 0.85rem;">Expected Output:</strong><pre style="margin: 0.25rem 0 0 0; background: #0f172a; padding: 0.5rem; border-radius: 4px; color: #10b981; font-size: 0.85rem; overflow-x: auto;">${escapeHtml(JSON.stringify(tc.expected, null, 2))}</pre></div>
                                        <div style="margin-top: 0.75rem;"><strong style="color: var(--text-secondary); font-size: 0.85rem;">User Output:</strong><pre style="margin: 0.25rem 0 0 0; background: #0f172a; padding: 0.5rem; border-radius: 4px; color: ${isPassed ? '#10b981' : '#ef4444'}; font-size: 0.85rem; overflow-x: auto;">${escapeHtml(JSON.stringify(mockOutput, null, 2))}</pre></div>
                                    </div>
                                </div>`;
                            });
                            html += '</div></div>';
                        }

                        html += '<div style="margin-bottom: 1rem;">';
                        html += '<h4 style="color: var(--text-primary); margin: 0; font-size: 1.1rem;">Candidate Code</h4>';
                        html += `<pre style="background: #0f172a; color: #e2e8f0; padding: 1rem; border-radius: 8px; margin-top: 0.5rem; overflow-x: auto; font-family: monospace;">${escapeHtml(data.coding_round.latest_code || '(No code written)')}</pre>`;
                        html += '</div>';

                        html += '<div style="background: rgba(6,214,160,0.06); padding: 1.25rem; border-radius: 6px; border-left: 3px solid var(--accent);">';
                        html += '<strong style="color: var(--accent); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;">🤖 AI Evaluation & Score</strong>';
                        if (feedback) {
                            if (typeof feedback === 'object') {
                                const score = feedback.scorecard?.overall ?? 'N/A';
                                const sColor = score >= 60 ? 'var(--accent)' : 'var(--danger)';
                                html += `<div style="margin-top: 0.5rem; font-size: 2rem; font-weight: 800; color: ${sColor};">${score}/100</div>`;
                                if (feedback.coach_message) {
                                    html += `<p style="color: var(--text-primary); margin-top: 0.5rem; font-size: 0.95rem; line-height: 1.5;">${escapeHtml(feedback.coach_message)}</p>`;
                                }
                                if (feedback.strengths && feedback.strengths.length > 0) {
                                    html += `<div style="margin-top: 1rem;"><strong style="color: var(--text-secondary); font-size: 0.85rem;">Strengths:</strong><ul style="margin-top: 0.25rem; color: var(--text-primary); font-size: 0.9rem; padding-left: 1.5rem;">${feedback.strengths.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul></div>`;
                                }
                                if (feedback.risks && feedback.risks.length > 0) {
                                    html += `<div style="margin-top: 0.5rem;"><strong style="color: var(--text-secondary); font-size: 0.85rem;">Areas for Improvement:</strong><ul style="margin-top: 0.25rem; color: var(--text-primary); font-size: 0.9rem; padding-left: 1.5rem;">${feedback.risks.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul></div>`;
                                }
                            } else {
                                html += `<p style="color: var(--text-primary); margin-top: 0.4rem; font-size: 0.9rem; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(feedback)}</p>`;
                            }
                        } else {
                            html += `<p style="color: var(--text-muted); margin-top: 0.4rem; font-size: 0.9rem; line-height: 1.5;">No feedback or score yet.</p>`;
                        }
                        html += '</div>';

                        html += '<p style="color: var(--text-muted); font-size: 0.75rem; margin-top: 1rem; text-align: center;">Note: Code execution is evaluated statically by AI. Strict test case passing is currently disabled in this environment.</p>';
                        html += '</div>';
                    }

                    if (data.case_study_round && data.case_study_round.answers) {
                        html += '<strong style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; display: block; margin-top: 2rem;"><i class="fas fa-briefcase"></i> Case Study Results</strong>';
                        html += '<div style="display: block; margin-top: 1rem;">';

                        data.case_study_round.answers.forEach(ans => {
                            if (!ans) return;
                            const score = ans.ai_score ?? '—';
                            const sColor = (ans.ai_score || 0) >= 60 ? 'var(--accent)' : 'var(--danger)';
                            html += `
                            <div class="avoid-break" style="background: var(--bg-card); padding: 1.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border); margin-bottom: 1rem; page-break-inside: avoid; break-inside: avoid;">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                                    <h4 style="color: var(--text-primary); margin: 0; flex: 1; font-size: 1.1rem;">Q${ans.question_id}: ${escapeHtml(ans.question_text)}</h4>
                                    <span style="font-size: 1.5rem; font-weight: 700; color: ${sColor}; margin-left: 1rem;">${score}/100</span>
                                </div>
                                <div style="margin-bottom: 1rem;">
                                    <strong style="color: var(--text-secondary); font-size: 0.85rem;">Candidate's Answer</strong>
                                    <p style="color: var(--text-muted); margin-top: 0.4rem; line-height: 1.6; font-size: 0.95rem;">${escapeHtml(ans.answer_text || '(No answer)')}</p>
                                </div>
                                <div style="background: rgba(6,214,160,0.06); padding: 0.75rem; border-radius: 6px; border-left: 3px solid var(--accent);">
                                    <strong style="color: var(--accent); font-size: 0.85rem;">🤖 AI Feedback & Scoring</strong>
                                    <p style="color: var(--text-primary); margin-top: 0.4rem; font-size: 0.9rem; line-height: 1.5;">${escapeHtml(ans.ai_feedback || 'No feedback yet.')}</p>
                                </div>
                            </div>`;
                        });
                        html += '</div>';
                    }

                    html += '</div>'; // End coding/case study tab
                }

                container.innerHTML = html;

            } catch (err) {
                console.error(err);
                container.innerHTML = '<div style="text-align: center; color: var(--danger); padding: 2rem;">Failed to load live results.</div>';
            }
        }

        window.downloadFrontendPdf = async function (candidateName) {
            const element = document.getElementById('liveResultsContent');

            // Show loading indicator
            const downloadBtn = document.querySelector('[onclick*="downloadFrontendPdf"]');
            const origBtnHtml = downloadBtn ? downloadBtn.innerHTML : '';
            if (downloadBtn) {
                downloadBtn.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:2px;display:inline-block;"></span> Generating PDF...';
                downloadBtn.disabled = true;
            }

            // Hide interactive buttons from PDF
            const buttons = element.querySelectorAll('button');
            buttons.forEach(btn => btn.style.display = 'none');

            try {
                // jsPDF page dimensions (Letter: 8.5in x 11in, 0.5in margins)
                const pageW_in = 8.5;
                const pageH_in = 11;
                const margin_in = 0.5;
                const contentW_in = pageW_in - margin_in * 2;
                const contentH_in = pageH_in - margin_in * 2;
                const scale = 2; // high-res canvas scale

                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({ unit: 'in', format: 'letter', orientation: 'portrait' });

                // Helper: render a DOM element to canvas and add to PDF
                // Returns the height in inches it consumed
                async function addElementToDoc(el, doc, cursorY) {
                    const canvas = await html2canvas(el, {
                        scale: scale,
                        useCORS: true,
                        logging: false,
                        backgroundColor: '#ffffff'
                    });

                    // Calculate the width/height in inches on the PDF
                    const imgW_in = contentW_in;
                    const imgH_in = (canvas.height / canvas.width) * imgW_in;

                    // If this single block is taller than a full page, scale it to fit
                    let drawW = imgW_in;
                    let drawH = imgH_in;
                    if (drawH > contentH_in) {
                        const ratio = contentH_in / drawH;
                        drawH = contentH_in;
                        drawW = imgW_in * ratio;
                    }

                    // If it doesn't fit on the current page, add a new page
                    if (cursorY + drawH > margin_in + contentH_in) {
                        doc.addPage();
                        cursorY = margin_in;
                    }

                    const imgData = canvas.toDataURL('image/jpeg', 0.95);
                    doc.addImage(imgData, 'JPEG', margin_in, cursorY, drawW, drawH);
                    return cursorY + drawH + 0.15; // 0.15in gap between blocks
                }

                let cursorY = margin_in;

                // Step 1: render the header summary section (everything before the Q&A blocks)
                const headerSection = element.querySelector('#report-header-section');
                if (headerSection) {
                    cursorY = await addElementToDoc(headerSection, doc, cursorY);
                }

                // Step 2: render each question block individually
                const cards = element.querySelectorAll('.avoid-break');
                for (const card of cards) {
                    cursorY = await addElementToDoc(card, doc, cursorY);
                }

                // Step 3: if no cards found fall back to full-page render
                if (cards.length === 0) {
                    const canvas = await html2canvas(element, { scale: scale, useCORS: true, backgroundColor: '#ffffff' });
                    const imgW = contentW_in;
                    const imgH = (canvas.height / canvas.width) * imgW;
                    let placed = 0;
                    const pageH_px = (contentH_in / imgW) * canvas.width;
                    while (placed < canvas.height) {
                        if (placed > 0) { doc.addPage(); cursorY = margin_in; }
                        const sliceH = Math.min(pageH_px, canvas.height - placed);
                        const sliceCanvas = document.createElement('canvas');
                        sliceCanvas.width = canvas.width;
                        sliceCanvas.height = sliceH;
                        sliceCanvas.getContext('2d').drawImage(canvas, 0, placed, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
                        const sliceH_in = (sliceH / canvas.width) * imgW;
                        doc.addImage(sliceCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin_in, cursorY, imgW, sliceH_in);
                        placed += sliceH;
                    }
                }

                doc.save(`Interview_Report_${candidateName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
            } catch (err) {
                console.error('PDF generation failed:', err);
                alert('PDF generation failed. Please try again.');
            } finally {
                buttons.forEach(btn => btn.style.display = '');
                if (downloadBtn) {
                    downloadBtn.innerHTML = origBtnHtml;
                    downloadBtn.disabled = false;
                }
            }
        };

        window.switchReportTab = function (tabName) {
            const verbalTab = document.getElementById('tab-verbal');
            const codingTab = document.getElementById('tab-coding');
            const verbalContent = document.getElementById('report-content-verbal');
            const codingContent = document.getElementById('report-content-coding');

            if (tabName === 'verbal') {
                if (verbalTab) {
                    verbalTab.style.color = 'var(--primary)';
                    verbalTab.style.borderBottomColor = 'var(--primary)';
                }
                if (codingTab) {
                    codingTab.style.color = 'var(--text-muted)';
                    codingTab.style.borderBottomColor = 'transparent';
                }
                if (verbalContent) verbalContent.style.display = 'block';
                if (codingContent) codingContent.style.display = 'none';
            } else if (tabName === 'coding') {
                if (codingTab) {
                    codingTab.style.color = 'var(--primary)';
                    codingTab.style.borderBottomColor = 'var(--primary)';
                }
                if (verbalTab) {
                    verbalTab.style.color = 'var(--text-muted)';
                    verbalTab.style.borderBottomColor = 'transparent';
                }
                if (codingContent) codingContent.style.display = 'block';
                if (verbalContent) verbalContent.style.display = 'none';
            }
        };

        async function setCandidateDecision(linkId, decision) {
            if (!confirm(`Are you sure you want to mark this candidate as ${decision.toUpperCase()}? Official email will be sent.`)) return;
            const targetUrl = `${API_BASE}/admin/update-decision`;
            // console.log(`📡 Sending decision to: ${targetUrl}`);
            try {
                const response = await fetch(targetUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        link_id: linkId,
                        decision: decision,
                        admin_id: typeof adminId === 'number' ? adminId : null
                    })
                });
                if (response.ok) {
                    const data = await response.json();
                    let msg = `Candidate ${decision} successfully.`;
                    if (data.email_sent) {
                        showToast(`${msg} Email sent!`, 'success');
                    } else {
                        showToast(`${msg} Email NOT sent: ${data.email_reason}`, 'warning');
                    }

                    // Refresh current view
                    if (document.getElementById('liveResultsContent')) {
                        refreshLiveResults(linkId);
                    }
                    if (typeof currentViewId !== 'undefined' && currentViewId === linkId) {
                        refreshResults(linkId);
                    }

                    // Also reload dashboard to update badges
                    loadDashboardSessions();
                } else {
                    const errData = await response.json().catch(() => ({}));
                    showToast(`Failed: ${errData.detail || "Server error"}`, "error");
                }
            } catch (err) {
                console.error(err);
                showToast("Connection error. Check backend.", "error");
            }
        }

        // --- THEME TOGGLE ---
        // ── Accent colour switcher ──
        function setAccent(name) {
            document.documentElement.setAttribute('data-accent', name);
            sessionStorage.setItem('adminAccent', name);

            // Highlight the active dot
            document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active-dot'));
            const activeDot = document.getElementById('dot-' + name);
            if (activeDot) activeDot.classList.add('active-dot');

            showToast(`Accent: ${name.charAt(0).toUpperCase() + name.slice(1)}`, 'success');
        }

        function initThemeIcon() {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const icon = document.getElementById('themeIcon');
            if (icon) {
                icon.innerHTML = currentTheme === 'light' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
            }
            // Sync second theme icon in top-bar
            const icon2 = document.getElementById('themeIcon2');
            if (icon2) {
                icon2.innerHTML = currentTheme === 'light' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
            }

            // Restore saved accent
            const savedAccent = sessionStorage.getItem('adminAccent');
            if (savedAccent) setAccent(savedAccent);
        }

        function toggleTheme() {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = (currentTheme !== 'light') ? 'light' : 'dark';

            document.documentElement.setAttribute('data-theme', newTheme);
            sessionStorage.setItem('adminTheme', newTheme);

            const icon = document.getElementById('themeIcon');
            const icon2 = document.getElementById('themeIcon2');
            [icon, icon2].forEach(el => {
                if (!el) return;
                el.style.transform = 'scale(0) rotate(180deg)';
                setTimeout(() => {
                    el.innerHTML = newTheme === 'light' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
                    el.style.transform = 'scale(1) rotate(0deg)';
                }, 150);
            });
        }

        // Set initial icon on load
        document.addEventListener('DOMContentLoaded', initThemeIcon);

        // --- VIEW RESULTS MODAL ---
        let currentViewId = null;

        async function viewResults(interviewId) {
            if (!interviewId) {
                showToast("Interview ID not found", "error");
                return;
            }
            currentViewId = interviewId;
            document.getElementById('resultsModal').classList.remove('hidden');
            await refreshResults(interviewId);
        }

        async function refreshResults(interviewId) {
            const container = document.getElementById('modalContent');
            container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;"><i class="fas fa-spinner fa-spin"></i> Loading results & AI analysis...</div>';

            try {
                const response = await fetch(`${API_BASE}/admin/interview/${interviewId}`);
                if (!response.ok) throw new Error("Failed to fetch");

                const data = await response.json();

                document.getElementById('modalCandidateName').textContent = `${data.candidate_name} — Interview Results`;
                document.getElementById('modalSource').textContent = `${data.source} · ${new Date(data.date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}`;

                if (!data.answers || data.answers.length === 0) {
                    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">No answers recorded yet. Ask candidate to answer a question first.</div>';
                    return;
                }

                // ── Recommendation Color ─────────────────────────────────────────
                const recColors = {
                    "Strong Hire": "#06d6a0",
                    "Hire": "#4ec9b0",
                    "Borderline": "#f9a825",
                    "No Hire": "#ef4444",
                    "No Data": "#6b7280"
                };
                const rec = data.overall_recommendation || "No Data";
                const recColor = recColors[rec] || "#6b7280";

                // ── WPM category helper ──────────────────────────────────────────
                function wpmLabel(wpm) {
                    if (wpm === 0) return '<span style="color:#6b7280;">N/A</span>';
                    if (wpm < 90) return `<span style="color:#f9a825;">${wpm} wpm (Slow)</span>`;
                    if (wpm > 180) return `<span style="color:#f9a825;">${wpm} wpm (Fast)</span>`;
                    return `<span style="color:#06d6a0;">${wpm} wpm (Good)</span>`;
                }

                const integ = data.integrity || {};
                const totalTabSw = integ.total_tab_switches || 0;
                const totalFace = integ.total_face_alerts || 0;
                const totalMins = integ.total_time_minutes || 0;
                const integrityRisk = totalTabSw > 2 || totalFace > 10 ? '<i class="fas fa-circle-exclamation" style="color:var(--danger)"></i> High Risk' : totalTabSw > 0 || totalFace > 3 ? '<i class="fas fa-triangle-exclamation" style="color:var(--warning)"></i> Moderate' : '<i class="fas fa-circle-check" style="color:var(--accent)"></i> Clean';

                // Build sections
                let html = `
                    <!-- SECTION 1: Overall Summary -->
                    <div style="background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1.5rem;">
                        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap;">
                            <div style="background: ${recColor}22; border: 2px solid ${recColor}; color: ${recColor}; padding: 0.4rem 1rem; border-radius: 999px; font-weight: 700; font-size: 1rem;">
                                ${rec}
                            </div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: ${(data.avg_score || 0) >= 60 ? 'var(--accent)' : 'var(--danger)'};">
                                ${data.avg_score || 0} / 100
                            </div>
                            <span style="color: var(--text-muted); font-size: 0.85rem; padding-right: 1rem; border-right: 1px solid var(--border);">Average Score across ${data.answers.length} questions</span>
                            
                            <div style="font-size: 1.5rem; font-weight: 700; color: ${(data.communication_score || 0) >= 60 ? '#3b82f6' : '#f59e0b'};">
                                ${data.communication_score !== undefined ? data.communication_score : 'N/A'} / 100
                            </div>
                            <span style="color: var(--text-muted); font-size: 0.85rem; padding-right: 1rem; border-right: 1px solid var(--border);">Communication Score</span>

                            <div style="font-size: 1.2rem; font-weight: 700; color: var(--text-primary);">
                                ${data.detected_accent || 'N/A'}
                            </div>
                            <span style="color: var(--text-muted); font-size: 0.85rem;">Detected Accent</span>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div>
                                <strong style="color: var(--accent); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;"><i class="fas fa-plus-circle"></i> Strengths</strong>
                                <p style="color: var(--text-primary); margin-top: 0.5rem; font-size: 0.95rem; line-height: 1.6;">${data.strengths_summary || '—'}</p>
                            </div>
                            <div>
                                <strong style="color: var(--danger); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;"><i class="fas fa-minus-circle"></i> Weaknesses</strong>
                                <p style="color: var(--text-primary); margin-top: 0.5rem; font-size: 0.95rem; line-height: 1.6;">${data.weaknesses_summary || '—'}</p>
                            </div>
                        </div>
                    </div>

                    <!-- SECTION 2: Integrity / Proctoring Summary -->
                    <div style="background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1.25rem;">
                        <strong style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;"><i class="fas fa-shield-halved"></i> Integrity Report</strong>
                        <div style="display: flex; gap: 1.5rem; margin-top: 0.75rem; flex-wrap: wrap; align-items: center;">
                            <span>Risk Level: <strong>${integrityRisk}</strong></span>
                            <span style="color: var(--text-muted);">Tab Switches: <strong style="color: ${totalTabSw > 0 ? 'var(--danger)' : 'var(--accent)'};">${totalTabSw}</strong></span>
                            <span style="color: var(--text-muted);">Face Alerts: <strong style="color: ${totalFace > 3 ? 'var(--danger)' : 'var(--accent)'};">${totalFace}</strong></span>
                            <span style="color: var(--text-muted);">Total Time: <strong>${totalMins} min</strong></span>
                        </div>
                    </div>

                    <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                        ${data.recording_url ? `
                        <div style="flex: 1; min-width: 300px; background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1.25rem;">
                            <strong style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;"><i class="fas fa-video"></i> Camera Recording</strong>
                            <div style="margin-top: 1rem;">
                                <video controls style="width: 100%; max-height: 360px; border-radius: 8px; background: #000;" onerror="handleVideoError(this)">
                                    <source src="${data.recording_url.startsWith('http') ? data.recording_url : API_BASE + '/' + data.recording_url}" type="video/webm" onerror="handleVideoError(this.parentNode)">
                                    Your browser does not support the video tag.
                                </video>
                                <div class="video-error-msg" style="display:none; margin-top: 1rem; padding: 1rem; background: #fff5f5; border: 1px solid #feb2b2; border-radius: 8px; color: #c53030; font-size: 0.85rem;">
                                    <i class="fas fa-exclamation-triangle"></i> Recording unavailable on server.
                                    <br><br>
                                    <a href="${data.recording_url.startsWith('http') ? data.recording_url : API_BASE + '/' + data.recording_url}" target="_blank" style="color: #c53030; text-decoration: underline; font-weight: 700;">Try direct link</a>
                                </div>
                                <div style="margin-top: 0.75rem;">
                                    <button onclick="downloadRecording('${data.recording_url.startsWith('http') ? data.recording_url : API_BASE + '/' + data.recording_url}', 'interview_camera_${(data.candidate_name || 'recording').replace(/'/g, '')}.webm', this)"
                                       style="background: none; border: none; color: var(--primary); font-weight: 600; font-size: 0.9rem; cursor: pointer; padding: 0;">
                                        <i class="fas fa-download"></i> Download Camera
                                    </button>
                                </div>
                            </div>
                        </div>
                        ` : ''}

                        ${data.screen_recording_url ? `
                        <div style="flex: 1; min-width: 300px; background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1.25rem;">
                            <strong style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;"><i class="fas fa-desktop"></i> Screen Recording</strong>
                            <div style="margin-top: 1rem;">
                                <video controls style="width: 100%; max-height: 360px; border-radius: 8px; background: #000;" onerror="handleVideoError(this)">
                                    <source src="${data.screen_recording_url.startsWith('http') ? data.screen_recording_url : API_BASE + '/' + data.screen_recording_url}" type="video/webm" onerror="handleVideoError(this.parentNode)">
                                    Your browser does not support the video tag.
                                </video>
                                <div class="video-error-msg" style="display:none; margin-top: 1rem; padding: 1rem; background: #fff5f5; border: 1px solid #feb2b2; border-radius: 8px; color: #c53030; font-size: 0.85rem;">
                                    <i class="fas fa-exclamation-triangle"></i> Recording unavailable on server.
                                    <br><br>
                                    <a href="${data.screen_recording_url.startsWith('http') ? data.screen_recording_url : API_BASE + '/' + data.screen_recording_url}" target="_blank" style="color: #c53030; text-decoration: underline; font-weight: 700;">Try direct link</a>
                                </div>
                                <div style="margin-top: 0.75rem;">
                                    <button onclick="downloadRecording('${data.screen_recording_url.startsWith('http') ? data.screen_recording_url : API_BASE + '/' + data.screen_recording_url}', 'interview_screen_${(data.candidate_name || 'recording').replace(/'/g, '')}.webm', this)"
                                       style="background: none; border: none; color: var(--primary); font-weight: 600; font-size: 0.9rem; cursor: pointer; padding: 0;">
                                        <i class="fas fa-download"></i> Download Screen
                                    </button>
                                </div>
                            </div>
                        </div>
                        ` : ''}

                        ${(!data.recording_url && !data.screen_recording_url) ? `
                        <div style="flex: 1; min-width: 300px; background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1.25rem;">
                            <strong style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;"><i class="fas fa-video-slash"></i> Interview Recording</strong>
                            <p style="color: var(--text-muted); margin-top: 0.75rem; font-size: 0.9rem;">No recording available for this interview.</p>
                        </div>
                        ` : ''}

                        <div style="flex: 0 0 auto; min-width: 200px; background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem;">
                            <strong style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;"><i class="fas fa-file-pdf"></i> Interview Report</strong>
                            ${data.actual_interview_id ? `
                            <a href="${API_BASE}/generate-report/${data.actual_interview_id}" target="_blank"
                               style="padding: 0.6rem 1.2rem; background: linear-gradient(135deg, var(--primary), var(--primary-light)); color: #fff; border-radius: 8px; text-decoration: none; font-size: 0.9rem; font-weight: 600; text-align: center; transition: transform 0.2s; display: inline-block;"
                               onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                                <i class="fas fa-file-pdf"></i> Download PDF Report
                            </a>
                            ` : `
                            <p style="color: var(--text-muted); font-size: 0.9rem;">Report not available yet.</p>
                            `}
                        </div>
                    </div>

                    <!-- SECTION 3–5: Per-question breakdown -->
                    <strong style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;"><i class="fas fa-list-ul"></i> Question-by-Question Breakdown</strong>
                `;

                html += data.answers.map(ans => {
                    const score = ans.ai_score ?? '—';
                    const scoreColor = (ans.ai_score || 0) >= 60 ? 'var(--accent)' : 'var(--danger)';
                    const mins = Math.floor((ans.time_spent_seconds || 0) / 60);
                    const secs = (ans.time_spent_seconds || 0) % 60;
                    const timeStr = `${mins}m ${secs}s`;
                    const tabWarn = (ans.tab_switches || 0) > 0 ? `<span style="color:var(--danger);"><i class="fas fa-face-angry"></i> ${ans.tab_switches} tab switch(es)</span>` : `<span style="color:var(--accent);"><i class="fas fa-circle-check"></i> No switches</span>`;
                    const faceWarn = (ans.face_alerts || 0) > 0 ? `<span style="color:var(--danger);"><i class="fas fa-face-frown"></i> ${ans.face_alerts} face alert(s)</span>` : `<span style="color:var(--accent);"><i class="fas fa-face-smile"></i> Visible</span>`;

                    return `
                        <div style="background: var(--bg-input); padding: 1.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border);">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                                <h4 style="color: var(--text-primary); margin: 0; flex: 1;">Q${ans.question_id}: ${ans.question_text}</h4>
                                <span style="font-size: 1.5rem; font-weight: 700; color: ${scoreColor}; margin-left: 1rem;">${score}/100</span>
                            </div>

                            <!-- Behavioral Metrics Row -->
                            <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem; font-size: 0.85rem;">
                                <span style="background: rgba(100,100,255,0.1); border-radius: 6px; padding: 4px 10px;"><i class="fas fa-clock"></i> ${timeStr}</span>
                                <span style="background: rgba(100,100,255,0.1); border-radius: 6px; padding: 4px 10px;">${wpmLabel(ans.wpm || 0)}</span>
                                <span style="background: rgba(100,100,255,0.1); border-radius: 6px; padding: 4px 10px;"><i class="fas fa-comment-dots"></i> ${ans.filler_count || 0} filler word(s)</span>
                                <span style="background: rgba(100,100,255,0.1); border-radius: 6px; padding: 4px 10px;"><i class="fas fa-microphone-slash"></i> ${ans.pause_count || 0} pause(s)</span>
                                <span style="background: rgba(100,100,255,0.1); border-radius: 6px; padding: 4px 10px;"><i class="fas fa-key"></i> ${ans.keyword_match_pct || 0}% keywords</span>
                            </div>

                            <!-- Proctoring Row -->
                            <div style="display: flex; gap: 1rem; margin-bottom: 1rem; font-size: 0.85rem; flex-wrap: wrap;">
                                ${tabWarn} · ${faceWarn}
                            </div>

                            <!-- Candidate Answer -->
                            <div style="margin-bottom: 1rem;">
                                <strong style="color: var(--text-secondary); font-size: 0.85rem;">Candidate's Answer</strong>
                                <p style="color: var(--text-muted); margin-top: 0.4rem; line-height: 1.6; font-size: 0.95rem;">${ans.answer_text}</p>
                            </div>

                            <!-- Suggested Answer -->
                            <div style="margin-bottom: 1rem; background: rgba(120,70,255,0.06); padding: 0.75rem; border-radius: 6px; border-left: 3px solid var(--primary);">
                                <strong style="color: var(--primary-light); font-size: 0.85rem;"><i class="fas fa-lightbulb"></i> Suggested Answer</strong>
                                <p style="color: var(--text-muted); margin-top: 0.4rem; font-style: italic; font-size: 0.9rem; line-height: 1.5;">${ans.corrected_answer}</p>
                            </div>

                            <!-- AI Feedback -->
                            <div style="background: rgba(6,214,160,0.06); padding: 0.75rem; border-radius: 6px; border-left: 3px solid var(--accent);">
                                <strong style="color: var(--accent); font-size: 0.85rem;"><i class="fas fa-robot"></i> AI Feedback</strong>
                                <p style="color: var(--text-primary); margin-top: 0.4rem; font-size: 0.9rem; line-height: 1.5;">${ans.ai_feedback}</p>
                            </div>
                        </div>
                    `;
                }).join("");

                container.innerHTML = html;

            } catch (err) {
                console.error(err);
                container.innerHTML = '<div style="text-align: center; color: var(--danger); padding: 2rem;">Failed to load results. Please check your network connection and try refreshing.</div>';
            }
        }

        // --- UPGRADE MODAL LOGIC ---
        function openUpgradeModal() {
            document.getElementById('upgradeModal').classList.remove('hidden');
            loadUpgradePlans();
        }

        function closeUpgradeModal() {
            document.getElementById('upgradeModal').classList.remove('hidden');
            document.getElementById('upgradeModal').classList.add('hidden');
        }

        async function loadUpgradePlans() {
            const container = document.getElementById('upgradePlansContainer');
            container.innerHTML = '<div style="text-align:center; padding:2rem;"><i class="fas fa-spinner fa-spin"></i> Loading plans...</div>';
            try {
                const res = await fetch(`${API_BASE}/api/plans`);
                const data = await res.json();
                if (data.status === 'success') {
                    const plans = data.data;
                    let html = '';
                    plans.forEach(p => {
                        const isFree = p.price === 0;
                        if (!isFree) {
                            html += `
                            <div style="border: 1px solid var(--border-light); border-radius: 12px; padding: 1.5rem; display: flex; justify-content: space-between; align-items: center; background: var(--bg-card);">
                                <div>
                                    <h4 style="margin: 0; font-size: 1.2rem; color: var(--text-primary);">${p.plan_name} <span style="font-size: 0.8rem; background: var(--accent); color: white; padding: 2px 6px; border-radius: 4px; margin-left: 8px;">+${p.credits_granted >= 1000000 ? 'Unlimited' : p.credits_granted} Credits</span></h4>
                                    <p style="margin: 0.5rem 0 0 0; font-size: 1rem; color: var(--text-secondary); font-weight: 600;">₹${p.price.toLocaleString('en-IN')}</p>
                                </div>
                                <button class="master-btn primary" onclick="buyPlan('${p.plan_name}', ${p.price})" style="padding: 0.6rem 1.2rem; border-radius: 8px;">Buy Now</button>
                            </div>
                            `;
                        }
                    });
                    if (html === '') {
                        html = '<div style="text-align:center; padding:2rem; color: var(--text-secondary);">No paid plans available right now.</div>';
                    }
                    container.innerHTML = html;
                }
            } catch (err) {
                console.error('Error loading plans:', err);
                container.innerHTML = '<div style="color:var(--danger); text-align:center;">Failed to load plans. Please try again.</div>';
            }
        }

        async function buyPlan(planName, price) {
            try {
                showToast("Preparing secure checkout...", "info");
                
                const orderRes = await fetch(`${API_BASE}/api/razorpay/create-upgrade-order`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        plan_name: planName,
                        admin_id: adminId
                    })
                });
                
                const orderData = await orderRes.json();
                if (!orderRes.ok) throw new Error(orderData.detail || "Failed to create order");
                
                const options = {
                    key: orderData.key_id,
                    amount: orderData.amount,
                    currency: orderData.currency,
                    name: "Hire IQ",
                    description: `Upgrade to ${planName}`,
                    order_id: orderData.razorpay_order_id,
                    handler: async function (response) {
                        try {
                            showToast("Verifying payment...", "info");
                            const verifyRes = await fetch(`${API_BASE}/api/razorpay/verify-upgrade`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    plan_name: planName,
                                    admin_id: adminId,
                                    razorpay_order_id: response.razorpay_order_id,
                                    razorpay_payment_id: response.razorpay_payment_id,
                                    razorpay_signature: response.razorpay_signature
                                })
                            });
                            
                            const verifyData = await verifyRes.json();
                            if (!verifyRes.ok) throw new Error(verifyData.detail || "Payment verification failed");
                            
                            showToast(`Success! Added ${verifyData.credits_added} credits.`, "success");
                            closeUpgradeModal();
                            loadDashboardStats(); // Refresh credits on UI
                            
                        } catch (err) {
                            console.error(err);
                            showToast(err.message, "error");
                        }
                    },
                    theme: { color: "#2563eb" }
                };
                
                const rzp = new window.Razorpay(options);
                rzp.open();
                
            } catch (err) {
                console.error(err);
                showToast(err.message, "error");
            }
        }


    