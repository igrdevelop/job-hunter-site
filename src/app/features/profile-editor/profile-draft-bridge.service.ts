import { Injectable, signal } from '@angular/core';
import { ProfileDocument } from '../../core/api/models';

/**
 * docs/PROFILE_PAGE_TABS.md S2: the Uploads tab (tab 1) and the Editor tab
 * (tab 2, `ProfileEditorComponent`) are SIBLING sections under the tab shell's
 * `@switch` — only one is ever mounted at a time, so a component reference
 * can't be passed directly between them. This tiny root-provided service is
 * the handoff: the Uploads tab's own upload dialog (the SAME
 * `UploadResumeDialogComponent` F5 already built — not duplicated) submits
 * the parsed draft here and asks the tab shell to switch to `editor`;
 * `ProfileEditorComponent` consumes it once its own profile load completes,
 * feeding the exact same `parsedDraft`/confirmation-screen flow a same-tab
 * "Upload another resume to merge" click already uses. F5's merge/confirm
 * logic itself is untouched — this only relocates where the button lives.
 */
@Injectable({ providedIn: 'root' })
export class ProfileDraftBridgeService {
  private readonly pendingDraft = signal<ProfileDocument | null>(null);

  /** Reactive so a consumer's `effect()` can wait for both "profile loaded" and "draft pending". */
  readonly pending = this.pendingDraft.asReadonly();

  submit(doc: ProfileDocument): void {
    this.pendingDraft.set(doc);
  }

  /** Reads and clears in one step — a bridged draft is consumed exactly once. */
  consume(): ProfileDocument | null {
    const value = this.pendingDraft();
    if (value) this.pendingDraft.set(null);
    return value;
  }
}
