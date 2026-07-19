import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist", "coverage", "node_modules"] },

  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      // typeChecked pulls real type information into the linter, so rules like
      // no-floating-promises and no-misused-promises can actually fire. Costs a
      // few seconds per run; worth it in an app that is mostly async I/O.
      ...tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // Unused args are fine when prefixed with _ — used for signature-shaped
      // callbacks (e.g. a fetch spy that must accept url/init it never reads).
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],

      // The app deliberately renders backend-supplied HTML via innerHTML in
      // HtmlVisual; flagging every template string as unsafe would drown the
      // signal. Keep the explicit-any ban, which is what actually matters here.
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  // Test files: relax the rules that fight with mocking.
  {
    files: ["**/*.test.{ts,tsx}", "src/test/**"],
    rules: {
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },

  // Config files run in Node, not the browser.
  {
    files: ["*.config.{js,ts}"],
    languageOptions: { globals: globals.node },
  },

  // Must stay last — turns off every stylistic rule Prettier owns.
  prettier,
);
