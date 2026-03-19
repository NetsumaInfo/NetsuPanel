import type { DetectionOrigin, MangaScanResult, PageIdentity, RawImageCandidate } from '@shared/types';

export interface ScanAdapterInput {
  document: ParentNode;
  page: PageIdentity;
  origin: DetectionOrigin;
  imageCandidates: RawImageCandidate[];
}

export interface SiteAdapter {
  id: string;
  matches(url: string): boolean;
  scan(input: ScanAdapterInput): MangaScanResult;
}
