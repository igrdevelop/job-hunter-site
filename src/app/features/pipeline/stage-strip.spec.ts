import { InProgressRun } from '../../core/api/pipeline.models';
import { PIPELINE_SAMPLE_SNAPSHOT } from '../../core/api/pipeline.mock';
import { STAGE_ORDER, buildStageStrip } from './stage-strip';

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
        refine_progress: { round: 2, kind: 'honest', score: 90, best: 90, outcome: 'accepted' },
      }),
    );
    const refine = view.items.find((i) => i.key === 'refine')!;
    expect(refine.state).toBe('now');
    expect(refine.label).toBe('refine 2/5');
    expect(states(view)).toBe('ddddddddnp');
  });

  it('shows a plain refine label when no round is known (pre-M1 or garbage payload)', () => {
    const noProgress = buildStageStrip(run('refine', 'start event'));
    expect(noProgress.items.find((i) => i.key === 'refine')!.label).toBe('refine');

    const nullRound = buildStageStrip(
      run('refine', 'refine round discarded', {
        refine_progress: { round: null, kind: null, score: null, best: null, outcome: 'discarded' },
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
