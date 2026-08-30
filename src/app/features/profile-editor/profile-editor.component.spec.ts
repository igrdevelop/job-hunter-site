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

  function findField(labelText: string): HTMLElement | undefined {
    const fields = Array.from(
      fixture.nativeElement.querySelectorAll('.field'),
    ) as HTMLElement[];
    return fields.find((el) => el.querySelector('span')?.textContent?.trim() === labelText);
  }

  function fieldInputValue(labelText: string): string {
    return (findField(labelText)?.querySelector('input') as HTMLInputElement | null)?.value ?? '';
  }

  function fieldChips(labelText: string): string[] {
    return Array.from(findField(labelText)?.querySelectorAll('.chip') ?? []).map((el) =>
      (el.textContent ?? '').replace('×', '').trim(),
    );
  }

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

    it('renders the identity card as editable fields', () => {
      expect(fieldInputValue('Full name')).toBe('Jane Doe');
      expect(fieldInputValue('Headline')).toBe('Senior Frontend Developer');
    });

    it('renders the questionnaire card from location/languages/experience', () => {
      expect(fieldInputValue('Home city')).toBe('Warsaw');
      expect(fieldInputValue('Work authorization')).toBe('EU');
      expect(fieldInputValue('Experience label')).toBe('6+');
      expect(fieldChips('Home city aliases')).toEqual(['warszawa', 'warsaw']);
      expect(fieldChips('Acceptable hybrid cities')).toEqual(['Warsaw']);
      expect(fieldChips('Weekly hybrid cities')).toEqual(['Krakow']);
      expect(fieldChips('Disqualifying languages')).toEqual(['de', 'fr']);
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
      const roleCards = fixture.nativeElement.querySelectorAll('.role-card');
      const fields = Array.from(
        roleCards[0].querySelectorAll('.role-fields input'),
      ) as HTMLInputElement[];
      expect(fields.map((el) => el.value)).toEqual([
        'Acme Corp',
        'Senior Frontend Developer',
        'Jan 2024 - Present',
        'FinTech, Payments Platform',
      ]);
      const firstBullet = roleCards[0].querySelector('.bullets-editor textarea') as HTMLTextAreaElement;
      expect(firstBullet.value).toContain('Built and maintained a payments dashboard');
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

  describe('identity + questionnaire editing (F3)', () => {
    beforeEach(async () => {
      await createWith(() => Promise.resolve(structuredClone(PROFILE_MOCK)));
    });

    it('updateIdentity() edits a field and marks the draft dirty', () => {
      expect(component.isDirty()).toBe(false);
      component.updateIdentity('headline', 'Staff Frontend Developer');
      expect(component.document()?.core.identity.headline).toBe('Staff Frontend Developer');
      expect(component.isDirty()).toBe(true);
    });

    it('identityFieldError() flags a required field only once it is emptied', () => {
      expect(component.identityFieldError('full_name')).toBeNull();
      component.updateIdentity('full_name', '   ');
      expect(component.identityFieldError('full_name')).toBe('core.identity.full_name is required');
      expect(component.hasBlockingErrors()).toBe(true);
    });

    it('blocks save() while a required identity field is empty', async () => {
      const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ revision: 2, renderJobId: null });
      component.updateIdentity('contact', '');
      expect(component.isDirty()).toBe(true);
      await component.save();
      expect(putSpy).not.toHaveBeenCalled();
    });

    it('disables the Save button in the template while blocked', () => {
      component.updateIdentity('cv_filename_prefix', '');
      fixture.detectChanges();
      const saveBtn = fixture.nativeElement.querySelector('.savebar .btn-primary') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });

    it('shows a live filename example next to cv_filename_prefix', () => {
      const year = new Date().getFullYear();
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain(`Jane_Doe_CV_angular_${year}_EN.docx`);
    });

    it('updateLocation() edits a scalar questionnaire field', () => {
      component.updateLocation('home_city', 'Kraków');
      expect(component.document()?.core.location.home_city).toBe('Kraków');
      expect(component.isDirty()).toBe(true);
    });

    it('updateExperience() edits years_label and since_year', () => {
      component.updateExperience('years_label', '8+');
      component.updateExperience('since_year', 2016);
      const experience = component.document()?.core.experience;
      expect(experience?.years_label).toBe('8+');
      expect(experience?.since_year).toBe(2016);
    });

    it('addQuestionnaireChip()/removeQuestionnaireChip() edit a list field, ignoring duplicates', () => {
      component.setQuestionnaireChipDraft('disqualify_required', 'DE');
      component.addQuestionnaireChip('disqualify_required');
      expect(component.questionnaireList('disqualify_required')).toEqual(['de', 'fr']);

      component.setQuestionnaireChipDraft('disqualify_required', 'it');
      component.addQuestionnaireChip('disqualify_required');
      expect(component.questionnaireList('disqualify_required')).toEqual(['de', 'fr', 'it']);

      component.removeQuestionnaireChip('disqualify_required', 'fr');
      expect(component.questionnaireList('disqualify_required')).toEqual(['de', 'it']);
    });

    it('save() carries edited identity/questionnaire fields plus untouched skills/roles byte-identical', async () => {
      const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ revision: 2, renderJobId: null });
      component.updateIdentity('headline', 'Staff Frontend Developer');
      component.updateLocation('work_authorization', 'PL + EU');

      await component.save();

      const sent = putSpy.mock.calls[0][0];
      expect(sent.core.identity.headline).toBe('Staff Frontend Developer');
      expect(sent.core.location.work_authorization).toBe('PL + EU');
      expect(sent.core.skills).toEqual(PROFILE_MOCK.profile.core.skills);
      expect(sent.core.roles).toEqual(PROFILE_MOCK.profile.core.roles);
    });
  });

  describe('roles + extras editing (F4)', () => {
    beforeEach(async () => {
      await createWith(() => Promise.resolve(structuredClone(PROFILE_MOCK)));
    });

    function roleId(index: number): string {
      return PROFILE_MOCK.profile.core.roles[index].id;
    }

    it('updateRoleField() edits a field and flips the role origin to edited', () => {
      expect(component.roles()[1].origin).toBe('parsed');
      component.updateRoleField(roleId(1), 'title', 'Staff Frontend Developer');
      expect(component.roles()[1].title).toBe('Staff Frontend Developer');
      expect(component.roles()[1].origin).toBe('edited');
      expect(component.isDirty()).toBe(true);
    });

    it('addBullet()/removeBullet() edit the bullets list', () => {
      const before = component.roles()[0].bullets.length;
      component.addBullet(roleId(0));
      expect(component.roles()[0].bullets.length).toBe(before + 1);
      expect(component.roles()[0].bullets.at(-1)?.origin).toBe('edited');

      component.removeBullet(roleId(0), before);
      expect(component.roles()[0].bullets.length).toBe(before);
    });

    it('updateBulletText() flips only that bullet\'s origin, not the whole role', () => {
      expect(component.roles()[1].origin).toBe('parsed');
      component.updateBulletText(roleId(1), 0, 'Rewrote this bullet.');
      expect(component.roles()[1].bullets[0].text).toBe('Rewrote this bullet.');
      expect(component.roles()[1].bullets[0].origin).toBe('edited');
      expect(component.roles()[1].origin).toBe('parsed');
    });

    it('moveBullet() reorders and clamps at the edges', () => {
      const texts = component.roles()[0].bullets.map((b) => b.text);
      component.moveBullet(roleId(0), 0, 1);
      expect(component.roles()[0].bullets.map((b) => b.text)).toEqual([texts[1], texts[0], texts[2]]);
      component.moveBullet(roleId(0), 0, -1);
      expect(component.roles()[0].bullets[0].text).toBe(texts[1]);
    });

    it('addExtra()/updateExtra()/removeExtra() edit the extras list', () => {
      const before = component.document()?.core.extras.length ?? 0;
      component.addExtra();
      expect(component.document()?.core.extras.length).toBe(before + 1);

      component.updateExtra(before, 'text', 'AWS Certified Developer');
      const added = component.document()?.core.extras[before];
      expect(added?.text).toBe('AWS Certified Developer');
      expect(added?.origin).toBe('edited');

      component.removeExtra(before);
      expect(component.document()?.core.extras.length).toBe(before);
    });

    it('updateGenerationNotes() edits the free-text story-bank field', () => {
      component.updateGenerationNotes('Led a migration from AngularJS to Angular 19.');
      expect(component.document()?.core.generation_notes).toBe(
        'Led a migration from AngularJS to Angular 19.',
      );
      expect(component.isDirty()).toBe(true);
    });

    it('save() carries edited roles/extras while skills and identity stay untouched', async () => {
      const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ revision: 2, renderJobId: null });
      component.updateRoleField(roleId(0), 'title', 'Lead Frontend Engineer');
      component.updateGenerationNotes('Story bank entry.');

      await component.save();

      const sent = putSpy.mock.calls[0][0];
      expect(sent.core.roles[0].title).toBe('Lead Frontend Engineer');
      expect(sent.core.generation_notes).toBe('Story bank entry.');
      expect(sent.core.skills).toEqual(PROFILE_MOCK.profile.core.skills);
      expect(sent.core.identity).toEqual(PROFILE_MOCK.profile.core.identity);
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
      const tabs = Array.from(fixture.nativeElement.querySelectorAll('.skills-tabs .tab-btn')).map(
        (el) => (el as HTMLElement).textContent?.trim(),
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

    it('shows a role tab per track the role already has an override for', () => {
      const acme = component.roles()[0]; // has title_by_track.ai, stack_line_by_track/bullets_by_track.react
      expect(component.roleTabs(acme)).toEqual(['core', 'ai', 'react']);
      expect(component.roleAvailableTracksToAdd(acme)).toEqual(['angular']);

      const beta = component.roles()[1]; // no by-track overrides at all
      expect(component.roleTabs(beta)).toEqual(['core']);
      expect(component.roleAvailableTracksToAdd(beta)).toEqual(['angular', 'react']);
    });

    it('startTrackRewrite() seeds a new override from the current core values', () => {
      const beta = component.roles()[1];
      component.startTrackRewrite(beta, 'angular');

      const updated = component.roles()[1];
      expect(updated.title_by_track['angular']).toBe(beta.title);
      expect(updated.subtitle_by_track['angular']).toBe(beta.subtitle);
      expect(updated.stack_line_by_track['angular']).toBe(beta.stack_line);
      expect(updated.bullets_by_track['angular']).toEqual(beta.bullets.map((b) => b.text));
      expect(component.roleActiveTab(updated)).toBe('angular');
    });

    it('startTrackRewrite() does not clobber an existing override', () => {
      const acme = component.roles()[0];
      const before = acme.bullets_by_track['react'];
      component.startTrackRewrite(acme, 'react');
      expect(component.roles()[0].bullets_by_track['react']).toEqual(before);
    });

    it('removeTrackOverride() clears all four by-track maps for that track and resets the tab', () => {
      const acme = component.roles()[0];
      component.selectRoleTab(acme, 'react');
      component.removeTrackOverride(acme, 'react');

      const updated = component.roles()[0];
      expect(updated.stack_line_by_track['react']).toBeUndefined();
      expect(updated.bullets_by_track['react']).toBeUndefined();
      expect(component.roleTabs(updated)).toEqual(['core', 'ai']);
      expect(component.roleActiveTab(updated)).toBe('core');
    });

    it('addTrackBullet()/updateTrackBulletText()/removeTrackBullet() edit the by-track bullets', () => {
      const acme = component.roles()[0];
      const before = component.trackBullets(acme, 'react').length;

      component.addTrackBullet(acme.id, 'react');
      expect(component.trackBullets(component.roles()[0], 'react').length).toBe(before + 1);

      component.updateTrackBulletText(acme.id, 'react', before, 'A brand-new React bullet.');
      expect(component.trackBullets(component.roles()[0], 'react')[before]).toBe(
        'A brand-new React bullet.',
      );

      component.removeTrackBullet(acme.id, 'react', before);
      expect(component.trackBullets(component.roles()[0], 'react').length).toBe(before);
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
