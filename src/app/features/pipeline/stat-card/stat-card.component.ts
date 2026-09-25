import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { StatCardView, UNMEASURED_TEXT } from '../pipeline.view';

/** One stat tile of a /pipeline tier; `value: null` renders the unmeasured state. */
@Component({
  selector: 'app-stat-card',
  imports: [MatProgressSpinnerModule],
  template: `
    <div class="label">
      {{ card().label }}
      @if (card().busy && card().value !== null) {
        <mat-spinner diameter="12" strokeWidth="2" aria-label="working" data-testid="card-busy" />
      }
    </div>
    @if (card().value !== null) {
      <div class="value" [class.ok]="card().tone === 'ok'" [class.warn]="card().tone === 'warn'">
        {{ card().value }}
      </div>
    } @else {
      <div class="value unmeasured" data-testid="unmeasured">{{ unmeasuredText }}</div>
    }
    @if (card().sub) {
      <div class="sub">{{ card().sub }}</div>
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        min-width: 0;
        padding: var(--space-4);
        background: var(--color-surface);
        border: 1px solid var(--color-neutral-300);
        border-radius: var(--radius);
      }
      .label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--color-neutral-500);
      }
      .value {
        font-family: var(--font-heading);
        font-size: 26px;
        font-weight: 700;
        line-height: 1.2;
        color: var(--color-text);
        overflow-wrap: anywhere;
      }
      .value.ok {
        color: var(--color-status-applied);
      }
      .value.warn {
        color: var(--color-status-failed);
      }
      .value.unmeasured {
        font-family: var(--font-body);
        font-size: 14px;
        font-weight: 500;
        color: var(--color-neutral-500);
        padding: 6px 0;
      }
      .sub {
        font-size: 12px;
        color: var(--color-neutral-600);
        overflow-wrap: anywhere;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatCardComponent {
  readonly card = input.required<StatCardView>();
  protected readonly unmeasuredText = UNMEASURED_TEXT;
}
