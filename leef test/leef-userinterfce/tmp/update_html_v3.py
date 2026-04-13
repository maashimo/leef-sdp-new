import os

frontend_dir = r'c:\Users\User\Desktop\leef new\leef test\leef-userinterfce\frontend'
print(f"Searching in: {frontend_dir}")

if not os.path.exists(frontend_dir):
    print("DIRECTORY NOT FOUND!")
else:
    files = [f for f in os.listdir(frontend_dir) if f.endswith('.html')]
    print(f"Found {len(files)} HTML files.")
    for f in files:
        filepath = os.path.join(frontend_dir, f)
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as file:
            content = file.read()
        
        new_content = content.replace('http://localhost:5000', 'window.API_BASE_URL')
        
        # Simple injection for api-config.js
        if 'api-config.js' not in new_content:
            new_content = new_content.replace('</head>', '    <script src="api-config.js"></script>\n</head>')
        
        if new_content != content:
            with open(filepath, 'w', encoding='utf-8') as file:
                file.write(new_content)
            print(f"Updated: {f}")
