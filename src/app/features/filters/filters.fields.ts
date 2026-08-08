import { FilterProfile } from '../../core/api/models';

export interface FilterFieldCopy {
  label: string;
  hint?: string;
}

export const FILTER_FIELD_COPY: Partial<Record<keyof FilterProfile, FilterFieldCopy>> = {
  title_keywords: {
    label: 'Ключевые слова в заголовке',
    hint: 'Вакансия берётся, если заголовок содержит хотя бы одно из них.',
  },
  require_title_terms: {
    label: 'Обязательные термины в заголовке',
    hint: 'Если задано — слово ОБЯЗАНО быть в каждом заголовке. Пусто = не требовать.',
  },
  exclude_levels: {
    label: 'Исключаемые слова уровня',
    hint: 'Полный список, редактируемый. Группы выше — только быстрые ярлыки.',
  },
  exclude_patterns: {
    label: 'Исключить, если в заголовке',
    hint: 'Обычные слова — границы слов учитываются автоматически («java» не заденет «javascript»).',
  },
  exclude_stacks_without: {
    label: 'Правило «X без Y»',
    hint: 'Отсеивать вакансии со стеком X, если рядом нет Y.',
  },
  exclude_fullstack_with_backend: {
    label: 'Отсеивать фуллстек с «тяжёлым» бэкендом',
  },
  fullstack_backend_stacks: {
    label: 'Тяжёлые бэкенд-стеки',
  },
  exclude_body_disqualifiers: {
    label: 'Стоп-стек в тексте вакансии',
    hint: 'Заголовок чистый, а в описании вылезает платформа. Отдельный список от заголовочного.',
  },
  body_exclude_patterns: {
    label: 'Паттерны стоп-стека в теле',
  },
  exclude_body_onsite_city: {
    label: 'Отсеивать гибрид/офис в чужом городе',
    hint: 'Ловит «remote» в шапке + «3 дня в офисе в Кракове» в тексте.',
  },
  allow_low_frequency_hybrid: {
    label: 'Разрешить гибрид с редкими визитами в офис',
    hint: '«1 день в неделю или реже» в польском городе не отсеивается.',
  },
  extra_anti_hybrid_cities: {
    label: 'Стоп-города для гибрида',
    hint: 'Серые с замком — общий калиброванный список, убрать нельзя. Свои — можно.',
  },
  exclude_german_language_required: {
    label: 'Отсеивать вакансии с обязательным немецким',
  },
  exclude_unacceptable_contract: {
    label: 'Отсеивать part-time и короткие контракты',
  },
  exclude_relocation_required: {
    label: 'Отсеивать вакансии с обязательной релокацией',
  },
  exclude_ai_training: {
    label: 'Отсеивать AI-training / staffing-mill конторы',
  },
  exclude_companies: {
    label: 'Блоклист компаний',
    hint: '🔒 — общий блоклист, калиброван на реальных инцидентах, снять нельзя.',
  },
};

/** Options for the exclude_stacks_without selects. */
export const STACK_SELECT_OPTIONS = ['react', 'vue', 'angular', 'svelte'] as const;
