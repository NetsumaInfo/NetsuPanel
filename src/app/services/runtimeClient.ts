import type {
  CaptureImageRequest,
  FetchBinaryRequest,
  FetchDocumentRequest,
  GetSourceContextRequest,
  ScanRemotePageRequest,
  ScanTabRequest,
} from '@shared/messages';
import { RuntimeMessageType } from '@shared/messages';
import { browser } from '@shared/browser';
import type { CapturedImageResult, FetchBinaryResult, PageScanResult, SourceTabContext } from '@shared/types';
import { coerceArrayBuffer } from '@shared/utils/binaryTransfer';

export interface FetchBinaryOptions {
  referrer?: string;
  headers?: Record<string, string>;
  tabId?: number;
}

export async function getSourceContext(tabId: number): Promise<SourceTabContext> {
  const response = await browser.runtime.sendMessage({
    type: RuntimeMessageType.GetSourceContext,
    tabId,
  } satisfies GetSourceContextRequest);
  return response.context as SourceTabContext;
}

export async function scanSourceTab(tabId: number): Promise<PageScanResult> {
  const response = await browser.runtime.sendMessage({
    type: RuntimeMessageType.ScanTab,
    tabId,
  } satisfies ScanTabRequest);
  return response.scan as PageScanResult;
}

export async function scanRemotePage(url: string, options: FetchDocumentOptions = {}): Promise<PageScanResult> {
  const response = await browser.runtime.sendMessage({
    type: RuntimeMessageType.ScanRemotePage,
    url,
    referrer: options.referrer,
    tabId: options.tabId,
  } satisfies ScanRemotePageRequest);
  const scan = response.scan as PageScanResult | undefined;
  if (scan) {
    return scan;
  }
  throw new Error((response.error as string | undefined) || 'Remote page scan failed');
}

export interface FetchDocumentOptions {
  referrer?: string;
  tabId?: number;
}

export async function fetchDocument(url: string, options: FetchDocumentOptions = {}): Promise<string> {
  const response = await browser.runtime.sendMessage({
    type: RuntimeMessageType.FetchDocument,
    url,
    referrer: options.referrer,
    tabId: options.tabId,
  } satisfies FetchDocumentRequest);
  const html = response.html as string | undefined;
  if (typeof html === 'string') {
    return html;
  }
  throw new Error((response.error as string | undefined) || 'Document fetch failed');
}

export async function fetchBinary(url: string, options: FetchBinaryOptions = {}): Promise<FetchBinaryResult> {
  const response = await browser.runtime.sendMessage({
    type: RuntimeMessageType.FetchBinary,
    url,
    referrer: options.referrer,
    headers: options.headers,
    tabId: options.tabId,
  } satisfies FetchBinaryRequest);
  if (!response.resource) {
    throw new Error((response.error as string | undefined) || 'Image fetch failed');
  }
  const resource = response.resource as FetchBinaryResult;
  return {
    ...resource,
    bytes: coerceArrayBuffer(resource.bytes),
  };
}

export async function captureImage(tabId: number, candidateId: string): Promise<CapturedImageResult> {
  const response = await browser.runtime.sendMessage({
    type: RuntimeMessageType.CaptureImage,
    tabId,
    candidateId,
  } satisfies CaptureImageRequest);
  const capture = response.capture as CapturedImageResult;
  return {
    ...capture,
    bytes: coerceArrayBuffer(capture.bytes),
  };
}
