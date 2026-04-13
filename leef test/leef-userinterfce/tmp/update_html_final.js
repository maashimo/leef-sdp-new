const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();
const frontendDir = path.join(rootDir, 'frontend');

console.log(`Searching in: ${frontendDir}`);

if (!fs.existsSync(frontendDir)) {
    console.error("Frontend directory not found!");
    process.exit(1);
}

// FIXED: endsWith instead of endswith
const files = fs.readdirSync(frontendDir).filter(f => f.endsWith('.html'));
console.log(`Found ${files.length} HTML files.`);

let updatedCount = 0;

files.forEach(file => {
    const filePath = path.join(frontendDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    // Pattern 1: Template literal substitution
    content = content.replace(/`http:\/\/localhost:5000(\/.*?)`/g, '`${window.API_BASE_URL}$1`');
    
    // Pattern 2: Multi-line strings or direct strings
    content = content.replace(/"http:\/\/localhost:5000(\/.*?)"/g, 'window.API_BASE_URL + "$1"');
    content = content.replace(/'http:\/\/localhost:5000(\/.*?)'/g, "window.API_BASE_URL + '$1'");

    // Pattern 3: Remaining literal matches
    content = content.replace(/http:\/\/localhost:5000/g, 'window.API_BASE_URL');

    // Pattern 4: Cleanup window.API_BASE_URL + ""
    content = content.replace(/window\.API_BASE_URL \+ ""/g, 'window.API_BASE_URL');
    content = content.replace(/window\.API_BASE_URL \+ ''/g, 'window.API_BASE_URL');

    // Inject api-config.js if not present
    if (!content.includes('api-config.js')) {
        content = content.replace(/<\/head>/i, '    <script src="api-config.js"></script>\n</head>');
    }

    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated: ${file}`);
        updatedCount++;
    }
});

console.log(`\nTotal files updated: ${updatedCount}`);
