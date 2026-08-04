"use client";

import { useEffect, useRef, useState } from "react";

interface JournalNoteProps {
  orderId: string;
  initialText?: string;
  className?: string;
}

export function JournalNote({ orderId, initialText = "", className = "" }: JournalNoteProps) {
  const [text, setText] = useState(initialText);
  const [editing, setEditing] = useState(false);
  const [syncedText, setSyncedText] = useState(initialText);
  const inputRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A fresh note from the server wins over local edits. Adjusted during render
  // rather than in an effect, so there is no throwaway pass with stale text.
  if (initialText !== syncedText) {
    setSyncedText(initialText);
    setText(initialText);
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function scheduleSave(value: string) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void fetch("/api/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, text: value }),
      });
    }, 400);
  }

  function handleChange(value: string) {
    setText(value);
    scheduleSave(value);
  }

  if (!editing && !text) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`text-left text-sm text-muted hover:text-ink-secondary ${className}`}
      >
        note your thinking…
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      onFocus={() => setEditing(true)}
      onBlur={() => {
        if (!text) setEditing(false);
      }}
      placeholder="note your thinking…"
      className={`w-full min-w-0 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted ${className}`}
    />
  );
}
