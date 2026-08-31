import { TestBed } from '@angular/core/testing';
import { ProfileDraftBridgeService } from './profile-draft-bridge.service';
import { PROFILE_MOCK } from './mock/profile.mock';

describe('ProfileDraftBridgeService', () => {
  let service: ProfileDraftBridgeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ProfileDraftBridgeService);
  });

  it('starts with no pending draft', () => {
    expect(service.pending()).toBeNull();
    expect(service.consume()).toBeNull();
  });

  it('submit() makes the draft available via pending()', () => {
    service.submit(PROFILE_MOCK.profile);
    expect(service.pending()).toBe(PROFILE_MOCK.profile);
  });

  it('consume() returns the draft once and clears it', () => {
    service.submit(PROFILE_MOCK.profile);
    expect(service.consume()).toBe(PROFILE_MOCK.profile);
    expect(service.consume()).toBeNull();
    expect(service.pending()).toBeNull();
  });
});
