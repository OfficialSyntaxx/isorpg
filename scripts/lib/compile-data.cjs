// Compiles src/data (plus the bits it needs) to CommonJS so Node can require it.
//
// Two consumers depend on this: scripts/gen-wiki.cjs, which renders WIKI.md, and
// scripts/export-content.cjs, which emits the JSON the Unity build loads. They
// share this module rather than each carrying a copy, because the whole point of
// both is that the wiki, the game and the port cannot disagree about the data.
// Two compile configs that drift is the one way to reintroduce that.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");

/**
 * @param {string} emitDir absolute path to write the compiled output into
 * @returns {(module: string) => any} require a compiled module, e.g. D("Items.js")
 */
function compileData(emitDir) {
  fs.rmSync(emitDir, { recursive: true, force: true });
  fs.mkdirSync(emitDir, { recursive: true });

  const tsconfig = path.join(emitDir, "tsconfig.json");
  fs.writeFileSync(tsconfig, JSON.stringify({
    compilerOptions: {
      target: "ES2020", module: "CommonJS", moduleResolution: "Node",
      esModuleInterop: true, skipLibCheck: true, lib: ["ES2020", "DOM"],
      // rootDir pinned so emitted paths are predictable — tsc otherwise infers
      // it from the input set and the output layout shifts as imports change.
      rootDir: path.join(ROOT, "src"), outDir: ".", noEmit: false,
      strict: false, declaration: false,
    },
    include: [path.join(ROOT, "src/data/**/*.ts"), path.join(ROOT, "src/components/Skills.ts")],
  }, null, 2));

  execFileSync("npx", ["tsc", "-p", tsconfig], { cwd: ROOT, stdio: "pipe" });
  fs.writeFileSync(path.join(emitDir, "package.json"), '{"type":"commonjs"}');

  return (m) => require(path.join(emitDir, "data", m));
}

module.exports = { compileData, ROOT };
