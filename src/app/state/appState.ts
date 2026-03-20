import type {
  AppMode,
  ArchiveFormat,
  ChapterItem,
  DownloadJobState,
  PageScanResult,
  SourceTabContext,
  UpscaleSettings,
  UpscalePreviewState,
} from '@shared/types';
import { createDefaultUpscaleSettings } from '@core/upscale/realesrganModels';

export interface NetsuAppState {
  tabId: number | null;
  source: SourceTabContext | null;
  scan: PageScanResult | null;
  chapters: ChapterItem[];
  generalSelection: Record<string, boolean>;
  mode: AppMode;
  archiveFormat: ArchiveFormat;
  loading: boolean;
  loadingMessage: string;
  error: string | null;
  upscaleEnabled: boolean;
  upscalePreview: UpscalePreviewState | null;
  upscaleSettings: Record<AppMode, UpscaleSettings>;
  activity: DownloadJobState;
  waifuBackendLabel: string;
}

export const initialAppState: NetsuAppState = {
  tabId: null,
  source: null,
  scan: null,
  chapters: [],
  generalSelection: {},
  mode: 'manga',
  archiveFormat: 'cbz',
  loading: true,
  loadingMessage: 'Initialisation de l’onglet source…',
  error: null,
  upscaleEnabled: false,
  upscalePreview: null,
  upscaleSettings: {
    manga: createDefaultUpscaleSettings('manga'),
    general: createDefaultUpscaleSettings('general'),
  },
  activity: {
    active: false,
    progress: 0,
    message: '',
    cancelled: false,
  },
  waifuBackendLabel: 'waifu2x inactif',
};

export type AppAction =
  | { type: 'bootstrap-start'; tabId: number }
  | { type: 'bootstrap-success'; source: SourceTabContext; scan: PageScanResult; chapters: ChapterItem[] }
  | { type: 'bootstrap-error'; error: string }
  | { type: 'set-loading-message'; message: string }
  | { type: 'set-mode'; mode: AppMode }
  | { type: 'set-archive-format'; format: ArchiveFormat }
  | { type: 'toggle-general-item'; imageId: string }
  | { type: 'set-general-selection'; selection: Record<string, boolean> }
  | { type: 'set-chapters'; chapters: ChapterItem[] }
  | { type: 'set-chapter-preview-status'; chapterUrl: string; status: ChapterItem['previewStatus'] }
  | { type: 'set-chapter-preview'; chapterUrl: string; preview: ChapterItem['preview']; error?: string }
  | { type: 'set-upscale-enabled'; enabled: boolean }
  | { type: 'set-upscale-settings'; mode: AppMode; settings: Partial<UpscaleSettings> }
  | { type: 'set-upscale-preview'; preview: UpscalePreviewState | null }
  | { type: 'set-activity'; activity: DownloadJobState }
  | { type: 'set-waifu-backend'; label: string };

function buildGeneralSelection(scan: PageScanResult): Record<string, boolean> {
  return Object.fromEntries(scan.general.items.map((item) => [item.id, true]));
}

export function appReducer(state: NetsuAppState, action: AppAction): NetsuAppState {
  switch (action.type) {
    case 'bootstrap-start':
      return {
        ...state,
        tabId: action.tabId,
        loading: true,
        error: null,
      };

    case 'bootstrap-success':
      return {
        ...state,
        loading: false,
        loadingMessage: '',
        source: action.source,
        scan: action.scan,
        chapters: action.chapters,
        generalSelection: buildGeneralSelection(action.scan),
        error: null,
      };

    case 'bootstrap-error':
      return {
        ...state,
        loading: false,
        error: action.error,
      };

    case 'set-loading-message':
      return {
        ...state,
        loadingMessage: action.message,
      };

    case 'set-mode':
      return {
        ...state,
        mode: action.mode,
      };

    case 'set-archive-format':
      return {
        ...state,
        archiveFormat: action.format,
      };

    case 'toggle-general-item':
      return {
        ...state,
        generalSelection: {
          ...state.generalSelection,
          [action.imageId]: !state.generalSelection[action.imageId],
        },
      };

    case 'set-general-selection':
      return {
        ...state,
        generalSelection: action.selection,
      };

    case 'set-chapters':
      return {
        ...state,
        chapters: action.chapters,
      };

    case 'set-chapter-preview-status':
      return {
        ...state,
        chapters: state.chapters.map((chapter) =>
          chapter.canonicalUrl === action.chapterUrl
            ? {
                ...chapter,
                previewStatus: action.status,
                previewError: action.status === 'error' ? chapter.previewError : undefined,
              }
            : chapter
        ),
      };

    case 'set-chapter-preview':
      return {
        ...state,
        chapters: state.chapters.map((chapter) =>
          chapter.canonicalUrl === action.chapterUrl
            ? {
                ...chapter,
                previewStatus: action.error ? 'error' : 'ready',
                preview: action.preview,
                previewError: action.error,
              }
            : chapter
        ),
      };

    case 'set-upscale-enabled':
      return {
        ...state,
        upscaleEnabled: action.enabled,
      };

    case 'set-upscale-settings':
      return {
        ...state,
        upscalePreview: null,
        waifuBackendLabel: 'Upscale prêt',
        upscaleSettings: {
          ...state.upscaleSettings,
          [action.mode]: {
            ...state.upscaleSettings[action.mode],
            ...action.settings,
          },
        },
      };

    case 'set-upscale-preview':
      return {
        ...state,
        upscalePreview: action.preview,
      };

    case 'set-activity':
      return {
        ...state,
        activity: action.activity,
      };

    case 'set-waifu-backend':
      return {
        ...state,
        waifuBackendLabel: action.label,
      };

    default:
      return state;
  }
}
