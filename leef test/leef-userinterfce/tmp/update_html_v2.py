import os
import re

frontend_dir = r'c:\Users\User\Desktop\leef new\leef test\leef-userinterfce\frontend'

# 1. Regex to find the end of the head tag for script injection
head_end_regex = re.compile(r'(</head>)', re.IGNORECASE)

# 2. Regex to replace literal http://localhost:5000 with window.API_BASE_URL
# It handles both "http://localhost:5000/..." and `http://localhost:5000/...`
local_url_regex = re.compile(r'http://localhost:5000', re.IGNORECASE)

files_updated = 0

for filename in os.listdir(frontend_dir):
    if filename.endswith('.html'):
        filepath = os.path.join(frontend_dir, filename)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
        except UnicodeDecodeError:
            with open(filepath, 'r', encoding='latin-1') as f:
                content = f.read()

        new_content = content
        
        # Inject the script if not already present
        if 'src="api-config.js"' not in content:
            new_content = head_end_regex.sub(r'    <script src="api-config.js"></script>\n\1', new_content)
        
        # Replace all localhost:5000 occurrences
        # We replace "http://localhost:5000" with a reference to the global variable
        # If it's inside a string "", it becomes " + window.API_BASE_URL + "
        # If it's inside `, it becomes ${window.API_BASE_URL}
        
        # A simpler way: since window.API_BASE_URL is a string, we can use a temporary placeholder
        # and then clean up.
        
        # Let's use a more tactical replacement for template literals vs normal strings
        
        # 1. Handle template literals: `http://localhost:5000/...` -> `${window.API_BASE_URL}/...`
        new_content = re.sub(r'`http://localhost:5000', r'`${window.API_BASE_URL}', new_content)
        
        # 2. Handle double quotes: "http://localhost:5000/..." -> window.API_BASE_URL + "/..."
        # This is tricky because of the closing quote.
        # Let's try to just replace the literal string with the variable name where it makes sense, 
        # or just assume window.API_BASE_URL is available.
        
        # Actually, the most reliable way to fix the code without breaking syntax is:
        # Replace all "http://localhost:5000" with window.API_BASE_URL but only if it's the WHOLE string or used in concatenation.
        
        # Let's try replacing the literal "http://localhost:5000" with a template-friendly version if it's in a string.
        # But wait, if I just replace 'http://localhost:5000' with something that works in both, like:
        # (window.API_BASE_URL || 'http://localhost:5000')
        
        # Let's do a simple string replacement for the most common patterns:
        new_content = new_content.replace('"http://localhost:5000', 'window.API_BASE_URL + "')
        new_content = new_content.replace("'http://localhost:5000", "window.API_BASE_URL + '")
        
        # Cleanup double concatenation like window.API_BASE_URL + "/"
        # And handle cases where it was just the URL: "http://localhost:5000" -> window.API_BASE_URL
        new_content = new_content.replace('window.API_BASE_URL + ""', 'window.API_BASE_URL')
        new_content = new_content.replace("window.API_BASE_URL + ''", "window.API_BASE_URL")

        if new_content != content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            files_updated += 1
            print(f"Updated: {filename}")

print(f"\nTotal files updated: {files_updated}")
