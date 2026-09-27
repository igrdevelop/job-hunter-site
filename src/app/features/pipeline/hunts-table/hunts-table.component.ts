import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { HuntDetail, HuntListRow } from '../../../core/api/pipeline.models';
import { buildStageStrip } from '../stage-strip';
import { funnelSteps, huntRowView, jobRowView } from '../hunts-table.view';

/** What the open row's detail looks like while it is not a loaded detail. */
export type HuntDetailState = 'loading' | 'missing' | 'error' | null;

/**
 * The hunts table (bot repo docs/HUNT_DRILLDOWN_PLAN.md): one row per hunt,
 * newest first. Clicking a row (or Enter / Space on it) opens that hunt's own
 * pipeline in place — the funnel per step, then every vacancy that passed the
 * filter with where it is now. Presentational: the page owns loading and the
 * `?hunt=` query param; this component only renders and emits `toggle`.
 */
@Component({
  selector: 'app-hunts-table',
  imports: [MatProgressSpinnerModule, NgTemplateOutlet],
  template: `
    <div class="wrap">
      <table class="hunts">
        <thead>
          <tr>
            <th scope="col">Started</th>
            <th scope="col">By</th>
            <th scope="col">Sources</th>
            <th scope="col">Status</th>
            <th scope="col">Funnel</th>
            <th scope="col">Vacancies now</th>
            <th scope="col" class="num">Took</th>
          </tr>
        </thead>
        <tbody>
          @for (r of rows(); track r.id) {
            <tr
              class="hunt"
              [class.open]="r.id === openId()"
              tabindex="0"
              role="button"
              [attr.aria-expanded]="r.id === openId()"
              [attr.data-hunt]="r.id"
              (click)="toggle.emit(r.id)"
              (keydown.enter)="toggle.emit(r.id)"
              (keydown.space)="$event.preventDefault(); toggle.emit(r.id)"
            >
              <td class="time">
                <span class="caret" aria-hidden="true">{{ r.id === openId() ? '▾' : '▸' }}</span
                >{{ r.time }}
              </td>
              <td>{{ r.trigger }}</td>
              <td class="sources">{{ r.sources }}</td>
              <td>
                <span class="pill" [attr.data-tone]="r.status.tone">
                  @if (r.status.tone === 'live') {
                    <mat-spinner diameter="10" strokeWidth="2" />
                  }
                  {{ r.status.text }}
                </span>
              </td>
              <td class="funnel">{{ r.funnel ?? '—' }}</td>
              <td>
                @if (r.chips; as chips) {
                  @for (c of chips; track c.label) {
                    <span class="chip" [attr.data-tone]="c.tone">{{ c.count }} {{ c.label }}</span>
                  } @empty {
                    <span class="muted">—</span>
                  }
                } @else {
                  <span class="muted">not recorded</span>
                }
              </td>
              <td class="num">{{ r.duration ?? '—' }}</td>
            </tr>
            @if (r.id === openId()) {
              <tr class="detail-row">
                <td colspan="7">
                  <ng-container *ngTemplateOutlet="detailTpl" />
                </td>
              </tr>
            }
          }
        </tbody>
      </table>
    </div>

    @if (openOutsideList()) {
      <!-- ?hunt= names a hunt older than the rows the list returned: show it anyway. -->
      <section class="detail-outside" data-testid="hunt-outside" aria-label="Opened hunt">
        <div class="outside-head">
          <span>Hunt {{ openId() }} — older than the rows above</span>
          <button type="button" class="close" (click)="toggle.emit(openId()!)">Close</button>
        </div>
        <ng-container *ngTemplateOutlet="detailTpl" />
      </section>
    }

    <ng-template #detailTpl>
      @if (detail(); as d) {
        <div class="funnel-steps" data-testid="hunt-funnel">
          @for (s of steps(); track s.label; let last = $last) {
            <div class="step">
              <span class="label">{{ s.label }}</span>
              <span class="value">{{ s.value ?? '—' }}</span>
              @if (s.sub) {
                <span class="sub">{{ s.sub }}</span>
              }
            </div>
            @if (!last) {
              <span class="arrow" aria-hidden="true">→</span>
            }
          }
        </div>
        @if (jobs(); as list) {
          @if (list.length) {
            <ul class="jobs" data-testid="hunt-jobs">
              @for (j of list; track $index) {
                <li class="job">
                  <span class="chip state" [attr.data-tone]="j.state.tone">{{
                    j.state.label
                  }}</span>
                  <span class="who">
                    <a [href]="j.url" target="_blank" rel="noopener">{{ j.title }}</a>
                    <span class="company">{{ j.company }} · {{ j.source }}</span>
                  </span>
                  <span class="detail">
                    {{ j.detail ?? '' }}
                    @if (j.link; as l) {
                      <a [href]="l.href" target="_blank" rel="noopener">{{ l.label }}</a>
                    }
                  </span>
                  @if (j.live) {
                    <ol class="strip" aria-label="Stages">
                      @for (item of strip(j.live).items; track item.key) {
                        <li [attr.data-state]="item.state">{{ item.label }}</li>
                      }
                    </ol>
                  }
                </li>
              }
            </ul>
          } @else {
            <p class="muted">No vacancy passed the filter in this hunt.</p>
          }
        } @else {
          <p class="muted">
            Per-vacancy rows are not recorded for this hunt (older than 30 days, or before the bot
            started keeping them).
          </p>
        }
      } @else if (detailState() === 'loading') {
        <div class="muted loading"><mat-spinner diameter="16" /> Loading…</div>
      } @else if (detailState() === 'missing') {
        <p class="muted">This hunt is no longer stored.</p>
      } @else {
        <p class="muted">Could not load this hunt.</p>
      }
    </ng-template>
  `,
  styles: [
    `
      .wrap {
        overflow-x: auto;
        border: 1px solid var(--color-neutral-300);
        border-radius: var(--radius);
        background: var(--color-surface);
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      th {
        text-align: left;
        font-weight: 600;
        color: var(--color-neutral-600);
        padding: 8px 12px;
        border-bottom: 1px solid var(--color-neutral-300);
        white-space: nowrap;
      }
      td {
        padding: 8px 12px;
        border-bottom: 1px solid var(--color-neutral-200);
        vertical-align: top;
      }
      .num {
        text-align: right;
        white-space: nowrap;
      }
      tr.hunt {
        cursor: pointer;
      }
      tr.hunt:hover,
      tr.hunt.open {
        background: var(--color-surface-2);
      }
      tr.hunt:focus-visible {
        outline: 2px solid var(--color-accent-500);
        outline-offset: -2px;
      }
      .time {
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .caret {
        display: inline-block;
        width: 1.2em;
        color: var(--color-neutral-500);
      }
      .sources,
      .funnel {
        white-space: nowrap;
      }
      .pill,
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 1px 8px;
        margin: 0 4px 2px 0;
        border-radius: var(--radius-pill);
        font-size: 12px;
        white-space: nowrap;
        background: var(--color-surface-2);
        color: var(--color-text);
      }
      [data-tone='ok'] {
        background: rgba(34, 197, 94, 0.16);
        color: #86efac;
      }
      [data-tone='bad'] {
        background: rgba(239, 68, 68, 0.18);
        color: #fca5a5;
      }
      [data-tone='live'] {
        background: rgba(168, 85, 247, 0.18);
        color: #d8b4fe;
      }
      [data-tone='muted'] {
        color: var(--color-neutral-500);
      }
      .muted {
        color: var(--color-neutral-500);
      }
      .detail-outside {
        margin-top: 8px;
        border: 1px solid var(--color-neutral-300);
        border-radius: var(--radius);
        background: var(--color-surface-2);
        padding: 12px 16px 16px;
      }
      .outside-head {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
        font-size: 13px;
        color: var(--color-neutral-600);
      }
      .close {
        background: none;
        border: 1px solid var(--color-neutral-300);
        border-radius: var(--radius-pill);
        color: var(--color-text);
        padding: 0 10px;
        cursor: pointer;
      }
      tr.detail-row > td {
        background: var(--color-surface-2);
        padding: 12px 16px 16px;
      }
      .funnel-steps {
        display: flex;
        flex-wrap: wrap;
        align-items: stretch;
        gap: 8px;
        margin-bottom: 12px;
      }
      .step {
        display: flex;
        flex-direction: column;
        min-width: 120px;
        max-width: 260px;
        padding: 8px 12px;
        border: 1px solid var(--color-neutral-300);
        border-radius: var(--radius);
        background: var(--color-surface);
      }
      .step .label {
        font-size: 12px;
        color: var(--color-neutral-600);
      }
      .step .value {
        font-size: 20px;
        font-weight: 700;
      }
      .step .sub {
        font-size: 12px;
        color: var(--color-neutral-500);
      }
      .arrow {
        align-self: center;
        color: var(--color-neutral-500);
      }
      .jobs {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .job {
        display: grid;
        grid-template-columns: 110px minmax(0, 2fr) minmax(0, 2fr);
        gap: 4px 12px;
        align-items: baseline;
      }
      .job .state {
        justify-self: start;
      }
      .who {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .who a {
        color: var(--color-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .company,
      .detail {
        color: var(--color-neutral-500);
        font-size: 12px;
      }
      .detail a {
        margin-left: 6px;
      }
      .strip {
        grid-column: 2 / -1;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        list-style: none;
        margin: 0;
        padding: 0;
        font-size: 11px;
      }
      .strip li {
        padding: 0 6px;
        border-radius: var(--radius-pill);
        color: var(--color-neutral-500);
        border: 1px solid var(--color-neutral-300);
      }
      .strip li[data-state='done'] {
        color: var(--color-text);
      }
      .strip li[data-state='now'] {
        color: #d8b4fe;
        border-color: #a855f7;
      }
      .loading {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      @media (max-width: 720px) {
        /* Phone: keep the table readable without sideways scrolling — by,
           sources and duration are secondary; the funnel may wrap. */
        th:nth-child(2),
        th:nth-child(3),
        th:nth-child(7),
        tr.hunt > td:nth-child(2),
        tr.hunt > td:nth-child(3),
        tr.hunt > td:nth-child(7) {
          display: none;
        }
        .funnel {
          white-space: normal;
        }
        th,
        td {
          padding: 6px 6px;
        }
        .job {
          grid-template-columns: minmax(0, 1fr);
        }
        .strip {
          grid-column: 1;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HuntsTableComponent {
  readonly hunts = input.required<HuntListRow[]>();
  readonly now = input.required<Date>();
  readonly allSources = input<number | null>(null);
  readonly openId = input<string | null>(null);
  readonly detail = input<HuntDetail | null>(null);
  readonly detailState = input<HuntDetailState>(null);

  readonly toggle = output<string>();

  readonly rows = computed(() =>
    this.hunts().map((h) => huntRowView(h, this.now(), this.allSources())),
  );
  /** The opened hunt is not among the listed rows (older than the list's limit). */
  readonly openOutsideList = computed(() => {
    const id = this.openId();
    return !!id && !this.rows().some((r) => r.id === id);
  });
  readonly steps = computed(() => {
    const d = this.detail();
    return d ? funnelSteps(d) : [];
  });
  readonly jobs = computed(() => {
    const d = this.detail();
    return d?.jobs ? d.jobs.map((j) => jobRowView(j, this.now())) : null;
  });

  readonly strip = buildStageStrip;
}
