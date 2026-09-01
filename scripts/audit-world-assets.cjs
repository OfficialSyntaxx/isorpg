#!/usr/bin/env node
// Source integrity only. Imported shaders, silhouettes and animation require Unity.
const fs = require('node:fs');
const path = require('node:path');

function walk(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(e => e.isDirectory() ? walk(path.join(root, e.name)) : [path.join(root, e.name)]);
}

function inspectModel(file) {
  const buffer = fs.readFileSync(file);
  const header = buffer.subarray(0, 200).toString('utf8');
  if (header.startsWith('version https://git-lfs.github.com/spec/v1')) return ['Unresolved Git LFS pointer'];
  if (!buffer.length) return ['Empty model file'];
  const ext = path.extname(file).toLowerCase();
  if (ext === '.fbx' && !header.includes('FBX')) return ['Unrecognized FBX header'];
  if (ext !== '.glb') return [];
  if (buffer.length < 20 || buffer.toString('ascii', 0, 4) !== 'glTF') return ['Invalid GLB header'];
  if (buffer.readUInt32LE(4) !== 2) return ['Unsupported GLB version'];
  if (buffer.readUInt32LE(8) !== buffer.length) return ['GLB declared length differs from file'];
  let offset = 12, json = null;
  try {
    while (offset < buffer.length) {
      if (offset + 8 > buffer.length) throw new Error('Truncated GLB chunk header');
      const length = buffer.readUInt32LE(offset), type = buffer.readUInt32LE(offset + 4);
      if (length % 4 || offset + 8 + length > buffer.length) throw new Error('Invalid GLB chunk length');
      if (offset === 12) {
        if (type !== 0x4e4f534a) throw new Error('First GLB chunk is not JSON');
        json = JSON.parse(buffer.toString('utf8', offset + 8, offset + 8 + length));
      }
      offset += 8 + length;
    }
    if (!json || json.asset?.version !== '2.0') throw new Error('Missing glTF 2.0 asset metadata');
    for (const entry of [...(json.buffers || []), ...(json.images || [])]) {
      if (!entry.uri || entry.uri.startsWith('data:')) continue;
      if (/^https?:/.test(entry.uri)) throw new Error('External model dependency: ' + entry.uri);
      if (!fs.existsSync(path.resolve(path.dirname(file), decodeURIComponent(entry.uri))))
        throw new Error('Missing model dependency: ' + entry.uri);
    }
  } catch (error) { return [error.message]; }
  return [];
}

function audit(root) {
  const assets = path.join(root, 'unity/Assets');
  const files = walk(assets);
  const relative = file => path.relative(root, file).split(path.sep).join('/');
  const errors = [], guids = new Map(), resources = new Map(), models = [];
  for (const file of files) {
    if (file.endsWith('.meta')) {
      const guid = fs.readFileSync(file, 'utf8').match(/^guid: ([a-f0-9]{32})$/m)?.[1];
      if (guid) {
        if (guids.has(guid)) errors.push({ path: relative(file), problem: 'Duplicate GUID with ' + relative(guids.get(guid)) });
        guids.set(guid, file);
      }
      continue;
    }
    const rel = relative(file), resourceMarker = '/Resources/';
    if (rel.includes(resourceMarker)) {
      const key = rel.slice(rel.lastIndexOf(resourceMarker) + resourceMarker.length).replace(/\.[^/.]+$/, '');
      const entries = resources.get(key) || [];
      entries.push(file); resources.set(key, entries);
    }
    if (!/\.(fbx|glb|gltf|obj)$/i.test(file)) continue;
    const problems = inspectModel(file);
    if (!fs.existsSync(file + '.meta')) problems.push('Missing Unity .meta file');
    const resourcePath = rel.includes(resourceMarker)
      ? rel.slice(rel.lastIndexOf(resourceMarker) + resourceMarker.length).replace(/\.[^/.]+$/, '') : null;
    models.push({ path: rel, bytes: fs.statSync(file).size, resourcePath, problems });
    for (const problem of problems) errors.push({ path: rel, problem });
  }
  for (const [key, entries] of resources) {
    const modelEntries = entries.filter(f => /\.(fbx|glb|gltf|obj|prefab)$/i.test(f));
    if (modelEntries.length > 1) errors.push({ path: key, problem: 'Ambiguous GameObject Resources key' });
  }
  const references = new Map();
  const runtime = path.join(assets, 'Isoperia/Unity/Runtime');
  for (const file of walk(runtime).filter(f => f.endsWith('.cs'))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/"((?:Art|Materials|Textures|UI)\/[^"\r\n]+)"/g)) {
      if (match[1].endsWith('/') || match[1].endsWith('_')) continue;
      references.set(match[1], relative(file));
    }
    // Town contacts supply already-prefixed model IDs, so resolve the actual
    // concatenation instead of certifying the presence of an unused filename.
    const rootPath = source.match(/const string OwnedNpcRoot = "([^"]+)"/)?.[1];
    if (rootPath) for (const match of source.matchAll(/Create(?:Journey)?Npc\("[^"]+",\s*"[^"]+",\s*"([^"]+)"/g))
      references.set(rootPath + match[1], relative(file));
    const kitRoot = source.match(/const string AssetRoot = "(Art\/KenneyFantasyTown\/)"/)?.[1];
    if (kitRoot) {
      for (const match of source.matchAll(/(?:Place|TryPlaceTownKit)\("([^"/]+)"/g))
        references.set(kitRoot + match[1], relative(file));
      for (const match of source.matchAll(/PlaceKitPiece\([^,\n]+,\s*"([^"/]+)"/g))
        references.set(kitRoot + match[1], relative(file));
    }
  }
  for (const [key, file] of references)
    if (!resources.has(key)) errors.push({ path: file, problem: 'Missing Resources path: ' + key });
  return { scope: 'Model source integrity, GUID uniqueness, and discoverable literal Resources paths. Dynamic references, import results, materials, clips and visual approval require the Unity audit.',
    modelCount: models.length, resourceModelCount: models.filter(m => m.resourcePath).length,
    checkedResourceReferences: references.size, errors, models };
}

if (require.main === module) {
  const report = audit(path.resolve(__dirname, '..'));
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex >= 0) fs.writeFileSync(process.argv[outputIndex + 1], JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.modelCount} models; ${report.resourceModelCount} in Resources; ${report.checkedResourceReferences} resource references checked.`);
  for (const error of report.errors) console.error(`FAIL ${error.path}: ${error.problem}`);
  console.log(report.scope);
  process.exitCode = report.errors.length ? 1 : 0;
}
module.exports = { audit, inspectModel };
