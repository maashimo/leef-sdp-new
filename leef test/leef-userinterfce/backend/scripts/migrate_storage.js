const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'frontend');
const files = fs.readdirSync(dir);

let replacements = 0;

files.forEach(file => {
  if (file.endsWith('.html') || file.endsWith('.js')) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;

    // Replace user
    content = content.replace(/localStorage\.setItem\((['"])user\1/g, "sessionStorage.setItem($1user$1");
    content = content.replace(/localStorage\.getItem\((['"])user\1/g, "sessionStorage.getItem($1user$1");
    content = content.replace(/localStorage\.removeItem\((['"])user\1/g, "sessionStorage.removeItem($1user$1");

    // Replace token
    content = content.replace(/localStorage\.setItem\((['"])token\1/g, "sessionStorage.setItem($1token$1");
    content = content.replace(/localStorage\.getItem\((['"])token\1/g, "sessionStorage.getItem($1token$1");
    content = content.replace(/localStorage\.removeItem\((['"])token\1/g, "sessionStorage.removeItem($1token$1");

    // Replace shorthand
    content = content.replace(/localStorage\.user/g, "sessionStorage.user");
    content = content.replace(/localStorage\.token/g, "sessionStorage.token");

    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      replacements++;
      console.log(`Updated ${file}`);
    }
  }
});
console.log(`Replaced in ${replacements} files`);
