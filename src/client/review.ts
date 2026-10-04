import type { PasteLine } from '../domain/pasteLines.ts';
import type { MatchResult } from '../tmdb/match.ts';
export type ReviewLine = PasteLine & { result: MatchResult; resolved: boolean };
