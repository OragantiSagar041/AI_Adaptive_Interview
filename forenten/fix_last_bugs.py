from bs4 import BeautifulSoup
import re

def fix_last_bugs():
    with open('master.html', 'r', encoding='utf-8') as f:
        html = f.read()
    
    soup = BeautifulSoup(html, 'html.parser')

    # Find the style block containing html, body { overflow: hidden !important;
    for style in soup.find_all('style'):
        if 'html, body { overflow: hidden !important;' in style.text:
            new_css = """
        html, body { overflow: hidden !important; margin: 0; padding: 0; }
        #dashboardSection { max-width: 100% !important; margin: 0 !important; width: 100%; display: flex; }
        .main-wrapper { height: 100vh; flex: 1; overflow: visible !important; }
        .dropdown-menu { z-index: 9999 !important; }
        .notification-dropdown {
            position: absolute; top: 100%; right: 0; width: 280px; 
            background: var(--bg-card); border: 1px solid var(--border);
            box-shadow: var(--shadow-lg); border-radius: var(--radius-md);
            z-index: 9999; padding: 1rem; margin-top: 10px; display: none;
        }
        .notification-dropdown.active { display: block; }
            """
            style.string = new_css
            break

    # Ensure profile dropdown container has relative positioning
    top_bar = soup.find('div', class_='top-bar')
    if top_bar:
        # Find the profile container
        profile_container = top_bar.find('div', class_='profile-dropdown-container')
        if profile_container:
            profile_container['style'] = profile_container.get('style', '') + '; position: relative;'
            
            # Find the dropdown menu inside it
            dropdown = profile_container.find('div', class_='dropdown-menu')
            if dropdown:
                # Ensure it's right-aligned and not overflowing to the right
                dropdown['style'] = "position:absolute; top:100%; right:0; background:var(--bg-card); border:1px solid var(--border); box-shadow:var(--shadow-md); border-radius:var(--radius-md); width:180px; z-index:9999; margin-top:10px; padding:0.5rem 0;"
                # Remove 'hidden' from class if we toggle it via JS? The JS uses classList.toggle('hidden'), so it's fine.

    with open('master.html', 'w', encoding='utf-8') as f:
        f.write(str(soup))


if __name__ == '__main__':
    fix_last_bugs()
    print("Final bugs fixed successfully.")
