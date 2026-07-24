import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// Flat config (ESLint 9+/10). Lints the React/TS front end only; the Rust side
// under src-tauri is checked by cargo/clippy, and build output is ignored.
export default tseslint.config(
  {
    ignores: ["dist", "src-tauri", "coverage", "node_modules"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat["recommended-latest"],
    ],
    languageOptions: {
      ecmaVersion: 2021,
      globals: globals.browser,
    },
    plugins: {
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // react-hooks 7 ships React-Compiler-era rules that flag intentional
      // patterns in the canvas code — after-mount flags, "latest value" refs
      // written during render, and ref reads passed to children. These are
      // deliberate and correct here, so we keep rules-of-hooks + exhaustive-deps
      // but opt out of these two advisory rules.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
    },
  },
  {
    // Config and test files also run in Node and (for tests) under Vitest.
    files: ["**/*.config.{ts,js}", "**/*.test.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
);
