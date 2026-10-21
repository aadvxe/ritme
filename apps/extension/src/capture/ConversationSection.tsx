import { Button } from "@ritme/design";
import type { DraftConversation } from "../lib/conversation";
import { includedCount, senderLabels } from "../lib/conversation";
import { InfoGlyph } from "../ui/icons";
import { StatusNotice } from "../ui/StatusNotice";

/**
 * The messages read from a supported app. Each can be unchecked; names can be hidden. Only what is
 * checked ends up in the text that is sent.
 */
export function ConversationSection({
  conversation,
  onChange,
}: {
  conversation: DraftConversation;
  onChange: (patch: Partial<DraftConversation>) => void;
}) {
  const labels = conversation.hideNames ? senderLabels(conversation.messages) : null;
  const included = includedCount(conversation);
  const locked = conversation.textEdited;

  return (
    <section className="space-y-3" aria-labelledby="conversation-heading">
      <h2 id="conversation-heading" className="text-sm font-medium text-navy">
        Messages from {conversation.app}
      </h2>

      <StatusNotice tone="warning" icon={<InfoGlyph />} title="This includes messages written by other people">
        <p>Send only what you need. Uncheck anything you don't want to share.</p>
      </StatusNotice>

      {conversation.autoExcluded > 0 && (
        <StatusNotice
          tone="info"
          icon={<InfoGlyph />}
          title={`Only the latest ${included} message${included === 1 ? "" : "s"} fit`}
        >
          <p>
            The {conversation.autoExcluded} older {conversation.autoExcluded === 1 ? "message was" : "messages were"}{" "}
            left unchecked because Ritme can't save more text at once. Nothing was cut.
          </p>
        </StatusNotice>
      )}
      {conversation.capped && (
        <p className="text-xs text-text-muted">
          Ritme read the latest messages on screen; older ones were not captured.
        </p>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-primary-strong"
          checked={conversation.hideNames}
          disabled={locked}
          onChange={(e) => onChange({ hideNames: e.target.checked })}
        />
        <span>
          Hide other people's names
          <span className="block text-xs text-text-muted">
            Shown as Person A, Person B… Names written inside messages are not changed.
          </span>
        </span>
      </label>

      {locked && (
        <StatusNotice tone="info" icon={<InfoGlyph />} title="You edited the text by hand">
          <p>Changing the checkboxes would replace your edits.</p>
          <Button className="mt-2" size="sm" variant="outline" onClick={() => onChange({ textEdited: false })}>
            Rebuild text from the checked messages
          </Button>
        </StatusNotice>
      )}

      <fieldset className="space-y-1.5">
        <legend className="text-xs text-text-secondary" aria-live="polite">
          {included} of {conversation.messages.length} messages included
        </legend>
        <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {conversation.messages.map((m, i) => {
            const who = m.sender ? (labels?.get(m.sender) ?? m.sender) : "Unknown sender";
            return (
              <li key={`${m.id}-${i}`}>
                <label className="flex items-start gap-2 rounded-xl border border-border bg-surface p-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 accent-primary-strong"
                    checked={m.included}
                    disabled={locked}
                    onChange={(e) =>
                      onChange({
                        messages: conversation.messages.map((x, j) => (j === i ? { ...x, included: e.target.checked } : x)),
                      })
                    }
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-text-secondary">
                      {who}
                      {m.time ? ` · ${m.time}` : ""}
                    </span>
                    <span className="line-clamp-3 whitespace-pre-line break-words">{m.text}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
    </section>
  );
}
