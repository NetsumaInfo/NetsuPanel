import type { CapturedImageResult, FetchBinaryResult, PageScanResult, SourceTabContext } from './types';

export const enum RuntimeMessageType {
  ScanTab = 'SCAN_TAB',
  GetSourceContext = 'GET_SOURCE_CONTEXT',
  FetchDocument = 'FETCH_DOCUMENT',
  FetchBinary = 'FETCH_BINARY',
  CaptureImage = 'CAPTURE_IMAGE',
}

export interface ScanTabRequest {
  type: RuntimeMessageType.ScanTab;
  tabId: number;
}

export interface GetSourceContextRequest {
  type: RuntimeMessageType.GetSourceContext;
  tabId: number;
}

export interface FetchDocumentRequest {
  type: RuntimeMessageType.FetchDocument;
  url: string;
  referrer?: string;
  tabId?: number;
}

export interface FetchBinaryRequest {
  type: RuntimeMessageType.FetchBinary;
  url: string;
  referrer?: string;
  headers?: Record<string, string>;
  tabId?: number;
}

export interface CaptureImageRequest {
  type: RuntimeMessageType.CaptureImage;
  tabId: number;
  candidateId: string;
}

export type RuntimeRequest =
  | ScanTabRequest
  | GetSourceContextRequest
  | FetchDocumentRequest
  | FetchBinaryRequest
  | CaptureImageRequest;

export interface ScanTabResponse {
  scan: PageScanResult;
}

export interface GetSourceContextResponse {
  context: SourceTabContext;
}

export interface FetchDocumentResponse {
  html?: string;
  error?: string;
}

export interface FetchBinaryResponse {
  resource?: FetchBinaryResult;
  error?: string;
}

export interface CaptureImageResponse {
  capture: CapturedImageResult;
}

export type RuntimeResponse =
  | ScanTabResponse
  | GetSourceContextResponse
  | FetchDocumentResponse
  | FetchBinaryResponse
  | CaptureImageResponse;

export const enum ContentMessageType {
  ScanPage = 'SCAN_PAGE',
  CaptureImage = 'CAPTURE_IMAGE',
  FetchBinary = 'FETCH_BINARY',
  FetchDocument = 'FETCH_DOCUMENT',
}

export interface ScanPageRequest {
  type: ContentMessageType.ScanPage;
}

export interface CaptureImageContentRequest {
  type: ContentMessageType.CaptureImage;
  candidateId: string;
}

export interface FetchBinaryContentRequest {
  type: ContentMessageType.FetchBinary;
  url: string;
  referrer?: string;
  headers?: Record<string, string>;
}

export interface FetchDocumentContentRequest {
  type: ContentMessageType.FetchDocument;
  url: string;
  referrer?: string;
}

export type ContentRequest =
  | ScanPageRequest
  | CaptureImageContentRequest
  | FetchBinaryContentRequest
  | FetchDocumentContentRequest;
