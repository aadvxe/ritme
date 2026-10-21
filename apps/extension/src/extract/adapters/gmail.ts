import { oneLine, readText } from "../dom";
import type { Adapter } from "../types";

/**
 * Gmail (mail.google.com). UNVERIFIED. Reads only the messages of the open thread that are expanded
 * (collapsed older messages have no body in the DOM, so they are not captured).
 * Selectors: subject h2.hP; message div.adn; sender span.gD[email]; time span.g3[title]; body div.a3s.
 * Quoted history (.gmail_quote) and the "..." toggle (.yj6qo) are left out of the body text.
 */
const SENDER = ["span.gD", "h3.iw span[email]", "span[email]"];

function senderMeta(el: Element) {
  for (const sel of SENDER) {
    const s = el.querySelector(sel);
    if (!s) continue;
    const name = oneLine(readText(s));
    const email = s.getAttribute("email") ?? s.getAttribute("data-hovercard-id");
    if (name && email && name.toLowerCase() !== email.toLowerCase()) return { sender: `${name} <${email}>` };
    return { sender: name || email };
  }
  return null;
}

const common = {
  text: ["div.a3s.aiL", "div.a3s"],
  exclude: ".gmail_quote, .yj6qo",
  meta: senderMeta,
  time: ["span.g3", "span[data-tooltip][title]"],
};

export const gmail: Adapter = {
  id: "gmail",
  appName: "Gmail",
  hosts: ["mail.google.com"],
  scope: ["[role='main']"],
  title: ["h2.hP", "h2[data-thread-perm-id]", "[role='main'] h2"],
  strategies: [
    { name: "div.adn", messages: "div.adn", ...common },
    { name: "data-message-id", messages: "[data-message-id]", ...common },
    { name: "div.h7", messages: "div.h7", ...common },
  ],
};
