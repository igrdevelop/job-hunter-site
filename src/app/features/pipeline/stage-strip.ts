import { InProgressRun } from '../../core/api/pipeline.models';

/**
 * The contract's `STAGE_ORDER` (bot repo tools/pipeline_snapshot.py
 * `_infer_stage`). `gates` and `delivery` are never written as event stages —
 * they exist for inference only — but they are real steps of an apply run, so
 * the strip shows them.
 */
export const STAGE_ORDER = [
  'fetch',
  'gates',
  'generate',
  'ats_loop',
  'judge',
  'lang_gate',
  'render',
  'verdict',
  'refine',
  'delivery',
] as const;

export type StageKey = (typeof STAGE_ORDER)[number];

const STAGE_LABELS: Record<StageKey, string> = {
  fetch: 'fetch',
  gates: 'gates',
  generate: 'generate',
  ats_loop: 'ATS loop',
  judge: 'judge',
  lang_gate: 'lang gate',
  render: 'render',
  verdict: 'verdict',
  refine: 'refine',
  delivery: 'delivery',
};

/**
 * Display fallbacks for `run.refine_max_rounds` / `run.refine_target` — the bot
 * defaults (ATS_VERDICT_MAX_REFINES / ATS_VERDICT_TARGET). Used only when the
 * run's own refine `start` event has not been written (loop not started yet,
 * never runs, or a pre-M1 run).
 */
export const DEFAULT_REFINE_MAX_ROUNDS = 5;
export const DEFAULT_VERDICT_TARGET = 95;

export function refineMaxRounds(run: InProgressRun | null): number {
  return run?.refine_max_rounds ?? DEFAULT_REFINE_MAX_ROUNDS;
}

export function verdictTarget(run: InProgressRun | null): number {
  return run?.refine_target ?? DEFAULT_VERDICT_TARGET;
}

export type StageState = 'done' | 'now' | 'pending';

export interface StageStripItem {
  key: StageKey;
  label: string;
  state: StageState;
  /** Accessible/tooltip text when the label abbreviates something (refine k/N). */
  title: string | null;
}

export interface StageStripView {
  items: StageStripItem[];
  /** False when there is no run, or its stage name is not one the strip knows. */
  known: boolean;
  /** The current stage was guessed from the last `ok` event, not observed. */
  inferred: boolean;
}

/**
 * Maps a run's `current_stage` onto the strip: stages before it are done, it
 * is "now", later ones are pending. With no run (paste mode, metrics gap) or
 * an unknown stage (`"?"`), every stage is pending and `known` is false — the
 * page must not claim a position it cannot see.
 */
export function buildStageStrip(run: InProgressRun | null): StageStripView {
  const current = run?.current_stage?.stage ?? '';
  const index = (STAGE_ORDER as readonly string[]).indexOf(current);
  const known = index >= 0;
  const inferred = known && (run?.current_stage.basis ?? '').startsWith('inferred');

  const items = STAGE_ORDER.map((key, i): StageStripItem => {
    const state: StageState = !known
      ? 'pending'
      : i < index
        ? 'done'
        : i === index
          ? 'now'
          : 'pending';
    const round = refineRound(key, state, run);
    const max = refineMaxRounds(run);
    return round === null
      ? { key, label: STAGE_LABELS[key], state, title: null }
      : { key, label: `refine ${round}/${max}`, state, title: `${round} of ${max} rounds decided` };
  });
  return { items, known, inferred };
}

/**
 * `refine_progress.round` is the last round already DECIDED (accepted/rejected/
 * discarded), not the one running — the chip shows it as-is, never round + 1.
 */
function refineRound(key: StageKey, state: StageState, run: InProgressRun | null): number | null {
  const round = run?.refine_progress?.round;
  return key === 'refine' && state === 'now' && typeof round === 'number' ? round : null;
}
