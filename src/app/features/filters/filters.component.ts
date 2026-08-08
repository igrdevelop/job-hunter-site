import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
} from '@angular/core';
import { JsonPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FiltersApi } from '../../core/api/filters.api';
import { FilterMeta, FilterOverrides, FilterProfile } from '../../core/api/models';

/** Page sections from FILTERS_YAML_PLAN M5 / filters-page-mockup.html (no §8 — v2). */
export interface FilterSection {
  id: number;
  title: string;
  keys: (keyof FilterProfile)[];
}

export const FILTER_SECTIONS: FilterSection[] = [
  {
    id: 1,
    title: '1. Что ищем',
    keys: ['title_keywords', 'require_title_terms'],
  },
  {
    id: 2,
    title: '2. Уровень и роль',
    keys: ['exclude_levels'],
  },
  {
    id: 3,
    title: '3. Стек',
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
    title: '4. Локация и гибрид',
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
    title: '5. Языки',
    keys: ['exclude_german_language_required', 'languages'],
  },
  {
    id: 6,
    title: '6. Контракт',
    keys: ['exclude_unacceptable_contract', 'exclude_relocation_required'],
  },
  {
    id: 7,
    title: '7. Защита от спама',
    keys: ['exclude_ai_training', 'exclude_companies'],
  },
];

@Component({
  selector: 'app-filters',
  imports: [JsonPipe, RouterLink, MatProgressSpinnerModule],
  templateUrl: './filters.component.html',
  styleUrl: './filters.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FiltersComponent {
  private readonly api = inject(FiltersApi);

  readonly sections = FILTER_SECTIONS;

  private readonly filtersResource = resource({
    loader: () => this.api.get(),
  });

  readonly payload = computed(() =>
    this.filtersResource.hasValue() ? this.filtersResource.value() : null,
  );
  readonly loading = this.filtersResource.isLoading;
  readonly errorMessage = computed(() =>
    this.filtersResource.error() ? 'Could not load filters.' : null,
  );

  readonly overrides = computed<FilterOverrides>(() => this.payload()?.overrides ?? {});
  readonly effective = computed(() => this.payload()?.effective ?? null);
  readonly meta = computed(() => this.payload()?.meta ?? {});

  isOverridden(key: keyof FilterProfile): boolean {
    return Object.prototype.hasOwnProperty.call(this.overrides(), key);
  }

  metaFor(key: keyof FilterProfile): FilterMeta | undefined {
    return this.meta()[key];
  }

  valueOf(key: keyof FilterProfile): unknown {
    return this.effective()?.[key];
  }

  isList(value: unknown): value is string[] {
    return Array.isArray(value);
  }
}
