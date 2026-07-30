import re

with open("backend/app/routes_core.py", "r", encoding="utf-8") as f:
    content = f.read()

# We will remove router = APIRouter() and all @router.* functions.
# The functions are at the top level. We can split by '\n@router.' and process.

lines = content.split('\n')
new_lines = []
in_router_func = False

for line in lines:
    if line.startswith('@router.'):
        in_router_func = True
        continue
    
    if in_router_func:
        # If the line starts with def, we are still inside the function signature
        # If the line starts with whitespace, it's the body
        # If it's empty, it's a blank line
        # If it starts with anything else, it's the next top-level item!
        if not (line.startswith(' ') or line.startswith('\t') or line.startswith('def ') or line.strip() == '' or line.startswith('@')):
            in_router_func = False
    
    if not in_router_func:
        # Also skip router = APIRouter()
        if line.strip() == "router = APIRouter()":
            continue
        new_lines.append(line)

with open("backend/app/routes_core.py", "w", encoding="utf-8") as f:
    f.write('\n'.join(new_lines))

print("Cleaned up routes_core.py")
