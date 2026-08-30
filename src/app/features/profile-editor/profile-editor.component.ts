import { ChangeDetectionStrategy, Component, computed, effect, inject, resource, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
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
import { UploadResumeDialogComponent } from './upload-resume-dialog/upload-resume-dialog.component';
import {
  RevisionsHistoryDialogComponent,
  RevisionsHistoryDialogData,
} from './revisions-history-dialog/revisions-history-dialog.component';
import { safeResourceValue } from '../../core/utils/resource-value';

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

/** "Same role" heuristic (F5): normalized company + an identical period string.
 * Free-text date-range overlap math is out of scope — an exact period match
 * is the safe, simple case the doc's heuristic is meant to catch. */
function normalizeCompany(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function isSameRole(a: ProfileRole, b: ProfileRole): boolean {
  return (
    normalizeCompany(a.company) === normalizeCompany(b.company) &&
    a.period.trim().toLowerCase() === b.period.trim().toLowerCase()
  );
}

/** Unions two string lists case-insensitively, deduping WITHIN `incoming` too (not just against `current`). */
function unionCaseInsensitive(current: string[], incoming: string[]): string[] {
  const seen = new Set(current.map((s) => s.toLowerCase()));
  const additions: string[] = [];
  for (const item of incoming) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      additions.push(item);
    }
  }
  return [...current, ...additions];
}

/** Same as unionCaseInsensitive, for a list of objects keyed by their own `.text` (e.g. education entries). */
function unionByTextCaseInsensitive<T extends { text: string }>(current: T[], incoming: T[]): T[] {
  const seen = new Set(current.map((e) => e.text.trim().toLowerCase()));
  const additions: T[] = [];
  for (const item of incoming) {
    const key = item.text.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      additions.push(item);
    }
  }
  return [...current, ...additions];
}

/** Appends `-2`, `-3`, … until the id no longer collides — the merge's last line of defense against id reuse. */
function uniqueRoleId(existingIds: Set<string>, id: string): string {
  if (!existingIds.has(id)) return id;
  let n = 2;
  while (existingIds.has(`${id}-${n}`)) n++;
  return `${id}-${n}`;
}

