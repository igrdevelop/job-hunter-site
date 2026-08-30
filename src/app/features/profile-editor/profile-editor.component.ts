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
  ProfileLocation,
  ProfileOrigin,
  ProfileSkillCategory,
} from '../../core/api/models';

/** The skills table edits either core.skills ('core') or variants[track].skills. */
const CORE_TAB = 'core';

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

  hybridSummary(location: ProfileLocation): string {
    const parts: string[] = [];
    if (location.acceptable_hybrid.length) {
      parts.push(`Acceptable: ${location.acceptable_hybrid.join(', ')}`);
    }
    if (location.weekly_hybrid.length) {
      parts.push(`Weekly: ${location.weekly_hybrid.join(', ')}`);
    }
    return parts.length ? parts.join(' · ') : '—';
  }

  experienceSummary(experience: ProfileExperience): string {
    if (!experience.years_label) return '—';
    return experience.since_year
      ? `${experience.years_label} (since ${experience.since_year})`
      : experience.years_label;
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

  discard(): void {
    const b = this.baseline();
    this.draft.set(b ? structuredClone(b) : null);
    this.activeTab.set(CORE_TAB);
    this.chipDrafts.set({});
    this.saveError.set(null);
    this.fieldErrors.set([]);
  }

  async save(): Promise<void> {
    const doc = this.draft();
    if (this.saving() || !this.isDirty() || !doc) return;
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
