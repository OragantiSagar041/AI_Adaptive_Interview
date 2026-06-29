import os
import re

def is_top_level_def(line):
    if not line.strip(): return False
    if line.startswith(' ') or line.startswith('\t'): return False
    
    keywords = ['class ', 'def ', 'async def ', '@app.', '@router.', 'app = ', 'router = ', 'client = ', 'db = ', 'sqlite_conn =', 'pwd_context =', 'oauth2_scheme =', 'API_KEY_NAME =', 'api_key_header =']
    for kw in keywords:
        if line.startswith(kw):
            return True
            
    if 'collection =' in line or '_collection =' in line:
        return True
    
    if re.match(r'^[A-Za-z0-9_]+\s*=', line):
        return True
        
    return False

def parse_blocks(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    blocks = []
    current_block = []
    current_type = 'unknown'
    
    for line in lines:
        if line.startswith('import ') or line.startswith('from '):
            if current_block and current_type != 'import':
                blocks.append({'type': current_type, 'lines': current_block})
                current_block = []
            current_type = 'import'
            current_block.append(line)
        elif is_top_level_def(line):
            if current_block:
                blocks.append({'type': current_type, 'lines': current_block})
            current_block = [line]
            
            if line.startswith('class ') and '(BaseModel)' in line:
                current_type = 'model'
            elif line.startswith('@app.') or line.startswith('@app.exception_handler'):
                current_type = 'route'
            elif 'collection =' in line or '_collection =' in line or line.startswith('client =') or line.startswith('sqlite_conn =') or line.startswith('db ='):
                current_type = 'db'
            elif line.startswith('def ') or line.startswith('async def '):
                # Is it a route without @app.? Usually routes have @app above them.
                # If a def is caught here, it didn't have an @app directly above it (maybe spaces)
                current_type = 'service'
            elif line.startswith('app = '):
                current_type = 'app_init'
            else:
                current_type = 'misc'
        else:
            # If we are in a route block but see a def, it's the def for that route.
            if current_type == 'route' and (line.startswith('def ') or line.startswith('async def ')):
                pass # keep it route
            current_block.append(line)
            
    if current_block:
        blocks.append({'type': current_type, 'lines': current_block})
        
    return blocks

def generate_refactored(blocks, output_dir):
    os.makedirs(output_dir, exist_ok=True)
    
    # 1. Gather all imports
    imports = []
    for b in blocks:
        if b['type'] == 'import':
            imports.extend(b['lines'])
    
    # Filter out local imports that might break
    imports_str = "".join(imports)
    
    # 2. Extract specific components
    models = []
    db = []
    services = []
    routes = []
    misc = []
    app_init = []
    
    for b in blocks:
        if b['type'] == 'model':
            models.extend(b['lines'])
        elif b['type'] == 'db':
            db.extend(b['lines'])
        elif b['type'] == 'service':
            services.extend(b['lines'])
        elif b['type'] == 'route':
            routes.extend(b['lines'])
        elif b['type'] == 'app_init':
            app_init.extend(b['lines'])
        elif b['type'] == 'misc':
            misc.extend(b['lines'])
            
    # Write models.py
    with open(os.path.join(output_dir, 'models.py'), 'w', encoding='utf-8') as f:
        f.write(imports_str + "\n\n")
        f.write("".join(models))
        
    # Write database.py
    with open(os.path.join(output_dir, 'database.py'), 'w', encoding='utf-8') as f:
        f.write(imports_str + "\n")
        f.write("from .models import *\n\n")
        f.write("".join(db))
        
    # Write config.py (misc constants)
    with open(os.path.join(output_dir, 'config.py'), 'w', encoding='utf-8') as f:
        f.write(imports_str + "\n")
        f.write("from .models import *\nfrom .database import *\n\n")
        f.write("".join(misc))
        
    # Write services.py
    with open(os.path.join(output_dir, 'services.py'), 'w', encoding='utf-8') as f:
        f.write(imports_str + "\n")
        f.write("from .models import *\nfrom .database import *\nfrom .config import *\n\n")
        f.write("".join(services))
        
    # Write routes.py
    with open(os.path.join(output_dir, 'routes.py'), 'w', encoding='utf-8') as f:
        f.write(imports_str + "\n")
        f.write("from fastapi import APIRouter\n")
        f.write("from .models import *\nfrom .database import *\nfrom .config import *\nfrom .services import *\n\n")
        f.write("router = APIRouter()\n\n")
        
        route_content = "".join(routes)
        # Convert @app. to @router.
        route_content = route_content.replace("@app.", "@router.")
        f.write(route_content)
        
    # Write main.py
    with open(os.path.join(output_dir, 'main.py'), 'w', encoding='utf-8') as f:
        f.write(imports_str + "\n")
        f.write("from fastapi import FastAPI\n")
        f.write("from fastapi.middleware.cors import CORSMiddleware\n")
        f.write("from .database import *\nfrom .config import *\nfrom .routes import router\n\n")
        
        app_init_content = "".join(app_init)
        if not app_init_content:
            app_init_content = "app = FastAPI()\n"
        
        f.write(app_init_content + "\n")
        f.write("app.include_router(router)\n")
        
    print("Refactoring complete! Output in:", output_dir)

if __name__ == "__main__":
    blocks = parse_blocks('main.py')
    generate_refactored(blocks, 'app')
