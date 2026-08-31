import { ChangeDetectionStrategy, Component, computed, effect, inject, output, resource } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ProfileApi } from '../../core/api/profile.api';
import { ProfileDocument, ProfileJobStatus, ProfileUploadListEntry } from '../../core/api/models';
import { UploadResumeDialogComponent } from '../profile-editor/upload-resume-dialog/upload-resume-dialog.component';
import { ProfileDraftBridgeService } from '../profile-editor/profile-draft-bridge.service';
import { safeResourceValue } from '../../core/utils/resource-value';

const STATUS_LABEL: Record<ProfileJobStatus, string> = {
  pending: 'Pending',
  running: 'Parsing…',
  done: 'Done',
  error: 'Error — re-upload to retry',
};

/**
 * docs/PROFILE_PAGE_TABS.md tab 1 (Uploads) — relocates F5's upload entry
 * point here. The dialog and its poll/confirmation logic are the SAME
 * `UploadResumeDialogComponent` F5 built (not duplicated); a completed parse
 * is handed to `ProfileEditorComponent` via `ProfileDraftBridgeService` and
 * this component asks the tab shell (via the `completed` output) to switch
 * to the editor tab, where F5's existing confirmation screen takes over
 * unchanged.
 */
@Component({
  selector: 'app-profile-uploads',
  imports: [DatePipe, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './profile-uploads.component.html',
  styleUrl: './profile-uploads.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileUploadsComponent {
  private readonly api = inject(ProfileApi);
  private readonly dialog = inject(MatDialog);
  private readonly draftBridge = inject(ProfileDraftBridgeService);

  /** Emitted once a parse completes and the draft has been handed to the bridge — the tab shell switches to `editor`. */
  readonly completed = output<void>();

  private readonly uploadsResource = resource({
    loader: () => this.api.listUploads(),
  });

  readonly loading = this.uploadsResource.isLoading;
  readonly uploads = computed<ProfileUploadListEntry[]>(() => safeResourceValue(this.uploadsResource) ?? []);

  /**
   * `GET /api/profile/uploads` is api T2 — not deployed yet. A 404 there is
   * "the listing isn't live", not a real error: show a calm state instead of
   * the generic error message — never fabricate rows for a list the server
   * can't give.
   */
  readonly unavailable = computed(() => {
    const err = this.uploadsResource.error();
    return err instanceof HttpErrorResponse && err.status === 404;
  });

  readonly errorMessage = computed(() => {
    const err = this.uploadsResource.error();
    if (!err || this.unavailable()) return null;
    return 'Could not load your upload history. Is the API reachable?';
  });

  constructor() {
    // console.warn once per 404 transition — mirrors PROFILE_MOCK_FALLBACK_ENABLED's
    // philosophy of surfacing an undeployed endpoint loudly in devtools without
    // breaking the page for the user.
    effect(() => {
      if (this.unavailable()) {
        console.warn(
          '[ProfileUploadsComponent] GET /api/profile/uploads returned 404 — upload history is not available yet.',
        );
      }
    });
  }

  statusLabel(status: ProfileJobStatus): string {
    return STATUS_LABEL[status] ?? status;
  }

  isTerminalError(status: ProfileJobStatus): boolean {
    return status === 'error';
  }

  openUploadDialog(): void {
    const ref = this.dialog.open<UploadResumeDialogComponent, unknown, ProfileDocument | undefined>(
      UploadResumeDialogComponent,
      { width: '480px' },
    );
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.draftBridge.submit(result);
      this.uploadsResource.reload();
      this.completed.emit();
    });
  }
}
