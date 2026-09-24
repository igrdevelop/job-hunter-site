import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { InProgressCard } from '../../../core/api/pipeline.models';
import { buildStageStrip } from '../stage-strip';
import { formatMinutes, verdictHeadline } from '../pipeline.view';

/**
 * One wide card per vacancy being generated right now: identity line, elapsed
 * time, verdict progress, and the stage strip. With one apply worker there is
 * normally at most one of these.
 */
@Component({
  selector: 'app-run-card',
  template: `
    <div class="head">
      <div class="who">
        <span class="company">{{ card().company || '—' }}</span>
        <span class="title">{{ card().title }}</span>
      </div>
      <div class="meta">
        @for (part of metaParts(); track $index) {
          <span>{{ part }}</span>
        }
      </div>
    </div>

    <div class="facts">
      <span>{{ runningText() }}</span>
      <span>{{ verdictText() }}</span>
      @if (card().stale) {
        <span class="stale-note">no heartbeat &gt; 60 min</span>
      }
    </div>

    <ol class="strip" [attr.aria-label]="'Stages of ' + (card().company || 'this run')">
      @for (item of strip().items; track item.key) {
        <li
          class="stage"
          [class.done]="item.state === 'done'"
          [class.now]="item.state === 'now'"
          [attr.data-state]="item.state"
          [attr.aria-current]="item.state === 'now' ? 'step' : null"
          [attr.title]="item.title"
          [attr.aria-label]="item.title ? 'refine: ' + item.title : null"
        >
          {{ item.label }}
        </li>
      }
    </ol>
    @if (strip().inferred) {
      <div class="hint">probably — stage inferred from the last completed step</div>
    } @else if (!strip().known) {
      <div class="hint">stage unknown — no generation metrics for this run</div>
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        padding: var(--space-4);
        background: var(--color-surface);
        border: 1px solid var(--color-neutral-300);
        border-radius: var(--radius);
        min-width: 0;
      }
      :host(.stale) {
        opacity: 0.55;
        filter: grayscale(1);
      }
      .head {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: var(--space-2) var(--space-4);
      }
      .who {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        align-items: baseline;
        min-width: 0;
      }
      .company {
        font-weight: 600;
        font-size: 16px;
      }
      .title {
        color: var(--color-neutral-700);
        overflow-wrap: anywhere;
      }
      .meta,
      .facts {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-1) var(--space-3);
        font-size: 13px;
        color: var(--color-neutral-600);
      }
      .stale-note {
        color: var(--color-status-expired);
      }
      .strip {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .stage {
        font-size: 12px;
        padding: 4px 10px;
        border-radius: var(--radius-pill);
        border: 2px solid transparent;
        background: var(--color-neutral-200);
        color: var(--color-neutral-500);
        white-space: nowrap;
      }
      .stage.done {
        background: rgba(34, 197, 94, 0.16);
        color: #86efac;
      }
      .stage.now {
        border-color: var(--color-accent-500);
        background: rgba(59, 130, 246, 0.16);
        color: var(--color-accent-700);
        font-weight: 600;
      }
      .hint {
        font-size: 12px;
        color: var(--color-neutral-500);
      }
    `,
  ],
  host: { '[class.stale]': 'card().stale' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RunCardComponent {
  readonly card = input.required<InProgressCard>();

  protected readonly strip = computed(() => buildStageStrip(this.card().run));

  protected readonly metaParts = computed(() => {
    const c = this.card();
    const run = c.run;
    return [
      c.source,
      run?.pipeline ? `${run.pipeline} pipeline` : null,
      run?.profile || null,
    ].filter((p): p is string => !!p);
  });

  protected readonly runningText = computed(() => {
    const c = this.card();
    const min = c.run?.elapsed_min ?? c.claimed_min_ago;
    return min === null ? 'running' : `running ${formatMinutes(min)}`;
  });

  protected readonly verdictText = computed(() => verdictHeadline(this.card().run));
}
