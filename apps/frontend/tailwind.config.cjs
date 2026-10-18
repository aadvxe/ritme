/** Ritme web app: GMera-based preset from @ritme/design. */
module.exports = {
  presets: [require("@ritme/design/tailwind-preset")],
  content: ["./index.html", "./src/**/*.{ts,tsx}", "../../packages/design/src/**/*.{ts,tsx}"],
};
