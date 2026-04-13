const { execSync } = require('child_process');
const path = require('path');

function run(cmd) {
    console.log(`> Running: ${cmd}`);
    try {
        const out = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
        console.log(out);
        return true;
    } catch (e) {
        console.error(`FAILED: ${cmd}`);
        console.error(e.stdout || '');
        console.error(e.stderr || e.message);
        return false;
    }
}

process.chdir(__dirname); // Should be the root if script is there
console.log(`Current Dir: ${process.cwd()}`);

run('git add .');
run('git commit -m "Deployment readiness and Stripe integration updates"');
run('git push');
