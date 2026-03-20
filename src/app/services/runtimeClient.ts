import type {
  CaptureImageRequest,
  FetchBinaryRequest,
  FetchDocumentRequest,
  GetSourceContextRequest,
  ScanTabRequest,
} from '@shared/messages';
import { RuntimeMessageType } from '@shared/messages';
import { browser } from '@shared/browser';
import type { CapturedImageResult, FetchBinaryResult, PageScanResult, SourceTabContext } from '@shared/types';
import { coerceArrayBuffer } from '@shared/utils/binaryTransfer';

export interface FetchBinaryOptions {
  referrer?: string;
  tabId?: number;
}

export interface FetchDocumentOptions {
  referrer?: string;
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

export async function fetchDocument(url: string, options: FetchDocumentOptions = {}): Promise<string> {
  const response = await browser.runtime.sendMessage({
    type: RuntimeMessageType.FetchDocument,
    url,
    referrer: options.referrer,
    tabId: options.tabId,
  } satisfies FetchDocumentRequest);
  return response.html as string;
}

export async function fetchBinary(url: string, options: FetchBinaryOptions = {}): Promise<FetchBinaryResult> {
  const response = await browser.runtime.sendMessage({
    type: RuntimeMessageType.FetchBinary,
    url,
    referrer: options.referrer,
    tabId: options.tabId,
  } satisfies FetchBinaryRequest);
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
