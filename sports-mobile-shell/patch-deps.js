const fs = require('fs');
const path = require('path');

// 1. Patch react-native-screens and all its subpackages
const rnsDir = path.join(__dirname, 'node_modules/react-native-screens');
function fixScreens(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== 'node_modules') {
      const p = path.join(full, 'package.json');
      if (fs.existsSync(p)) {
        try {
          const j = JSON.parse(fs.readFileSync(p, 'utf8'));
          let changed = false;
          if (j['react-native']) {
            delete j['react-native'];
            changed = true;
          }
          if (j['source']) {
            delete j['source'];
            changed = true;
          }
          if (changed) {
            fs.writeFileSync(p, JSON.stringify(j, null, 2), 'utf8');
            console.log('[patch-deps] Patched ' + p);
          }
        } catch (e) {
          console.error(e);
        }
      }
      fixScreens(full);
    }
  }
}

// Fix main react-native-screens package.json
const rnsMainPkg = path.join(rnsDir, 'package.json');
if (fs.existsSync(rnsMainPkg)) {
  try {
    const j = JSON.parse(fs.readFileSync(rnsMainPkg, 'utf8'));
    let changed = false;
    if (j['react-native']) {
      delete j['react-native'];
      changed = true;
    }
    if (j['source']) {
      delete j['source'];
      changed = true;
    }
    if (changed) {
      fs.writeFileSync(rnsMainPkg, JSON.stringify(j, null, 2), 'utf8');
      console.log('[patch-deps] Patched ' + rnsMainPkg);
    }
  } catch (e) {
    console.error(e);
  }
}
fixScreens(rnsDir);

// 2. Patch react-native-reanimated
const reanimatedPkg = path.join(__dirname, 'node_modules/react-native-reanimated/package.json');
if (fs.existsSync(reanimatedPkg)) {
  try {
    const j = JSON.parse(fs.readFileSync(reanimatedPkg, 'utf8'));
    let changed = false;
    if (j['react-native'] === 'src/index') {
      j['react-native'] = 'lib/module/index';
      changed = true;
    }
    if (j['source'] === 'src/index') {
      j['source'] = 'lib/module/index';
      changed = true;
    }
    if (changed) {
      fs.writeFileSync(reanimatedPkg, JSON.stringify(j, null, 2), 'utf8');
      console.log('[patch-deps] Patched ' + reanimatedPkg);
    }
  } catch (e) {
    console.error(e);
  }
}
console.log('[patch-deps] Dependency patching complete.');
