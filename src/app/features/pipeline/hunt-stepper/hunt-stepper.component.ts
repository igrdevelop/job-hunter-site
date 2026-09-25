import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { HuntLiveRow } from '../../../core/api/pipeline.models';
import { buildHuntStepper } from '../hunt-stepper';

/**
 * The live hunt: waiting → fetch → filter → dedup → queue → done, a spinner on
 * the step the bot is on, ✓ on finished ones, elapsed time on the active one.
 */
@Component({
  selector: 'app-hunt-stepper',
  imports: [MatProgressSpinnerModule],
  template: `
    <div class="head">
      <span class="title">Hunting now</span>
      <span class="meta">{{ view().heading }} · {{ view().elapsed }}</span>
      @if (view().failed) {
        <span class="failed">failed</span>
      }
    </div>
    <ol class="steps" aria-label="Hunt steps">
      @for (item of view().items; track item.key) {
        <li
          class="step"
          [class.done]="item.state === 'done'"
          [class.now]="item.state === 'now'"
          [attr.data-state]="item.state"
          [attr.data-step]="item.key"
          [attr.aria-current]="item.state === 'now' ? 'step' : null"
        >
          <span class="marker" aria-hidden="true">
            @if (item.state === 'now') {
              <mat-spinner diameter="14" strokeWidth="2" data-testid="hunt-step-spinner" />
            } @else if (item.state === 'done') {
              ✓
            }
          </span>
          <span class="body">
            <span class="label">{{ item.label }}</span>
            @if (item.detail) {
              <span class="detail" data-testid="hunt-step-detail">{{ item.detail }}</span>
            }
            @if (item.elapsed) {
              <span class="elapsed" data-testid="hunt-step-elapsed">{{ item.elapsed }}</span>
            }
          </span>
        </li>
      }
    </ol>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        padding: var(--space-4);
        background: var(--color-surface);
        border: 1px solid var(--color-accent-500);
        border-radius: var(--radius);
        min-width: 0;
      }
      .head {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--space-1) var(--space-3);
      }
      .title {
        font-weight: 600;
        font-size: 16px;
      }
      .meta {
        font-size: 13px;
        color: var(--color-neutral-600);
      }
      .failed {
        font-size: 13px;
        font-weight: 600;
        color: var(--color-status-failed);
      }
      .steps {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .step {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: var(--radius-pill);
        border: 2px solid transparent;
        background: var(--color-neutral-200);
        color: var(--color-neutral-500);
        font-size: 12px;
        white-space: nowrap;
      }
      .step.done {
        background: rgba(34, 197, 94, 0.16);
        color: #86efac;
      }
      .step.now {
        border-color: var(--color-accent-500);
        background: rgba(59, 130, 246, 0.16);
        color: var(--color-accent-700);
        font-weight: 600;
        white-space: normal;
      }
      .marker {
        display: inline-flex;
        min-width: 0;
      }
      .body {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 2px 6px;
        align-items: baseline;
      }
      .detail,
      .elapsed {
        font-weight: 400;
        font-variant-numeric: tabular-nums;
      }
      .elapsed {
        color: var(--color-neutral-600);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HuntStepperComponent {
  readonly row = input.required<HuntLiveRow>();
  /** Estimate of the server clock, ticking every second. */
  readonly now = input.required<Date>();

  /** The bot's full source count; `null` when the snapshot has no `control` block. */
  readonly allSources = input<number | null>(null);
  protected readonly view = computed(() =>
    buildHuntStepper(this.row(), this.now(), this.allSources()),
  );
}
