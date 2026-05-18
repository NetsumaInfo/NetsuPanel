/**
 * HakuNeko engine layer ported to NetsuPanel.
 *
 * Replaces Electron-only Engine.Request with NetsuPanel's MV3 fetch
 * infrastructure (background/fetch.ts via runtimeClient or direct).
 *
 * Source: HakuNeko engine/Connector.mjs (Unlicense).
 */

import type { HakuNekoConnector, HakuNekoContext, RequestLike } from './types';

const DEFAULT_ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9';

export interface EngineDependencies {
  /** Fetch HTML string for a URL. */
  fetchHtml(url: string, options?: { referrer?: string; headers?: Record<string, string>; method?: string; body?: string }): Promise<string>;
  /** Fetch raw text. */
  fetchText?(url: string, options?: { referrer?: string; headers?: Record<string, string>; method?: string; body?: string }): Promise<string>;
  /** Fetch + parse JSON. */
  fetchJSON?<T = unknown>(url: string, options?: { referrer?: string; headers?: Record<string, string>; method?: string; body?: string }): Promise<T>;
  /** Eval JS in a live tab and resolve the script's promise. Optional. */
  fetchUI?<T = unknown>(url: string, script: string): Promise<T>;
}

function toRequestLike(input: string | URL | RequestLike): RequestLike {
  if (typeof input === 'string') return { url: input };
  if (input instanceof URL) return { url: input.href };
  return input;
}

/**
 * Parse HTML into a detached <html> element.
 * Mirrors HakuNeko createDOM: <img>→<source> swap prevents the DOMParser
 * from kicking off lazy image requests when we just want to read attributes.
 */
export function createDOM(html: string): HTMLElement {
  let content = html;
  content = content.replace(/<img/gi, '<source');
  content = content.replace(/<\/img/gi, '</source');
  content = content.replace(/<use/gi, '<source');
  content = content.replace(/<\/use/gi, '</source');
  content = content.replace(/<iframe[^<]*?>/gi, '<iframe>');
  const dom = document.createElement('html');
  dom.innerHTML = content;
  return dom;
}

/**
 * Resolve URL reference (string, URL, or DOM element with href/src) against base.
 */
export function getAbsolutePath(reference: string | URL | HTMLElement, base: string | URL): string {
  const baseURI = typeof base === 'string' ? new URL(base) : base;
  if (reference instanceof URL) return reference.href;
  if (typeof reference === 'string') return new URL(reference, baseURI.href).href;
  const el = reference as HTMLElement & { src?: string; href?: string };
  if (el.getAttribute) {
    const src = el.getAttribute('src');
    if (src) return new URL(src, baseURI.href).href;
    const href = el.getAttribute('href');
    if (href) return new URL(href, baseURI.href).href;
  }
  if (typeof el.src === 'string' && el.src) return new URL(el.src, baseURI.href).href;
  if (typeof el.href === 'string' && el.href) return new URL(el.href, baseURI.href).href;
  throw new Error('getAbsolutePath: reference has no href/src');
}

/**
 * Same-host: return path+search+hash. Cross-host: full URL.
 */
export function getRootRelativeOrAbsoluteLink(reference: string | URL | HTMLElement, base: string | URL): string {
  const abs = getAbsolutePath(reference, base);
  const baseURI = typeof base === 'string' ? new URL(base) : base;
  const uri = new URL(abs);
  if (uri.hostname === baseURI.hostname) {
    return uri.pathname + uri.search + uri.hash;
  }
  return uri.href;
}

function defaultHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    Accept: DEFAULT_ACCEPT,
    ...(extra || {}),
  };
}

export function createContext(connector: HakuNekoConnector, deps: EngineDependencies): HakuNekoContext {
  const fetchTextImpl = deps.fetchText ?? deps.fetchHtml;

  async function fetchDOM(input: string | URL | RequestLike, selector?: string): Promise<HTMLElement[] | HTMLElement> {
    const req = toRequestLike(input);
    const html = await deps.fetchHtml(req.url, {
      referrer: req.referer,
      headers: defaultHeaders(req.headers),
      method: req.method,
      body: req.body,
    });
    const dom = createDOM(html);
    if (!selector) return dom;
    return Array.from(dom.querySelectorAll<HTMLElement>(selector));
  }

  async function fetchJSON<T = unknown>(input: string | URL | RequestLike): Promise<T> {
    const req = toRequestLike(input);
    if (deps.fetchJSON) {
      return deps.fetchJSON<T>(req.url, {
        referrer: req.referer,
        headers: defaultHeaders(req.headers),
        method: req.method,
        body: req.body,
      });
    }
    const text = await fetchTextImpl(req.url, {
      referrer: req.referer,
      headers: defaultHeaders(req.headers),
      method: req.method,
      body: req.body,
    });
    return JSON.parse(text) as T;
  }

  async function fetchRegex(input: string | URL | RequestLike, regex: RegExp): Promise<string[]> {
    if (!regex.global) {
      throw new Error('fetchRegex requires a global regex (g flag)');
    }
    const req = toRequestLike(input);
    const text = await fetchTextImpl(req.url, {
      referrer: req.referer,
      headers: defaultHeaders(req.headers),
      method: req.method,
      body: req.body,
    });
    const out: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (match[1] !== undefined) out.push(match[1]);
    }
    return out;
  }

  async function fetchUI<T = unknown>(input: string | URL, script: string): Promise<T> {
    if (!deps.fetchUI) {
      throw new Error('fetchUI not available in this context (no active tab bridge)');
    }
    const url = typeof input === 'string' ? input : input.href;
    return deps.fetchUI<T>(url, script);
  }

  return {
    connector,
    fetchDOM,
    fetchJSON,
    fetchRegex,
    fetchUI,
    getAbsolutePath,
    getRootRelativeOrAbsoluteLink,
    createDOM,
  };
}
