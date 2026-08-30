import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ProfileApi } from '../../core/api/profile.api';
import { ProfileExperience, ProfileLocation, ProfileOrigin } from '../../core/api/models';

@Component({
  selector: 'app-profile-editor',
  imports: [RouterLink, MatProgressSpinnerModule],
  templateUrl: './profile-editor.component.html',
  styleUrl: './profile-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileEditorComponent {
  private readonly api = inject(ProfileApi);

  private readonly profileResource = resource({
    loader: () => this.api.get(),
  });

  readonly loading = this.profileResource.isLoading;
  readonly errorMessage = computed(() =>
    this.profileResource.error() ? 'Could not load your profile. Is the API reachable?' : null,
  );

  /** null once loaded = the user has no profile yet (a real 404). */
  readonly document = computed(() => {
    if (!this.profileResource.hasValue()) return null;
    return this.profileResource.value()?.profile ?? null;
  });

  readonly showEmptyState = computed(
    () => this.profileResource.hasValue() && !this.errorMessage() && this.document() === null,
  );

  readonly skills = computed(() => this.document()?.core.skills ?? []);
  readonly roles = computed(() => this.document()?.core.roles ?? []);
  readonly leftovers = computed(() => this.document()?.leftovers ?? []);

  /** Rule: with ≤ 1 variant, track UI stays invisible — a customer sees a plain editor. */
  readonly hasMultipleVariants = computed(
    () => Object.keys(this.document()?.variants ?? {}).length > 1,
  );

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
}
