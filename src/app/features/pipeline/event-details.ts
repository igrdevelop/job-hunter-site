import { EventDetails } from '../../core/api/pipeline.models';

/**
 * Turns an event's server-parsed `details` into a short human line for the
 * "Recent events" footer. `null` details → '' (nothing after the event name).
 *
 * Shapes (the stable payload fields of the snapshot contract):
 * - refine round `{round, kind, score, best}` → "round 2 · honest · 90 (best 90)"
 * - refine start `{target, max_rounds, verdict_first}` → "target 95 · up to 5 rounds · from 85"
 * - `{error}` → the error text, cut to ~80 chars
 * - `{score}` → "score 91"; `{chars}` → "3 112 chars"
 * - `{reason}` alone → the reason, cut to ~80 chars
 * The API passes numeric keys through as-is, so each one is type-checked here.
 */

export const DETAIL_TEXT_MAX = 80;

const REFINE_ROUND_EVENTS = new Set(['accepted', 'rejected', 'discarded']);

export function formatEventDetails(
  stage: string,
  event: string,
  details: EventDetails | null,
): string {
  if (!details) return '';
  const d = details;

  if (stage === 'refine' && REFINE_ROUND_EVENTS.has(event) && isNum(d.round)) {
    const score = isNum(d.score) ? fmtScore(d.score) : null;
    const best = isNum(d.best) ? `(best ${fmtScore(d.best)})` : null;
    return join([
      `round ${d.round}`,
      isStr(d.kind) ? d.kind : null,
      score && best ? `${score} ${best}` : (score ?? best),
    ]);
  }
  if (isNum(d.target) || isNum(d.max_rounds)) {
    return join([
      isNum(d.target) ? `target ${fmtScore(d.target)}` : null,
      isNum(d.max_rounds) ? `up to ${d.max_rounds} rounds` : null,
      isNum(d.verdict_first) ? `from ${fmtScore(d.verdict_first)}` : null,
    ]);
  }
  if (isStr(d.error)) return truncate(d.error, DETAIL_TEXT_MAX);
  if (isNum(d.score)) return `score ${fmtScore(d.score)}`;
  if (isNum(d.chars)) return `${groupThousands(d.chars)} chars`;
  if (isStr(d.reason)) return truncate(d.reason, DETAIL_TEXT_MAX);
  return '';
}

/** 3112 → "3 112" (space-grouped thousands). */
export function groupThousands(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isStr(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

function fmtScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function join(parts: (string | null)[]): string {
  return parts.filter((p): p is string => !!p).join(' · ');
}

function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
