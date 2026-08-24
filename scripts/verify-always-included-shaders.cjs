#!/usr/bin/env node
/**
 * Asserts URP/Lit stays pinned into the WebGL build.
 *
 * THE FAILURE THIS PREVENTS IS DEVICE-ONLY AND LOOKS LIKE AN UNRELATED CLEANUP.
 *
 * Eleven runtime views build their materials with
 *     new Material(Shader.Find("Universal Render Pipeline/Lit"))
 * A shader found that way has no tracked asset dependency, so a build keeps it
 * only if something else pulls it in.
 *
 * Something does, by accident: the four generated .mat assets reference URP/Lit,
 * and those are referenced only by the objects in Bootstrap.unity named
 * "legacy placeholder" — all of which are already deactivated. Deleting them is
 * an obviously harmless tidy-up. It would also strip URP/Lit from the build and
 * turn every runtime-created material magenta ON DEVICE ONLY: the Editor does
 * not strip shaders, so it would look perfect until someone opened the site.
 *
 * That is the same class of bug that already cost this project three deploy
 * cycles, and it would be even harder to find the second time, because the
 * commit that caused it would be about deleting placeholders.
 *
 * So: URP/Lit is listed explicitly in Always Included Shaders, and this asserts
 * the entry is still there. IsoperiaBuild.EnsureUrpLitIsAlwaysIncluded re-adds
 * it if ProjectSettings is ever regenerated.
 */
const fs = require("fs");

const GRAPHICS = "unity/ProjectSettings/GraphicsSettings.asset";

// URP's Lit.shader. Same guid the generated .mat assets use.
const URP_LIT_GUID = "933532a4fcc9baf4fa0491de14d08ed7";

let failures = 0;
const fail = (m) => { console.error(`FAIL  ${m}`); failures++; };
const pass = (m) => console.log(`PASS  ${m}`);

if (!fs.existsSync(GRAPHICS)) {
  console.log(`SKIP  ${GRAPHICS} not present (Unity project settings not generated yet).`);
  process.exit(0);
}

const text = fs.readFileSync(GRAPHICS, "utf8");
const block = text.match(/m_AlwaysIncludedShaders:\n((?:\s*- \{fileID:[^\n]*\n)*)/);

if (!block) {
  fail("m_AlwaysIncludedShaders not found in GraphicsSettings.asset");
} else if (!block[1].includes(URP_LIT_GUID)) {
  fail(
    `URP/Lit (guid ${URP_LIT_GUID}) is NOT in Always Included Shaders.\n` +
    "      Every runtime-created material would render magenta ON DEVICE once\n" +
    "      nothing else references the shader as an asset. Re-add it by running\n" +
    "      Isoperia/Configure render pipeline, or restore the entry by hand."
  );
} else {
  const n = (block[1].match(/- \{fileID:/g) || []).length;
  pass(`URP/Lit pinned in Always Included Shaders (${n} entries total)`);
}

// The pipeline must also actually be assigned, or URP shaders render magenta
// regardless of what is included. This is the bug that shipped a pink octagon.
if (/m_CustomRenderPipeline: \{fileID: 0\}/.test(text)) {
  fail("no render pipeline asset assigned (m_CustomRenderPipeline: {fileID: 0}) — " +
       "URP materials render magenta.");
} else {
  pass("a render pipeline asset is assigned");
}

const QUALITY = "unity/ProjectSettings/QualitySettings.asset";
if (fs.existsSync(QUALITY)) {
  const q = fs.readFileSync(QUALITY, "utf8");
  const unset = (q.match(/customRenderPipeline: \{fileID: 0\}/g) || []).length;
  if (unset > 0) {
    fail(`${unset} quality level(s) have no render pipeline — anyone landing on ` +
         `one of those sees magenta.`);
  } else {
    const levels = (q.match(/customRenderPipeline:/g) || []).length;
    pass(`all ${levels} quality levels have a render pipeline`);
  }
}

console.log(failures === 0 ? "\nshader pinning OK" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
