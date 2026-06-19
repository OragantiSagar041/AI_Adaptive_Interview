from bs4 import BeautifulSoup

def fix_master():
    with open('master.html', 'r', encoding='utf-8') as f:
        html = f.read()
    
    soup = BeautifulSoup(html, 'html.parser')

    # 1. Fix Double Scrollbars
    # Find the style block I injected previously
    for style in soup.find_all('style'):
        if '.main-wrapper' in style.text and 'overflow-y: auto !important;' in style.text:
            style.string = style.text.replace('.main-wrapper {', '.main-wrapper {\n            height: 100vh;').replace('overflow-y: auto !important;', 'overflow-y: auto !important; overflow-x: hidden;')
            break

    # 2. Fix Topbar Notification & Profile
    # The notification icon click logic
    # In my previous inject, I did: onclick="this.querySelector('.dropdown-menu').classList.toggle('hidden')"
    # Let's ensure it works perfectly by adding a global click listener
    script_fix = """
    <script>
        document.addEventListener('click', function(e) {
            const profileContainer = e.target.closest('.profile-dropdown-container');
            const dropdown = document.querySelector('.profile-dropdown-container .dropdown-menu');
            if (profileContainer) {
                // If they clicked the container, toggle it (handled by the inline onclick, wait, let's remove inline)
            } else if (dropdown && !dropdown.classList.contains('hidden')) {
                dropdown.classList.add('hidden');
            }
        });
        
        function toggleProfileDropdown(e) {
            e.stopPropagation();
            const dropdown = document.querySelector('.profile-dropdown-container .dropdown-menu');
            if (dropdown) dropdown.classList.toggle('hidden');
        }
    </script>
    """
    
    # Update the profile container HTML
    profile_container = soup.find(class_='profile-dropdown-container')
    if profile_container:
        profile_container['onclick'] = "toggleProfileDropdown(event)"

    # 3. Companies Overview - Change EXPIRY DATE to CREDITS
    subscribers_section = soup.find(id='masterSubscribersSection')
    if subscribers_section:
        th_expiry = subscribers_section.find('th', string=lambda t: t and 'Expiry Date' in t)
        if th_expiry:
            th_expiry.string = 'Credits'
            
    # Update the renderSubscribers JS logic to populate credits instead of expiry date
    for script in soup.find_all('script'):
        if 'renderSubscribers()' in script.text and '_allSubsCache.forEach' in script.text:
            js = script.text
            # Replace the JS rendering logic for the 6th column (Expiry Date -> Credits)
            # Find the line: `<td style="padding: 1rem 1.5rem; font-size:0.9rem; color:var(--text-secondary);">${c.plan_expiry ? new Date(c.plan_expiry).toLocaleDateString() : 'Lifetime'}</td>`
            js = js.replace(
                """<td style="padding: 1rem 1.5rem; font-size:0.9rem; color:var(--text-secondary);">${c.plan_expiry ? new Date(c.plan_expiry).toLocaleDateString() : 'Lifetime'}</td>""",
                """<td style="padding: 1rem 1.5rem; font-size:0.9rem; font-weight:700; color:var(--primary);">${c.credits || 0}</td>"""
            )
            script.string = js

    # 4. Subscription Plans alignment
    # In masterPlansSection, the plans grid had large paddings or gaps
    plans_section = soup.find(id='masterPlansSection')
    if plans_section:
        plans_section['style'] = plans_section.get('style', '').replace('margin: 0 auto;', 'margin: 0;').replace('padding: 2rem;', 'padding: 2rem 2rem 5rem 2rem;')

    # 5. Add ALL Admin Features to Checkboxes
    features_container = soup.find(id='ep_features_container')
    if features_container:
        features_container.clear()
        
        all_features = [
            "Overview Dashboard", "Create Interview", "Qualified Candidates", 
            "Rejected Candidates", "Deactivated Candidates", "Profile Settings", 
            "Live Monitor", "Analytics & Reports", "Bulk Email Invites", 
            "Resume Parsing", "Custom Branding", "Priority Support", "API Access",
            "Export Data", "User Management", "Role-Based Access", "Integration Webhooks"
        ]
        
        for feature in all_features:
            features_container.append(BeautifulSoup(f'<label class="feature-checkbox-label"><input type="checkbox" name="ep_feature" value="{feature}"> {feature}</label>', 'html.parser'))
            
    body = soup.find('body')
    if body:
        body.append(BeautifulSoup(script_fix, 'html.parser'))

    with open('master.html', 'w', encoding='utf-8') as f:
        f.write(str(soup))