/** Fills only the CURRENTLY EMPTY string fields in `keys` from `parsed` — never overwrites existing content. */
function fillEmptyStrings<T extends object>(current: T, parsed: T, keys: (keyof T)[]): T {
  const next = { ...current } as Record<string, unknown>;
  const parsedRecord = parsed as Record<string, unknown>;
  for (const key of keys) {
    const k = key as string;
    const curVal = next[k];
    const parsedVal = parsedRecord[k];
    if (typeof curVal === 'string' && typeof parsedVal === 'string' && !curVal.trim() && parsedVal.trim()) {
      next[k] = parsedVal;
    }
  }
  return next as T;
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
  private readonly dialog = inject(MatDialog);

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
    () =>
      this.profileResource.hasValue() &&
      !this.errorMessage() &&
      this.document() === null &&
      !this.parsedDraft(),
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
    if (!d) return false;
    if (!b) return true; // no server-side profile yet — a "start from scratch" draft is always worth saving
    return JSON.stringify(b) !== JSON.stringify(d);
  });

  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly fieldErrors = signal<string[]>([]);

  /** Bumped every time the load effect re-seeds baseline/draft from the server (initial load or a reload). */
  private loadGeneration = 0;

  constructor() {
    effect(() => {
      if (!this.profileResource.hasValue()) return;
      const doc = safeResourceValue(this.profileResource)?.profile ?? null;
      this.loadGeneration++;
      this.baseline.set(doc ? structuredClone(doc) : null);
      this.draft.set(doc ? structuredClone(doc) : null);
      this.activeTab.set(CORE_TAB);
      this.chipDrafts.set({});
      this.questionnaireChipDrafts.set({});
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
    // chipDrafts is keyed by row position within the ACTIVE tab's list — an index
    // from the previous tab means nothing here, so drop any uncommitted text
    // rather than let it silently attach to an unrelated category on the new tab.
    this.chipDrafts.set({});
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
    // chipDrafts is keyed by row position — shift every key above the removed
    // row down by one so an uncommitted draft stays attached to its own category.
    this.chipDrafts.update((m) => {
      const next: Record<number, string> = {};
      for (const [key, value] of Object.entries(m)) {
        const i = Number(key);
        if (i < index) next[i] = value;
        else if (i > index) next[i - 1] = value;
      }
      return next;
    });
  }

  moveCategory(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= this.activeSkills().length) return;
    this.updateActiveSkills((skills) => {
      const next = [...skills];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    // Swap the chip drafts along with the rows so an uncommitted draft follows
    // the category it was typed into, not whatever now sits at that index.
    this.chipDrafts.update((m) => {
      const next = { ...m };
      const a = next[index];
      const b = next[target];
      if (b !== undefined) next[index] = b;
      else delete next[index];
      if (a !== undefined) next[target] = a;
      else delete next[target];
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

  // ── F5: upload → parse → confirmation ────────────────────────────────

  /** Set once a parse job finishes — the confirmation screen replaces the normal editor while this is non-null. */
  readonly parsedDraft = signal<ProfileDocument | null>(null);
  private readonly skillAcceptance = signal<Record<string, boolean>>({});
  private readonly roleChoices = signal<Record<string, 'accept' | 'discard' | 'keep-both'>>({});

  leftoverSourceFilename(leftover: { source_upload_id: string }): string | null {
    return this.document()?.uploads.find((u) => u.id === leftover.source_upload_id)?.filename ?? null;
  }

  startFromScratch(): void {
    const blank: ProfileDocument = {
      schema_version: 1,
      core: {
        identity: { full_name: '', aka: '', headline: '', contact: '', cv_filename_prefix: '' },
        location: {
          home_city: '',
          home_city_aliases: [],
          acceptable_hybrid: [],
          weekly_hybrid: [],
          work_authorization: '',
        },
        languages: { spoken: [], cv_languages: [], disqualify_required: [] },
        employers: { protected: [], flexible: { name: '', period: '', projects: [] } },
        education: { entries: [], school_keyword: '', expected_role_count: 0 },
        experience: { years_label: '', since_year: 0 },
        summary: '',
        roles: [],
        skills: [],
        extras: [],
        generation_notes: '',
      },
      variants: {},
      leftovers: [],
      uploads: [],
    };
    this.draft.set(blank);
  }

  openUploadDialog(): void {
    const ref = this.dialog.open<UploadResumeDialogComponent, unknown, ProfileDocument | undefined>(
      UploadResumeDialogComponent,
      { width: '480px' },
    );
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.parsedDraft.set(result);
      this.skillAcceptance.set({});
      this.roleChoices.set({});
    });
  }

  // ── F6: revision history ─────────────────────────────────────────────

  openHistoryDialog(): void {
    const ref = this.dialog.open<RevisionsHistoryDialogComponent, RevisionsHistoryDialogData, boolean>(
      RevisionsHistoryDialogComponent,
      { width: '480px', data: { hasUnsavedEdits: this.isDirty() } },
    );
    ref.afterClosed().subscribe((restored) => {
      if (restored) {
        this.profileResource.reload();
      }
    });
  }

  private skillProposalKey(cat: ProfileSkillCategory): string {
    return cat.category.trim().toLowerCase();
  }

  readonly parsedSkillProposals = computed(() => {
    const parsed = this.parsedDraft();
    if (!parsed) return [];
    const current = this.document();
    // Collapse same-named categories WITHIN the parsed draft itself first — a
    // resume that yields e.g. both "Tools" and "tools" must produce one
    // proposal (items unioned), not two that fight over the same merge slot.
    const collapsed = new Map<string, ProfileSkillCategory>();
    for (const cat of parsed.core.skills) {
      const key = this.skillProposalKey(cat);
      const existing = collapsed.get(key);
      collapsed.set(key, existing ? { ...existing, items: unionCaseInsensitive(existing.items, cat.items) } : cat);
    }
    return Array.from(collapsed.values()).map((cat) => {
      const match = current?.core.skills.find(
        (c) => this.skillProposalKey(c) === this.skillProposalKey(cat),
      );
      return { parsed: cat, match: match ?? null, isEditedCollision: match?.origin === 'edited' };
    });
  });

  /** Default: accept a new category or a non-edited collision; skip (keep mine) a collision with edited content. */
  acceptSkillProposal(cat: ProfileSkillCategory): boolean {
    const key = this.skillProposalKey(cat);
    const explicit = this.skillAcceptance()[key];
    if (explicit !== undefined) return explicit;
    const proposal = this.parsedSkillProposals().find((p) => this.skillProposalKey(p.parsed) === key);
    return proposal ? !proposal.isEditedCollision : true;
  }

  toggleSkillProposal(cat: ProfileSkillCategory): void {
    const key = this.skillProposalKey(cat);
    this.skillAcceptance.update((m) => ({ ...m, [key]: !this.acceptSkillProposal(cat) }));
  }

  readonly parsedRoleProposals = computed(() => {
    const parsed = this.parsedDraft();
    if (!parsed) return [];
    const current = this.document();
    return parsed.core.roles.map((role) => ({
      parsed: role,
      duplicate: current?.core.roles.find((r) => isSameRole(r, role)) ?? null,
    }));
  });

  /** Never auto-merges a duplicate — the safe default is to discard the incoming copy, same "keep mine" spirit as skills. */
  roleChoice(role: ProfileRole): 'accept' | 'discard' | 'keep-both' {
    const explicit = this.roleChoices()[role.id];
    if (explicit) return explicit;
    const proposal = this.parsedRoleProposals().find((p) => p.parsed.id === role.id);
    return proposal?.duplicate ? 'discard' : 'accept';
  }

  setRoleChoice(role: ProfileRole, choice: 'accept' | 'discard' | 'keep-both'): void {
    this.roleChoices.update((m) => ({ ...m, [role.id]: choice }));
  }

  discardParsedDraft(): void {
    this.parsedDraft.set(null);
    this.skillAcceptance.set({});
    this.roleChoices.set({});
  }

  applyParsedMerge(): void {
    const parsed = this.parsedDraft();
    if (!parsed) return;
    const current = this.document();

    const acceptedSkills = this.parsedSkillProposals()
      .filter((p) => this.acceptSkillProposal(p.parsed))
      .map((p) => p.parsed);
    const acceptedRoles = this.parsedRoleProposals().filter((p) => this.roleChoice(p.parsed) !== 'discard');

    if (!current) {
      // Nothing to merge with yet — adopt the parsed draft wholesale (still respecting per-item choices).
      this.draft.set({
        ...parsed,
        core: { ...parsed.core, skills: acceptedSkills, roles: acceptedRoles.map((p) => p.parsed) },
      });
      this.discardParsedDraft();
      return;
    }

    let skills = [...current.core.skills];
    for (const cat of acceptedSkills) {
      const idx = skills.findIndex((c) => this.skillProposalKey(c) === this.skillProposalKey(cat));
      if (idx < 0) {
        skills = [...skills, cat];
        continue;
      }
      // A collision: union into the EXISTING category rather than replacing it
      // outright — every other merge in this function is additive, and a bare
      // replace would silently drop whatever items this particular upload
      // doesn't happen to mention (docs/RESUME_PROFILE_STORE.md: nothing gets
      // silently dropped, fuller is always better).
      const existing = skills[idx];
      skills = skills.map((c, i) =>
        i === idx
          ? {
              ...existing,
              items: unionCaseInsensitive(existing.items, cat.items),
              tracks: unionCaseInsensitive(existing.tracks, cat.tracks),
            }
          : c,
      );
    }

    let roles = [...current.core.roles];
    for (const proposal of acceptedRoles) {
      const choice = this.roleChoice(proposal.parsed);
      if (choice === 'keep-both' || !proposal.duplicate) {
        // A genuinely new slot — the parsed role's own id could still collide
        // with an existing (or already-pushed-this-loop) role's id, so make
        // sure whatever lands in `roles` is unique before it does.
        const existingIds = new Set(roles.map((r) => r.id));
        const role = existingIds.has(proposal.parsed.id)
          ? { ...proposal.parsed, id: uniqueRoleId(existingIds, proposal.parsed.id) }
          : proposal.parsed;
        roles = [...roles, role];
      } else {
        // Replacing an existing role's content in place — keep ITS id rather
        // than adopting the parsed role's id, which both avoids a possible
        // collision with a third, unrelated role and keeps the role's
        // identity in the document stable across the merge.
        const targetId = proposal.duplicate.id;
        roles = roles.map((r) => (r.id === targetId ? { ...proposal.parsed, id: targetId } : r));
      }
    }

    const merged: ProfileDocument = {
      ...current,
      core: {
        ...current.core,
        identity: fillEmptyStrings(current.core.identity, parsed.core.identity, [
          'full_name',
          'aka',
          'headline',
          'contact',
          'cv_filename_prefix',
        ]),
        location: {
          ...fillEmptyStrings(current.core.location, parsed.core.location, [
            'home_city',
            'work_authorization',
          ]),
          home_city_aliases: unionCaseInsensitive(
            current.core.location.home_city_aliases,
            parsed.core.location.home_city_aliases,
          ),
          acceptable_hybrid: unionCaseInsensitive(
            current.core.location.acceptable_hybrid,
            parsed.core.location.acceptable_hybrid,
          ),
          weekly_hybrid: unionCaseInsensitive(
            current.core.location.weekly_hybrid,
            parsed.core.location.weekly_hybrid,
          ),
        },
        languages: {
          ...current.core.languages,
          disqualify_required: unionCaseInsensitive(
            current.core.languages.disqualify_required,
            parsed.core.languages.disqualify_required,
          ),
        },
        employers: {
          ...current.core.employers,
          protected: unionCaseInsensitive(current.core.employers.protected, parsed.core.employers.protected),
          flexible: {
            ...fillEmptyStrings(current.core.employers.flexible, parsed.core.employers.flexible, [
              'name',
              'period',
            ]),
            projects: unionCaseInsensitive(
              current.core.employers.flexible.projects,
              parsed.core.employers.flexible.projects,
            ),
          },
        },
        education: {
          ...fillEmptyStrings(current.core.education, parsed.core.education, ['school_keyword']),
          entries: unionByTextCaseInsensitive(current.core.education.entries, parsed.core.education.entries),
          expected_role_count:
            current.core.education.expected_role_count || parsed.core.education.expected_role_count,
        },
        summary: current.core.summary.trim() ? current.core.summary : parsed.core.summary,
        experience: {
          ...fillEmptyStrings(current.core.experience, parsed.core.experience, ['years_label']),
          since_year: current.core.experience.since_year || parsed.core.experience.since_year,
        },
        skills,
        roles,
        extras: [...current.core.extras, ...parsed.core.extras],
      },
      leftovers: [...current.leftovers, ...parsed.leftovers],
      uploads: [...current.uploads, ...parsed.uploads],
    };

    this.draft.set(merged);
    this.discardParsedDraft();
  }

  discard(): void {
    const b = this.baseline();
    this.draft.set(b ? structuredClone(b) : null);
    this.activeTab.set(CORE_TAB);
    this.chipDrafts.set({});
    this.questionnaireChipDrafts.set({});
    this.roleActiveTabs.set({});
    this.saveError.set(null);
    this.fieldErrors.set([]);
  }

  async save(): Promise<void> {
    const doc = this.draft();
    if (this.saving() || !this.isDirty() || !doc || this.hasBlockingErrors()) return;
    const generationAtStart = this.loadGeneration;
    this.saving.set(true);
    this.saveError.set(null);
    this.fieldErrors.set([]);
    try {
      await this.api.put(doc);
      // If a reload (e.g. a revision restore) landed while this save was in
      // flight, its fresh baseline is more current than this stale snapshot —
      // applying `doc` here would silently revert what the reload just set.
      if (this.loadGeneration === generationAtStart) {
        this.baseline.set(structuredClone(doc));
      }
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
