import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ProfileEditorComponent } from './profile-editor.component';
import { ProfileApi } from '../../core/api/profile.api';
import { ProfileDocument } from '../../core/api/models';
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

    it('renders the employers card with protected chips, flexible employer fields, and project chips', () => {
      expect(fieldChips('Protected employers')).toEqual(['Acme Corp']);
      expect(fieldInputValue('Flexible employer name')).toBe('Beta Solutions');
      expect(fieldInputValue('Flexible employer period')).toBe('Mar 2020 - Dec 2023');
      expect(fieldChips('Flexible employer projects')).toEqual([
        'E-commerce Platform',
        'Marketing Website Revamp',
      ]);
    });

    it('renders one row per education entry with an origin badge, plus school keyword and expected role count', () => {
      const rows = Array.from(
        fixture.nativeElement.querySelectorAll('.education-row'),
      ) as HTMLElement[];
      expect(rows.length).toBe(PROFILE_MOCK.profile.core.education.entries.length);
      const texts = rows.map((el) => (el.querySelector('input') as HTMLInputElement).value);
      expect(texts).toContain('Example University — Bachelor, Computer Science');
      const badges = Array.from(rows[0].querySelectorAll('.tag')).map((el) => el.textContent?.trim());
      expect(badges).toContain('Parsed');
      expect(fieldInputValue('School keyword')).toBe('example university');
      expect(fieldInputValue('Expected role count')).toBe('2');
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

    it('removeCategory() re-indexes chip drafts for the rows that shifted down', () => {
      component.setChipDraft(0, 'stale'); // belongs to the row being removed
      component.setChipDraft(1, 'Docker'); // sits at row 1, should follow it down to row 0
      component.removeCategory(0);
      expect(component.chipDrafts()[0]).toBe('Docker');
      expect(component.chipDrafts()[1]).toBeUndefined();
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

    it('moveCategory() carries an uncommitted chip draft along with its row', () => {
      component.setChipDraft(0, 'Docker');
      component.moveCategory(0, 1);
      expect(component.chipDrafts()[1]).toBe('Docker');
      expect(component.chipDrafts()[0]).toBeUndefined();
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

    it('discard() clears an uncommitted questionnaire chip draft, not just the document', () => {
      component.setQuestionnaireChipDraft('home_city_aliases', 'Wro');
      expect(component.questionnaireChipDrafts()['home_city_aliases']).toBe('Wro');
      component.updateLocation('home_city', 'Kraków'); // make something dirty so discard() has an effect
      component.discard();
      expect(component.questionnaireChipDrafts()['home_city_aliases']).toBeUndefined();
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

  describe('employers + education editing', () => {
    beforeEach(async () => {
      await createWith(() => Promise.resolve(structuredClone(PROFILE_MOCK)));
    });

    it('updateFlexibleEmployer() edits a field and marks the draft dirty', () => {
      expect(component.isDirty()).toBe(false);
      component.updateFlexibleEmployer('name', 'Gamma Ventures');
      expect(component.document()?.core.employers.flexible.name).toBe('Gamma Ventures');
      expect(component.isDirty()).toBe(true);
    });

    it('addEmployerChip()/removeEmployerChip() edit the protected employers list, ignoring case-insensitive duplicates', () => {
      component.setEmployerChipDraft('protected', 'acme corp'); // dup of existing 'Acme Corp'
      component.addEmployerChip('protected');
      expect(component.document()?.core.employers.protected).toEqual(['Acme Corp']);

      component.setEmployerChipDraft('protected', 'New Employer Inc');
      component.addEmployerChip('protected');
      expect(component.document()?.core.employers.protected).toEqual(['Acme Corp', 'New Employer Inc']);

      component.removeEmployerChip('protected', 'Acme Corp');
      expect(component.document()?.core.employers.protected).toEqual(['New Employer Inc']);
    });

    it('addEmployerChip()/removeEmployerChip() edit the flexible employer projects list', () => {
      const before = component.document()?.core.employers.flexible.projects.length ?? 0;
      component.setEmployerChipDraft('projects', 'Internal Tools Rebuild');
      component.addEmployerChip('projects');
      expect(component.document()?.core.employers.flexible.projects.length).toBe(before + 1);
      expect(component.document()?.core.employers.flexible.projects).toContain('Internal Tools Rebuild');

      component.removeEmployerChip('projects', 'Internal Tools Rebuild');
      expect(component.document()?.core.employers.flexible.projects.length).toBe(before);
    });

    it('discard() clears an uncommitted employer chip draft, not just the document', () => {
      component.setEmployerChipDraft('protected', 'Draft Co');
      expect(component.employerChipDrafts()['protected']).toBe('Draft Co');
      component.updateFlexibleEmployer('name', 'Gamma Ventures'); // make something dirty so discard() has an effect
      component.discard();
      expect(component.employerChipDrafts()['protected']).toBe('');
    });

    it('addEducationEntry()/updateEducationEntry()/removeEducationEntry() edit the education entries list', () => {
      const before = component.document()?.core.education.entries.length ?? 0;
      component.addEducationEntry();
      expect(component.document()?.core.education.entries.length).toBe(before + 1);
      expect(component.document()?.core.education.entries.at(-1)?.origin).toBe('edited');

      component.updateEducationEntry(before, 'MSc Computer Science, Somewhere University');
      const added = component.document()?.core.education.entries[before];
      expect(added?.text).toBe('MSc Computer Science, Somewhere University');
      expect(added?.origin).toBe('edited');

      component.removeEducationEntry(before);
      expect(component.document()?.core.education.entries.length).toBe(before);
    });

    it('updateEducationEntry() flips a parsed entry to edited without touching the others', () => {
      expect(component.document()?.core.education.entries[0].origin).toBe('parsed');
      component.updateEducationEntry(0, 'Rewrote this entry.');
      expect(component.document()?.core.education.entries[0].text).toBe('Rewrote this entry.');
      expect(component.document()?.core.education.entries[0].origin).toBe('edited');
      expect(component.document()?.core.education.entries[1].origin).toBe('parsed');
    });

    it('updateEducation() edits school_keyword and expected_role_count', () => {
      component.updateEducation('school_keyword', 'somewhere university');
      component.updateEducation('expected_role_count', 3);
      const education = component.document()?.core.education;
      expect(education?.school_keyword).toBe('somewhere university');
      expect(education?.expected_role_count).toBe(3);
    });

    it('save() carries edited employers/education while skills, roles, and identity stay untouched', async () => {
      const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ revision: 2, renderJobId: null });
      component.updateFlexibleEmployer('period', 'Mar 2020 - Present');
      component.updateEducationEntry(0, 'MSc Computer Science, Somewhere University');
      component.updateEducation('school_keyword', 'somewhere university');

      await component.save();

      const sent = putSpy.mock.calls[0][0];
      expect(sent.core.employers.flexible.period).toBe('Mar 2020 - Present');
      expect(sent.core.education.entries[0].text).toBe('MSc Computer Science, Somewhere University');
      expect(sent.core.education.school_keyword).toBe('somewhere university');
      expect(sent.core.skills).toEqual(PROFILE_MOCK.profile.core.skills);
      expect(sent.core.roles).toEqual(PROFILE_MOCK.profile.core.roles);
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

    it('selectTab() clears chipDrafts — a row index means nothing across tabs', () => {
      component.setChipDraft(0, 'Rust');
      expect(component.chipDrafts()[0]).toBe('Rust');
      component.selectTab('react');
      expect(component.chipDrafts()[0]).toBeUndefined();
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

  describe('upload → parse → confirmation (F5)', () => {
    beforeEach(async () => {
      await createWith(() => Promise.resolve(structuredClone(PROFILE_MOCK)));
    });

    function openDialogWith(parsed: ProfileDocument): void {
      const dialog = TestBed.inject(MatDialog);
      vi.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => of(parsed),
      } as unknown as ReturnType<MatDialog['open']>);
      component.openUploadDialog();
    }

    it('openUploadDialog() sets parsedDraft from the dialog result', () => {
      const parsed = structuredClone(PROFILE_MOCK.profile);
      openDialogWith(parsed);
      expect(component.parsedDraft()).toEqual(parsed);
    });

    it('openUploadDialog() ignores a cancelled dialog (undefined result)', () => {
      const dialog = TestBed.inject(MatDialog);
      vi.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => of(undefined),
      } as unknown as ReturnType<MatDialog['open']>);
      component.openUploadDialog();
      expect(component.parsedDraft()).toBeNull();
    });

    it('openHistoryDialog() reloads the profile once a restore happened', async () => {
      const dialog = TestBed.inject(MatDialog);
      vi.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => of(true),
      } as unknown as ReturnType<MatDialog['open']>);
      const getSpy = vi.spyOn(api, 'get');
      const before = getSpy.mock.calls.length;

      component.openHistoryDialog();
      await fixture.whenStable();

      expect(getSpy.mock.calls.length).toBeGreaterThan(before);
    });

    it('openHistoryDialog() does not reload when the dialog closes without restoring', () => {
      const dialog = TestBed.inject(MatDialog);
      vi.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => of(false),
      } as unknown as ReturnType<MatDialog['open']>);
      const getSpy = vi.spyOn(api, 'get');
      const before = getSpy.mock.calls.length;

      component.openHistoryDialog();

      expect(getSpy.mock.calls.length).toBe(before);
    });

    it('openHistoryDialog() tells the dialog whether there are unsaved edits to warn about', () => {
      const dialog = TestBed.inject(MatDialog);
      const openSpy = vi.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => of(false),
      } as unknown as ReturnType<MatDialog['open']>);

      component.openHistoryDialog();
      expect(openSpy.mock.calls[0][1]?.data).toEqual({ hasUnsavedEdits: false });

      component.updateIdentity('headline', 'Staff Frontend Developer');
      component.openHistoryDialog();
      expect(openSpy.mock.calls[1][1]?.data).toEqual({ hasUnsavedEdits: true });
    });

    describe('skills merge: edited-wins default', () => {
      it('defaults a brand-new parsed category to accepted', () => {
        const parsed = structuredClone(PROFILE_MOCK.profile);
        parsed.core.skills = [{ category: 'Cloud', items: ['AWS'], origin: 'parsed', tracks: [] }];
        openDialogWith(parsed);
        expect(component.acceptSkillProposal(parsed.core.skills[0])).toBe(true);
      });

      it('defaults a collision with an EDITED category to unaccepted (keep mine)', () => {
        // "Core Stack" in the mock already has origin 'edited'.
        const parsed = structuredClone(PROFILE_MOCK.profile);
        parsed.core.skills = [{ category: 'Core Stack', items: ['Vue'], origin: 'parsed', tracks: [] }];
        openDialogWith(parsed);
        expect(component.acceptSkillProposal(parsed.core.skills[0])).toBe(false);
      });

      it('defaults a collision with a non-edited (parsed) category to accepted', () => {
        // "Tools" in the mock has origin 'parsed'.
        const parsed = structuredClone(PROFILE_MOCK.profile);
        parsed.core.skills = [{ category: 'Tools', items: ['Vite'], origin: 'parsed', tracks: [] }];
        openDialogWith(parsed);
        expect(component.acceptSkillProposal(parsed.core.skills[0])).toBe(true);
      });

      it('toggleSkillProposal() flips the default explicitly', () => {
        const parsed = structuredClone(PROFILE_MOCK.profile);
        parsed.core.skills = [{ category: 'Core Stack', items: ['Vue'], origin: 'parsed', tracks: [] }];
        openDialogWith(parsed);
        expect(component.acceptSkillProposal(parsed.core.skills[0])).toBe(false);
        component.toggleSkillProposal(parsed.core.skills[0]);
        expect(component.acceptSkillProposal(parsed.core.skills[0])).toBe(true);
      });

      it('collapses two same-named categories WITHIN the parsed draft into one proposal instead of one overwriting the other', () => {
        const parsed = structuredClone(PROFILE_MOCK.profile);
        parsed.core.skills = [
          { category: 'Cloud', items: ['AWS'], origin: 'parsed', tracks: [] },
          { category: 'cloud', items: ['Azure'], origin: 'parsed', tracks: [] },
        ];
        parsed.core.roles = [];
        openDialogWith(parsed);

        expect(component.parsedSkillProposals()).toHaveLength(1);
        expect(component.parsedSkillProposals()[0].parsed.items).toEqual(['AWS', 'Azure']);

        component.applyParsedMerge();

        const skills = component.document()?.core.skills ?? [];
        const cloud = skills.filter((s) => s.category.toLowerCase() === 'cloud');
        expect(cloud).toHaveLength(1);
        expect(cloud[0].items).toEqual(['AWS', 'Azure']);
      });
    });

    describe('roles merge: duplicate-role prompt, never auto-merged', () => {
      function parsedDuplicateOfAcme(): ProfileDocument {
        const parsed = structuredClone(PROFILE_MOCK.profile);
        const acme = PROFILE_MOCK.profile.core.roles[0];
        parsed.core.roles = [
          {
            ...acme,
            id: 'parsed-role-acme',
            title: 'Lead Frontend Developer (from parse)',
            origin: 'parsed',
          },
        ];
        return parsed;
      }

      it('flags a same-company/same-period parsed role as a duplicate and defaults to discard', () => {
        const parsed = parsedDuplicateOfAcme();
        openDialogWith(parsed);
        const proposal = component.parsedRoleProposals()[0];
        expect(proposal.duplicate?.id).toBe(PROFILE_MOCK.profile.core.roles[0].id);
        expect(component.roleChoice(parsed.core.roles[0])).toBe('discard');
      });

      it('a brand-new parsed role (no company/period match) defaults to accepted', () => {
        const parsed = structuredClone(PROFILE_MOCK.profile);
        parsed.core.roles = [
          {
            ...PROFILE_MOCK.profile.core.roles[0],
            id: 'role-new',
            company: 'Totally New Co',
            period: 'Jan 2026 - Present',
            origin: 'parsed',
          },
        ];
        openDialogWith(parsed);
        const proposal = component.parsedRoleProposals()[0];
        expect(proposal.duplicate).toBeNull();
        expect(component.roleChoice(parsed.core.roles[0])).toBe('accept');
      });

      it('a brand-new parsed role can be explicitly rejected via its own checkbox, both in state and in the DOM', () => {
        const parsed = structuredClone(PROFILE_MOCK.profile);
        parsed.core.roles = [
          {
            ...PROFILE_MOCK.profile.core.roles[0],
            id: 'role-new',
            company: 'Totally New Co',
            period: 'Jan 2026 - Present',
            origin: 'parsed',
          },
        ];
        openDialogWith(parsed);
        fixture.detectChanges();

        const checkbox = fixture.nativeElement.querySelector(
          '.role-choice-new input[type="checkbox"]',
        ) as HTMLInputElement;
        expect(checkbox.checked).toBe(true);

        checkbox.checked = false;
        checkbox.dispatchEvent(new Event('change'));

        expect(component.roleChoice(parsed.core.roles[0])).toBe('discard');
      });

      it('setRoleChoice() requires an explicit call to replace or keep both — the default never auto-merges', () => {
        const parsed = parsedDuplicateOfAcme();
        openDialogWith(parsed);
        const role = parsed.core.roles[0];
        expect(component.roleChoice(role)).toBe('discard');
        component.setRoleChoice(role, 'keep-both');
        expect(component.roleChoice(role)).toBe('keep-both');
        component.setRoleChoice(role, 'accept');
        expect(component.roleChoice(role)).toBe('accept');
      });
    });

    describe('applyParsedMerge()', () => {
      it('adds a new skill category and skips a collision with edited content by default', () => {
        const parsed = structuredClone(PROFILE_MOCK.profile);
        parsed.core.skills = [
          { category: 'Cloud', items: ['AWS'], origin: 'parsed', tracks: [] },
          { category: 'Core Stack', items: ['Vue'], origin: 'parsed', tracks: [] },
        ];
        parsed.core.roles = [];
        openDialogWith(parsed);

        component.applyParsedMerge();

        const skills = component.document()?.core.skills ?? [];
        expect(skills.some((s) => s.category === 'Cloud')).toBe(true);
        const coreStack = skills.find((s) => s.category === 'Core Stack');
        expect(coreStack?.items).toEqual(PROFILE_MOCK.profile.core.skills[0].items); // untouched
        expect(component.parsedDraft()).toBeNull();
        expect(component.isDirty()).toBe(true);
      });

      it('a duplicate role left at its default (discard) never touches the current role', () => {
        const parsed = parsedDuplicateOfAcmeHelper();
        parsed.core.skills = [];
        openDialogWith(parsed);

        component.applyParsedMerge();

        const roles = component.document()?.core.roles ?? [];
        expect(roles).toHaveLength(PROFILE_MOCK.profile.core.roles.length);
        expect(roles[0].title).toBe(PROFILE_MOCK.profile.core.roles[0].title);
      });

      it('"keep both" adds the parsed role alongside the existing one', () => {
        const parsed = parsedDuplicateOfAcmeHelper();
        parsed.core.skills = [];
        openDialogWith(parsed);
        component.setRoleChoice(parsed.core.roles[0], 'keep-both');

        component.applyParsedMerge();

        const roles = component.document()?.core.roles ?? [];
        expect(roles).toHaveLength(PROFILE_MOCK.profile.core.roles.length + 1);
        expect(roles.some((r) => r.id === 'parsed-role-acme')).toBe(true);
      });

      it('"replace mine with parsed" swaps the existing role for the parsed one, keeping the ORIGINAL id', () => {
        const parsed = parsedDuplicateOfAcmeHelper(); // parsed id is 'parsed-role-acme'
        parsed.core.skills = [];
        openDialogWith(parsed);
        component.setRoleChoice(parsed.core.roles[0], 'accept');

        component.applyParsedMerge();

        const roles = component.document()?.core.roles ?? [];
        expect(roles).toHaveLength(PROFILE_MOCK.profile.core.roles.length);
        expect(roles[0].title).toBe('Lead Frontend Developer (from parse)');
        expect(roles[0].id).toBe(PROFILE_MOCK.profile.core.roles[0].id); // not 'parsed-role-acme'
      });

      it('a new (non-duplicate) role whose id collides with an unrelated existing role gets a unique id', () => {
        const parsed = structuredClone(PROFILE_MOCK.profile);
        parsed.core.skills = [];
        const beta = PROFILE_MOCK.profile.core.roles[1];
        parsed.core.roles = [
          {
            ...PROFILE_MOCK.profile.core.roles[0],
            id: beta.id, // collides with an unrelated existing role, even though company/period differ
            company: 'Totally New Co',
            period: 'Jan 2026 - Present',
            origin: 'parsed',
          },
        ];
        openDialogWith(parsed);

        component.applyParsedMerge();

        const roles = component.document()?.core.roles ?? [];
        expect(roles).toHaveLength(PROFILE_MOCK.profile.core.roles.length + 1);
        const ids = roles.map((r) => r.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(roles.find((r) => r.company === beta.company)?.id).toBe(beta.id); // untouched
      });

      it('"keep both" renames the parsed role\'s id if it collides with the role it is kept alongside', () => {
        const parsed = structuredClone(PROFILE_MOCK.profile);
        parsed.core.skills = [];
        const acme = PROFILE_MOCK.profile.core.roles[0];
        parsed.core.roles = [{ ...acme, id: acme.id, title: 'Lead Frontend Developer (from parse)', origin: 'parsed' }];
        openDialogWith(parsed);
        component.setRoleChoice(parsed.core.roles[0], 'keep-both');

        component.applyParsedMerge();

        const roles = component.document()?.core.roles ?? [];
        expect(roles).toHaveLength(PROFILE_MOCK.profile.core.roles.length + 1);
        const ids = roles.map((r) => r.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(roles.some((r) => r.id === acme.id && r.title === acme.title)).toBe(true); // original untouched
        expect(roles.some((r) => r.id === `${acme.id}-2` && r.title === 'Lead Frontend Developer (from parse)')).toBe(
          true,
        ); // renamed parsed copy
      });

      it('fills empty identity/questionnaire fields without overwriting non-empty ones', () => {
        const parsed = structuredClone(PROFILE_MOCK.profile);
        parsed.core.skills = [];
        parsed.core.roles = [];
        parsed.core.identity.aka = 'JD'; // current aka is '' in the mock
        parsed.core.identity.full_name = 'Someone Else'; // current is non-empty — must NOT overwrite
        parsed.core.location.home_city_aliases = ['warszawa', 'wwa']; // 'wwa' is new
        openDialogWith(parsed);

        component.applyParsedMerge();

        const doc = component.document();
        expect(doc?.core.identity.aka).toBe('JD');
        expect(doc?.core.identity.full_name).toBe(PROFILE_MOCK.profile.core.identity.full_name);
        expect(doc?.core.location.home_city_aliases).toEqual(['warszawa', 'warsaw', 'wwa']);
      });

      it('appends extras, leftovers, and uploads unconditionally', () => {
        const parsed = structuredClone(PROFILE_MOCK.profile);
        parsed.core.skills = [];
        parsed.core.roles = [];
        parsed.core.extras = [{ kind: 'certification', text: 'New Cert', origin: 'parsed' }];
        parsed.leftovers = [{ text: 'A stray fragment.', source_upload_id: 'upload-2' }];
        parsed.uploads = [
          { id: 'upload-2', filename: 'new_resume.pdf', sha256: 'abc', parsed_at: '2026-08-30T00:00:00Z' },
        ];
        openDialogWith(parsed);

        component.applyParsedMerge();

        const doc = component.document();
        expect(doc?.core.extras).toHaveLength(PROFILE_MOCK.profile.core.extras.length + 1);
        expect(doc?.leftovers).toHaveLength(PROFILE_MOCK.profile.leftovers.length + 1);
        expect(doc?.uploads).toHaveLength(PROFILE_MOCK.profile.uploads.length + 1);
        expect(component.leftoverSourceFilename({ source_upload_id: 'upload-2' })).toBe(
          'new_resume.pdf',
        );
      });

      it('merges education entries (append-only, deduped) and fills school_keyword/expected_role_count only if currently unset', () => {
        const parsed = structuredClone(PROFILE_MOCK.profile);
        parsed.core.skills = [];
        parsed.core.roles = [];
        parsed.core.education.entries = [
          { text: 'Example University — Bachelor, Computer Science', origin: 'parsed' }, // dup of an existing entry
          { text: 'New Certification Course', origin: 'parsed' },
        ];
        parsed.core.education.school_keyword = 'should not overwrite'; // current is already set
        parsed.core.education.expected_role_count = 5; // current is already non-zero
        openDialogWith(parsed);

        component.applyParsedMerge();

        const education = component.document()?.core.education;
        expect(education?.entries).toHaveLength(PROFILE_MOCK.profile.core.education.entries.length + 1);
        expect(education?.entries.some((e) => e.text === 'New Certification Course')).toBe(true);
        expect(education?.school_keyword).toBe(PROFILE_MOCK.profile.core.education.school_keyword);
        expect(education?.expected_role_count).toBe(PROFILE_MOCK.profile.core.education.expected_role_count);
      });

      it('merges employers.protected and flexible.projects as unions, keeping the current flexible employer name/period', () => {
        const parsed = structuredClone(PROFILE_MOCK.profile);
        parsed.core.skills = [];
        parsed.core.roles = [];
        parsed.core.employers.protected = [
          ...PROFILE_MOCK.profile.core.employers.protected,
          'New Employer Inc',
        ];
        parsed.core.employers.flexible = { name: 'Someone Else Corp', period: 'never', projects: ['Parsed Project'] };
        openDialogWith(parsed);

        component.applyParsedMerge();

        const employers = component.document()?.core.employers;
        expect(employers?.protected).toContain('New Employer Inc');
        expect(employers?.flexible.name).toBe(PROFILE_MOCK.profile.core.employers.flexible.name); // untouched
        expect(employers?.flexible.projects).toContain('Parsed Project');
      });

      it('keeps the current summary when it is already non-empty, rather than silently overwriting it', () => {
        const parsed = structuredClone(PROFILE_MOCK.profile);
        parsed.core.skills = [];
        parsed.core.roles = [];
        parsed.core.summary = 'A completely different parsed summary.';
        openDialogWith(parsed);

        component.applyParsedMerge();

        expect(component.document()?.core.summary).toBe(PROFILE_MOCK.profile.core.summary);
      });
    });

    it('discardParsedDraft() clears the review screen without touching the draft', () => {
      const before = component.document();
      const parsed = structuredClone(PROFILE_MOCK.profile);
      parsed.core.skills = [{ category: 'Cloud', items: ['AWS'], origin: 'parsed', tracks: [] }];
      openDialogWith(parsed);

      component.discardParsedDraft();

      expect(component.parsedDraft()).toBeNull();
      expect(component.document()).toEqual(before);
    });

    it('renders the review screen in the DOM: a new-skill checkbox and a duplicate-role radio prompt', () => {
      const parsed = structuredClone(PROFILE_MOCK.profile);
      parsed.core.skills = [{ category: 'Cloud', items: ['AWS'], origin: 'parsed', tracks: [] }];
      const acme = PROFILE_MOCK.profile.core.roles[0];
      parsed.core.roles = [
        { ...acme, id: 'parsed-role-acme', title: 'Lead Frontend Developer (from parse)', origin: 'parsed' },
      ];
      openDialogWith(parsed);
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Review parsed resume');
      expect(text).toContain('Cloud');
      expect(text).toContain('Looks like the same role as');
      expect(text).toContain('merge?');

      const skillCheckbox = fixture.nativeElement.querySelector(
        '.review-row input[type="checkbox"]',
      ) as HTMLInputElement;
      expect(skillCheckbox.checked).toBe(true); // new category — accepted by default

      const roleRadios = Array.from(
        fixture.nativeElement.querySelectorAll('.role-choice input[type="radio"]'),
      ) as HTMLInputElement[];
      expect(roleRadios).toHaveLength(3);
      expect(roleRadios.find((r) => r.checked)?.parentElement?.textContent).toContain('Discard');
    });

    function parsedDuplicateOfAcmeHelper(): ProfileDocument {
      const parsed = structuredClone(PROFILE_MOCK.profile);
      const acme = PROFILE_MOCK.profile.core.roles[0];
      parsed.core.roles = [
        { ...acme, id: 'parsed-role-acme', title: 'Lead Frontend Developer (from parse)', origin: 'parsed' },
      ];
      return parsed;
    }
  });

  describe('applyParsedMerge(): summary fills from parsed when the current one is blank', () => {
    beforeEach(async () => {
      const blankSummaryDoc = structuredClone(PROFILE_MOCK.profile);
      blankSummaryDoc.core.summary = '';
      await createWith(() =>
        Promise.resolve({ profile: blankSummaryDoc, revision: 1, updatedAt: '2026-08-30T00:00:00Z' }),
      );
    });

    it('fills the summary from the parsed draft when the current document has none', () => {
      const dialog = TestBed.inject(MatDialog);
      const parsed = structuredClone(PROFILE_MOCK.profile);
      parsed.core.skills = [];
      parsed.core.roles = [];
      parsed.core.summary = 'A parsed summary.';
      vi.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => of(parsed),
      } as unknown as ReturnType<MatDialog['open']>);
      component.openUploadDialog();

      component.applyParsedMerge();

      expect(component.document()?.core.summary).toBe('A parsed summary.');
    });
  });

  describe('save() vs a concurrent history restore', () => {
    beforeEach(async () => {
      await createWith(() => Promise.resolve(structuredClone(PROFILE_MOCK)));
    });

    it('does not clobber a freshly-restored baseline with a stale in-flight save', async () => {
      // A save that resolves only after we simulate a reload landing first.
      let resolvePut!: (value: { revision: number; renderJobId: string | null }) => void;
      vi.spyOn(api, 'put').mockReturnValue(
        new Promise((resolve) => {
          resolvePut = resolve;
        }),
      );
      component.updateIdentity('headline', 'Stale edit');
      const savePromise = component.save();

      // Simulate a revision restore's reload landing WHILE the save is in flight.
      const restoredDoc = structuredClone(PROFILE_MOCK.profile);
      restoredDoc.core.identity.headline = 'Restored from history';
      vi.spyOn(api, 'get').mockResolvedValue({
        profile: restoredDoc,
        revision: 5,
        updatedAt: '2026-08-30T00:00:00Z',
      });
      component['profileResource'].reload();
      await fixture.whenStable();
      expect(component.document()?.core.identity.headline).toBe('Restored from history');

      // Now let the stale save resolve.
      resolvePut({ revision: 2, renderJobId: null });
      await savePromise;

      // The stale save must not have overwritten the freshly-restored baseline —
      // the restored draft should still read as dirty-free against it.
      expect(component.document()?.core.identity.headline).toBe('Restored from history');
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

    it('startFromScratch() creates a blank, dirty draft and hides the empty state', () => {
      component.startFromScratch();
      expect(component.showEmptyState()).toBe(false);
      expect(component.isDirty()).toBe(true);
      expect(component.document()?.core.identity.full_name).toBe('');
      expect(component.document()?.core.skills).toEqual([]);
    });

    it('showEmptyState() turns false once a parse review is pending, even though document() is still null', () => {
      const dialog = TestBed.inject(MatDialog);
      const parsed = structuredClone(PROFILE_MOCK.profile);
      vi.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => of(parsed),
      } as unknown as ReturnType<MatDialog['open']>);

      expect(component.showEmptyState()).toBe(true);
      component.openUploadDialog();

      expect(component.document()).toBeNull(); // nothing merged yet
      expect(component.parsedDraft()).not.toBeNull();
      expect(component.showEmptyState()).toBe(false);
    });

    it('applyParsedMerge() with no current profile adopts the parsed draft wholesale', () => {
      const dialog = TestBed.inject(MatDialog);
      const parsed = structuredClone(PROFILE_MOCK.profile);
      vi.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => of(parsed),
      } as unknown as ReturnType<MatDialog['open']>);
      component.openUploadDialog();

      component.applyParsedMerge();

      expect(component.document()?.core.identity.full_name).toBe('Jane Doe');
      expect(component.document()?.core.skills).toEqual(parsed.core.skills);
      expect(component.isDirty()).toBe(true);
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
