import os

files = [
    os.path.join('Front-end', 'src', 'hooks', 'useProctoring.js'),
    os.path.join('Front-end', 'src', 'workers', 'proctoring.worker.js')
]

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replace the escaped single quote sequence
    content = content.replace('\\\'', '\'')
    
    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)

print('Fixed quotes in both files!')
