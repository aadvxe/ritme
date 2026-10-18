import { describe, expect, it } from "vitest";
import { detectSensitive } from "./sensitive";

describe("detectSensitive", () => {
  it.each([
    ["mychart.hospital.org", "health"],
    ["www.halodoc.com", "health"],
    ["online.mybank.com", "finance"],
    ["klikbca.com", "finance"],
    ["www.paypal.com", "finance"],
    ["acme.wd5.myworkday.com", "hr"],
    ["app.bamboohr.com", "hr"],
    ["hr.acme.co", "hr"],
  ])("flags %s as %s", (domain, category) => {
    expect(detectSensitive(domain)).toBe(category);
  });

  it.each(["docs.google.com", "github.com", "en.wikipedia.org", "intern-onboarding.acme.co", null, undefined, ""])(
    "does not flag %s",
    (domain) => {
      expect(detectSensitive(domain)).toBeNull();
    },
  );
});
