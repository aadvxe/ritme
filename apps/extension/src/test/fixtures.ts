/**
 * SYNTHETIC fixtures that follow the DOM hooks each adapter relies on (see the adapter files).
 * They were written from the documented/observed attribute names, NOT captured from live accounts.
 * When a real site changes, add a fresh fixture here and fix the selector table in the adapter.
 */

export const whatsappHtml = `
<div id="app"><div id="main">
  <header><span dir="auto" title="Project team">Project team</span></header>
  <div data-id="false_1@g.us_A">
    <div class="message-in"><div class="copyable-text" data-pre-plain-text="[10:15, 18/10/2026] Dewi Anggraini: ">
      <span class="selectable-text copyable-text"><span>Can you send the report by Friday? <img alt="🙂" src="x"></span></span>
    </div></div>
  </div>
  <div data-id="true_2@g.us_B">
    <div class="message-out"><div class="copyable-text" data-pre-plain-text="[10:20, 18/10/2026] Rangga: ">
      <span class="selectable-text"><span>Sure, I will do it.</span></span>
    </div></div>
  </div>
  <div data-id="false_3@g.us_C">
    <div class="message-in"><div class="copyable-text" data-pre-plain-text="[10:22, 18/10/2026] Dewi Anggraini: "></div></div>
  </div>
  <div data-id="false_4@g.us_D">
    <div class="message-in">
      <div data-testid="quoted-message"><span class="selectable-text">older quoted text</span></div>
      <div class="copyable-text" data-pre-plain-text="[10:30, 18/10/2026] Budi Santoso: ">
        <span class="selectable-text">Noted, thanks.</span>
      </div>
    </div>
  </div>
</div></div>`;

/** Same chat without data-pre-plain-text: forces the second strategy. */
export const whatsappFallbackHtml = `
<div id="main"><header><span dir="auto" title="Project team">Project team</span></header>
  <div data-id="false_9"><div class="message-in"><span class="selectable-text">First fallback message</span></div></div>
  <div data-id="true_10"><div class="message-out"><span class="selectable-text">My reply</span></div></div>
</div>`;

export const telegramAHtml = `
<div id="MiddleColumn">
  <div class="MiddleHeader"><div class="ChatInfo"><div class="title">Design chat</div></div></div>
  <div class="MessageList">
    <div class="Message" id="message-1">
      <div class="message-title"><span class="message-title-name">Ayu</span></div>
      <div class="content-inner"><div class="text-content">Hello team <span class="MessageMeta"><span class="message-time">09:00</span></span></div></div>
    </div>
    <div class="Message" id="message-2">
      <div class="content-inner"><div class="text-content">Also, the deck is ready <span class="MessageMeta"><span class="message-time">09:01</span></span></div></div>
    </div>
    <div class="Message own" id="message-3">
      <div class="content-inner"><div class="text-content">On it <span class="MessageMeta"><span class="message-time">09:02</span></span></div></div>
    </div>
  </div>
</div>`;

export const telegramKHtml = `
<div class="chat-info"><span class="peer-title">Ops room</span></div>
<div class="bubbles">
  <div class="bubble" data-mid="5"><div class="bubble-content">
    <div class="name"><span class="peer-title">Citra</span></div>
    <div class="message">Ship it <span class="time"><span class="i18n">11:00</span></span></div>
  </div></div>
  <div class="bubble is-out" data-mid="6"><div class="bubble-content">
    <div class="message">Shipping now <span class="time"><span class="i18n">11:01</span></span></div>
  </div></div>
</div>`;

export const teamsHtml = `
<div role="main">
  <h2 data-tid="chat-title">Sprint planning</h2>
  <div data-tid="chat-pane-message">
    <div data-tid="message-author-name">Eko Prasetyo</div>
    <time datetime="2026-10-18T03:15:00Z"></time>
    <div data-tid="message-body">Standup moved to 10:00</div>
  </div>
  <div data-tid="chat-pane-message">
    <div data-tid="message-body">Please confirm</div>
  </div>
</div>`;

export const slackHtml = `
<div data-qa="message_pane">
  <span data-qa="channel_name">launch-plan</span>
  <div data-qa="message_container">
    <button data-qa="message_sender_name">Fajar</button>
    <a data-qa="timestamp" data-ts="1792300000.000100" aria-label="">10:15</a>
    <div data-qa="message-text">Release notes are due Thursday</div>
  </div>
  <div data-qa="message_container">
    <div data-qa="message-text">And please tag the build</div>
  </div>
</div>`;

export const slackFallbackHtml = `
<div class="c-virtual_list__scroll_container">
  <div class="c-message_kit__background">
    <a class="c-message__sender_link">Gita</a><a class="c-timestamp" data-ts="1792300100">10:17</a>
    <div class="c-message_kit__blocks"><div class="p-rich_text_block">Fallback strategy message</div></div>
  </div>
</div>`;

export function slackManyHtml(count: number): string {
  const rows = Array.from(
    { length: count },
    (_, i) =>
      `<div data-qa="message_container"><button data-qa="message_sender_name">User ${i % 3}</button><div data-qa="message-text">message number ${i + 1}</div></div>`,
  ).join("");
  return `<div data-qa="message_pane">${rows}</div>`;
}

export const gmailHtml = `
<div role="main">
  <h2 class="hP">Budget review</h2>
  <div class="adn"><div class="gs">
    <h3 class="iw"><span class="gD" email="sari@acme.co">Sari</span></h3>
    <span class="g3" title="Sat, Oct 18, 2026, 10:15 AM">10:15 AM</span>
    <div class="a3s aiL"><div>Please review the budget.</div><div class="gmail_quote">older quoted history</div></div>
  </div></div>
  <div class="adn"><div class="gs"><span class="gD" email="old@acme.co">Old</span></div></div>
</div>`;

export const outlookHtml = `
<div id="ConversationReadingPaneContainer">
  <div role="heading" aria-level="2">Quarterly plan</div>
  <div role="article">
    <span aria-label="From: Tono Wijaya">Tono Wijaya</span>
    <span id="dateTime1">Sat 10/18/2026 10:15 AM</span>
    <div id="UniqueMessageBody_1"><p>Please see the attached plan.</p><p>Thanks!</p></div>
  </div>
</div>`;

export const emptyHtml = `<div id="app"><p>Nothing here</p></div>`;
