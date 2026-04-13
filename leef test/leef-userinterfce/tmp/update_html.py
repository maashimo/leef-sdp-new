import os
import re

frontend_dir = r'c:\Users\User\Desktop\leef new\leef test\leef-userinterfce\frontend'

# 1. Regex to find the end of the head tag
head_end_regex = re.compile(r'(</head>)', re.IGNORECASE)

# 2. Regex to find the API constant definition
# Matches: const API = 'http://localhost:5000' or similar
api_regex = re.compile(r'const\s+API\s*=\s*[\'"]http://localhost:5000[\'"]\s*;?', re.IGNORECASE)

files_updated = 0

for filename in os.listdir(frontend_dir):
    if filename.endswith('.html'):
        filepath = os.path.join(frontend_dir, filename)
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        new_content = content
        
        # Inject the script if not already present
        if 'src="api-config.js"' not in content:
            new_content = head_end_regex.sub(r'    <script src="api-config.js"></script>\n\1', new_content)
        
        # Replace the API constant
        if api_regex.search(new_content):
            new_content = api_regex.sub('const API = window.API_BASE_URL || "http://localhost:5000";', new_content)
            
        if new_content != content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            files_updated += 1
            print(f"Updated: {filename}")

print(f"\nTotal files updated: {files_updated}")
