from bs4 import BeautifulSoup
import re

def solve_blunders():
    with open('master.html', 'r', encoding='utf-8') as f:
        html = f.read()
    
    soup = BeautifulSoup(html, 'html.parser')

    # Fix the style block with our custom CSS overrides
    for style in soup.find_all('style'):
        if 'html, body { overflow: hidden !important;' in style.text or '.main-wrapper { height: 100vh;' in style.text:
            new_css = """
        /* Force body to scroll normally (Main Scrollbar) */
        html, body { overflow: auto !important; margin: 0; padding: 0; }
        
        /* Dashboard Container - allow it to grow with content */
        #dashboardSection { max-width: 100% !important; margin: 0 !important; width: 100%; display: flex; align-items: flex-start; height: auto !important; min-height: 100vh; }
        
        /* Sidebar - make it sticky so it stays in view while body scrolls */
        .sidebar-wrapper { position: sticky; top: 0; height: 100vh; overflow-y: auto; }
        
        /* Main Wrapper - allow it to grow naturally */
        .main-wrapper { height: auto; min-height: 100vh; flex: 1; overflow: visible !important; display: flex; flex-direction: column; }
        
        /* Top Bar - Z-index fix so dropdowns overlay the content */
        .top-bar { position: relative; z-index: 9999; }
        
        /* Main Content - remove inner scrollbar */
        .main-content { overflow-y: visible !important; height: auto !important; flex: 1; }
        
        /* Dropdowns */
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

    # Add the style block if it doesn't exist
    if not any('/* Force body to scroll normally' in s.text for s in soup.find_all('style')):
        style_tag = soup.new_tag('style')
        style_tag.string = """
        /* Force body to scroll normally (Main Scrollbar) */
        html, body { overflow: auto !important; margin: 0; padding: 0; }
        #dashboardSection { max-width: 100% !important; margin: 0 !important; width: 100%; display: flex; align-items: flex-start; height: auto !important; min-height: 100vh; }
        .sidebar-wrapper { position: sticky; top: 0; height: 100vh; overflow-y: auto; }
        .main-wrapper { height: auto; min-height: 100vh; flex: 1; overflow: visible !important; display: flex; flex-direction: column; }
        .top-bar { position: relative; z-index: 9999; }
        .main-content { overflow-y: visible !important; height: auto !important; flex: 1; }
        .dropdown-menu { z-index: 9999 !important; }
        .notification-dropdown {
            position: absolute; top: 100%; right: 0; width: 280px; 
            background: var(--bg-card); border: 1px solid var(--border);
            box-shadow: var(--shadow-lg); border-radius: var(--radius-md);
            z-index: 9999; padding: 1rem; margin-top: 10px; display: none;
        }
        .notification-dropdown.active { display: block; }
        """
        head = soup.find('head')
        if head:
            head.append(style_tag)

    # Double check profile dropdown is aligned right and has no weird styles
    top_bar = soup.find('div', class_='top-bar')
    if top_bar:
        profile_container = top_bar.find('div', class_='profile-dropdown-container')
        if profile_container:
            dropdown = profile_container.find('div', class_='dropdown-menu')
            if dropdown:
                dropdown['style'] = "position:absolute; top:100%; right:0; background:var(--bg-card); border:1px solid var(--border); box-shadow:var(--shadow-md); border-radius:var(--radius-md); width:180px; z-index:9999; margin-top:10px; padding:0.5rem 0;"

    with open('master.html', 'w', encoding='utf-8') as f:
        f.write(str(soup))


if __name__ == '__main__':
    solve_blunders()
    print("Blunders resolved.")
