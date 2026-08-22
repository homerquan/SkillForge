import { useEffect, useRef, useState } from "react";
import { formatAction, type ChatMessage } from "../lib/types";

interface Props {
  messages: ChatMessage[];
  busy: boolean;
  onSend: (text: string) => void;
  onAbort: () => void;
  onClear: () => void;
  /** Set when the run ended in error; renders an inline retry card. */
  errorMessage?: string | null;
  /** Resend the instruction that produced errorMessage. */
  onRetry?: () => void;
}

// Chosen to each exercise a different corner of the mock's keyword parser —
// pick, rotate+place, and a combined grab-and-place chain — so the empty
// state doubles as a quick tour of what the robot can do.
const SUGGESTIONS = [
  "Move to the table and pick up the blue box.",
  "Rotate 90 degrees, then place it in the bin.",
  "Grab the red block and set it down on the table.",
];

export function ConversationPanel({
  messages,
  busy,
  onSend,
  onAbort,
  onClear,
  errorMessage,
  onRetry,
}: Props) {
  const [draft, setDraft] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Shared by message bubbles and action pills. The "Copied" label reverts
  // on its own so a click always gets a visible acknowledgement. Falls back
  // to a hidden-textarea copy where the Clipboard API is unavailable or its
  // permission is denied (some embedded/sandboxed browser contexts).
  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        // Best effort — nothing more we can do in this context.
      }
      document.body.removeChild(ta);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1200);
  }

  // Follow the conversation as it grows, including while text streams in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // Return focus to the composer once a turn finishes, so a rapid back-and-
  // forth never needs a mouse click in between.
  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    onSend(text);
    setDraft("");
  }

  return (
    <section className="panel conversation">
      <header className="panel-head">
        <h2>Conversation</h2>
        {busy ? (
          <button type="button" className="ghost" onClick={onAbort}>
            Stop
          </button>
        ) : (
          messages.length > 0 && (
            <button type="button" className="ghost" onClick={onClear}>
              Clear
            </button>
          )
        )}
      </header>

      <div className="messages">
        {messages.length === 0 && (
          <div className="empty">
            <p className="empty-title">Ready when you are.<br />What should the robot do?</p>
            <span className="empty-hint">Try one of these:</span>
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="suggestion" onClick={() => onSend(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m) => (
          <article key={m.id} className={`msg ${m.role}`}>
            <div className="msg-head">
              <span className="who">{m.role === "user" ? "You" : "OpenClaw"}</span>
              {!m.pending && m.text && (
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() => copy(m.text, m.id)}
                >
                  {copiedId === m.id ? "Copied" : "Copy"}
                </button>
              )}
            </div>
            <p className="text">
              {m.text}
              {m.pending && <span className="caret" />}
            </p>
            {!!m.actions?.length && (
              <ul className="actions">
                {m.actions.map((a, i) => {
                  const actionId = `${m.id}-a${i}`;
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => copy(formatAction(a), actionId)}
                        title="Copy"
                      >
                        {copiedId === actionId ? "Copied" : formatAction(a)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
        ))}

        {errorMessage && (
          <div className="error-card" role="alert">
            <p>{errorMessage}</p>
            {onRetry && (
              <button type="button" className="ghost" onClick={onRetry}>
                Retry
              </button>
            )}
          </div>
        )}

        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={submit}>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type instruction…"
          aria-label="Instruction"
          disabled={busy}
          autoFocus
        />
        <button type="submit" disabled={busy || !draft.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
