import re

with open('master.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Remove tenantSidebarNav
html = re.sub(r'<div class="sidebar-nav" id="tenantSidebarNav">.*?</div>\s*<div class="sidebar-nav hidden" id="masterSidebarNav">', '<div class="sidebar-nav" id="masterSidebarNav">', html, flags=re.DOTALL)

# Remove super admin tabs and tenant views
start_str = "<!-- SUPER ADMIN TABS -->"
# Find the end of view-settings
end_str = "<!-- END OF DASHBOARD WRAPPER -->"

if start_str in html and end_str in html:
    start_idx = html.find(start_str)
    # We want to keep from end_str onwards, wait, the views might end before some other modals.
    # Let's find exactly where view-settings ends.
    view_settings_end = html.find('<!-- MODALS -->')
    if view_settings_end != -1:
        html = html[:start_idx] + "\n" + html[view_settings_end:]
    else:
        print("Could not find <!-- MODALS -->")
else:
    print("Could not find start_str or end_str")

# In master.html, we don't need any tenant logic like loadDashboardStats
# Actually, it might be safer to just leave the JS for now, as it's not hurting, or we can clean it if needed.

with open('master.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Cleaned master.html")
