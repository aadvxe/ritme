import tseslint from "typescript-eslint";

export default tseslint.config(...tseslint.configs.recommended, {
  rules: {
    // Boundary: design must stay UI-only.
    "no-restricted-imports": ["error", { patterns: ["@ritme/api-client", "firebase*", "@google/*"] }],
  },
});
