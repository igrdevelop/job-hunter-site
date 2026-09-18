import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import { AppStatusCellRendererComponent, AppStatusCellRendererParams } from './app-status-cell-renderer.component';
import { Application } from '../../../core/api/models';

function baseApplication(): Application {
  return {
    id: '42',
    date: '2026-09-01',
    company: 'Acme',
    title: 'Engineer',
    stack: 'Angular',
    atsStatus: '',
    url: '',
    folder: '',
    sent: '',
    toLearn: '',
    costUsd: null,
    atsVerdict: null,
  };
}

describe('AppStatusCellRendererComponent', () => {
  let fixture: ComponentFixture<AppStatusCellRendererComponent>;
  let component: AppStatusCellRendererComponent;
  let onSelect: ReturnType<typeof vi.fn>;
  let onMenuOpenChange: ReturnType<typeof vi.fn>;

  async function setup(value: string, overrides: Partial<Application> = {}): Promise<void> {
    onSelect = vi.fn();
    onMenuOpenChange = vi.fn();
    await TestBed.configureTestingModule({
      imports: [AppStatusCellRendererComponent],
      providers: [provideAnimationsAsync()],
    }).compileComponents();

    fixture = TestBed.createComponent(AppStatusCellRendererComponent);
    component = fixture.componentInstance;
    const data = { ...baseApplication(), appStatus: value, ...overrides };
    const node = { data };
    component.agInit({
      value,
      data,
      node,
      onSelect,
      onMenuOpenChange,
    } as unknown as AppStatusCellRendererParams);
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.restoreAllMocks();
    // mat-menu appends its overlay to document.body — clean up between tests
    // so a leftover panel from one test can't leak into the next.
    document.querySelectorAll('.cdk-overlay-container').forEach((el) => el.remove());
  });

  function openMenu(): void {
    const trigger = fixture.nativeElement.querySelector('.status-pill') as HTMLElement;
    trigger.click();
    fixture.detectChanges();
  }

  function menuItems(): HTMLElement[] {
    return Array.from(document.querySelectorAll('.cdk-overlay-container [mat-menu-item]'));
  }

  it('shows the current status on the pill', async () => {
    await setup('Interview');
    expect(fixture.nativeElement.querySelector('.status-pill').textContent).toContain('Interview');
  });

  it('shows a muted "Set status" placeholder when empty', async () => {
    await setup('');
    const pill = fixture.nativeElement.querySelector('.status-pill');
    expect(pill.textContent).toContain('Set status');
    expect(pill.classList.contains('status-pill--empty')).toBe(true);
  });

  it('exposes the current status via a dynamic aria-label, not a static one', async () => {
    await setup('Interview');
    const pill = fixture.nativeElement.querySelector('.status-pill') as HTMLElement;
    expect(pill.getAttribute('aria-label')).toBe('My status: Interview');
  });

  it('labels an empty status distinctly for screen readers', async () => {
    await setup('');
    const pill = fixture.nativeElement.querySelector('.status-pill') as HTMLElement;
    expect(pill.getAttribute('aria-label')).toBe('My status: not set');
  });

  it('a single click opens the mat-menu as a CDK overlay on document.body', async () => {
    await setup('');
    expect(menuItems().length).toBe(0);

    openMenu();

    expect(menuItems().length).toBeGreaterThan(0);
  });

  it('offers the full menu layout: Sent, the four outcomes, the two decline statuses, and Clear', async () => {
    await setup('');
    openMenu();
    const labels = menuItems().map((el) => el.textContent?.trim());
    expect(labels).toEqual([
      'Sent',
      'Interview',
      'Rejected',
      'Offer',
      'Silence',
      'Skipped…',
      'Filter miss…',
      'Clear',
    ]);
  });

  it('calls onSelect with the row node and the chosen status', async () => {
    await setup('');
    openMenu();
    const skipped = menuItems().find((el) => el.textContent?.trim() === 'Skipped…')!;
    skipped.click();

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ id: '42' }) }),
      'Skipped',
      expect.any(HTMLElement),
    );
  });

  it('passes its own pill button as the third onSelect argument, for dialog focus restore', async () => {
    await setup('');
    openMenu();
    const skipped = menuItems().find((el) => el.textContent?.trim() === 'Skipped…')!;
    skipped.click();

    const triggerElement = onSelect.mock.calls[0][2];
    expect(triggerElement).toBe(fixture.nativeElement.querySelector('.status-pill'));
  });

  it('calls onSelect with an empty string for Clear', async () => {
    await setup('Sent');
    openMenu();
    const clear = menuItems().find((el) => el.textContent?.trim() === 'Clear')!;
    clear.click();

    expect(onSelect).toHaveBeenCalledWith(expect.anything(), '', expect.any(HTMLElement));
  });

  it('reports menu open to the host so it can pause the grid refresh', async () => {
    await setup('');
    openMenu();
    expect(onMenuOpenChange).toHaveBeenCalledWith(true);
  });

  it('releases the host pause when destroyed with the menu still open', async () => {
    await setup('');
    openMenu();
    onMenuOpenChange.mockClear();

    fixture.destroy();

    expect(onMenuOpenChange).toHaveBeenCalledWith(false);
  });

  it('refresh() re-renders the current value', async () => {
    await setup('Sent');
    const node = { data: baseApplication() };
    component.refresh({ value: 'Rejected', node, onSelect } as unknown as AppStatusCellRendererParams);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.status-pill').textContent).toContain('Rejected');
  });

  // The bot writes SKIP when its filter rejected the vacancy and FAIL when
  // generation errored out: nothing was sent either way, so there is no
  // outcome for the owner to record.
  for (const atsStatus of ['SKIP', 'FAIL']) {
    it(`renders a read-only cell with no pill or menu for an ${atsStatus} row`, async () => {
      await setup('', { atsStatus });

      expect(fixture.nativeElement.querySelector('.status-pill')).toBeNull();
      expect(fixture.nativeElement.querySelector('.status-locked')?.textContent?.trim()).toBe('—');
      expect(menuItems().length).toBe(0);
    });
  }

  it('explains in the cell tooltip why a SKIP row has no status to set', async () => {
    await setup('', { atsStatus: 'SKIP' });
    const locked = fixture.nativeElement.querySelector('.status-locked') as HTMLElement;
    expect(locked.getAttribute('title')).toContain('Skipped by the job filter');
  });

  it('explains in the cell tooltip why a FAIL row has no status to set', async () => {
    await setup('', { atsStatus: 'FAIL' });
    const locked = fixture.nativeElement.querySelector('.status-locked') as HTMLElement;
    expect(locked.getAttribute('title')).toContain('Generation failed');
  });

  it('keeps the menu on a SKIP row that already carries a status, so it can still be corrected', async () => {
    await setup('Sent', { atsStatus: 'SKIP' });

    expect(fixture.nativeElement.querySelector('.status-locked')).toBeNull();
    expect(fixture.nativeElement.querySelector('.status-pill')).not.toBeNull();
    openMenu();
    expect(menuItems().length).toBeGreaterThan(0);
  });

  it('still offers the menu on an ordinary scored row', async () => {
    await setup('', { atsStatus: '82%' });
    expect(fixture.nativeElement.querySelector('.status-pill')).not.toBeNull();
  });

  it('locks the cell when a refresh turns an ordinary row into a SKIP row', async () => {
    await setup('', { atsStatus: '82%' });
    expect(fixture.nativeElement.querySelector('.status-pill')).not.toBeNull();

    const data = { ...baseApplication(), atsStatus: 'SKIP' };
    component.refresh({
      value: '',
      data,
      node: { data },
      onSelect,
    } as unknown as AppStatusCellRendererParams);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.status-pill')).toBeNull();
    expect(fixture.nativeElement.querySelector('.status-locked')).not.toBeNull();
  });
});
