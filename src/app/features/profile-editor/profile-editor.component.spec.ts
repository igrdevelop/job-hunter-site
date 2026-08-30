import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import { ProfileEditorComponent } from './profile-editor.component';
import { ProfileApi } from '../../core/api/profile.api';
import { PROFILE_MOCK } from './mock/profile.mock';

describe('ProfileEditorComponent', () => {
  let fixture: ComponentFixture<ProfileEditorComponent>;
  let component: ProfileEditorComponent;
  let api: ProfileApi;

  async function createWith(getResult: () => ReturnType<ProfileApi['get']>): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ProfileEditorComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideAnimationsAsync(),
      ],
    }).compileComponents();

    api = TestBed.inject(ProfileApi);
    vi.spyOn(api, 'get').mockImplementation(getResult);

    fixture = TestBed.createComponent(ProfileEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => vi.restoreAllMocks());

  describe('with a profile', () => {
    beforeEach(async () => {
      await createWith(() => Promise.resolve(structuredClone(PROFILE_MOCK)));
    });

    it('loads the document from ProfileApi.get()', () => {
      expect(api.get).toHaveBeenCalled();
      expect(component.document()?.core.identity.full_name).toBe('Jane Doe');
    });

    it('renders the identity card', () => {
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Jane Doe');
      expect(text).toContain('Senior Frontend Developer');
    });

    it('renders the questionnaire card from location/languages/experience', () => {
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Warsaw');
      expect(text).toContain('EU');
      expect(text).toContain('6+');
    });

    it('renders one row per skill category with its chip-listed items', () => {
      const rows = fixture.nativeElement.querySelectorAll('.skills-row');
      expect(rows.length).toBe(PROFILE_MOCK.profile.core.skills.length);
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Core Stack');
      expect(text).toContain('NgRx');
    });

    it('hides track chips when there is only one variant', () => {
      expect(component.hasMultipleVariants()).toBe(false);
      // "ai" is a track tag on the "AI Dev Tools" category — must not render as its own tag.
      const trackTags = Array.from(
        fixture.nativeElement.querySelectorAll('.skills-category .tag-outline'),
      ) as HTMLElement[];
      expect(trackTags.some((el) => el.textContent?.trim() === 'ai')).toBe(false);
    });

    it('renders roles with company/title/period and bullets', () => {
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Acme Corp');
      expect(text).toContain('Jan 2024 - Present');
      expect(text).toContain('Built and maintained a payments dashboard');
    });

    it('flags edited elements with an Edited badge', () => {
      const badges = Array.from(fixture.nativeElement.querySelectorAll('.tag-accent')) as HTMLElement[];
      expect(badges.some((el) => el.textContent?.trim() === 'Edited')).toBe(true);
    });

    it('renders the leftovers bucket', () => {
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain("Couldn't place this");
      expect(text).toContain('hereby give consent');
    });
  });

  describe('with no profile (404)', () => {
    beforeEach(async () => {
      await createWith(() => Promise.resolve(null));
    });

    it('shows the empty-state CTA instead of the profile sections', () => {
      expect(component.showEmptyState()).toBe(true);
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('No profile yet');
      expect(text).toContain('Upload your resume');
      expect(text).toContain('Start from scratch');
    });
  });

  describe('on a load error', () => {
    beforeEach(async () => {
      await createWith(() => Promise.reject(new Error('network down')));
    });

    it('shows an error message instead of the empty state', () => {
      expect(component.errorMessage()).toBeTruthy();
      expect(component.showEmptyState()).toBe(false);
    });
  });
});
