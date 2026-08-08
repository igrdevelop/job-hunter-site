import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  resource,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FiltersApi } from '../../core/api/filters.api';
import {
  ExcludeStacksWithout,
  FilterMeta,
  FilterOverrides,
  FilterProfile,
  FiltersErrors,
  FiltersPayload,
} from '../../core/api/models';
import {
  EXCLUDE_LEVEL_GROUPS,
  ExcludeLevelGroup,
  GroupCheckState,
  groupCheckState,
  toggleGroupWords,
} from './exclude-level-groups';
import { FILTER_FIELD_COPY, STACK_SELECT_OPTIONS } from './filters.fields';

/** Page sections from FILTERS_YAML_PLAN M5 / filters-page-mockup.html (no §8 — v2). */
export interface FilterSection {
  id: number;
  title: string;
  keys: (keyof FilterProfile)[];
}

export const FILTER_SECTIONS: FilterSection[] = [
  {
    id: 1,
    title: '1. What we keep',
    keys: ['title_keywords', 'require_title_terms'],
  },
  {
    id: 2,
    title: '2. Level & role — skip',
    keys: ['exclude_levels'],
  },
  {
    id: 3,
    title: '3. Stack — skip',
    keys: [
      'exclude_patterns',
      'exclude_stacks_without',
      'exclude_fullstack_with_backend',
      'fullstack_backend_stacks',
      'exclude_body_disqualifiers',
      'body_exclude_patterns',
    ],
  },
  {
    id: 4,
    title: '4. Location & hybrid',
    keys: [
      'home_city',
      'locations',
      'exclude_body_onsite_city',
      'allow_low_frequency_hybrid',
      'extra_anti_hybrid_cities',
    ],
  },
  {
    id: 5,
    title: '5. Languages',
    keys: ['exclude_german_language_required', 'languages'],
  },
  {
    id: 6,
    title: '6. Contract',
    keys: ['exclude_unacceptable_contract', 'exclude_relocation_required'],
  },
  {
    id: 7,
    title: '7. Spam protection',
    keys: ['exclude_ai_training', 'exclude_companies'],
  },
];

const LIST_KEYS = new Set<keyof FilterProfile>([
  'title_keywords',
  'require_title_terms',
  'exclude_levels',
  'exclude_patterns',
  'fullstack_backend_stacks',
  'body_exclude_patterns',
  'extra_anti_hybrid_cities',
  'exclude_companies',
  'locations',
  'languages',
]);

