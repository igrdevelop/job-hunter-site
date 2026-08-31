import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import { ManagePersonasDialogComponent } from './manage-personas-dialog.component';

describe('ManagePersonasDialogComponent', () => {
  let fixture: ComponentFixture<ManagePersonasDialogComponent>;
  let component: ManagePersonasDialogComponent;
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  async function createWith(tracks: string[]): Promise<void> {
    dialogRef = { close: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [ManagePersonasDialogComponent],
      providers: [
        provideAnimationsAsync(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { tracks } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ManagePersonasDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('lists one row per persona track', async () => {
    await createWith(['angular', 'react']);
    const rows = fixture.nativeElement.querySelectorAll('.persona-row');
    expect(rows.length).toBe(2);
    expect((rows[0] as HTMLElement).textContent).toContain('angular');
    expect((rows[1] as HTMLElement).textContent).toContain('react');
  });

  it('shows an empty state when there are no personas', async () => {
    await createWith([]);
    expect(fixture.nativeElement.textContent).toContain('No personas left.');
  });

  it('confirmDelete() does nothing when the user cancels', async () => {
    await createWith(['angular', 'react']);
    vi.stubGlobal('confirm', () => false);

    component.confirmDelete('react');

    expect(component.remaining()).toEqual(['angular', 'react']);
  });

  it('confirmDelete() removes the row from view and tracks it for close(), warning about the stale base CV', async () => {
    await createWith(['angular', 'react']);
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);

    component.confirmDelete('react');

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('base_cv_react.md'));
    expect(component.remaining()).toEqual(['angular']);
  });

  it('close() resolves with every confirmed delete, in order', async () => {
    await createWith(['angular', 'react', 'ai']);
    vi.stubGlobal('confirm', () => true);

    component.confirmDelete('react');
    component.confirmDelete('ai');
    component.close();

    expect(dialogRef.close).toHaveBeenCalledWith(['react', 'ai']);
  });

  it('close() resolves with an empty array when nothing was deleted', async () => {
    await createWith(['angular']);
    component.close();
    expect(dialogRef.close).toHaveBeenCalledWith([]);
  });
});
