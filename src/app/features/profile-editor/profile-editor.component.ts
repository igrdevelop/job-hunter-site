import { ChangeDetectionStrategy, Component, computed, effect, inject, resource, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ProfileApi } from '../../core/api/profile.api';
import {
  ProfileDocument,
  ProfileErrors,
  ProfileExperience,
  ProfileIdentity,
  ProfileLocation,
  ProfileOrigin,
  ProfileRole,
  ProfileSkillCategory,
} from '../../core/api/models';

/** The skills table edits either core.skills ('core') or variants[track].skills. */
const CORE_TAB = 'core';

/** The four per-role maps a track "rewrite" touches together. */
const ROLE_TRACK_MAP_FIELDS = [
  'title_by_track',
  'subtitle_by_track',
  'stack_line_by_track',
  'bullets_by_track',
] as const;

function omitKey<T>(obj: Record<string, T>, key: string): Record<string, T> {
  const next = { ...obj };
  delete next[key];
  return next;
}

/** Required identity fields — the server's PUT 400 list mirrors these exact messages. */
const REQUIRED_IDENTITY_FIELDS: { key: keyof ProfileIdentity; message: string }[] = [
  { key: 'full_name', message: 'core.identity.full_name is required' },
  { key: 'contact', message: 'core.identity.contact is required' },
  { key: 'cv_filename_prefix', message: 'core.identity.cv_filename_prefix is required' },
];

/** String-list fields on the questionnaire card, all edited with the same chip UX. */
type QuestionnaireListKey =
  | 'home_city_aliases'
  | 'acceptable_hybrid'
  | 'weekly_hybrid'
  | 'disqualify_required';

