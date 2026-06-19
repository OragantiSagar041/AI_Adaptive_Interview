import sys

def remove_element_by_id(html, el_id):
    start_tag = f'id="{el_id}"'
    idx = html.find(start_tag)
    if idx == -1:
        return html
        
    # find the opening <div
    start_idx = html.rfind('<div', 0, idx)
    if start_idx == -1:
        return html
        
    # find the matching closing div
    count = 0
    i = start_idx
    while i < len(html):
        if html.startswith('<div', i):
            count += 1
            i += 4
        elif html.startswith('</div', i):
            count -= 1
            if count == 0:
                end_idx = i + 6 # len('</div>')
                return html[:start_idx] + html[end_idx:]
            i += 5
        else:
            i += 1
    return html

with open('master.html', 'r', encoding='utf-8') as f:
    html = f.read()

ids_to_remove = [
    'tenantSidebarNav',
    'view-super_dashboard',
    'view-team',
    'view-overview',
    'view-qualified',
    'view-unqualified',
    'view-create',
    'view-results',
    'view-settings',
    'emailPreviewModal',
    'liveResultsModal',
    'resultsModal',
    'candidateExistsModal',
    'rescheduleModal',
    'addAdminModal'
]

for el_id in ids_to_remove:
    while el_id in html:
        old_len = len(html)
        html = remove_element_by_id(html, el_id)
        if len(html) == old_len:
            break

# also remove the 'hidden' class from masterSidebarNav so it shows by default
html = html.replace('<div class="sidebar-nav hidden" id="masterSidebarNav">', '<div class="sidebar-nav" id="masterSidebarNav">')

# also remove 'hidden' class from masterDashboardSection
html = html.replace('<div id="masterDashboardSection" class="hidden master-workspace">', '<div id="masterDashboardSection" class="master-workspace">')

with open('master.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Cleaned master.html successfully")
