"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { askTutorAction } from "@/app/(dashboard)/tutor/actions";
import type { TutorChatMessage } from "./types";

/**
 * Chat UI for „Учителят": message bubbles, law-citation chips parsed from
 * [ЗДвП чл. X] markers, starter questions, Enter-to-send input and a typing
 * indicator while the (non-streaming) server action runs.
 */

/** Keep in sync with TUTOR_MAX_INPUT_LENGTH in @/modules/tutor. */
const INPUT_MAX_LENGTH = 500;

const STARTER_QUESTIONS = [
  "Кога имам предимство?",
  "Какво значи знак „Стоп“?",
  "С каква скорост мога да карам в града?",
  "Кога е забранено изпреварването?",
];

/** Splits "[ЗДвП чл. 47]" markers out of the text; markers become chips. */
const MARKER_SPLIT_RE = /(\[[^\][]+\])/g;

function MessageContent({ content }: { content: string }) {
  const parts = content.split(MARKER_SPLIT_RE);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("[") && part.endsWith("]") ? (
          <span
            key={i}
            className="mx-0.5 inline-flex items-center whitespace-nowrap rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 align-middle text-xs font-semibold text-accent"
          >
            {part.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-1" aria-label="Учителят пише…">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden
          className="h-2 w-2 animate-bounce rounded-full bg-muted motion-reduce:animate-none"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

export function TutorChat({
  initialMessages,
}: {
  initialMessages: TutorChatMessage[];
}) {
  const [messages, setMessages] = useState<TutorChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [limited, setLimited] = useState(false);
  const [isAsking, startAsking] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the newest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isAsking]);

  // The input is disabled while the tutor answers, which drops focus —
  // give it back so the student can fire the next question with Enter.
  useEffect(() => {
    if (!isAsking && !limited && messages.length > 0) {
      inputRef.current?.focus();
    }
  }, [isAsking, limited, messages.length]);

  const send = (raw: string): void => {
    const question = raw.trim();
    if (question.length === 0 || isAsking || limited) return;

    setError(null);
    setInput("");
    setMessages((prev) => [
      ...prev,
      { role: "user", content: question, ts: Date.now() },
    ]);

    startAsking(async () => {
      try {
        const result = await askTutorAction(question);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: result.reply, ts: Date.now() },
        ]);
        if (result.limited) setLimited(true);
      } catch {
        setError("Учителят не отговори. Провери връзката и опитай пак.");
      }
    });
  };

  const empty = messages.length === 0;

  return (
    <div className="card flex min-h-[60vh] flex-col">
      {/* Message list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 sm:p-6"
        aria-live="polite"
      >
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="text-4xl" aria-hidden>
              🤖
            </p>
            <div>
              <h2 className="text-lg font-extrabold">Питай Учителя</h2>
              <p className="mt-1 text-sm text-muted">
                Отговаря само по учебната програма — с точния член от закона.
              </p>
            </div>
            <ul className="flex flex-wrap justify-center gap-2">
              {STARTER_QUESTIONS.map((q) => (
                <li key={q}>
                  <button
                    type="button"
                    onClick={() => send(q)}
                    className="rounded-full border border-border px-4 py-2 text-sm font-semibold transition hover:border-accent hover:text-accent motion-reduce:transition-none"
                  >
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {messages.map((m, i) => (
              <li
                key={`${m.ts}-${i}`}
                className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground"
                      : "max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-surface-2 px-4 py-2.5 text-sm leading-relaxed"
                  }
                >
                  {m.role === "assistant" && (
                    <p className="mb-1 text-xs font-bold text-accent">Учителят</p>
                  )}
                  <p className="whitespace-pre-wrap">
                    <MessageContent content={m.content} />
                  </p>
                </div>
              </li>
            ))}
            {isAsking && (
              <li className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm border border-border bg-surface-2 px-4 py-2.5">
                  <TypingIndicator />
                </div>
              </li>
            )}
          </ul>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border p-3 sm:p-4">
        {error && (
          <p className="mb-2 text-sm font-semibold text-danger" role="alert">
            {error}
          </p>
        )}
        {limited && (
          <p className="mb-2 text-sm font-semibold text-warning">
            Дневният лимит е изчерпан — Учителят те чака пак утре.
          </p>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <label htmlFor="tutor-input" className="visually-hidden">
            Въпрос към Учителя
          </label>
          <input
            id="tutor-input"
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={INPUT_MAX_LENGTH}
            placeholder={
              limited ? "До утре! 👋" : "Питай за правило, знак или ситуация…"
            }
            disabled={isAsking || limited}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-accent disabled:opacity-60"
          />
          <button
            type="submit"
            className="btn-accent shrink-0 disabled:pointer-events-none disabled:opacity-50"
            disabled={isAsking || limited || input.trim().length === 0}
          >
            Питай
          </button>
        </form>
      </div>
    </div>
  );
}
