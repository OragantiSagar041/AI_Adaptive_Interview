from bs4 import BeautifulSoup
import re

def fix_master():
    with open('master.html', 'r', encoding='utf-8') as f:
        html = f.read()
    
    soup = BeautifulSoup(html, 'html.parser')

    # 1. Global CSS fix for gap and scrollbars
    style_tag = soup.new_tag('style')
    style_tag.string = """
        html, body { overflow: hidden !important; margin: 0; padding: 0; }
        #dashboardSection { max-width: 100% !important; margin: 0 !important; width: 100%; display: flex; }
        .main-wrapper { overflow-y: auto !important; overflow-x: hidden; height: 100vh; flex: 1; }
        .dropdown-menu { z-index: 9999 !important; }
        .notification-dropdown {
            position: absolute; top: 100%; right: -50px; width: 280px; 
            background: var(--bg-card); border: 1px solid var(--border);
            box-shadow: var(--shadow-lg); border-radius: var(--radius-md);
            z-index: 9999; padding: 1rem; margin-top: 10px; display: none;
        }
        .notification-dropdown.active { display: block; }
    """
    head = soup.find('head')
    if head:
        head.append(style_tag)

    # 2. Fix the Profile Dropdown and Notifications Dropdown HTML
    # We will find the top bar icons
    # The notification bell
    bell_icon = soup.find('i', class_='fa-bell')
    if bell_icon:
        bell_parent = bell_icon.parent
        if bell_parent:
            bell_parent['onclick'] = "toggleNotificationDropdown(event)"
            bell_parent['style'] = bell_parent.get('style', '') + "; position:relative;"
            # Append notification dropdown
            notif_html = """
            <div class="notification-dropdown" id="notificationDropdown">
                <h4 style="margin:0 0 10px 0; font-size:0.9rem; color:var(--text-primary);">Notifications</h4>
                <div style="font-size:0.8rem; color:var(--text-muted); padding:0.5rem 0; border-bottom:1px solid var(--border);">No new notifications</div>
            </div>
            """
            bell_parent.append(BeautifulSoup(notif_html, 'html.parser'))
            
    # Add JS for notification toggle
    script_toggle = soup.new_tag('script')
    script_toggle.string = """
        function toggleNotificationDropdown(e) {
            e.stopPropagation();
            const nd = document.getElementById('notificationDropdown');
            if(nd) nd.classList.toggle('active');
            
            // Close profile dropdown if open
            const pd = document.querySelector('.profile-dropdown-container .dropdown-menu');
            if(pd) pd.classList.add('hidden');
        }
        
        // Update document click to close both
        document.addEventListener('click', function(e) {
            if(!e.target.closest('.profile-dropdown-container')) {
                const pd = document.querySelector('.profile-dropdown-container .dropdown-menu');
                if(pd) pd.classList.add('hidden');
            }
            if(!e.target.closest('.fa-bell') && !e.target.closest('.notification-dropdown')) {
                const nd = document.getElementById('notificationDropdown');
                if(nd) nd.classList.remove('active');
            }
        });
    """
    body = soup.find('body')
    if body:
        body.append(script_toggle)

    # 3. Add EXACT Features User Requested to Edit Plan Modal
    features_container = soup.find(id='ep_features_container')
    if features_container:
        features_container.clear()
        # "industry type, ATS Score , induatry type, interview type etcc .., all"
        all_features = [
            "Overview Dashboard", "Create Interview", "Qualified Candidates", 
            "Rejected Candidates", "Deactivated Candidates", "Profile Settings", 
            "Live Monitor", "Analytics & Reports", "Bulk Email Invites", 
            "Resume Parsing", "Custom Branding", "Priority Support", "API Access",
            "Export Data", "User Management", "Role-Based Access", "Integration Webhooks",
            "Industry Type", "ATS Score", "Interview Type"
        ]
        
        for feature in all_features:
            features_container.append(BeautifulSoup(f'<label class="feature-checkbox-label"><input type="checkbox" name="ep_feature" value="{feature}"> {feature}</label>', 'html.parser'))


    # 4. Fix "All Plans" Dropdown in Companies Overview Filter
    # We will patch the JS `fetchSubscribersData` logic
    for script in soup.find_all('script'):
        if 'fetchSubscribersData' in script.text and 'subscriberPlanFilter' in script.text:
            # The script currently has:
            # const plans = [...new Set(data.data.map(c => c.plan_name).filter(Boolean))];
            # We want to change this to fetch from `_allPlansCache` or just leave it, but user wants FREE, BASIC, ADVANCE regardless if someone has it.
            js = script.text
            new_logic = """
            // Replace plan filter logic
            const pSelect = document.getElementById('subscriberPlanFilter');
            pSelect.innerHTML = '<option value="all">All Plans</option>';
            if(window._allPlansCache && window._allPlansCache.length > 0) {
                window._allPlansCache.forEach(p => {
                    pSelect.innerHTML += `<option value="${p.plan_name}">${p.plan_name}</option>`;
                });
            } else {
                ['Free Trial', 'Basic', 'Advance'].forEach(p => {
                    pSelect.innerHTML += `<option value="${p}">${p}</option>`;
                });
            }
            """
            
            # Use regex to replace the old logic
            js = re.sub(r'const plans = \[\.\.\.new Set.*?plans\.forEach\(p => pSelect\.innerHTML \+= `<option value="\$\{p\}">\$\{p\}</option>`\);', new_logic, js, flags=re.DOTALL)
            script.string = js

    with open('master.html', 'w', encoding='utf-8') as f:
        f.write(str(soup))


if __name__ == '__main__':
    fix_master()
    print("Master bugs fixed successfully.")