def fix_index():
    with open('index.html', 'r', encoding='utf-8') as f:
        html = f.read()
    
    soup = BeautifulSoup(html, 'html.parser')
    
    # Ensure loadPlans logic accurately parses features and styles cards
    for script in soup.find_all('script'):
        if 'function loadPlans()' in script.text or 'function renderPlans' in script.text:
            # We want to replace the `renderPlans` function to make it fully dynamic
            # And we need to make sure the pricing matches the Master exactly
            new_js = """
        const planOrder = {
            "Free Trial": 0,
            "Basic": 1,
            "Advance": 2,
        };

        function formatPrice(price) {
            const numeric = Number(price || 0);
            if (numeric === 0) return "Free";
            return `$${numeric.toLocaleString("en-US")}`;
        }

        function planBadge(plan, index) {
            if (plan.price === 0) return "Trial";
            if (index === 1) return "Popular";
            if (plan.plan_name.toLowerCase() === "advance") return "Scale";
            return "Plan";
        }

        function renderPlans(plans) {
            const grid = document.getElementById("pricingGrid");
            if (!grid) return;
            
            grid.innerHTML = ""; // Clear loader
            
            plans.forEach((plan, index) => {
                const featured = index === 1; // Middle plan is highlighted
                const card = document.createElement("div");
                card.className = `pricing-card ${featured ? 'featured' : ''}`;
                
                // Parse features
                let featuresList = [];
                if (Array.isArray(plan.features)) {
                    featuresList = plan.features;
                } else if (typeof plan.features === 'string') {
                    featuresList = plan.features.split(',').map(f => f.trim());
                }
                
                if (featuresList.length === 0) {
                    featuresList = ["No specific features defined"];
                }
                
                const featuresHtml = featuresList.map(feature => 
                    `<li><i class="fas fa-check-circle" style="color: ${featured ? '#fff' : 'var(--accent)'}"></i> ${feature}</li>`
                ).join("");
                
                card.innerHTML = `
                    ${featured ? `<div class="popular-badge"><i class="fas fa-star"></i> Most Popular</div>` : ''}
                    <div class="card-header">
                        <h3>${plan.plan_name} <span class="badge" style="background:${featured ? 'rgba(255,255,255,0.2)' : 'rgba(99,102,241,0.1)'}; color:${featured ? '#fff' : 'var(--primary)'};">${planBadge(plan, index)}</span></h3>
                        <div class="price">
                            ${formatPrice(plan.price)}
                            ${plan.price !== 0 ? '<span>/month</span>' : ''}
                        </div>
                        <p style="margin-top:10px; font-weight:700; color:${featured ? 'rgba(255,255,255,0.9)' : 'var(--text-secondary)'};">
                            <i class="fas fa-coins" style="color:#f59e0b;"></i> ${plan.credits_granted} Credits
                        </p>
                    </div>
                    <div class="card-body">
                        <ul>
                            ${featuresHtml}
                        </ul>
                    </div>
                    <div class="cta">
                        <a href="register.html?plan=${encodeURIComponent(plan.plan_name)}" class="btn ${featured ? 'btn-outline' : 'btn-primary'}" style="${featured ? 'background:white; color:var(--accent); border-color:white;' : ''}">
                            ${plan.price === 0 ? "Start Free Trial" : "Choose This Plan"}
                        </a>
                    </div>
                `;
                
                grid.appendChild(card);
            });
        }

        async function loadPlans() {
            try {
                const response = await fetch(`${API_BASE}/api/plans`);
                const payload = await response.json();
                if (!response.ok || payload.status !== "success") {
                    throw new Error(payload.detail || payload.message || "Unable to load plans");
                }

                const plans = (payload.data || []).sort((a, b) => {
                    const aOrder = planOrder[a.plan_name] ?? 999;
                    const bOrder = planOrder[b.plan_name] ?? 999;
                    return aOrder - bOrder;
                });
                renderPlans(plans);
            } catch (error) {
                const loader = document.getElementById("plansLoader");
                if (loader) loader.textContent = error.message || "Unable to load pricing plans right now.";
            }
        }
        
        // Wait for DOM to load
        document.addEventListener('DOMContentLoaded', () => {
            loadPlans();
        });
            """
            # Replace everything from `const planOrder` to `loadPlans();` with our new script
            import re
            js = script.text
            js = re.sub(r'const planOrder.*?loadPlans\(\);', new_js, js, flags=re.DOTALL)
            script.string = js

    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(str(soup))


if __name__ == '__main__':
    fix_master()
    fix_index()
    print("UI fixes applied successfully.")
