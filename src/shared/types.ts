export type AppMode = 'manga' | 'general';
export type UpscaleDenoiseLevel =
  | 'conservative'
  | 'no-denoise'
  | 'denoise1x'
  | 'denoise2x'
  | 'denoise3x';
export type UpscaleBackendPreference = 'auto' | 'webgpu' | 'webgl' | 'cpu';
export type UpscaleModelId =
  | 'realcugan-2x'
  | 'realcugan-4x'
  | 'realesrgan-anime_fast'
  | 'realesrgan-anime_plus'
  | 'realesrgan-general_fast'
  | 'realesrgan-general_plus'
  | 'waifu2x';
export type ArchiveFormat =
  | 'cbz'
  | 'cbz-jpg'
  | 'cbz-png'
  | 'cbz-webp'
  | 'zip'
  | 'zip-jpg'
  | 'zip-png'
  | 'zip-webp';

export type CaptureStrategy = 'network' | 'content';
export type DetectionOrigin = 'live-dom' | 'static-html';
export type ChapterRelation = 'current' | 'previous' | 'next' | 'listing' | 'candidate';
export type PreviewStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface DetectionDiagnostic {
  code: string;
  message: string;
  level: 'info' | 'warning' | 'error';
  candidateId?: string;
}

export interface PageIdentity {
  url: string;
  title: string;
  host: string;
  pathname: string;
}

export interface SourceTabContext {
  id: number;
  url: string;
  title: string;
  favIconUrl?: string;
}

export interface RawImageCandidate {
  id: string;
  url: string;
  previewUrl: string;
  captureStrategy: CaptureStrategy;
  sourceKind: string;
  origin: DetectionOrigin;
  width: number;
  height: number;
  domIndex: number;
  top: number;
  left: number;
  altText: string;
  titleText: string;
  containerSignature: string;
  visible: boolean;
  diagnostics: string[];
}

export interface ImageCandidate {
  id: string;
  url: string;
  previewUrl: string;
  canonicalUrl: string;
  querylessUrl: string;
  captureStrategy: CaptureStrategy;
  sourceKind: string;
  origin: DetectionOrigin;
  width: number;
  height: number;
  area: number;
  domIndex: number;
  top: number;
  left: number;
  altText: string;
  titleText: string;
  containerSignature: string;
  familyKey: string;
  visible: boolean;
  filenameHint: string;
  extensionHint: string;
  pageNumber: number | null;
  score: number;
  diagnostics: string[];
}

export interface ImageCollectionResult {
  items: ImageCandidate[];
  totalCandidates: number;
  diagnostics: DetectionDiagnostic[];
}

export interface ChapterLinkCandidate {
  id: string;
  url: string;
  canonicalUrl: string;
  label: string;
  relation: ChapterRelation;
  score: number;
  chapterNumber: number | null;
  volumeNumber: number | null;
  containerSignature: string;
  diagnostics: string[];
}

export interface MangaScanResult {
  adapterId: string;
  currentPages: ImageCollectionResult;
  chapters: ChapterLinkCandidate[];
  navigation: {
    current?: ChapterLinkCandidate;
    previous?: ChapterLinkCandidate;
    next?: ChapterLinkCandidate;
    listing?: ChapterLinkCandidate;
  };
  diagnostics: DetectionDiagnostic[];
}

export interface PageScanResult {
  page: PageIdentity;
  general: ImageCollectionResult;
  manga: MangaScanResult;
}

export interface ChapterItem {
  id: string;
  url: string;
  canonicalUrl: string;
  label: string;
  relation: ChapterRelation;
  chapterNumber: number | null;
  volumeNumber: number | null;
  score: number;
  previewStatus: PreviewStatus;
  preview?: ImageCollectionResult;
  previewError?: string;
  diagnostics: string[];
}

export interface DownloadJobState {
  active: boolean;
  progress: number;
  message: string;
  error?: string;
  cancelled: boolean;
}

export interface UpscalePreviewState {
  sourceImageId: string;
  originalUrl: string;
  originalReferrer?: string;
  upscaledUrl?: string;
  loading: boolean;
  error?: string;
}

export interface UpscaleSettings {
  modelId: UpscaleModelId;
  denoise: UpscaleDenoiseLevel;
  preferredBackend: UpscaleBackendPreference;
}

export interface FetchBinaryResult {
  bytes: ArrayBuffer;
  mime: string;
  finalUrl: string;
}

export interface CapturedImageResult {
  bytes: ArrayBuffer;
  mime: string;
}
