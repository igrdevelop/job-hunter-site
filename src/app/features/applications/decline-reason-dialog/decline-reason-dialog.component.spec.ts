import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import {
  DeclineReasonDialogComponent,
  DeclineReasonDialogData,
} from './decline-reason-dialog.component';

describe('DeclineReasonDialogComponent', () => {
  let fixture: ComponentFixture<DeclineReasonDialogComponent>;
  let component: DeclineReasonDialogComponent;
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  async function createWith(data: DeclineReasonDialogData): Promise<void> {
    dialogRef = { close: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [DeclineReasonDialogComponent],
      providers: [
        provideAnimationsAsync(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DeclineReasonDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => vi.restoreAllMocks());

  it('titles the dialog "Why skipped?" for Skipped', async () => {
    await createWith({ status: 'Skipped', reason: '', note: '' });
    expect(fixture.nativeElement.querySelector('h2').textContent).toBe('Why skipped?');
  });

  it('titles the dialog "Which filter should have caught it?" for Filter miss', async () => {
    await createWith({ status: 'Filter miss', reason: '', note: '' });
    expect(fixture.nativeElement.querySelector('h2').textContent).toBe(
      'Which filter should have caught it?',
    );
  });

  it('lists every reason code for Skipped, including the Skipped-only ones', async () => {
    await createWith({ status: 'Skipped', reason: '', note: '' });
    const codes = component.reasons.map((r) => r.code);
    expect(codes).toContain('salary');
    expect(codes).toContain('not_interesting');
    expect(codes).toContain('stack');
  });

  it('hides salary and not_interesting for Filter miss', async () => {
    await createWith({ status: 'Filter miss', reason: '', note: '' });
    const codes = component.reasons.map((r) => r.code);
    expect(codes).not.toContain('salary');
    expect(codes).not.toContain('not_interesting');
    expect(codes).toContain('stack');
  });

  it('disables Save until a reason is picked', async () => {
    await createWith({ status: 'Skipped', reason: '', note: '' });
    const saveBtn = fixture.nativeElement.querySelector('button[color="primary"]') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);

    component.reason = 'stack';
    fixture.detectChanges();
    expect(saveBtn.disabled).toBe(false);
  });

  it('is pre-filled when editing an existing reason', async () => {
    await createWith({ status: 'Skipped', reason: 'location', note: '3 days in Kraków' });
    expect(component.reason).toBe('location');
    expect(component.note).toBe('3 days in Kraków');
  });

  it('save() closes with the chosen reason and trimmed comment', async () => {
    await createWith({ status: 'Skipped', reason: '', note: '' });
    component.reason = 'location';
    component.note = '  3 days in Kraków  ';

    component.save();

    expect(dialogRef.close).toHaveBeenCalledWith({ reason: 'location', note: '3 days in Kraków' });
  });

  it('save() does nothing when no reason is picked', async () => {
    await createWith({ status: 'Skipped', reason: '', note: '' });
    component.save();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('cancel() closes with undefined — no change at all', async () => {
    await createWith({ status: 'Skipped', reason: 'stack', note: 'some note' });
    component.cancel();
    expect(dialogRef.close).toHaveBeenCalledWith(undefined);
  });

  it('enforces the 500-char comment limit via maxlength', async () => {
    await createWith({ status: 'Skipped', reason: '', note: '' });
    const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.maxLength).toBe(500);
  });
});
