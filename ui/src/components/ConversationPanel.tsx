import { useEffect, useRef, useState } from "react";
import { formatAction, type ChatMessage } from "../lib/types";

interface Props {
  messages: ChatMessage[];
  busy: boolean;
  onSend: (text: string) => void;
  onAbort: () => void;
}

const SUGGESTION = "Move to the table and pick up the blue box.";

export function ConversationPanel({ messages, busy, onSend, onAbort }: Props) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // Follow the conversation as it grows, including while text streams in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

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
        {busy && (
          <button type="button" className="ghost" onClick={onAbort}>
            Stop
          </button>
        )}
      </header>

      <div className="messages">
        {messages.length === 0 && (
          <div className="empty">
            <p>Tell the robot what to do.</p>
            <button type="button" className="suggestion" onClick={() => onSend(SUGGESTION)}>
              {SUGGESTION}
            </button>
          </div>
        )}

        {messages.map((m) => (
          <article key={m.id} className={`msg ${m.role}`}>
            <span className="who">{m.role === "user" ? "You" : "OpenClaw"}</span>
            <p className="text">
              {m.text}
              {m.pending && <span className="caret" />}
            </p>
            {!!m.actions?.length && (
              <ul className="actions">
                {m.actions.map((a, i) => (
                  <li key={i}>{formatAction(a)}</li>
                ))}
              </ul>
            )}
          </article>
        ))}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={submit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type instruction…"
          aria-label="Instruction"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !draft.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
