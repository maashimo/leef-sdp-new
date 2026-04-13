const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();
const frontendDir = path.join(rootDir, 'frontend');

if (!fs.existsSync(frontendDir)) {
    console.error("Frontend directory not found!");
    process.exit(1);
}

const files = fs.readdirSync(frontendDir).filter(f => f.endsWith('.html'));
console.log(`Found ${files.length} HTML files.`);

files.forEach(file => {
    const filePath = path.join(frontendDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    // Pattern 1: "http://localhost:5000/api/..." -> window.API_BASE_URL + "/api/..."
    content = content.replace(/"http:\/\/localhost:5000(\/.*?)"/g, 'window.API_BASE_URL + "$1"');
    
    // Pattern 2: 'http://localhost:5000/api/...' -> window.API_BASE_URL + '/api/...'
    content = content.replace(/'http:\/\/localhost:5000(\/.*?)'/g, "window.API_BASE_URL + '$1'");

    // Pattern 3: `http://localhost:5000/api/...` -> `${window.API_BASE_URL}/api/...`
    content = content.replace(/`http:\/\/localhost:5000(\/.*?)`/g, '`${window.API_BASE_URL}$1`');

    // Pattern 4: any remaining http://localhost:5000 that wasn't caught (e.g. without trailing slash)
    content = content.replace(/http:\/\/localhost:5000/g, 'window.API_BASE_URL');

    // Inject api-config.js if not present
    if (!content.includes('api-config.js')) {
        content = content.replace(/<\/head>/i, '    <script src="api-config.js"></script>\n</head>');
    }

    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated: ${file}`);
    }
});
