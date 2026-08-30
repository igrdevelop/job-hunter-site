import { ProfileDocument, ProfileGetResponse } from '../../../core/api/models';
import profileFixture from './profile.mock.json';

/**
 * Byte-copy of the bot repo's `candidate/profile.example.json` (bot PR #238,
 * commit fc9668b) — the normative schema_version-1 example. Serves double
 * duty: ProfileApi.get() returns it while PROFILE_MOCK_FALLBACK_ENABLED, and
 * the contract spec imports the same file as its fixture, so a schema drift
 * between this client and the bot shows up in one place.
 */
export const PROFILE_MOCK: ProfileGetResponse = {
  profile: profileFixture as ProfileDocument,
  revision: 1,
  updatedAt: '2026-08-30T12:00:00Z',
};

export function cloneProfileMock(): ProfileGetResponse {
  return structuredClone(PROFILE_MOCK);
}
