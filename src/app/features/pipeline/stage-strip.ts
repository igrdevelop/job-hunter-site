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
 * The bot's default ATS_VERDICT_MAX_REFINES. The snapshot does not carry the
 * configured value (only the refine `start` event's payload does, and the
 * footer payload is a truncated display string), so the strip labels rounds
 * against the default.
 */
export const REFINE_MAX_ROUNDS = 5;

/** The verdict score the refine loop aims for (bot default ATS_VERDICT_TARGET). */
export const VERDICT_TARGET = 95;

export type StageState = 'done' | 'now' | 'pending';

export interface StageStripItem {
  key: StageKey;
  label: string;
  state: StageState;
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
    return { key, label: stageLabel(key, state, run), state };
  });
  return { items, known, inferred };
}

function stageLabel(key: StageKey, state: StageState, run: InProgressRun | null): string {
  const round = run?.refine_progress?.round;
  if (key === 'refine' && state === 'now' && typeof round === 'number') {
    return `refine ${round}/${REFINE_MAX_ROUNDS}`;
  }
  return STAGE_LABELS[key];
}
