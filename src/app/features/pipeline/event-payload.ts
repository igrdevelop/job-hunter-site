/**
 * Turns a `pipeline_events.payload` string into a short human line for the
 * "Recent events" footer.
 *
 * Only the shapes the snapshot contract calls stable are formatted:
 * the refine round `{round, kind, score, best, reason}`, the refine start
 * `{target, max_rounds, verdict_first}`, `{error}`, `{score}` and `{chars}`.
 * Anything else falls back to the raw text, truncated.
 *
 * The API serves the footer payload TRUNCATED to 80 characters, so a refine
 * round carrying a long `reason` arrives as broken JSON. When `JSON.parse`
 * fails, the complete `"key": value` pairs in the surviving prefix are read
 * instead (and an unterminated `"error": "…` string is taken as far as it goes),
 * so the known shapes still format; a prefix with none of them falls back.
 */

export const RAW_PAYLOAD_MAX = 60;
export const ERROR_TEXT_MAX = 80;

type Fields = Record<string, unknown>;

const REFINE_ROUND_EVENTS = new Set(['accepted', 'rejected', 'discarded']);

export function formatEventPayload(stage: string, event: string, payload: string): string {
  const raw = (payload ?? '').trim();
  if (!raw) return '';
  const f = parseFields(raw);

  if (stage === 'refine' && REFINE_ROUND_EVENTS.has(event) && isNum(f['round'])) {
    const score = isNum(f['score']) ? fmtScore(f['score']) : null;
    const best = isNum(f['best']) ? `(best ${fmtScore(f['best'])})` : null;
    return join([
      `round ${f['round']}`,
      isStr(f['kind']) ? f['kind'] : null,
      score && best ? `${score} ${best}` : (score ?? best),
    ]);
  }
  if (stage === 'refine' && event === 'start' && (isNum(f['target']) || isNum(f['max_rounds']))) {
    return join([
      isNum(f['target']) ? `target ${fmtScore(f['target'])}` : null,
      isNum(f['max_rounds']) ? `up to ${f['max_rounds']} rounds` : null,
      isNum(f['verdict_first']) ? `from ${fmtScore(f['verdict_first'])}` : null,
    ]);
  }
  if (isStr(f['error'])) return truncate(f['error'], ERROR_TEXT_MAX);
  if (isNum(f['score'])) return `score ${fmtScore(f['score'])}`;
  if (isNum(f['chars'])) return `${groupThousands(f['chars'])} chars`;

  return truncate(raw, RAW_PAYLOAD_MAX);
}

function parseFields(raw: string): Fields {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Fields) : {};
  } catch {
    return parsePrefix(raw);
  }
}

/** Complete `"key": value` pairs from a (possibly truncated) JSON object prefix. */
function parsePrefix(raw: string): Fields {
  if (!raw.startsWith('{')) return {};
  const out: Fields = {};
  const pair = /"(\w+)"\s*:\s*("(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|null|true|false)/g;
  for (const m of raw.matchAll(pair)) {
    try {
      out[m[1]] = JSON.parse(m[2]);
    } catch {
      // skip a value that is not valid JSON on its own
    }
  }
  if (!('error' in out)) {
    const cut = /"error"\s*:\s*"((?:[^"\\]|\\.)*)$/.exec(raw);
    if (cut) out['error'] = cut[1].replace(/\\"/g, '"').replace(/\\n/g, ' ');
  }
  return out;
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

/** 3112 → "3 112" (space-grouped thousands). */
export function groupThousands(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function join(parts: (string | null)[]): string {
  return parts.filter((p): p is string => !!p).join(' · ');
}

function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
