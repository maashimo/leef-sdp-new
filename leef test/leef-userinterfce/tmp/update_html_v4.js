const fs = require('fs');
const path = require('path');

// Root is the current working directory from where we run the script
const rootDir = process.cwd();
const frontendDir = path.join(rootDir, 'frontend');

console.log(`Searching in: ${frontendDir}`);

if (!fs.existsSync(frontendDir)) {
    console.error("Frontend directory not found!");
    process.exit(1);
}

const files = fs.readdirSync(frontendDir).filter(f => f.endswith('.html'));
console.log(`Found ${files.length} HTML files.`);

let updatedCount = 0;

files.forEach(file => {
    const filePath = path.join(frontendDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    // Replace http://localhost:5000 with window.API_BASE_URL
    // Pattern 1: template literal `http://localhost:5000/path` -> `${window.API_BASE_URL}/path`
    content = content.replace(/`http:\/\/localhost:5000/g, '`${window.API_BASE_URL}');
    
    // Pattern 2: string "http://localhost:5000/path" -> window.API_BASE_URL + "/path"
    // We replace the literal string with the variable and concatenate
    content = content.replace(/"http:\/\/localhost:5000/g, 'window.API_BASE_URL + "');
    content = content.replace(/'http:\/\/localhost:5000/g, "window.API_BASE_URL + '");

    // Cleanup: window.API_BASE_URL + "/..." remains as is. 
    // If it was just the URL "http://localhost:5000" it becomes window.API_BASE_URL + ""
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
