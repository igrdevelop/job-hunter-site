import { Component, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-inline-edit-cell',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (editing()) {
      <input
        #input
        class="edit-input"
        [type]="type()"
        [(ngModel)]="draft"
        (keydown.enter)="commit()"
        (keydown.escape)="cancel()"
        (blur)="commit()"
      />
    } @else {
      <button type="button" class="cell-value" (click)="startEdit()">
        {{ value() || placeholder() }}
      </button>
    }
  `,
  styles: [
    `
      .cell-value {
        background: none;
        border: none;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
        font: inherit;
        text-align: left;
        color: inherit;
      }
      .cell-value:hover {
        background: rgba(0, 0, 0, 0.06);
      }
      .edit-input {
        font: inherit;
        padding: 2px 6px;
        width: 100%;
        max-width: 140px;
      }
    `,
  ],
})
export class InlineEditCellComponent {
  readonly value = input<string>('');
  readonly type = input<'text' | 'date'>('text');
  readonly placeholder = input('—');
  readonly saved = output<string>();

  private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('input');

  readonly editing = signal(false);
  draft = '';

  startEdit(): void {
    this.draft = this.value();
    this.editing.set(true);
    queueMicrotask(() => this.inputRef()?.nativeElement.focus());
  }

  commit(): void {
    if (!this.editing()) {
      return;
    }
    this.editing.set(false);
    if (this.draft !== this.value()) {
      this.saved.emit(this.draft);
    }
  }

  cancel(): void {
    this.editing.set(false);
    this.draft = this.value();
  }
}
