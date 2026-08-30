import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
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
      const categoryNames = Array.from(
        fixture.nativeElement.querySelectorAll('.category-input'),
      ).map((el) => (el as HTMLInputElement).value);
      expect(categoryNames).toContain('Core Stack');
      const text = fixture.nativeElement.textContent as string;
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

  describe('skills table editing (F2)', () => {
    beforeEach(async () => {
      await createWith(() => Promise.resolve(structuredClone(PROFILE_MOCK)));
    });

    it('addCategory() appends an edited, empty category', () => {
      const before = component.activeSkills().length;
      component.addCategory();
      expect(component.activeSkills().length).toBe(before + 1);
      const added = component.activeSkills()[before];
      expect(added.origin).toBe('edited');
      expect(added.items).toEqual([]);
    });

    it('renameCategory() flips a parsed category to edited', () => {
      expect(component.activeSkills()[1].category).toBe('Tools');
      expect(component.activeSkills()[1].origin).toBe('parsed');
      component.renameCategory(1, 'Dev Tools');
      expect(component.activeSkills()[1].category).toBe('Dev Tools');
      expect(component.activeSkills()[1].origin).toBe('edited');
    });

    it('addSkillItem() ignores a case-insensitive duplicate and adds a new item, flipping origin', () => {
      component.setChipDraft(1, 'jest');
      component.addSkillItem(1);
      expect(component.activeSkills()[1].items).toEqual(['Jest', 'Cypress', 'Git', 'Webpack']);

      component.setChipDraft(1, 'Playwright');
      component.addSkillItem(1);
      expect(component.activeSkills()[1].items).toContain('Playwright');
      expect(component.activeSkills()[1].origin).toBe('edited');
    });

    it('removeSkillItem() removes the item and flips origin', () => {
      component.removeSkillItem(1, 'Git');
      expect(component.activeSkills()[1].items).toEqual(['Jest', 'Cypress', 'Webpack']);
      expect(component.activeSkills()[1].origin).toBe('edited');
    });

    it('removeCategory() drops the row', () => {
      const before = component.activeSkills().length;
      component.removeCategory(0);
      expect(component.activeSkills().length).toBe(before - 1);
      expect(component.activeSkills()[0].category).toBe('Tools');
    });

    it('moveCategory() reorders and clamps at the edges', () => {
      const names = component.activeSkills().map((c) => c.category);
      component.moveCategory(0, 1);
      expect(component.activeSkills().map((c) => c.category)).toEqual([
        names[1],
        names[0],
        names[2],
      ]);
      component.moveCategory(0, -1);
      expect(component.activeSkills()[0].category).toBe(names[1]);
    });

    it('is clean before any edit and shows the save bar once dirty', () => {
      expect(component.isDirty()).toBe(false);
      expect(fixture.nativeElement.querySelector('.savebar')).toBeNull();

      component.addCategory();
      fixture.detectChanges();

      expect(component.isDirty()).toBe(true);
      expect(fixture.nativeElement.querySelector('.savebar')).not.toBeNull();
    });

    it('discard() reverts the draft to the last-saved baseline', () => {
      component.addCategory();
      expect(component.isDirty()).toBe(true);
      component.discard();
      expect(component.isDirty()).toBe(false);
      expect(component.activeSkills().length).toBe(PROFILE_MOCK.profile.core.skills.length);
    });

    it('save() PUTs the whole document, with untouched sections byte-identical, and clears dirty', async () => {
      const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ revision: 2, renderJobId: null });
      component.renameCategory(0, 'Core Stack (Angular)');
      expect(component.isDirty()).toBe(true);

      await component.save();

      expect(putSpy).toHaveBeenCalledTimes(1);
      const sent = putSpy.mock.calls[0][0];
      expect(sent.core.skills[0].category).toBe('Core Stack (Angular)');
      expect(sent.core.identity).toEqual(PROFILE_MOCK.profile.core.identity);
      expect(sent.core.roles).toEqual(PROFILE_MOCK.profile.core.roles);
      expect(sent.leftovers).toEqual(PROFILE_MOCK.profile.leftovers);
      expect(sent.uploads).toEqual(PROFILE_MOCK.profile.uploads);

      expect(component.isDirty()).toBe(false);
    });

    it('save() maps a 400 response onto fieldErrors', async () => {
      component.addCategory();
      vi.spyOn(api, 'put').mockRejectedValue(
        new HttpErrorResponse({
          status: 400,
          error: { errors: ['core.skills[3].category is required'] },
        }),
      );
      await component.save();
      expect(component.fieldErrors()).toEqual(['core.skills[3].category is required']);
      expect(component.saveError()).toContain('Fix the errors');
    });

    it('save() shows an API-not-ready message on 404', async () => {
      component.addCategory();
      vi.spyOn(api, 'put').mockRejectedValue(new HttpErrorResponse({ status: 404 }));
      await component.save();
      expect(component.saveError()).toContain('not available yet');
    });
  });

  describe('with multiple variants', () => {
    function twoVariantResponse(): ReturnType<ProfileApi['get']> {
      const profile = structuredClone(PROFILE_MOCK.profile);
      profile.variants['react'] = { headline: '', summary: '', skills: [] };
      return Promise.resolve({ profile, revision: 1, updatedAt: '2026-08-30T00:00:00Z' });
    }

    beforeEach(async () => {
      await createWith(twoVariantResponse);
    });

    it('shows a tab strip with Core plus each variant track', () => {
      expect(component.hasMultipleVariants()).toBe(true);
      const tabs = Array.from(fixture.nativeElement.querySelectorAll('.tab-btn')).map((el) =>
        (el as HTMLElement).textContent?.trim(),
      );
      expect(tabs).toEqual(['Core', 'angular', 'react']);
    });

    it('shows the core-fallback hint (not the override banner) for an empty variant', () => {
      component.selectTab('react');
      fixture.detectChanges();
      expect(component.activeVariantOverridesCore()).toBe(false);
      expect(fixture.nativeElement.querySelector('.variant-banner')).toBeNull();
      expect(fixture.nativeElement.textContent).toContain('falls back to core skills');
    });

    it('shows the override banner once a variant gets its own category, and Reset to core clears it', () => {
      component.selectTab('react');
      component.addCategory();
      fixture.detectChanges();
      expect(component.activeVariantOverridesCore()).toBe(true);
      expect(fixture.nativeElement.querySelector('.variant-banner')).not.toBeNull();

      component.resetVariantToCore();
      fixture.detectChanges();
      expect(component.activeVariantOverridesCore()).toBe(false);
      expect(component.document()?.variants['react'].skills).toEqual([]);
    });

    it('toggleTrack() assigns a core category to a track and back', () => {
      component.selectTab('core');
      expect(component.hasTrack(component.activeSkills()[0], 'react')).toBe(false);
      component.toggleTrack(0, 'react');
      expect(component.hasTrack(component.activeSkills()[0], 'react')).toBe(true);
      expect(component.activeSkills()[0].origin).toBe('edited');
      component.toggleTrack(0, 'react');
      expect(component.hasTrack(component.activeSkills()[0], 'react')).toBe(false);
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
