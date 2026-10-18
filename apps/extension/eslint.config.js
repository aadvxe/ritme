import tseslint from "typescript-eslint";

export default tseslint.config(...tseslint.configs.recommended, {
  rules: {
    // Boundary: the extension talks to the API only through @ritme/api-client and never ships an LLM SDK.
    "no-restricted-imports": [
      "error",
      { patterns: ["@google/*", "google-genai*", "@anthropic-ai/*", "openai*", "firebase*"] },
    ],
  },
});
