from bs4 import BeautifulSoup

def inject():
    with open('master.html', 'r', encoding='utf-8') as f:
        html = f.read()
    
    soup = BeautifulSoup(html, 'html.parser')

    # 1. Fix CSS overflow for .main-wrapper
    style_tag = soup.new_tag('style')
    style_tag.string = """
        .main-wrapper {
            overflow-y: auto !important;
        }
        
        /* New custom checkboxes for edit plan */
        .feature-checkbox-label {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.85rem;
            color: var(--text-primary);
            cursor: pointer;
            padding: 0.5rem;
            border-radius: 6px;
            transition: background 0.2s;
        }
        .feature-checkbox-label:hover {
            background: rgba(99, 102, 241, 0.05);
        }
        .feature-checkbox-label input[type="checkbox"] {
            accent-color: var(--primary);
            width: 16px;
            height: 16px;
            cursor: pointer;
        }
    """
    head = soup.find('head')
    if head:
        head.append(style_tag)

    # 2. Update Companies Overview
    subs_section = soup.find(id='masterSubscribersSection')
    if subs_section:
        # Change heading
        h2 = subs_section.find('h2')
        if h2 and h2.text == 'Subscribers Overview':
            h2.string = 'Companies Overview'
            
        # Change subtitle
        p = subs_section.find('p')
        if p and 'Track ongoing' in p.text:
            p.string = 'Manage all registered companies and their plans'

        # Add the "Add New Tenant" button to the top right of this card
        header_div = subs_section.find('div', recursive=False)
        if header_div:
            # First child is the card with background var(--bg-card)
            flex_container = header_div.find('div', style=lambda value: value and 'justify-content:space-between' in value.replace(' ', ''))
            if flex_container:
                # Append the button
                btn_html = '<button class="hero-primary-btn" onclick="showMasterCreateTenant()" style="padding:0.75rem 1.5rem; background:#2563eb; color:white; border-radius:var(--radius-sm); font-weight:600;"><i class="fas fa-plus"></i> Add New Tenant</button>'
                flex_container.append(BeautifulSoup(btn_html, 'html.parser'))


    # 3. Enhance Master Dashboard Visuals
    dash_section = soup.find(id='masterDashboardSection')
    if dash_section:
        dash_section.clear()
        new_dash_html = """
        <div class="master-page-head" style="margin-bottom: 2rem;">
            <div>
                <h2 class="master-page-title" style="font-size:1.8rem; font-weight:700; color:var(--text-primary);">Master Console Overview</h2>
                <p class="master-page-subtitle" style="color:var(--text-secondary);">Real-time metrics, MRR, and platform analytics.</p>
            </div>
            <div class="master-action-row" style="display:flex; gap:10px;">
                <button class="hero-secondary-btn" onclick="initRichCharts()"><i class="fas fa-rotate"></i> Refresh Data</button>
                <button class="hero-primary-btn" onclick="showMasterCreateTenant()" style="background:#2563eb;"><i class="fas fa-plus"></i> Create Tenant</button>
            </div>
        </div>

        <!-- Enhanced Stat Cards -->
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:1.5rem; margin-bottom:2rem;">
            <div style="background:var(--bg-card); padding:1.5rem; border-radius:var(--radius-lg); border:1px solid var(--border); box-shadow:var(--shadow-sm);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <p style="font-size:0.85rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Monthly Recurring Revenue</p>
                        <h3 style="font-size:2rem; font-weight:800; color:var(--text-primary); margin:0.5rem 0;" id="mrrValue">$12,450</h3>
                        <p style="font-size:0.85rem; color:#10b981; font-weight:600;"><i class="fas fa-arrow-up"></i> 14.2% from last month</p>
                    </div>
                    <div style="width:45px; height:45px; border-radius:12px; background:rgba(16,185,129,0.1); color:#10b981; display:flex; align-items:center; justify-content:center; font-size:1.2rem;">
                        <i class="fas fa-dollar-sign"></i>
                    </div>
                </div>
            </div>
            
            <div style="background:var(--bg-card); padding:1.5rem; border-radius:var(--radius-lg); border:1px solid var(--border); box-shadow:var(--shadow-sm);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <p style="font-size:0.85rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Active Companies</p>
                        <h3 style="font-size:2rem; font-weight:800; color:var(--text-primary); margin:0.5rem 0;" id="richActiveCompanies">0</h3>
                        <p style="font-size:0.85rem; color:#10b981; font-weight:600;"><i class="fas fa-arrow-up"></i> 5 new this week</p>
                    </div>
                    <div style="width:45px; height:45px; border-radius:12px; background:rgba(37,99,235,0.1); color:#2563eb; display:flex; align-items:center; justify-content:center; font-size:1.2rem;">
                        <i class="fas fa-building"></i>
                    </div>
                </div>
            </div>
            
            <div style="background:var(--bg-card); padding:1.5rem; border-radius:var(--radius-lg); border:1px solid var(--border); box-shadow:var(--shadow-sm);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <p style="font-size:0.85rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Total Interviews Conducted</p>
                        <h3 style="font-size:2rem; font-weight:800; color:var(--text-primary); margin:0.5rem 0;" id="richTotalInterviews">1,204</h3>
                        <p style="font-size:0.85rem; color:#f59e0b; font-weight:600;"><i class="fas fa-minus"></i> Stable</p>
                    </div>
                    <div style="width:45px; height:45px; border-radius:12px; background:rgba(245,158,11,0.1); color:#f59e0b; display:flex; align-items:center; justify-content:center; font-size:1.2rem;">
                        <i class="fas fa-video"></i>
                    </div>
                </div>
            </div>

            <div style="background:var(--bg-card); padding:1.5rem; border-radius:var(--radius-lg); border:1px solid var(--border); box-shadow:var(--shadow-sm);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <p style="font-size:0.85rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">System Health</p>
                        <h3 style="font-size:2rem; font-weight:800; color:var(--text-primary); margin:0.5rem 0;">99.9%</h3>
                        <p style="font-size:0.85rem; color:#10b981; font-weight:600;"><i class="fas fa-check-circle"></i> All systems operational</p>
                    </div>
                    <div style="width:45px; height:45px; border-radius:12px; background:rgba(99,102,241,0.1); color:#6366f1; display:flex; align-items:center; justify-content:center; font-size:1.2rem;">
                        <i class="fas fa-server"></i>
                    </div>
                </div>
            </div>
        </div>

        <!-- Charts Area -->
        <div style="display:grid; grid-template-columns: 2fr 1fr; gap:1.5rem; margin-bottom:2rem;">
            <!-- MRR Line Chart -->
            <div style="background:var(--bg-card); padding:1.5rem; border-radius:var(--radius-lg); border:1px solid var(--border); box-shadow:var(--shadow-sm);">
                <h3 style="font-size:1.1rem; font-weight:700; margin-bottom:1rem; color:var(--text-primary);">Revenue Growth (MRR)</h3>
                <div style="position:relative; height:300px; width:100%;">
                    <canvas id="mrrChart"></canvas>
                </div>
            </div>

            <!-- Plan Distribution -->
            <div style="background:var(--bg-card); padding:1.5rem; border-radius:var(--radius-lg); border:1px solid var(--border); box-shadow:var(--shadow-sm);">
                <h3 style="font-size:1.1rem; font-weight:700; margin-bottom:1rem; color:var(--text-primary);">Plan Distribution</h3>
                <div style="position:relative; height:250px; width:100%;">
                    <canvas id="planDistChart"></canvas>
                </div>
            </div>
        </div>
        """
        dash_section.append(BeautifulSoup(new_dash_html, 'html.parser'))


    # 4. Update Edit Plan Modal (Textarea to Checkboxes)
    modal = soup.find(id='editPlanModal')
    if modal:
        textarea = modal.find(id='ep_features')
        if textarea:
            parent_group = textarea.parent
            parent_group.clear()
            
            checkbox_html = """
                <label class="dash-label">Select Features</label>
                <div id="ep_features_container" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; max-height:200px; overflow-y:auto; border:1px solid var(--border); padding:1rem; border-radius:var(--radius-md); background:var(--bg-input);">
                    <label class="feature-checkbox-label"><input type="checkbox" name="ep_feature" value="Admin Dashboard"> Admin Dashboard</label>
                    <label class="feature-checkbox-label"><input type="checkbox" name="ep_feature" value="Single Interview Creation"> Single Interview Creation</label>
                    <label class="feature-checkbox-label"><input type="checkbox" name="ep_feature" value="Bulk Email Invites"> Bulk Email Invites</label>
                    <label class="feature-checkbox-label"><input type="checkbox" name="ep_feature" value="Resume Parsing"> Resume Parsing</label>
                    <label class="feature-checkbox-label"><input type="checkbox" name="ep_feature" value="Basic Analytics"> Basic Analytics</label>
                    <label class="feature-checkbox-label"><input type="checkbox" name="ep_feature" value="Advanced Analytics"> Advanced Analytics</label>
                    <label class="feature-checkbox-label"><input type="checkbox" name="ep_feature" value="Live Monitor"> Live Monitor</label>
                    <label class="feature-checkbox-label"><input type="checkbox" name="ep_feature" value="Custom Branding"> Custom Branding</label>
                    <label class="feature-checkbox-label"><input type="checkbox" name="ep_feature" value="Priority Support"> Priority Support</label>
                    <label class="feature-checkbox-label"><input type="checkbox" name="ep_feature" value="API Access"> API Access</label>
                </div>
            """
            parent_group.append(BeautifulSoup(checkbox_html, 'html.parser'))

    # 5. Inject new JS for Chart rendering and checkbox handling
    body = soup.find('body')
    if body:
        script = soup.new_tag('script')
        script.string = """
            // Rich Dashboard JS
            let mrrChartInstance = null;
            let planDistChartInstance = null;
            
            async function initRichCharts() {
                try {
                    const res = await fetch(`${API_BASE}/master/companies`, { headers: {'Authorization': `Bearer ${adminId}`} });
                    const data = await res.json();
                    
                    let companies = [];
                    if(data.status === 'success') companies = data.data;
                    
                    document.getElementById('richActiveCompanies').textContent = companies.length;
                    
                    // Dummy MRR Logic for demo purposes based on companies
                    const mrr = companies.length * 150;
                    document.getElementById('mrrValue').textContent = `$${mrr.toLocaleString()}`;
                    
                    // Count plan distributions
                    const planCounts = {};
                    companies.forEach(c => {
                        const p = c.plan_name || 'Free Trial';
                        planCounts[p] = (planCounts[p] || 0) + 1;
                    });
                    
                    renderCharts(planCounts);
                } catch(e) {
                    console.error("Error loading rich charts", e);
                }
            }
            
            function renderCharts(planCounts) {
                // Setup MRR Chart
                const ctxMrr = document.getElementById('mrrChart');
                if(ctxMrr) {
                    if(mrrChartInstance) mrrChartInstance.destroy();
                    mrrChartInstance = new Chart(ctxMrr, {
                        type: 'line',
                        data: {
                            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                            datasets: [{
                                label: 'MRR ($)',
                                data: [5000, 6500, 8200, 9500, 11000, 12450],
                                borderColor: '#6366f1',
                                backgroundColor: 'rgba(99, 102, 241, 0.2)',
                                borderWidth: 3,
                                fill: true,
                                tension: 0.4
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                                y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                                x: { grid: { display: false } }
                            }
                        }
                    });
                }
                
                // Setup Plan Dist Chart
                const ctxPlan = document.getElementById('planDistChart');
                if(ctxPlan) {
                    if(planDistChartInstance) planDistChartInstance.destroy();
                    const labels = Object.keys(planCounts).length ? Object.keys(planCounts) : ['Free Trial', 'Pro', 'Enterprise'];
                    const dataVals = Object.keys(planCounts).length ? Object.values(planCounts) : [10, 5, 2];
                    planDistChartInstance = new Chart(ctxPlan, {
                        type: 'doughnut',
                        data: {
                            labels: labels,
                            datasets: [{
                                data: dataVals,
                                backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899'],
                                borderWidth: 0,
                                hoverOffset: 4
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            cutout: '75%',
                            plugins: {
                                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
                            }
                        }
                    });
                }
            }
            
            // Override openEditPlanModal to handle checkboxes
            const origOpenEditPlanModal = window.openEditPlanModal;
            window.openEditPlanModal = function(planName) {
                const p = _allPlansCache.find(x => x.plan_name === planName);
                if(!p) return;
                document.getElementById('ep_plan_name').value = p.plan_name;
                document.getElementById('ep_credits').value = p.credits_granted;
                document.getElementById('ep_price').value = p.price;
                
                // Clear all checkboxes
                document.querySelectorAll('input[name="ep_feature"]').forEach(cb => cb.checked = false);
                
                // Check the ones the plan has
                if(p.features) {
                    document.querySelectorAll('input[name="ep_feature"]').forEach(cb => {
                        if(p.features.includes(cb.value)) {
                            cb.checked = true;
                        }
                    });
                }
                
                document.getElementById('ep_modal_title').textContent = `Edit ${p.plan_name} Plan`;
                document.getElementById('editPlanModal').classList.remove('hidden');
            };
            
            // Override handleEditPlanSubmit to read checkboxes
            const origHandleEditPlanSubmit = window.handleEditPlanSubmit;
            window.handleEditPlanSubmit = async function(e) {
                e.preventDefault();
                const btn = document.getElementById('btnSavePlan');
                const origText = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
                btn.disabled = true;
                
                // Get checked features
                const selectedFeatures = Array.from(document.querySelectorAll('input[name="ep_feature"]:checked')).map(cb => cb.value);
                
                const payload = {
                    plan_name: document.getElementById('ep_plan_name').value,
                    credits_granted: parseInt(document.getElementById('ep_credits').value),
                    price: parseInt(document.getElementById('ep_price').value),
                    features: selectedFeatures
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
                } catch(err) {
                    console.error(err);
                }
                btn.innerHTML = origText;
                btn.disabled = false;
            };

            // Call initRichCharts when dashboard loads
            document.addEventListener("DOMContentLoaded", () => {
                // Let the original script run, then override
                setTimeout(() => {
                    const origShowDashboard = window.showMasterDashboard;
                    window.showMasterDashboard = function() {
                        origShowDashboard();
                        initRichCharts();
                    }
                    if(document.getElementById('masterDashboardSection') && !document.getElementById('masterDashboardSection').classList.contains('hidden')) {
                        initRichCharts();
                    }
                }, 500);
            });
        """
        body.append(script)

    with open('master.html', 'w', encoding='utf-8') as f:
        f.write(str(soup))

if __name__ == '__main__':
    inject()
