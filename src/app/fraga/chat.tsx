"use client";

import { useEffect, useRef, useState } from "react";
import { askQuestion } from "../actions";

interface Msg {
  role: "user" | "assistant";
  content: string;
  sources?: { id: string; label: string; url: string | null }[];
  error?: boolean;
}

const SUGGESTIONS = [
  "Vad har jag denna vecka?",
  "Vad ska jag förbereda inför nästa labb?",
  "Vilka inlämningar har jag inte gjort?",
  "Vilka grupper är jag med i?",
];

const STORAGE_KEY = "canvas-hub-chat";

export function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Spara konversationen lokalt i webbläsaren (bara bekvämlighet).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setMessages(JSON.parse(saved));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {}
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await askQuestion(
        next.filter((m) => !m.error).map(({ role, content }) => ({ role, content }))
      );
      if ("error" in res) {
        setMessages([...next, { role: "assistant", content: res.error ?? "Något gick fel.", error: true }]);
      } else {
        setMessages([...next, { role: "assistant", content: res.answer, sources: res.sources }]);
      }
    } catch {
      setMessages([...next, { role: "assistant", content: "Kunde inte nå servern. Är du inloggad?", error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat">
      {messages.length === 0 && (
        <div className="chat-empty">
          <p className="muted">Fråga om dina kurser, deadlines, labbar och grupper. Svaren bygger på din data från Canvas.</p>
          <div className="chat-suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip" onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        </div>
      )}

      <ul className="chat-log">
        {messages.map((m, i) => (
          <li key={i} className={`bubble bubble-${m.role} ${m.error ? "bubble-error" : ""}`}>
            <p>{m.content}</p>
            {m.sources && m.sources.length > 0 && (
              <div className="bubble-sources">
                {m.sources.map((s) =>
                  s.url ? (
                    <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer">{s.label} ↗</a>
                  ) : (
                    <span key={s.id}>{s.label}</span>
                  )
                )}
              </div>
            )}
          </li>
        ))}
        {busy && <li className="bubble bubble-assistant bubble-busy">Tänker…</li>}
      </ul>
      <div ref={endRef} />

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Skriv en fråga…"
          aria-label="Fråga"
        />
        <button type="submit" className="btn" disabled={busy || !input.trim()}>Skicka</button>
      </form>
      {messages.length > 0 && (
        <button className="link-button chat-clear" onClick={() => setMessages([])} disabled={busy}>
          Rensa konversationen
        </button>
      )}
    </div>
  );
}
