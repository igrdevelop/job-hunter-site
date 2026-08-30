import profileFixtureRaw from './mock/profile.mock.json';
import { cloneProfileMock, PROFILE_MOCK } from './mock/profile.mock';
import { ProfileDocument } from '../../core/api/models';

/**
 * Contract test: the bot's `candidate/profile.example.json` (schema_version 1,
 * bot PR #238) must parse into ProfileDocument with nothing dropped. This
 * client never runs the fixture through a lossy mapper — it passes the raw
 * document straight through — so the guard here is really against someone
 * later adding a hand-built reconstruction that forgets a field.
 */
describe('resume profile store contract (schema_version 1)', () => {
  it('the mock fixture round-trips losslessly', () => {
    expect(cloneProfileMock().profile).toEqual(profileFixtureRaw);
    expect(PROFILE_MOCK.profile).toEqual(profileFixtureRaw);
  });

  it('matches the documented shape (docs/RESUME_PROFILE_STORE.md)', () => {
    const profile = PROFILE_MOCK.profile as ProfileDocument;
    expect(profile.schema_version).toBe(1);

    // core.identity — required fields the server's PUT validation mirrors.
    expect(profile.core.identity.full_name.trim()).not.toBe('');
    expect(profile.core.identity.contact.trim()).not.toBe('');
    expect(profile.core.identity.cv_filename_prefix.trim()).not.toBe('');

    // core.skills: [{ category, items, origin, tracks }]
    expect(profile.core.skills.length).toBeGreaterThan(0);
    for (const category of profile.core.skills) {
      expect(typeof category.category).toBe('string');
      expect(Array.isArray(category.items)).toBe(true);
      expect(['parsed', 'edited']).toContain(category.origin);
      expect(Array.isArray(category.tracks)).toBe(true);
    }

    // variants: a variant with its own skills replaces the core list for that track.
    for (const variant of Object.values(profile.variants)) {
      expect(typeof variant.headline).toBe('string');
      expect(Array.isArray(variant.skills)).toBe(true);
    }

    // core.roles carry the full shape, including *_by_track overrides.
    expect(profile.core.roles.length).toBeGreaterThan(0);
    for (const role of profile.core.roles) {
      expect(typeof role.company).toBe('string');
      expect(typeof role.title_by_track).toBe('object');
      expect(typeof role.bullets_by_track).toBe('object');
      for (const bullet of role.bullets) {
        expect(['parsed', 'edited']).toContain(bullet.origin);
      }
    }

    // leftovers/uploads survive untouched.
    expect(Array.isArray(profile.leftovers)).toBe(true);
    expect(Array.isArray(profile.uploads)).toBe(true);
  });
});
