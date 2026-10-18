import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "playwright-report", "test-results"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Boundary: the web app talks to the backend only through @ritme/api-client; no LLM SDKs or backend code.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@google/*",
            "@google-cloud/*",
            "openai",
            "@anthropic-ai/*",
            "**/apps/backend/**",
            "**/packages/contracts/**",
            "**/packages/ai-engine/**",
          ],
        },
      ],
    },
  },
);
