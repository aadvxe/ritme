/** TypeScript boundary rules (spec §6). Python boundaries are enforced by import-linter (pyproject.toml). */
module.exports = {
  forbidden: [
    {
      name: "client-apps-no-server-or-llm",
      comment: "frontend/extension may only talk to the API via api-client and share design.",
      severity: "error",
      from: { path: "^apps/(frontend|extension)/src" },
      to: { path: "^(apps/backend|packages/ai-engine|packages/contracts)" },
    },
    {
      name: "no-llm-sdk-in-clients",
      severity: "error",
      from: { path: "^(apps/(frontend|extension)|packages/(design|api-client))/src" },
      to: { path: "node_modules/(@google|google-genai|@anthropic-ai|openai)" },
    },
    {
      name: "extension-no-frontend",
      severity: "error",
      from: { path: "^apps/extension/src" },
      to: { path: "^apps/frontend" },
    },
    {
      name: "design-and-client-are-leaf-packages",
      severity: "error",
      from: { path: "^packages/design/src" },
      to: { path: "^packages/api-client" },
    },
  ],
  options: { tsConfig: undefined, doNotFollow: { path: "node_modules" } },
};
