import { UrlMatchResult, UrlSegment } from '@angular/router';

/** Matches /files and /files/** into a single `path` param (joined with /). */
export function candidateFilesMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments[0]?.path !== 'files') return null;
  const rest = segments.slice(1).map((s) => s.path).join('/');
  return {
    consumed: segments,
    posParams: rest ? { path: new UrlSegment(rest, {}) } : {},
  };
}
