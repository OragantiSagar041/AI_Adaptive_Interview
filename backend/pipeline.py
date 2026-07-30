import os
import shutil
import re

# Fix the fixer script
with open('fix_imports.py', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(r"'\n'.join", r"'\n'.join")
content = content.replace(r"\\n", r"\n")

with open('fix_imports.py', 'w', encoding='utf-8') as f:
    f.write(content)

print('1. Restoring routes.py from legacy...')
shutil.copy2('app/routes_legacy.py', 'app/routes.py')

print('2. Running split_routes.py...')
os.system('python split_routes.py')

print('3. Re-injecting email scheduler functions into routes_core.py...')
with open('app/routes_legacy.py', 'r', encoding='utf-8') as f:
    legacy_lines = f.readlines()
missing_funcs = ''.join(legacy_lines[3561:3604])
with open('app/routes_core.py', 'r', encoding='utf-8') as f:
    core_content = f.read()
core_content = core_content.replace(
    'async def startup_event_db_and_email():',
    missing_funcs + '\nasync def startup_event_db_and_email():'
)
with open('app/routes_core.py', 'w', encoding='utf-8') as f:
    f.write(core_content)

print('4. Adding from app.routes_models import * to all split files...')
split_dir = 'app/routes_split'
for fn in os.listdir(split_dir):
    if not fn.endswith('.py') or fn == '__init__.py':
        continue
    path = os.path.join(split_dir, fn)
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    if 'from app.routes_models import *' not in content:
        content = content.replace(
            'from app.routes_core import (', 
            'from app.routes_models import *\nfrom app.routes_core import ('
        )
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)

print('5. Running fix_imports.py to resolve cross-dependencies...')
os.system('python fix_imports.py')
print('Pipeline complete!')
