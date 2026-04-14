#!/usr/bin/env python3
"""
Bulk replace all hardcoded http://localhost:5000 references in the frontend
with window.API_BASE_URL so the backend URL can be configured in one place.

This script:
1. Ensures every .html file includes <script src="api-config.js"></script>
2. Replaces all hardcoded localhost:5000 URLs in JS code with API_BASE_URL
3. Handles HTML attribute contexts (form action=) by setting them via JS
"""

import os
import re
import glob

FRONTEND_DIR = os.path.dirname(os.path.abspath(__file__))

# Files to skip (this script itself, config file, and non-relevant files)
SKIP_FILES = {
    'replace_localhost.py',
    'temp_replace.py',
    'fix_tags.py',
    'api-config.js',
    'frontend-server.js',  # This just logs its own URL, not the backend
    'package.json',
    'package-lock.json',
    '.gitignore',
}

def add_api_config_script(content, filename):
    """Add <script src="api-config.js"></script> if not already present."""
    if 'api-config.js' in content:
        return content
    
    # Insert right after the first <head> tag (or after meta tags)
    # Look for the first <script or <link tag in <head> and insert before it
    head_match = re.search(r'(<head[^>]*>)', content, re.IGNORECASE)
    if head_match:
        insert_pos = head_match.end()
        # Find the next line after <head>
        next_newline = content.find('\n', insert_pos)
        if next_newline != -1:
            content = content[:next_newline + 1] + '    <script src="api-config.js"></script>\n' + content[next_newline + 1:]
        else:
            content = content[:insert_pos] + '\n    <script src="api-config.js"></script>' + content[insert_pos:]
    
    return content


def replace_localhost_in_js(content):
    """Replace http://localhost:5000 patterns in JavaScript code."""

    # --- Pattern 1: Inside template literals (backtick strings) ---
    # e.g., `http://localhost:5000/api/something` -> `${window.API_BASE_URL}/api/something`
    # e.g., `${...}http://localhost:5000/...` -> `${...}${window.API_BASE_URL}/...`
    content = content.replace('http://localhost:5000', '${window.API_BASE_URL}')
    
    return content


def fix_form_actions(content):
    """
    Fix <form action="http://localhost:5000/..."> by removing the action
    and adding JS to set it dynamically.
    """
    # Pattern: action="http://localhost:5000/..."
    # We need to replace with a dynamic action set via JS
    pattern = r'action="\$\{window\.API_BASE_URL\}(/[^"]*)"'
    
    def replace_action(match):
        path = match.group(1)
        return f'action="#" data-api-path="{path}"'
    
    new_content = re.sub(pattern, replace_action, content)
    
    # If we made replacements, add a script to set the form actions dynamically
    if new_content != content:
        # Add a script before </body> to set form actions
        form_action_script = """
    <script>
        // Dynamically set form actions from api-config
        document.querySelectorAll('form[data-api-path]').forEach(form => {
            form.action = window.API_BASE_URL + form.dataset.apiPath;
        });
    </script>"""
        
        body_close = new_content.rfind('</body>')
        if body_close != -1:
            new_content = new_content[:body_close] + form_action_script + '\n' + new_content[body_close:]
    
    return new_content


def fix_double_interpolation(content):
    """
    Fix cases where we end up with nested template literals like:
    '${window.API_BASE_URL}' (inside single quotes) which is wrong.
    Should be: window.API_BASE_URL + '/path'
    """
    # Pattern: single-quoted strings containing ${window.API_BASE_URL}
    # e.g., 'http://localhost:5000' became '${window.API_BASE_URL}'
    # This should be window.API_BASE_URL (no quotes)
    
    # Fix: '${window.API_BASE_URL}/path...' -> window.API_BASE_URL + '/path...'
    pattern = r"'\$\{window\.API_BASE_URL\}(/[^']*)'"
    content = re.sub(pattern, r"window.API_BASE_URL + '\1'", content)
    
    # Fix: '${window.API_BASE_URL}' (alone) -> window.API_BASE_URL
    content = content.replace("'${window.API_BASE_URL}'", "window.API_BASE_URL")
    
    # Fix: "${window.API_BASE_URL}/path..." -> window.API_BASE_URL + "/path..."
    # (in double-quoted strings, NOT template literals)
    pattern = r'"\$\{window\.API_BASE_URL\}(/[^"]*)"'
    
    def fix_double_quoted(match):
        path = match.group(1)
        # Check if this is inside a template literal by looking backwards for backtick
        return f'window.API_BASE_URL + "{path}"'
    
    # Only fix double-quoted strings that are NOT inside template literals
    # We need to be careful here - only fix when it's clearly a regular string
    # Look for patterns like: fetch("${window.API_BASE_URL}/...") 
    # These should become: fetch(window.API_BASE_URL + "/...")
    # But `...${window.API_BASE_URL}/...` should stay as is (template literal)
    
    lines = content.split('\n')
    fixed_lines = []
    for line in lines:
        # Check if the line has a double-quoted ${window.API_BASE_URL} pattern
        if '"${window.API_BASE_URL}' in line:
            # Check if it's inside a template literal (backtick context)
            # Count unescaped backticks before this pattern
            idx = line.find('"${window.API_BASE_URL}')
            prefix = line[:idx]
            backtick_count = prefix.count('`') - prefix.count('\\`')
            
            if backtick_count % 2 == 0:
                # Not inside a template literal - fix it
                line = re.sub(
                    r'"\$\{window\.API_BASE_URL\}(/[^"]*)"',
                    lambda m: f'window.API_BASE_URL + "{m.group(1)}"',
                    line
                )
                # Also fix standalone "${window.API_BASE_URL}"
                line = line.replace('"${window.API_BASE_URL}"', 'window.API_BASE_URL')
        
        fixed_lines.append(line)
    
    content = '\n'.join(fixed_lines)
    
    return content


def process_file(filepath):
    """Process a single file to replace localhost references."""
    filename = os.path.basename(filepath)
    
    if filename in SKIP_FILES:
        return False
    
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        original = f.read()
    
    if 'localhost:5000' not in original and 'localhost' not in original:
        return False
    
    content = original
    
    # For HTML files, ensure api-config.js is included
    if filename.endswith('.html'):
        content = add_api_config_script(content, filename)
    
    # Replace localhost:5000 in JS/HTML
    content = replace_localhost_in_js(content)
    
    # Fix form actions (HTML attributes can't use JS template literals)
    if filename.endswith('.html'):
        content = fix_form_actions(content)
    
    # Fix double interpolation issues (${...} inside regular strings)
    content = fix_double_interpolation(content)
    
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    
    return False


def main():
    modified_files = []
    
    # Process all HTML files
    for filepath in glob.glob(os.path.join(FRONTEND_DIR, '*.html')):
        if process_file(filepath):
            modified_files.append(os.path.basename(filepath))
    
    # Process all JS files
    for filepath in glob.glob(os.path.join(FRONTEND_DIR, '*.js')):
        if process_file(filepath):
            modified_files.append(os.path.basename(filepath))
    
    print(f"\n✅ Modified {len(modified_files)} files:")
    for f in sorted(modified_files):
        print(f"   - {f}")
    
    print(f"\n📋 To change the backend URL, edit api-config.js and set the BACKEND_URL variable.")


if __name__ == '__main__':
    main()
