from bs4 import BeautifulSoup
import sys

def inject():
    with open('master.html', 'r', encoding='utf-8') as f:
        html = f.read()
    
    soup = BeautifulSoup(html, 'html.parser')
    
    # 1. Update Sidebar
    sidebar = soup.find(id='masterSidebarNav')
    if sidebar:
        # Clear existing
        sidebar.clear()
        
        # Add new sidebar content
        sidebar_content = """
            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.5); font-weight: 800; text-transform: uppercase; margin-bottom: 0.5rem; letter-spacing: 1px; padding-left: 0.5rem;">
                Master Control</div>
            <button class="nav-btn active" id="master-nav-dashboard" onclick="showMasterDashboard();"><i class="fas fa-gauge-high"></i> Dashboard</button>
            <button class="nav-btn" id="master-nav-plans" onclick="showMasterPlans();"><i class="fas fa-tags"></i> Plans</button>
            <button class="nav-btn" id="master-nav-subscribers" onclick="showMasterSubscribers();"><i class="fas fa-building-user"></i> Subscribers</button>
            <button class="nav-btn" id="master-nav-create-tenant" onclick="showMasterCreateTenant();"><i class="fas fa-user-plus"></i> Create Tenant</button>
            
            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.5); font-weight: 800; text-transform: uppercase; margin: 1.5rem 0 0.5rem 1rem; letter-spacing: 1px;">
                Admin Features</div>
            <button class="nav-btn" onclick="showMasterAdminView('overview')" id="nav-master-overview"><i class="fas fa-chart-pie"></i> Overview Dashboard</button>
            <button class="nav-btn" onclick="showMasterAdminView('create')" id="nav-master-create"><i class="fas fa-plus-circle"></i> Create Interview</button>
            <button class="nav-btn" onclick="showMasterAdminView('qualified')" id="nav-master-qualified"><i class="fas fa-user-check"></i> Qualified Candidates</button>
            <button class="nav-btn" onclick="showMasterAdminView('unqualified')" id="nav-master-unqualified"><i class="fas fa-user-slash"></i> Rejected Candidates</button>
            <button class="nav-btn" onclick="showMasterAdminView('deactivated')" id="nav-master-deactivated"><i class="fas fa-user-times"></i> Deactivated Candidates</button>
            <button class="nav-btn" onclick="showMasterAdminView('settings')" id="nav-master-settings"><i class="fas fa-cog"></i> Profile Settings</button>
            
            <div class="master-sidebar-separator"></div>
            <button class="nav-btn" onclick="showLiveResultsModal()" style="background: rgba(16, 185, 129, 0.1); color: #10b981;"><i class="fas fa-broadcast-tower"></i> Live Monitor</button>
        """
        sidebar.append(BeautifulSoup(sidebar_content, 'html.parser'))
        
    # 2. Update Top Bar Actions (Profile & Notifications)
    topbar_actions = soup.find(class_='topbar-actions')
    if topbar_actions:
        profile_dropdown = """
            <div class="notification-btn" style="position:relative; cursor:pointer; font-size:1.2rem; color:var(--text-muted); margin-right:1rem;">
                <i class="fas fa-bell"></i>
                <span style="position:absolute; top:-2px; right:-2px; width:8px; height:8px; background:var(--danger); border-radius:50%;"></span>
            </div>
            <div class="profile-dropdown-container" style="position:relative; display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="this.querySelector('.dropdown-menu').classList.toggle('hidden')">
                <img src="https://i.pravatar.cc/150?u=a042581f4e29026704d" style="width:36px; height:36px; border-radius:50%;" />
                <div style="line-height:1.2;">
                    <div style="font-size:0.9rem; font-weight:600; color:var(--text-primary);">Sarah J.</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">Admin</div>
                </div>
                <i class="fas fa-chevron-down" style="font-size:0.8rem; color:var(--text-muted);"></i>
                <div class="dropdown-menu hidden" style="position:absolute; top:100%; right:0; background:var(--bg-card); border:1px solid var(--border); box-shadow:var(--shadow-md); border-radius:var(--radius-md); width:180px; z-index:100; margin-top:10px; padding:0.5rem 0;">
                    <a href="#" onclick="event.preventDefault();" style="display:flex; align-items:center; gap:10px; padding:0.6rem 1rem; color:var(--text-primary); text-decoration:none; font-size:0.9rem;"><i class="fas fa-user"></i> My Profile</a>
                    <a href="#" onclick="event.preventDefault();" style="display:flex; align-items:center; gap:10px; padding:0.6rem 1rem; color:var(--text-primary); text-decoration:none; font-size:0.9rem;"><i class="fas fa-cog"></i> Settings</a>
                    <hr style="border:none; border-top:1px solid var(--border); margin:0.5rem 0;"/>
                    <a href="#" onclick="event.preventDefault(); performLogout();" style="display:flex; align-items:center; gap:10px; padding:0.6rem 1rem; color:var(--danger); text-decoration:none; font-size:0.9rem;"><i class="fas fa-sign-out-alt"></i> Logout</a>
                </div>
            </div>
        """
        # remove logout btn if it exists inside topbar_actions
        logout_btn = topbar_actions.find(class_='btn-logout')
        if logout_btn: logout_btn.decompose()
        
        topbar_actions.append(BeautifulSoup(profile_dropdown, 'html.parser'))

    # 3. Add New Views next to masterDashboardSection
    main_wrapper = soup.find(class_='main-wrapper')
    
    new_views_html = """
        <!-- MASTER PLANS SECTION -->
        <div class="master-workspace view-panel hidden" id="masterPlansSection" style="padding: 2rem; max-width: 1200px; margin: 0 auto; width: 100%;">
            <div style="background: var(--bg-card); padding: 1.5rem 2rem; border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); border: 1px solid var(--border); margin-bottom: 2rem;">
                <div style="display:flex; align-items:center; gap:15px; margin-bottom:0.5rem;">
                    <div style="width:40px; height:40px; border-radius:10px; background:rgba(99,102,241,0.1); color:var(--primary); display:flex; align-items:center; justify-content:center; font-size:1.2rem;">
                        <i class="fas fa-tags"></i>
                    </div>
                    <h2 style="font-size: 1.4rem; font-weight: 600; color: var(--text-primary);">Subscription Plans</h2>
                </div>
                <p style="color: var(--text-secondary); margin-left:55px;">Manage pricing, credits, and available features for all plans.</p>
            </div>
            
            <div id="plansGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;">
                <div style="text-align:center; padding:3rem; color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading plans...</div>
            </div>
        </div>

        <!-- MASTER SUBSCRIBERS SECTION -->
        <div class="master-workspace view-panel hidden" id="masterSubscribersSection" style="padding: 2rem; max-width: 1200px; margin: 0 auto; width: 100%;">
            <div style="background: var(--bg-card); padding: 1.5rem 2rem; border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); border: 1px solid var(--border); margin-bottom: 2rem;">
                <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1rem;">
                    <div>
                        <div style="display:flex; align-items:center; gap:15px; margin-bottom:0.5rem;">
                            <div style="width:40px; height:40px; border-radius:10px; background:rgba(99,102,241,0.1); color:var(--primary); display:flex; align-items:center; justify-content:center; font-size:1.2rem;">
                                <i class="fas fa-list"></i>
                            </div>
                            <h2 style="font-size: 1.4rem; font-weight: 600; color: var(--text-primary);">Subscribers Overview</h2>
                        </div>
                        <p style="color: var(--text-secondary); margin-left:55px;">Track ongoing and active subscription plans</p>
                    </div>
                </div>
                
                <div style="margin-top: 1.5rem; display:flex; gap:1rem; flex-wrap:wrap; align-items:flex-end;">
                    <div style="flex:1; min-width:200px;">
                        <label style="font-size:0.75rem; font-weight:600; color:var(--text-muted); text-transform:uppercase; margin-bottom:0.4rem; display:block;">Search Subscriber</label>
                        <div class="input-wrapper">
                            <i class="fas fa-search input-icon"></i>
                            <input type="text" id="subscriberSearch" placeholder="Search company or email..." style="width:100%; padding:0.75rem 1rem 0.75rem 2.5rem; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-input); color:var(--text-primary);">
                        </div>
                    </div>
                    <div>
                        <label style="font-size:0.75rem; font-weight:600; color:var(--text-muted); text-transform:uppercase; margin-bottom:0.4rem; display:block;">Plan</label>
                        <select id="subscriberPlanFilter" style="padding:0.75rem; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-input); color:var(--text-primary); min-width:150px;">
                            <option value="all">All Plans</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.75rem; font-weight:600; color:var(--text-muted); text-transform:uppercase; margin-bottom:0.4rem; display:block;">Status</label>
                        <select id="subscriberStatusFilter" style="padding:0.75rem; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-input); color:var(--text-primary); min-width:150px;">
                            <option value="all">All Statuses</option>
                            <option value="active">Active</option>
                            <option value="expired">Expired</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.75rem; font-weight:600; color:var(--text-muted); text-transform:uppercase; margin-bottom:0.4rem; display:block;">Sort By</label>
                        <select id="subscriberSort" style="padding:0.75rem; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-input); color:var(--text-primary); min-width:150px;">
                            <option value="name">Company Name</option>
                            <option value="date">Activation Date</option>
                        </select>
                    </div>
                    <button class="hero-secondary-btn" style="padding:0.75rem 1rem; color:var(--danger); border-color:rgba(244,63,94,0.3); background:rgba(244,63,94,0.05);" onclick="document.getElementById('subscriberSearch').value=''; document.getElementById('subscriberPlanFilter').value='all'; document.getElementById('subscriberStatusFilter').value='all'; fetchSubscribers();"><i class="fas fa-times"></i></button>
                    <button class="hero-secondary-btn" style="padding:0.75rem 1rem; color:var(--accent); border-color:rgba(6,214,160,0.3); background:rgba(6,214,160,0.05);"><i class="fas fa-file-excel"></i> Export</button>
                </div>
            </div>
            
            <div style="background: var(--bg-card); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); border: 1px solid var(--border); overflow:hidden;">
                <table style="width: 100%; border-collapse: collapse; text-align:left;">
                    <thead>
                        <tr style="background: rgba(0,0,0,0.02); border-bottom: 1px solid var(--border);">
                            <th style="padding: 1rem 1.5rem; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Company / Admin</th>
                            <th style="padding: 1rem 1.5rem; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Plan</th>
                            <th style="padding: 1rem 1.5rem; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Status</th>
                            <th style="padding: 1rem 1.5rem; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Usage</th>
                            <th style="padding: 1rem 1.5rem; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Activation Date</th>
                            <th style="padding: 1rem 1.5rem; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Expiry Date</th>
                            <th style="padding: 1rem 1.5rem; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="subscribersTableBody">
                        <tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">Loading subscribers...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- MASTER CREATE TENANT SECTION -->
        <div class="master-workspace view-panel hidden" id="masterCreateTenantSection" style="padding: 2rem; max-width: 900px; margin: 0 auto; width: 100%;">
            <div style="background: var(--bg-card); padding: 2.5rem; border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); border: 1px solid var(--border);">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:2rem;">
                    <div>
                        <h2 style="font-size: 1.5rem; font-weight: 600; color: var(--text-primary); margin-bottom:0.25rem;">Create New Tenant</h2>
                        <p style="color: var(--text-secondary); font-size:0.95rem;">Provision a new administrative account with a subscription plan.</p>
                    </div>
                    <div style="width:45px; height:45px; border-radius:12px; background:rgba(37,99,235,0.1); color:var(--primary); display:flex; align-items:center; justify-content:center; font-size:1.4rem;">
                        <i class="fas fa-user-plus"></i>
                    </div>
                </div>
                
                <form id="createTenantFormFull" onsubmit="handleCreateTenantFull(event)">
                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap:1.5rem; margin-bottom:1.5rem;">
                        <div>
                            <label style="display:block; margin-bottom:0.5rem; font-size:0.85rem; font-weight:600; color:var(--text-primary);"><i class="fas fa-user" style="color:var(--text-muted); margin-right:5px;"></i> Username</label>
                            <input type="text" id="ct_username" required placeholder="e.g. company_admin" style="width:100%; padding:0.85rem 1rem; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-input); color:var(--text-primary);">
                        </div>
                        <div>
                            <label style="display:block; margin-bottom:0.5rem; font-size:0.85rem; font-weight:600; color:var(--text-primary);"><i class="fas fa-envelope" style="color:var(--text-muted); margin-right:5px;"></i> Email Address</label>
                            <input type="email" id="ct_email" required placeholder="admin@company.com" style="width:100%; padding:0.85rem 1rem; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-input); color:var(--text-primary);">
                        </div>
                        <div>
                            <label style="display:block; margin-bottom:0.5rem; font-size:0.85rem; font-weight:600; color:var(--text-primary);"><i class="fas fa-lock" style="color:var(--text-muted); margin-right:5px;"></i> Password</label>
                            <div class="input-wrapper">
                                <input type="password" id="ct_password" required placeholder="Secure password" style="width:100%; padding:0.85rem 1rem; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-input); color:var(--text-primary);">
                                <button type="button" class="eye-toggle" onclick="const p = document.getElementById('ct_password'); p.type = p.type === 'password' ? 'text' : 'password';"><i class="fas fa-eye"></i></button>
                            </div>
                        </div>
                    </div>
                    
                    <div style="margin-bottom:1.5rem;">
                        <label style="display:block; margin-bottom:0.5rem; font-size:0.85rem; font-weight:600; color:var(--text-primary);"><i class="fas fa-building" style="color:var(--text-muted); margin-right:5px;"></i> Company Name</label>
                        <input type="text" id="ct_company_name" required placeholder="Acme Corp" style="width:100%; padding:0.85rem 1rem; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-input); color:var(--text-primary);">
                    </div>
                    
                    <div style="margin-bottom:2.5rem;">
                        <label style="display:block; margin-bottom:0.5rem; font-size:0.85rem; font-weight:600; color:var(--text-primary);"><i class="fas fa-layer-group" style="color:var(--text-muted); margin-right:5px;"></i> Subscription Plan</label>
                        <select id="ct_plan_name" required style="width:100%; padding:0.85rem 1rem; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-input); color:var(--text-primary);">
                            <option value="">Select a plan...</option>
                        </select>
                    </div>
                    
                    <hr style="border:none; border-top:1px solid var(--border); margin-bottom:1.5rem;" />
                    
                    <div style="display:flex; justify-content:flex-end; gap:1rem;">
                        <button type="reset" class="hero-secondary-btn" style="padding:0.75rem 1.5rem; font-weight:600; background:var(--bg-card); color:var(--text-primary);">Reset Form</button>
                        <button type="submit" class="hero-primary-btn" id="btnCreateTenantFull" style="padding:0.75rem 2rem; font-weight:600; background:var(--primary); box-shadow:none;"><i class="fas fa-bolt" style="margin-right:8px;"></i> Create Account Now</button>
                    </div>
                </form>
            </div>
        </div>
        
        <!-- EDIT PLAN MODAL -->
        <div id="editPlanModal" class="modal-overlay hidden">
            <div class="modal-card">
                <button class="modal-close" onclick="document.getElementById('editPlanModal').classList.add('hidden')"><i class="fas fa-times"></i></button>
                <div class="section-header">
                    <div class="header-icon purple"><i class="fas fa-edit"></i></div>
                    <div>
                        <h3 id="ep_modal_title">Edit Plan</h3>
                        <p>Modify plan pricing and credits</p>
                    </div>
                </div>
                <form id="editPlanForm" onsubmit="handleEditPlanSubmit(event)">
                    <input type="hidden" id="ep_plan_name">
                    <div class="dash-form-group">
                        <label class="dash-label">Credits Granted</label>
                        <input type="number" id="ep_credits" class="dash-input" required min="1">
                    </div>
                    <div class="dash-form-group">
                        <label class="dash-label">Price ($)</label>
                        <input type="number" id="ep_price" class="dash-input" required min="0">
                    </div>
                    <div class="dash-form-group">
                        <label class="dash-label">Features (comma separated)</label>
                        <textarea id="ep_features" class="dash-textarea" placeholder="AI Analysis, Video Recording..."></textarea>
                    </div>
                    <button type="submit" class="hero-primary-btn" style="width:100%; justify-content:center; margin-top:1rem; background:var(--primary); box-shadow:none;" id="btnSavePlan">Save Changes</button>
                </form>
            </div>
        </div>
    """
    
    if main_wrapper:
        main_wrapper.append(BeautifulSoup(new_views_html, 'html.parser'))
        
    # 4. Inject JS Script for the new views
    script_html = """
    <script>
        // JS injected for Master Dashboard Expanded Views
        
        function hideAllMasterViews() {
            const views = [
                'masterDashboardSection', 'masterPlansSection', 
                'masterSubscribersSection', 'masterCreateTenantSection'
            ];
            views.forEach(v => {
                const el = document.getElementById(v);
                if (el) el.classList.add('hidden');
            });
            document.querySelectorAll('#masterSidebarNav .nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.view-panel').forEach(p => {
                if(!p.id.startsWith('master')) p.classList.add('hidden');
            });
        }
        
        // Ensure showMasterDashboard is patched to play nicely
        const origShowMasterDashboard = window.showMasterDashboard;
        window.showMasterDashboard = function() {
            hideAllMasterViews();
            document.getElementById('masterDashboardSection')?.classList.remove('hidden');
            document.getElementById('master-nav-dashboard')?.classList.add('active');
            const title = document.getElementById('consoleTitle');
            if (title) title.textContent = 'Master Console';
            // refresh data
            if(window.loadMasterTenants) window.loadMasterTenants();
        };

        function showMasterPlans() {
            hideAllMasterViews();
            document.getElementById('masterPlansSection').classList.remove('hidden');
            document.getElementById('master-nav-plans').classList.add('active');
            document.getElementById('consoleTitle').textContent = 'Master Console';
            fetchPlansData();
        }
        
        function showMasterSubscribers() {
            hideAllMasterViews();
            document.getElementById('masterSubscribersSection').classList.remove('hidden');
            document.getElementById('master-nav-subscribers').classList.add('active');
            document.getElementById('consoleTitle').textContent = 'Master Console';
            fetchSubscribers();
        }
        
        function showMasterCreateTenant() {
            hideAllMasterViews();
            document.getElementById('masterCreateTenantSection').classList.remove('hidden');
            document.getElementById('master-nav-create-tenant').classList.add('active');
            document.getElementById('consoleTitle').textContent = 'Master Console';
            
            // Populate plan dropdown
            fetch(`${API_BASE}/api/plans`)
                .then(res => res.json())
                .then(data => {
                    const sel = document.getElementById('ct_plan_name');
                    sel.innerHTML = '<option value="">Select a plan...</option>';
                    if(data.status === 'success') {
                        data.data.forEach(p => {
                            sel.innerHTML += `<option value="${p.plan_name}">${p.plan_name}</option>`;
                        });
                    }
                });
        }
        
        // -- PLANS API LOGIC --
        let _allPlansCache = [];
        async function fetchPlansData() {
            const grid = document.getElementById('plansGrid');
            grid.innerHTML = '<div style="text-align:center; padding:3rem; grid-column:1/-1; color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading plans...</div>';
            try {
                const res = await fetch(`${API_BASE}/api/plans`);
                const data = await res.json();
                if(data.status === 'success') {
                    _allPlansCache = data.data;
                    renderPlansGrid();
                }
            } catch(e) {
                console.error(e);
            }
        }
        
        function renderPlansGrid() {
            const grid = document.getElementById('plansGrid');
            grid.innerHTML = '';
            _allPlansCache.forEach(p => {
                grid.innerHTML += `
                    <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-md); padding:1.5rem; display:flex; flex-direction:column;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                            <h3 style="font-size:1.2rem; font-weight:700; color:var(--text-primary); text-transform:capitalize;">${p.plan_name}</h3>
                            <span style="background:rgba(99,102,241,0.1); color:var(--primary); padding:0.25rem 0.75rem; border-radius:99px; font-size:0.75rem; font-weight:700;">$${p.price}</span>
                        </div>
                        <div style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:1.5rem;">
                            <div style="margin-bottom:0.5rem;"><i class="fas fa-coins" style="width:20px; color:var(--warning);"></i> <b>${p.credits_granted}</b> Credits</div>
                            <div><i class="fas fa-list-check" style="width:20px; color:var(--accent);"></i> ${p.features ? p.features.length : 0} Features</div>
                        </div>
                        <div style="margin-top:auto;">
                            <button onclick="openEditPlanModal('${p.plan_name}')" class="hero-secondary-btn" style="width:100%; padding:0.6rem; border-color:var(--border-focus); color:var(--primary);"><i class="fas fa-edit"></i> Edit Plan</button>
                        </div>
                    </div>
                `;
            });
        }
        
        function openEditPlanModal(planName) {
            const p = _allPlansCache.find(x => x.plan_name === planName);
            if(!p) return;
            document.getElementById('ep_plan_name').value = p.plan_name;
            document.getElementById('ep_credits').value = p.credits_granted;
            document.getElementById('ep_price').value = p.price;
            document.getElementById('ep_features').value = (p.features || []).join(', ');
            document.getElementById('ep_modal_title').textContent = `Edit ${p.plan_name} Plan`;
            document.getElementById('editPlanModal').classList.remove('hidden');
        }
        
        async function handleEditPlanSubmit(e) {
            e.preventDefault();
            const btn = document.getElementById('btnSavePlan');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            btn.disabled = true;
            
            const payload = {
                plan_name: document.getElementById('ep_plan_name').value,
                credits_granted: parseInt(document.getElementById('ep_credits').value),
                price: parseInt(document.getElementById('ep_price').value),
                features: document.getElementById('ep_features').value.split(',').map(s=>s.trim()).filter(s=>s)
            };
            
            try {
                const res = await fetch(`${API_BASE}/master/plans`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${adminId}`},
                    body: JSON.stringify(payload)
                });
                if(res.ok) {
                    showToast('Plan updated successfully', 'success');
                    document.getElementById('editPlanModal').classList.add('hidden');
                    fetchPlansData();
                } else {
                    showToast('Failed to update plan', 'error');
                }
            } catch(e) {
                console.error(e);
            }
            btn.innerHTML = 'Save Changes';
            btn.disabled = false;
        }

        // -- SUBSCRIBERS API LOGIC --
        let _allSubsCache = [];
        async function fetchSubscribers() {
            const tb = document.getElementById('subscribersTableBody');
            tb.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading subscribers...</td></tr>';
            try {
                const res = await fetch(`${API_BASE}/master/companies`, {
                    headers: {'Authorization': `Bearer ${adminId}`}
                });
                const data = await res.json();
                if(data.status === 'success') {
                    _allSubsCache = data.data;
                    
                    // populate plans filter
                    const plans = [...new Set(data.data.map(c => c.plan_name).filter(Boolean))];
                    const pSelect = document.getElementById('subscriberPlanFilter');
                    pSelect.innerHTML = '<option value="all">All Plans</option>';
                    plans.forEach(p => pSelect.innerHTML += `<option value="${p}">${p}</option>`);
                    
                    renderSubscribers();
                }
            } catch(e) {
                console.error(e);
            }
        }
        
        function renderSubscribers() {
            const q = document.getElementById('subscriberSearch').value.toLowerCase();
            const pF = document.getElementById('subscriberPlanFilter').value;
            const sF = document.getElementById('subscriberStatusFilter').value;
            const sort = document.getElementById('subscriberSort').value;
            
            let filtered = _allSubsCache.filter(c => {
                const matchQ = c.company_name.toLowerCase().includes(q) || c.admin_email.toLowerCase().includes(q);
                const matchP = pF === 'all' || c.plan_name === pF;
                
                // Derive status
                let status = 'active';
                if (c.plan_expiry) {
                    const expiry = new Date(c.plan_expiry);
                    if (expiry < new Date()) status = 'expired';
                }
                const matchS = sF === 'all' || status === sF;
                
                return matchQ && matchP && matchS;
            });
            
            if(sort === 'name') filtered.sort((a,b) => a.company_name.localeCompare(b.company_name));
            else if(sort === 'date') filtered.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
            
            const tb = document.getElementById('subscribersTableBody');
            tb.innerHTML = '';
            
            if(filtered.length === 0) {
                tb.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">No subscribers found.</td></tr>';
                return;
            }
            
            filtered.forEach(c => {
                let status = 'active';
                let statusColor = 'rgba(16,185,129,0.1)';
                let statusText = '#10b981';
                
                if (c.plan_expiry && new Date(c.plan_expiry) < new Date()) {
                    status = 'expired';
                    statusColor = 'rgba(244,63,94,0.1)';
                    statusText = '#f43f5e';
                }
                
                tb.innerHTML += `
                    <tr style="border-bottom: 1px solid var(--border); transition: background 0.2s;">
                        <td style="padding: 1rem 1.5rem;">
                            <div style="font-weight:600; color:var(--text-primary); font-size:0.95rem;">${c.company_name}</div>
                            <div style="font-size:0.8rem; color:var(--text-muted);">${c.admin_email}</div>
                        </td>
                        <td style="padding: 1rem 1.5rem; font-size:0.9rem; color:var(--text-primary); text-transform:capitalize;">${c.plan_name || '-'}</td>
                        <td style="padding: 1rem 1.5rem;">
                            <span style="background:${statusColor}; color:${statusText}; padding:0.25rem 0.6rem; border-radius:99px; font-size:0.75rem; font-weight:700; text-transform:uppercase;">${status}</span>
                        </td>
                        <td style="padding: 1rem 1.5rem; font-size:0.9rem; color:var(--text-secondary);">${c.total_sessions || 0} sessions</td>
                        <td style="padding: 1rem 1.5rem; font-size:0.9rem; color:var(--text-secondary);">${c.created_at ? new Date(c.created_at).toLocaleDateString() : '-'}</td>
                        <td style="padding: 1rem 1.5rem; font-size:0.9rem; color:var(--text-secondary);">${c.plan_expiry ? new Date(c.plan_expiry).toLocaleDateString() : 'Lifetime'}</td>
                        <td style="padding: 1rem 1.5rem;">
                            <button class="hero-secondary-btn" style="padding:0.4rem 0.75rem; font-size:0.8rem;"><i class="fas fa-ellipsis-v"></i></button>
                        </td>
                    </tr>
                `;
            });
        }
        
        document.getElementById('subscriberSearch').addEventListener('input', renderSubscribers);
        document.getElementById('subscriberPlanFilter').addEventListener('change', renderSubscribers);
        document.getElementById('subscriberStatusFilter').addEventListener('change', renderSubscribers);
        document.getElementById('subscriberSort').addEventListener('change', renderSubscribers);

        // -- CREATE TENANT LOGIC --
        async function handleCreateTenantFull(e) {
            e.preventDefault();
            const btn = document.getElementById('btnCreateTenantFull');
            const origHTML = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
            btn.disabled = true;

            const payload = {
                name: document.getElementById('ct_username').value,
                email: document.getElementById('ct_email').value,
                password: document.getElementById('ct_password').value,
                company_name: document.getElementById('ct_company_name').value,
                plan_name: document.getElementById('ct_plan_name').value
            };

            try {
                const res = await fetch(`${API_BASE}/master/tenants`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminId}` },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if(data.status === 'success') {
                    showToast('Tenant created successfully!', 'success');
                    document.getElementById('createTenantFormFull').reset();
                    // Optionally switch to subscribers tab
                    showMasterSubscribers();
                } else {
                    showToast(data.message || 'Error creating tenant', 'error');
                }
            } catch(e) {
                console.error(e);
                showToast('Failed to create tenant', 'error');
            }
            btn.innerHTML = origHTML;
            btn.disabled = false;
        }

    </script>
    """
    
    # Append the script logic right before </body>
    body = soup.find('body')
    if body:
        body.append(BeautifulSoup(script_html, 'html.parser'))
        
    with open('master.html', 'w', encoding='utf-8') as f:
        f.write(str(soup))
        
if __name__ == '__main__':
    inject()
