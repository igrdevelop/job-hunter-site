import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export interface TextPreviewData {
  fileName: string;
  content: string;
}

@Component({
  selector: 'app-text-preview-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.fileName }}</h2>
    <mat-dialog-content>
      <pre class="content">{{ data.content }}</pre>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .content {
        white-space: pre-wrap;
        word-break: break-word;
        font-family: 'Roboto Mono', monospace;
        font-size: 0.875rem;
        max-height: 60vh;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextPreviewDialogComponent {
  readonly data = inject<TextPreviewData>(MAT_DIALOG_DATA);
}
