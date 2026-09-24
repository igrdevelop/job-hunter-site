import { InProgressRun } from '../../core/api/pipeline.models';
import { PIPELINE_SAMPLE_SNAPSHOT } from '../../core/api/pipeline.mock';
import { STAGE_ORDER, buildStageStrip } from './stage-strip';

const TS = '2026-09-22T11:59:00+00:00';

function run(stage: string, basis: string, extra: Partial<InProgressRun> = {}): InProgressRun {
  const base = structuredClone(PIPELINE_SAMPLE_SNAPSHOT.apply.in_progress.cards[0].run!);
  return { ...base, refine_progress: null, current_stage: { stage, basis }, ...extra };
}

function states(view: ReturnType<typeof buildStageStrip>): string {
  return view.items.map((i) => i.state[0]).join('');
}

describe('buildStageStrip', () => {
  it('marks stages before the current one done, the current one now, later ones pending', () => {
    const view = buildStageStrip(run('judge', 'start event'));
    // fetch gates generate ats_loop | judge | lang_gate render verdict refine delivery
    expect(states(view)).toBe('ddddnppppp');
    expect(view.items.find((i) => i.state === 'now')?.key).toBe('judge');
    expect(view.known).toBe(true);
    expect(view.inferred).toBe(false);
  });

  it('keeps the contract STAGE_ORDER, first stage current with no events', () => {
    const view = buildStageStrip(run('fetch', 'no events yet'));
    expect(view.items.map((i) => i.key)).toEqual([...STAGE_ORDER]);
    expect(states(view)).toBe('nppppppppp');
  });

  it('labels an in-flight refine stage with the round from refine_progress', () => {
    const view = buildStageStrip(
      run('refine', 'refine round accepted', {
        refine_progress: {
          round: 2,
          kind: 'honest',
          score: 90,
          best: 90,
          outcome: 'accepted',
          ts: TS,
        },
      }),
    );
    const refine = view.items.find((i) => i.key === 'refine')!;
    expect(refine.state).toBe('now');
    expect(refine.label).toBe('refine 2/5');
    expect(refine.title).toBe('2 of 5 rounds decided');
    expect(states(view)).toBe('ddddddddnp');
    expect(view.items.filter((i) => i.title !== null)).toHaveLength(1);
  });

  it("uses the run's own refine_max_rounds, the last DECIDED round, and falls back to 5 when null", () => {
    const progress = { round: 1, kind: 'honest', score: 84, best: 85, outcome: 'rejected', ts: TS };
    const custom = buildStageStrip(
      run('refine', 'refine round rejected', { refine_progress: progress, refine_max_rounds: 3 }),
    );
    const chip = custom.items.find((i) => i.key === 'refine')!;
    expect(chip.label).toBe('refine 1/3');
    expect(chip.title).toBe('1 of 3 rounds decided');

    const fallback = buildStageStrip(
      run('refine', 'refine round rejected', {
        refine_progress: progress,
        refine_max_rounds: null,
      }),
    );
    expect(fallback.items.find((i) => i.key === 'refine')!.label).toBe('refine 1/5');
  });

  it('shows a plain refine label when no round is known (pre-M1 or garbage payload)', () => {
    const noProgress = buildStageStrip(run('refine', 'start event'));
    expect(noProgress.items.find((i) => i.key === 'refine')!.label).toBe('refine');

    const nullRound = buildStageStrip(
      run('refine', 'refine round discarded', {
        refine_progress: {
          round: null,
          kind: null,
          score: null,
          best: null,
          outcome: 'discarded',
          ts: TS,
        },
      }),
    );
    expect(nullRound.items.find((i) => i.key === 'refine')!.label).toBe('refine');
  });

  it('flags an inferred stage so the page can say "probably"', () => {
    const view = buildStageStrip(run('ats_loop', "inferred: after 'generate' ok"));
    expect(view.inferred).toBe(true);
    expect(view.items.find((i) => i.state === 'now')?.key).toBe('ats_loop');
  });

  it('claims no position for an unknown stage or a missing run', () => {
    for (const view of [
      buildStageStrip(run('?', "inferred: after 'mystery' ok")),
      buildStageStrip(null),
    ]) {
      expect(view.known).toBe(false);
      expect(view.inferred).toBe(false);
      expect(states(view)).toBe('pppppppppp');
    }
  });
});
