/**
 * Text-input "sink": the field only ever holds a zero-width sentinel plus whatever was typed since the
 * last flush. Each flush diffs the field against the sentinel, turns the diff into messages for the PC,
 * and resets the field. This is robust against Gboard/iOS autocorrect and composition because we never
 * rely on remembering what was previously in the field.
 */
import type { ClientMsg } from "@tvdeck/protocol";

/** Zero-width space: gives the soft keyboard something to backspace over in an otherwise empty field. */
export const SENTINEL = "​";
export const MAX_CHUNK = 500;
export const MAX_BACKSPACES = 64;

export type TextOp = Extract<ClientMsg, { type: "typeText" | "textKey" }>;

/** Splits into chunks of at most `max` UTF-16 units, never inside a surrogate pair. */
export function chunkText(text: string, max = MAX_CHUNK): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + max, text.length);
    if (end < text.length) {
      const c = text.charCodeAt(end - 1);
      if (c >= 0xd800 && c <= 0xdbff) end--;
    }
    out.push(text.slice(i, end));
    i = end;
  }
  return out;
}

/**
 * Turns the field's current value into ordered messages: backspaces for removed sentinel/characters,
 * then the new text (newlines become Enter on the server). Returns [] when nothing changed.
 */
export function planSink(value: string, baseline = SENTINEL): TextOp[] {
  let p = 0;
  const max = Math.min(baseline.length, value.length);
  while (p < max && baseline.charCodeAt(p) === value.charCodeAt(p)) p++;
  const ops: TextOp[] = [];
  const backs = Math.min(baseline.length - p, MAX_BACKSPACES);
  for (let i = 0; i < backs; i++) ops.push({ type: "textKey", key: "backspace" });
  const inserted = value.slice(p).replaceAll(SENTINEL, "").replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  for (const text of chunkText(inserted)) ops.push({ type: "typeText", text });
  return ops;
}
