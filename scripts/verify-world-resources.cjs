#!/usr/bin/env node
// Compile the real presentation selection rules without Unity; never report a skip as a pass.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
for (const command of ['mcs', 'mono']) {
  const check = spawnSync(command, ['--version'], { encoding: 'utf8' });
  if (check.error || check.status !== 0) {
    console.error(`BLOCKED: ${command} is required for resource selection tests. Install mono-mcs and mono-runtime.`);
    process.exit(2);
  }
}
function collect(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? collect(path.join(dir, e.name)) : e.name.endsWith('.cs') ? [path.join(dir, e.name)] : []);
}
const unity = path.join(root, 'unity/Assets/Isoperia');
const sources = [...collect(path.join(unity, 'Core/Runtime')),
  path.join(unity, 'Unity/Runtime/WorldResourceRegistry.cs'),
  path.join(unity, 'Unity/Runtime/WorldResourceSelection.cs'),
  path.join(unity, 'Unity/Tests/WorldResourceSelectionTests.cs'),
  path.join(root, 'tools/parity/NUnitShim.cs')];
fs.mkdirSync(path.join(root, '.parity'), { recursive: true });
const exe = path.join(root, '.parity/world-resources.exe');
const build = spawnSync('mcs', ['-out:' + exe, '-optimize+', '-langversion:latest', ...sources], { cwd: root, encoding: 'utf8' });
process.stdout.write((build.stdout || '') + (build.stderr || ''));
if (build.status !== 0) process.exit(1);
const run = spawnSync('mono', [exe], { cwd: root, encoding: 'utf8' });
process.stdout.write((run.stdout || '') + (run.stderr || ''));
process.exit(run.status === 0 ? 0 : 1);