@Component({
  selector: 'app-profile-editor',
  imports: [FormsModule, RouterLink, MatProgressSpinnerModule],
  templateUrl: './profile-editor.component.html',
  styleUrl: './profile-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileEditorComponent {
  private readonly api = inject(ProfileApi);
  private readonly snackBar = inject(MatSnackBar);

  private readonly profileResource = resource({
    loader: () => this.api.get(),
  });

  readonly loading = this.profileResource.isLoading;
  readonly errorMessage = computed(() =>
    this.profileResource.error() ? 'Could not load your profile. Is the API reachable?' : null,
  );

  /** Last-saved document (dirty baseline / discard target). */
  private readonly baseline = signal<ProfileDocument | null>(null);
  /** Working copy the editor mutates. */
  private readonly draft = signal<ProfileDocument | null>(null);

  /** null once loaded = the user has no profile yet (a real 404). */
  readonly document = computed(() => this.draft());

  readonly showEmptyState = computed(
    () => this.profileResource.hasValue() && !this.errorMessage() && this.document() === null,
  );

  readonly roles = computed(() => this.document()?.core.roles ?? []);
  readonly leftovers = computed(() => this.document()?.leftovers ?? []);

  /** Rule: with ≤ 1 variant, track UI stays invisible — a customer sees a plain editor. */
  readonly variantTracks = computed(() => Object.keys(this.document()?.variants ?? {}));
  readonly hasMultipleVariants = computed(() => this.variantTracks().length > 1);

  readonly activeTab = signal<string>(CORE_TAB);
  readonly tabs = computed(() => [CORE_TAB, ...this.variantTracks()]);

  readonly activeSkills = computed<ProfileSkillCategory[]>(() => {
    const doc = this.document();
    if (!doc) return [];
    return this.activeTab() === CORE_TAB
      ? doc.core.skills
      : (doc.variants[this.activeTab()]?.skills ?? []);
  });

  /** True once a variant's own skills list has content — it overrides core for that track. */
  readonly activeVariantOverridesCore = computed(
    () => this.activeTab() !== CORE_TAB && this.activeSkills().length > 0,
  );

  readonly chipDrafts = signal<Record<number, string>>({});

  readonly isDirty = computed(() => {
    const b = this.baseline();
    const d = this.draft();
    if (!b || !d) return false;
    return JSON.stringify(b) !== JSON.stringify(d);
  });

  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly fieldErrors = signal<string[]>([]);

  constructor() {
    effect(() => {
      if (!this.profileResource.hasValue()) return;
      const doc = this.profileResource.value()?.profile ?? null;
      this.baseline.set(doc ? structuredClone(doc) : null);
      this.draft.set(doc ? structuredClone(doc) : null);
      this.activeTab.set(CORE_TAB);
      this.chipDrafts.set({});
      this.roleActiveTabs.set({});
      this.saveError.set(null);
      this.fieldErrors.set([]);
    });
  }

  isEdited(origin: ProfileOrigin): boolean {
    return origin === 'edited';
  }

  originLabel(origin: ProfileOrigin): string {
    return this.isEdited(origin) ? 'Edited' : 'Parsed';
  }

  // ── Identity (plain fields, spread-updated straight into the draft) ──────

  updateIdentity<K extends keyof ProfileIdentity>(field: K, value: ProfileIdentity[K]): void {
    const doc = this.draft();
    if (!doc) return;
    this.draft.set({ ...doc, core: { ...doc.core, identity: { ...doc.core.identity, [field]: value } } });
  }

  identityFieldError(field: keyof ProfileIdentity): string | null {
    const doc = this.document();
    if (!doc) return null;
    const rule = REQUIRED_IDENTITY_FIELDS.find((r) => r.key === field);
    if (!rule) return null;
    return doc.core.identity[field].trim() ? null : rule.message;
  }

  readonly hasBlockingErrors = computed(() => {
    const doc = this.document();
    if (!doc) return false;
    return REQUIRED_IDENTITY_FIELDS.some((rule) => !doc.core.identity[rule.key].trim());
  });

  /** e.g. "Jane_Doe_CV_Angular_2026_EN.docx" — mirrors bot generate_docs.resume_docx_basename(). */
  cvFilenameExample(profile: ProfileDocument): string {
    const prefix = profile.core.identity.cv_filename_prefix.trim() || 'CV';
    const year = new Date().getFullYear();
    const stack = (this.variantTracks()[0] ?? 'FE').replace(/[^\w-]+/g, '_').slice(0, 22) || 'FE';
    const lang = (profile.core.languages.cv_languages[0] ?? 'EN').toUpperCase().slice(0, 2) || 'EN';
    return `${prefix}_${stack}_${year}_${lang}.docx`;
  }

  // ── Questionnaire: location / languages / experience ─────────────────────

  updateLocation<K extends keyof ProfileLocation>(field: K, value: ProfileLocation[K]): void {
    const doc = this.draft();
    if (!doc) return;
    this.draft.set({ ...doc, core: { ...doc.core, location: { ...doc.core.location, [field]: value } } });
  }

  updateExperience<K extends keyof ProfileExperience>(field: K, value: ProfileExperience[K]): void {
    const doc = this.draft();
    if (!doc) return;
    this.draft.set({
      ...doc,
      core: { ...doc.core, experience: { ...doc.core.experience, [field]: value } },
    });
  }

  readonly questionnaireChipDrafts = signal<Record<string, string>>({});

  questionnaireList(listKey: QuestionnaireListKey): string[] {
    const doc = this.document();
    if (!doc) return [];
    return listKey === 'disqualify_required'
      ? doc.core.languages.disqualify_required
      : doc.core.location[listKey];
  }

  setQuestionnaireChipDraft(listKey: QuestionnaireListKey, value: string): void {
    this.questionnaireChipDrafts.update((m) => ({ ...m, [listKey]: value }));
  }

  onQuestionnaireChipKeydown(event: KeyboardEvent, listKey: QuestionnaireListKey): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addQuestionnaireChip(listKey);
    }
  }

  addQuestionnaireChip(listKey: QuestionnaireListKey): void {
    const raw = (this.questionnaireChipDrafts()[listKey] ?? '').trim();
    if (!raw) return;
    const list = this.questionnaireList(listKey);
    if (!list.some((x) => x.toLowerCase() === raw.toLowerCase())) {
      this.setQuestionnaireList(listKey, [...list, raw]);
    }
    this.setQuestionnaireChipDraft(listKey, '');
  }

  removeQuestionnaireChip(listKey: QuestionnaireListKey, item: string): void {
    this.setQuestionnaireList(
      listKey,
      this.questionnaireList(listKey).filter((x) => x !== item),
    );
  }

  private setQuestionnaireList(listKey: QuestionnaireListKey, list: string[]): void {
    const doc = this.draft();
    if (!doc) return;
    if (listKey === 'disqualify_required') {
      this.draft.set({
        ...doc,
        core: { ...doc.core, languages: { ...doc.core.languages, disqualify_required: list } },
      });
      return;
    }
    this.draft.set({
      ...doc,
      core: { ...doc.core, location: { ...doc.core.location, [listKey]: list } },
    });
  }

  selectTab(tab: string): void {
    this.activeTab.set(tab);
  }

  tabLabel(tab: string): string {
    return tab === CORE_TAB ? 'Core' : tab;
  }

  addCategory(): void {
    this.updateActiveSkills((skills) => [
      ...skills,
      { category: 'New category', items: [], origin: 'edited', tracks: [] },
    ]);
  }

  removeCategory(index: number): void {
    this.updateActiveSkills((skills) => skills.filter((_, i) => i !== index));
  }

  moveCategory(index: number, direction: -1 | 1): void {
    this.updateActiveSkills((skills) => {
      const target = index + direction;
      if (target < 0 || target >= skills.length) return skills;
      const next = [...skills];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  renameCategory(index: number, name: string): void {
    this.updateActiveSkills((skills) =>
      skills.map((cat, i) => (i === index ? { ...cat, category: name, origin: 'edited' } : cat)),
    );
  }

  setChipDraft(index: number, value: string): void {
    this.chipDrafts.update((m) => ({ ...m, [index]: value }));
  }

  onChipKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addSkillItem(index);
    }
  }

  addSkillItem(index: number): void {
    const item = (this.chipDrafts()[index] ?? '').trim();
    if (!item) return;
    this.updateActiveSkills((skills) =>
      skills.map((cat, i) => {
        if (i !== index) return cat;
        if (cat.items.some((x) => x.toLowerCase() === item.toLowerCase())) return cat;
        return { ...cat, items: [...cat.items, item], origin: 'edited' };
      }),
    );
    this.setChipDraft(index, '');
  }

  removeSkillItem(index: number, item: string): void {
    this.updateActiveSkills((skills) =>
      skills.map((cat, i) =>
        i === index ? { ...cat, items: cat.items.filter((x) => x !== item), origin: 'edited' } : cat,
      ),
    );
  }

  hasTrack(category: ProfileSkillCategory, track: string): boolean {
    return category.tracks.includes(track);
  }

  toggleTrack(index: number, track: string): void {
    this.updateActiveSkills((skills) =>
      skills.map((cat, i) => {
        if (i !== index) return cat;
        const tracks = this.hasTrack(cat, track)
          ? cat.tracks.filter((t) => t !== track)
          : [...cat.tracks, track];
        return { ...cat, tracks, origin: 'edited' };
      }),
    );
  }

  resetVariantToCore(): void {
    const doc = this.document();
    const track = this.activeTab();
    if (!doc || track === CORE_TAB) return;
    const variant = doc.variants[track];
    if (!variant) return;
    this.draft.set({
      ...doc,
      variants: { ...doc.variants, [track]: { ...variant, skills: [] } },
    });
  }

  // ── Roles ──────────────────────────────────────────────────────────────

  private readonly roleActiveTabs = signal<Record<string, string>>({});

  roleActiveTab(role: ProfileRole): string {
    return this.roleActiveTabs()[role.id] ?? CORE_TAB;
  }

  selectRoleTab(role: ProfileRole, tab: string): void {
    this.roleActiveTabs.update((m) => ({ ...m, [role.id]: tab }));
  }

  /** Tracks this role already has an override for, in any of the four *_by_track maps. */
  roleOverrideTracks(role: ProfileRole): string[] {
    const keys = new Set<string>();
    for (const field of ROLE_TRACK_MAP_FIELDS) {
      for (const track of Object.keys(role[field])) keys.add(track);
    }
    return Array.from(keys);
  }

  roleTabs(role: ProfileRole): string[] {
    return [CORE_TAB, ...this.roleOverrideTracks(role)];
  }

  /** Known variant tracks this role has NOT started a rewrite for yet. */
  roleAvailableTracksToAdd(role: ProfileRole): string[] {
    const existing = new Set(this.roleOverrideTracks(role));
    return this.variantTracks().filter((t) => !existing.has(t));
  }

  private updateRole(roleId: string, mutate: (role: ProfileRole) => ProfileRole): void {
    const doc = this.draft();
    if (!doc) return;
    this.draft.set({
      ...doc,
      core: { ...doc.core, roles: doc.core.roles.map((r) => (r.id === roleId ? mutate(r) : r)) },
    });
  }

  updateRoleField<K extends keyof ProfileRole>(roleId: string, field: K, value: ProfileRole[K]): void {
    this.updateRole(roleId, (r) => ({ ...r, [field]: value, origin: 'edited' }));
  }

  updateBulletText(roleId: string, index: number, text: string): void {
    this.updateRole(roleId, (r) => ({
      ...r,
      bullets: r.bullets.map((b, i) => (i === index ? { ...b, text, origin: 'edited' } : b)),
    }));
  }

  addBullet(roleId: string): void {
    this.updateRole(roleId, (r) => ({
      ...r,
      bullets: [...r.bullets, { text: '', origin: 'edited', tracks: [] }],
    }));
  }

  removeBullet(roleId: string, index: number): void {
    this.updateRole(roleId, (r) => ({ ...r, bullets: r.bullets.filter((_, i) => i !== index) }));
  }

  moveBullet(roleId: string, index: number, direction: -1 | 1): void {
    this.updateRole(roleId, (r) => {
      const target = index + direction;
      if (target < 0 || target >= r.bullets.length) return r;
      const next = [...r.bullets];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...r, bullets: next };
    });
  }

  updateRoleTrackField(
    roleId: string,
    field: 'title_by_track' | 'subtitle_by_track' | 'stack_line_by_track',
    track: string,
    value: string,
  ): void {
    this.updateRole(roleId, (r) => ({ ...r, [field]: { ...r[field], [track]: value } }));
  }

  trackBullets(role: ProfileRole, track: string): string[] {
    return role.bullets_by_track[track] ?? [];
  }

  updateTrackBulletText(roleId: string, track: string, index: number, text: string): void {
    this.updateRole(roleId, (r) => ({
      ...r,
      bullets_by_track: {
        ...r.bullets_by_track,
        [track]: (r.bullets_by_track[track] ?? []).map((t, i) => (i === index ? text : t)),
      },
    }));
  }

  addTrackBullet(roleId: string, track: string): void {
    this.updateRole(roleId, (r) => ({
      ...r,
      bullets_by_track: { ...r.bullets_by_track, [track]: [...(r.bullets_by_track[track] ?? []), ''] },
    }));
  }

  removeTrackBullet(roleId: string, track: string, index: number): void {
    this.updateRole(roleId, (r) => ({
      ...r,
      bullets_by_track: {
        ...r.bullets_by_track,
        [track]: (r.bullets_by_track[track] ?? []).filter((_, i) => i !== index),
      },
    }));
  }

  moveTrackBullet(roleId: string, track: string, index: number, direction: -1 | 1): void {
    this.updateRole(roleId, (r) => {
      const list = r.bullets_by_track[track] ?? [];
      const target = index + direction;
      if (target < 0 || target >= list.length) return r;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...r, bullets_by_track: { ...r.bullets_by_track, [track]: next } };
    });
  }

  /** Seeds an override with a copy of the current core values, so editing starts from what renders today. */
  startTrackRewrite(role: ProfileRole, track: string): void {
    if (!track) return;
    this.updateRole(role.id, (r) => ({
      ...r,
      title_by_track: { ...r.title_by_track, [track]: r.title_by_track[track] ?? r.title },
      subtitle_by_track: { ...r.subtitle_by_track, [track]: r.subtitle_by_track[track] ?? r.subtitle },
      stack_line_by_track: {
        ...r.stack_line_by_track,
        [track]: r.stack_line_by_track[track] ?? r.stack_line,
      },
      bullets_by_track: {
        ...r.bullets_by_track,
        [track]: r.bullets_by_track[track] ?? r.bullets.map((b) => b.text),
      },
    }));
    this.selectRoleTab(role, track);
  }

  removeTrackOverride(role: ProfileRole, track: string): void {
    this.updateRole(role.id, (r) => ({
      ...r,
      title_by_track: omitKey(r.title_by_track, track),
      subtitle_by_track: omitKey(r.subtitle_by_track, track),
      stack_line_by_track: omitKey(r.stack_line_by_track, track),
      bullets_by_track: omitKey(r.bullets_by_track, track),
    }));
    this.selectRoleTab(role, CORE_TAB);
  }

  // ── Extras + generation notes ─────────────────────────────────────────

  addExtra(): void {
    const doc = this.draft();
    if (!doc) return;
    this.draft.set({
      ...doc,
      core: { ...doc.core, extras: [...doc.core.extras, { kind: 'other', text: '', origin: 'edited' }] },
    });
  }

  updateExtra(index: number, field: 'kind' | 'text', value: string): void {
    const doc = this.draft();
    if (!doc) return;
    this.draft.set({
      ...doc,
      core: {
        ...doc.core,
        extras: doc.core.extras.map((e, i) => (i === index ? { ...e, [field]: value, origin: 'edited' } : e)),
      },
    });
  }

  removeExtra(index: number): void {
    const doc = this.draft();
    if (!doc) return;
    this.draft.set({ ...doc, core: { ...doc.core, extras: doc.core.extras.filter((_, i) => i !== index) } });
  }

  updateGenerationNotes(value: string): void {
    const doc = this.draft();
    if (!doc) return;
    this.draft.set({ ...doc, core: { ...doc.core, generation_notes: value } });
  }

  discard(): void {
    const b = this.baseline();
    this.draft.set(b ? structuredClone(b) : null);
    this.activeTab.set(CORE_TAB);
    this.chipDrafts.set({});
    this.roleActiveTabs.set({});
    this.saveError.set(null);
    this.fieldErrors.set([]);
  }

  async save(): Promise<void> {
    const doc = this.draft();
    if (this.saving() || !this.isDirty() || !doc || this.hasBlockingErrors()) return;
    this.saving.set(true);
    this.saveError.set(null);
    this.fieldErrors.set([]);
    try {
      await this.api.put(doc);
      this.baseline.set(structuredClone(doc));
      this.snackBar.open('Saved — applies to the next generated CV.', undefined, { duration: 4000 });
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 404) {
          this.saveError.set(
            'API not available yet — saving is disabled until /api/profile is deployed.',
          );
        } else if (err.status === 400) {
          const body = err.error as ProfileErrors | null;
          this.fieldErrors.set(body?.errors ?? []);
          this.saveError.set('Fix the errors below and try again.');
        } else {
          this.saveError.set('Could not save your profile.');
        }
      } else {
        this.saveError.set('Could not save your profile.');
      }
    } finally {
      this.saving.set(false);
    }
  }

  private updateActiveSkills(
    mutate: (skills: ProfileSkillCategory[]) => ProfileSkillCategory[],
  ): void {
    const doc = this.draft();
    if (!doc) return;
    const tab = this.activeTab();
    if (tab === CORE_TAB) {
      this.draft.set({ ...doc, core: { ...doc.core, skills: mutate(doc.core.skills) } });
      return;
    }
    const variant = doc.variants[tab] ?? { headline: '', summary: '', skills: [] };
    this.draft.set({
      ...doc,
      variants: { ...doc.variants, [tab]: { ...variant, skills: mutate(variant.skills) } },
    });
  }
}