@Component({
  selector: 'app-filters',
  imports: [FormsModule, RouterLink, MatProgressSpinnerModule],
  templateUrl: './filters.component.html',
  styleUrl: './filters.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FiltersComponent {
  private readonly api = inject(FiltersApi);
  private readonly snackBar = inject(MatSnackBar);

  readonly sections = FILTER_SECTIONS;
  readonly levelGroups = EXCLUDE_LEVEL_GROUPS;
  readonly fieldCopy = FILTER_FIELD_COPY;
  readonly stackOptions = STACK_SELECT_OPTIONS;

  private readonly filtersResource = resource({
    loader: () => this.api.get(),
  });

  /** Layer-1 defaults from GET (immutable for the session until reload). */
  readonly defaults = signal<FilterProfile | null>(null);
  readonly meta = signal<Record<string, FilterMeta>>({});
  /** Last saved overrides (dirty baseline). */
  readonly baseline = signal<FilterOverrides>({});
  /** Working overrides draft — PUT body shape. */
  readonly draft = signal<FilterOverrides>({});

  readonly chipDrafts = signal<Record<string, string>>({});
  readonly advancedPatterns = signal(false);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

  readonly loading = this.filtersResource.isLoading;
  readonly errorMessage = computed(() =>
    this.filtersResource.error() ? 'Could not load filters.' : null,
  );
  readonly ready = computed(() => this.defaults() !== null);

  readonly dirtyCount = computed(() => {
    const a = this.draft() as Record<string, unknown>;
    const b = this.baseline() as Record<string, unknown>;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let n = 0;
    for (const k of keys) {
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) n++;
    }
    return n;
  });
  readonly isDirty = computed(() => this.dirtyCount() > 0);

  constructor() {
    effect(() => {
      if (!this.filtersResource.hasValue()) return;
      this.applyPayload(this.filtersResource.value());
    });
  }

  private applyPayload(payload: FiltersPayload): void {
    this.defaults.set(payload.defaults);
    this.meta.set(payload.meta);
    const overrides = structuredClone(payload.overrides);
    this.baseline.set(overrides);
    this.draft.set(structuredClone(overrides));
    this.fieldErrors.set({});
    this.saveError.set(null);
  }

  isOverridden(key: keyof FilterProfile): boolean {
    return Object.prototype.hasOwnProperty.call(this.draft(), key);
  }

  metaFor(key: keyof FilterProfile): FilterMeta | undefined {
    return this.meta()[key];
  }

  isDerived(key: keyof FilterProfile): boolean {
    return !!this.metaFor(key)?.derived;
  }

  /** Value shown/edited: override if present, else default. */
  valueOf<K extends keyof FilterProfile>(key: K): FilterProfile[K] | undefined {
    const d = this.defaults();
    if (!d) return undefined;
    if (this.isOverridden(key)) {
      return this.draft()[key] as FilterProfile[K];
    }
    return d[key];
  }

  labelOf(key: keyof FilterProfile): string {
    return this.fieldCopy[key]?.label ?? key;
  }

  hintOf(key: keyof FilterProfile): string | undefined {
    return this.fieldCopy[key]?.hint;
  }

  isListKey(key: keyof FilterProfile): boolean {
    return LIST_KEYS.has(key);
  }

  listValue(key: keyof FilterProfile): string[] {
    const v = this.valueOf(key);
    return Array.isArray(v) ? v : [];
  }

  boolValue(key: keyof FilterProfile): boolean {
    return !!this.valueOf(key);
  }

  isChipLocked(key: keyof FilterProfile, word: string): boolean {
    if (this.metaFor(key)?.merge !== 'extend_only') return false;
    const builtins = this.defaults()?.[key];
    if (!Array.isArray(builtins)) return false;
    const lower = word.toLowerCase();
    return builtins.some((b) => b.toLowerCase() === lower);
  }

  resetField(key: keyof FilterProfile): void {
    if (this.isDerived(key)) return;
    const next = { ...this.draft() };
    delete next[key];
    this.draft.set(next);
  }

  setBoolean(key: keyof FilterProfile, checked: boolean): void {
    if (this.isDerived(key)) return;
    this.commitValue(key, checked);
  }

  addChip(key: keyof FilterProfile): void {
    if (this.isDerived(key)) return;
    const raw = (this.chipDrafts()[key] ?? '').trim();
    if (!raw) return;
    const list = [...this.listValue(key)];
    if (!list.some((w) => w.toLowerCase() === raw.toLowerCase())) {
      list.push(raw);
      this.commitValue(key, list);
    }
    this.chipDrafts.update((m) => ({ ...m, [key]: '' }));
  }

  removeChip(key: keyof FilterProfile, word: string): void {
    if (this.isChipLocked(key, word)) return;
    const list = this.listValue(key).filter((w) => w !== word);
    this.commitValue(key, list);
  }

  onChipKeydown(event: KeyboardEvent, key: keyof FilterProfile): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.addChip(key);
    }
  }

  setChipDraft(key: keyof FilterProfile, value: string): void {
    this.chipDrafts.update((m) => ({ ...m, [key]: value }));
  }

  groupState(group: ExcludeLevelGroup): GroupCheckState {
    return groupCheckState(this.listValue('exclude_levels'), group.words);
  }

  toggleGroup(group: ExcludeLevelGroup): void {
    const next = toggleGroupWords(this.listValue('exclude_levels'), group.words);
    this.commitValue('exclude_levels', next);
  }

  stacksBlock(): string {
    const rule = this.valueOf('exclude_stacks_without') as ExcludeStacksWithout | null;
    return rule?.block?.[0] ?? '';
  }

  stacksUnless(): string {
    const rule = this.valueOf('exclude_stacks_without') as ExcludeStacksWithout | null;
    if (!rule) return '';
    return rule.unless;
  }

  setStacksBlock(block: string): void {
    if (!block) {
      this.commitValue('exclude_stacks_without', null);
      return;
    }
    const unless = this.stacksUnless() || 'angular';
    this.commitValue('exclude_stacks_without', { unless, block: [block] });
  }

  setStacksUnless(unless: string): void {
    const block = this.stacksBlock();
    if (!block) {
      this.commitValue('exclude_stacks_without', null);
      return;
    }
    this.commitValue('exclude_stacks_without', { unless, block: [block] });
  }

  listDisabled(key: keyof FilterProfile): boolean {
    if (key === 'fullstack_backend_stacks') {
      return !this.boolValue('exclude_fullstack_with_backend');
    }
    if (key === 'body_exclude_patterns') {
      return !this.boolValue('exclude_body_disqualifiers');
    }
    if (key === 'exclude_companies') {
      return !this.boolValue('exclude_ai_training');
    }
    return false;
  }

  germanHint(): string | null {
    const langs = this.defaults()?.languages ?? [];
    const speaksGerman = langs.some((l) => l.toLowerCase().includes('german') || l === 'de');
    if (!speaksGerman) return null;
    if (this.isOverridden('exclude_german_language_required')) return null;
    return 'Your profile lists German, so the shared default usually leaves this filter off.';
  }

  fieldError(key: keyof FilterProfile): string | null {
    const errors = this.fieldErrors();
    if (errors[key]) return errors[key];
    const prefix = `${key}[`;
    const parts = Object.entries(errors)
      .filter(([k]) => k === key || k.startsWith(prefix))
      .map(([k, v]) => (k === key ? v : `${k}: ${v}`));
    return parts.length ? parts.join('; ') : null;
  }

  discard(): void {
    this.draft.set(structuredClone(this.baseline()));
    this.fieldErrors.set({});
    this.saveError.set(null);
  }

  resetAll(): void {
    this.draft.set({});
    this.fieldErrors.set({});
    this.saveError.set(null);
  }

  async save(): Promise<void> {
    if (this.saving() || !this.isDirty()) return;
    this.saving.set(true);
    this.saveError.set(null);
    this.fieldErrors.set({});
    try {
      const result = await this.api.put(this.draft());
      this.applyPayload(result);
      this.snackBar.open(
        'Saved. Changes apply on the next hunt cycle.',
        undefined,
        { duration: 4000 },
      );
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 404) {
          this.saveError.set(
            'API not available yet — saving is disabled until /api/filters is deployed.',
          );
        } else if (err.status === 400) {
          const body = err.error as FiltersErrors | null;
          this.fieldErrors.set(body?.errors ?? {});
          this.saveError.set('Fix the field errors and try again.');
        } else {
          this.saveError.set('Could not save filters.');
        }
      } else {
        this.saveError.set('Could not save filters.');
      }
    } finally {
      this.saving.set(false);
    }
  }

  private commitValue<K extends keyof FilterProfile>(key: K, value: FilterProfile[K]): void {
    const defaults = this.defaults();
    if (!defaults) return;
    const next: FilterOverrides = { ...this.draft(), [key]: value };
    // Drop key from draft when it matches the default (same rule as PUT).
    if (valuesEqual(value, defaults[key])) {
      delete next[key];
    }
    this.draft.set(next);
    // Clear stale errors for this key (and indexed variants).
    this.fieldErrors.update((errs) => {
      const cleaned = { ...errs };
      for (const k of Object.keys(cleaned)) {
        if (k === key || k.startsWith(`${key}[`)) delete cleaned[k];
      }
      return cleaned;
    });
  }
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
