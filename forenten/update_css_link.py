import os

base_path = r'c:\Users\sagar\Downloads\mock-interview - Copy (3)\forenten'
admin_file = os.path.join(base_path, 'admin.html')

with open(admin_file, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = lines[:21] + ['    <link rel="stylesheet" href="assets/css/admin-core.css">\n'] + lines[2418:]

with open(admin_file, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('Successfully updated admin.html to link admin-core.css')
