const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { audit, inspectModel } = require('./audit-world-assets.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'isorpg-assets-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (relative, text) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text);
    return file;
  };
  return { root, write };
}

test('rejects unresolved LFS and malformed model payloads', t => {
  const { write } = fixture(t);
  assert.match(inspectModel(write('hero.glb', 'version https://git-lfs.github.com/spec/v1\n'))[0], /LFS/);
  assert.match(inspectModel(write('tree.fbx', 'not a model'))[0], /FBX/);
  assert.match(inspectModel(write('empty.glb', ''))[0], /Empty/);
});

test('validates GLB chunk boundaries and declared length', t => {
  const { write } = fixture(t);
  const raw = JSON.stringify({ asset: { version: '2.0' } });
  const json = Buffer.from(raw.padEnd(Math.ceil(raw.length / 4) * 4));
  const glb = Buffer.alloc(20 + json.length);
  glb.write('glTF'); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(json.length, 12); glb.writeUInt32LE(0x4e4f534a, 16); json.copy(glb, 20);
  assert.deepEqual(inspectModel(write('valid.glb', glb)), []);
  glb.writeUInt32LE(glb.length + 4, 8);
  assert.match(inspectModel(write('truncated.glb', glb))[0], /declared length/);
  glb.writeUInt32LE(glb.length, 8); glb.writeUInt32LE(json.length + 4, 12);
  assert.match(inspectModel(write('chunk.glb', glb))[0], /chunk length/);
});

test('flags missing metas, duplicate GUIDs and ambiguous model keys', t => {
  const { root, write } = fixture(t);
  write('unity/Assets/Resources/Art/tree.fbx', '; FBX 7.4.0');
  write('unity/Assets/Other/Resources/Art/tree.obj', 'v 0 0 0');
  write('unity/Assets/a.meta', 'guid: 0123456789abcdef0123456789abcdef\n');
  write('unity/Assets/b.meta', 'guid: 0123456789abcdef0123456789abcdef\n');
  const problems = audit(root).errors.map(e => e.problem).join('\n');
  assert.match(problems, /Missing Unity/); assert.match(problems, /Duplicate GUID/);
  assert.match(problems, /Ambiguous/);
});

test('resolves actual NPC prefixes and first-argument kit paths', t => {
  const { root, write } = fixture(t);
  write('unity/Assets/Resources/Art/OwnedModels/npc_ranger_kit.fbx', '; FBX 7.4.0');
  write('unity/Assets/Resources/Art/OwnedModels/npc_ranger_kit.fbx.meta', 'guid: 0123456789abcdef0123456789abcdef\n');
  write('unity/Assets/Resources/Art/KenneyFantasyTown/tree.fbx', '; FBX 7.4.0');
  write('unity/Assets/Resources/Art/KenneyFantasyTown/tree.fbx.meta', 'guid: 0123456789abcdef0123456789abcdee\n');
  const source = 'const string OwnedNpcRoot = "Art/OwnedModels/";\n' +
    'const string AssetRoot = "Art/KenneyFantasyTown/";\n' +
    'CreateNpc("Forester", "Hello", "npc_ranger_kit", pos, color);\n' +
    'Place("tree", "Scene_Instance_Name", pos);';
  const file = write('unity/Assets/Isoperia/Unity/Runtime/Town.cs', source);
  assert.deepEqual(audit(root).errors, []);
  fs.writeFileSync(file, source.replace('Art/OwnedModels/', 'Art/OwnedModels/npc_'));
  assert.match(audit(root).errors.map(e => e.problem).join('\n'), /npc_npc_ranger_kit/);
});
