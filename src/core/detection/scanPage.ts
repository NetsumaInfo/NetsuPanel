import type { DetectionOrigin, PageIdentity, PageScanResult, RawImageCandidate } from '@shared/types';
import { buildImageCollection } from './pipeline/imageCandidatePipeline';
import { resolveSiteAdapter } from './adapters/siteResolver';
import { resolveSiteSupport } from './adapters/siteSupport';

interface ScanPageInput {
  document: ParentNode;
  page: PageIdentity;
  origin: DetectionOrigin;
  imageCandidates: RawImageCandidate[];
}

export function scanPageDocument(input: ScanPageInput): PageScanResult {
  const adapter = resolveSiteAdapter(input.page.url);
  const support = resolveSiteSupport(input.page.url);
  const manga = adapter.scan({
    document: input.document,
    page: input.page,
    origin: input.origin,
    imageCandidates: input.imageCandidates,
  });

  manga.diagnostics = [
    {
      code: `site-support-${support.status}`,
      message:
        support.status === 'supported'
          ? `Site reconnu: ${support.family}${support.matchedDomain ? ` (${support.matchedDomain})` : ''}.`
          : support.status === 'unsupported'
            ? `Site non supporte explicitement: ${support.family}.${support.note ? ` ${support.note}` : ''}`
            : `Site en mode experimental: ${support.family}.${support.note ? ` ${support.note}` : ''}`,
      level: support.status === 'unsupported' ? 'warning' : 'info',
    },
    ...manga.diagnostics,
  ];

  return {
    page: input.page,
    general: buildImageCollection(input.imageCandidates, 'general'),
    manga,
  };
}
