// Syncs manifest.json version to package.json version and stages the change for commit.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = __dirname ? path.resolve(__dirname, '..') : process.cwd();
const pkgPath = path.join(root, 'package.json');
const manifestPath = path.join(root, 'manifest.json');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (!pkg.version) {
  console.error('package.json has no version field.');
  process.exit(1);
}

manifest.version = pkg.version;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(`Synchronized manifest.json version to ${pkg.version}`);

// Stage the change so that `npm version` commit includes it
try {
  cp.execSync(`git add ${JSON.stringify(path.relative(root, manifestPath))}`, { stdio: 'inherit' });
} catch (e) {
  console.warn('Warning: failed to stage manifest.json change. You may need to commit it manually.');
}
