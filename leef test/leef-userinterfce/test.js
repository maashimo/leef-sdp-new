const fs = require('fs');
const html = fs.readFileSync('frontend/customer-dashboard.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);

if (scriptMatch) {
    const code = scriptMatch[1];
    try {
        require('vm').Script(code);
        console.log("Syntax is VALID");
    } catch (e) {
        console.error("Syntax Error found in the generated script block:");
        console.error(e);
    }
} else {
    console.log("No script tag found");
}
