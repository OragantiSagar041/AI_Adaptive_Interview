from bs4 import BeautifulSoup
import sys

with open('master.html', 'r', encoding='utf-8') as f:
    soup = BeautifulSoup(f.read(), 'html.parser')

# 1. Remove tenant sidebar
el = soup.find(id='tenantSidebarNav')
if el: el.decompose()

# 2. Remove all view-panels
for panel in soup.find_all(class_='view-panel'):
    panel.decompose()

# 3. Clean up masterSidebarNav buttons that link to tenant views
# IDs: nav-master-overview, nav-master-create, nav-master-qualified, nav-master-unqualified, nav-master-settings
for btn_id in ['nav-master-overview', 'nav-master-create', 'nav-master-qualified', 'nav-master-unqualified', 'nav-master-settings']:
    btn = soup.find(id=btn_id)
    if btn: btn.decompose()

# Remove Live Monitor button which has onclick="showLiveResultsModal()"
live_btn = soup.find(lambda tag: tag.name == 'button' and tag.has_attr('onclick') and 'showLiveResultsModal()' in tag['onclick'])
if live_btn: live_btn.decompose()

# 4. Remove unnecessary modals
for modal_id in ['emailPreviewModal', 'liveResultsModal', 'resultsModal', 'candidateExistsModal', 'rescheduleModal', 'addAdminModal']:
    modal = soup.find(id=modal_id)
    if modal: modal.decompose()

# 5. Fix visibility of masterSidebarNav and masterDashboardSection
master_sidebar = soup.find(id='masterSidebarNav')
if master_sidebar and 'hidden' in master_sidebar.get('class', []):
    master_sidebar['class'].remove('hidden')

master_dashboard = soup.find(id='masterDashboardSection')
if master_dashboard and 'hidden' in master_dashboard.get('class', []):
    master_dashboard['class'].remove('hidden')

with open('master.html', 'w', encoding='utf-8') as f:
    f.write(str(soup))

print('Successfully cleaned master.html with bs4')
