const fs = require('fs');
const path = require('path');

const frontendDir = path.join(__dirname, 'frontend');

if (!fs.existsSync(frontendDir)) {
    console.error("Frontend directory not found!");
    process.exit(1);
}

const files = fs.readdirSync(frontendDir).filter(f => f.endsWith('.html'));
console.log(`Found ${files.length} HTML files.`);

let updatedCount = 0;

files.forEach(file => {
    const filePath = path.join(frontendDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    // Replace http://localhost:5000 with window.API_BASE_URL
    // We handle it as a direct replacement first
    content = content.replace(/http:\/\/localhost:5000/g, 'window.API_BASE_URL');

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
