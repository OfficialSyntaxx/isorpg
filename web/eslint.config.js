// Flat config. Astro's plugin supplies the .astro parser and its recommended
// rules; typescript-eslint covers the .ts under src/lib.
//
// defineConfig from eslint/config rather than tseslint.config(), which is
// deprecated in typescript-eslint 8 and reported as a hint by `astro check`.
//
// Type-aware linting is deliberately NOT enabled: `astro check` already
// typechecks the whole project including .astro frontmatter, and running the
// type graph twice doubles CI time to re-report the same errors.
import { defineConfig, globalIgnores } from "eslint/config";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";

export default defineConfig([
  globalIgnores(["dist/**", ".astro/**", "node_modules/**", "src/styles/tokens.css"]),
  eslint.configs.recommended,
  tseslint.configs.recommended,
  astro.configs.recommended,
  {
    // public/ ships plain browser scripts, not modules bundled by Astro, so
    // eslint has no way to infer the environment from the file itself.
    files: ["public/**/*.js"],
    languageOptions: {
      globals: { window: "readonly", document: "readonly" },
    },
  },
  {
    rules: {
      // An unused variable prefixed with _ is an intentional placeholder.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]);
