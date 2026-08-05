import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-pdf-preview',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="preview-header">
      <span>{{ fileName() }}</span>
      <a mat-button [href]="fileUrl()" target="_blank" rel="noopener">
        <mat-icon>download</mat-icon>
        Download
      </a>
    </div>
    <iframe [src]="safeUrl()" class="pdf-frame" title="PDF preview"></iframe>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: 8px;
        height: 100%;
      }
      .preview-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .pdf-frame {
        flex: 1;
        min-height: 480px;
        width: 100%;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 4px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfPreviewComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly fileUrl = input.required<string>();
  readonly fileName = input.required<string>();

  readonly safeUrl = computed(() => this.sanitizer.bypassSecurityTrustResourceUrl(this.fileUrl()));
}
