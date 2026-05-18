/**
 * Infy Scroll next/prev URL detector — TypeScript port.
 *
 * Source: github.com/sixcious/infy-scroll src/js/next-prev.js (MIT, © Sixcious 2015-2020).
 *
 * Algorithm:
 *   1. Try a CSS selector or XPath rule (if provided) — element[property] yields URL.
 *   2. Fall back to keyword scan: enumerate every link/form/button URL, then check
 *      self/parent/child × attribute/innerText × equals/startsWith/endsWith/includes
 *      in fixed priority order.
 *
 * Use case: detect "next chapter" link inside a chapter reader page without
 * relying on site-specific selectors. Pair with HakuNeko templates so we can
 * silently fetch the next chapter once the current one is loaded (Infy-style).
 */

export type InfyMethod = 'selector' | 'xpath' | 'keyword';
export type InfyRelationship = 'self' | 'parent' | 'child';
export type InfyType = 'attribute' | 'innerText';
export type InfySubtype = 'equals' | 'startsWith' | 'endsWith' | 'includes';

export interface InfyResult {
  url: string;
  method: InfyMethod;
  rule?: string;
  relationship?: InfyRelationship;
  type?: InfyType;
  subtype?: InfySubtype;
  keyword?: string;
  element?: string;
  attribute?: string;
}

export interface InfyDetectOptions {
  /** Direction: 'next' or 'prev'. */
  direction: 'next' | 'prev';
  /** Optional explicit CSS selector pointing to the link element. */
  selector?: string;
  /** Optional XPath expression. */
  xpath?: string;
  /** Property path on the matched element (default ['href']). */
  property?: string[];
  /** Whether to fall back to keyword scan (default true). */
  keywordsEnabled?: boolean;
  /** Custom keyword list (defaults to NEXT_KEYWORDS / PREV_KEYWORDS). */
  keywords?: string[];
  /** Whether to decodeURIComponent the matched URL. */
  decodeURI?: boolean;
}

const NEXT_KEYWORDS = [
  'pnnext',
  'next',
  'forward',
  'newer',
  'continue',
  'older>>',
  '次のページ',
  '次へ',
  '次',
  '下一页',
  '下一頁',
  '下页',
  '下頁',
  '后页',
  '后頁',
  '次ページ',
  'siguiente',
  'próximo',
  'próxima',
  'suivant',
  'volgende',
  'weiter',
  'mais',
  'következő',
  'tiếp theo',
  'الت一التالي',
  '다음',
  'sonraki',
  'далее',
  'следующая',
  'наступна',
];

const PREV_KEYWORDS = [
  'pnprev',
  'prev',
  'previous',
  'previousprev',
  'back',
  'older',
  'newer<<',
  '前のページ',
  '前へ',
  '前',
  '上一页',
  '上一頁',
  '上页',
  '上頁',
  '前ページ',
  'anterior',
  'précédent',
  'vorige',
  'zurück',
  'предыдущая',
  '이전',
];

const PROPERTY_PRIORITY = ['href', 'action', 'formAction'] as const;

interface UrlsKeywordEntry {
  url: string;
  element: Element;
  elementName: string;
  attribute?: string;
  relationship: InfyRelationship;
}

interface UrlsStore {
  rule?: { url: string; method: InfyMethod; rule: string; element: Element };
  keywords: Record<
    InfyRelationship,
    Record<InfyType, Record<InfySubtype, Map<string, UrlsKeywordEntry>>>
  >;
}

function emptyUrls(): UrlsStore {
  type Entry = { url: string; element: Element; elementName: string; attribute?: string; relationship: InfyRelationship };
  const make = (): Record<InfySubtype, Map<string, Entry>> => ({
    equals: new Map<string, Entry>(),
    startsWith: new Map<string, Entry>(),
    endsWith: new Map<string, Entry>(),
    includes: new Map<string, Entry>(),
  });
  const relStore = (): Record<InfyType, Record<InfySubtype, Map<string, Entry>>> => ({
    attribute: make(),
    innerText: make(),
  });
  return {
    keywords: {
      self: relStore(),
      parent: relStore(),
      child: relStore(),
    },
  };
}

function isValidURL(value: string | null | undefined): value is string {
  if (!value || typeof value !== 'string') return false;
  if (value.startsWith('javascript:')) return false;
  if (value.startsWith('#')) return false;
  try {
    new URL(value, 'http://x');
    return true;
  } catch {
    return false;
  }
}

function fixURL(value: string): string {
  return value.trim();
}

function getURLFromElement(el: Element, property: string[]): string | undefined {
  let cur: unknown = el;
  for (const key of property) {
    if (cur && typeof cur === 'object' && key in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  if (typeof cur === 'string' && cur) return cur;
  return undefined;
}

function checkRule(
  urls: UrlsStore,
  type: 'selector' | 'xpath',
  selector: string | undefined,
  xpath: string | undefined,
  property: string[],
  decodeURIEnabled: boolean,
  document_: Document,
): void {
  try {
    let element: Element | null = null;
    if (type === 'xpath' && xpath) {
      const result = document_.evaluate(xpath, document_, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      element = result.singleNodeValue as Element | null;
    } else if (selector) {
      element = document_.querySelector(selector);
    }
    if (!element) return;
    let url = getURLFromElement(element, property);
    let defaultProperty: string | undefined;
    if (!url) {
      for (const p of PROPERTY_PRIORITY) {
        const v = (element as unknown as Record<string, unknown>)[p];
        if (typeof v === 'string' && v) {
          defaultProperty = p;
          property = [p];
          url = v;
          break;
        }
      }
    }
    if (url && !defaultProperty && !property.includes('href')) {
      try {
        url = new URL(url, document_.baseURI).href;
      } catch {
        // ignore
      }
    }
    if (decodeURIEnabled && url) {
      try {
        url = decodeURIComponent(url);
      } catch {
        // ignore
      }
    }
    if (url && isValidURL(url)) {
      urls.rule = {
        url: fixURL(url),
        method: type,
        rule: (type === 'xpath' ? xpath : selector) + '.' + property.join('.') + (defaultProperty ? ' (default property)' : ''),
        element,
      };
    }
  } catch {
    // ignore
  }
}

function parseText(
  urls: UrlsStore,
  keywords: string[],
  type: InfyType,
  url: string,
  text: string,
  elementName: string,
  element: Element,
  attribute: string | undefined,
  relationship: InfyRelationship,
): void {
  const value = { url, element, elementName, attribute, relationship };
  for (const keyword of keywords) {
    if (text === keyword) {
      urls.keywords[relationship][type].equals.set(keyword, value);
    } else if (text.startsWith(keyword)) {
      urls.keywords[relationship][type].startsWith.set(keyword, value);
    } else if (text.endsWith(keyword)) {
      urls.keywords[relationship][type].endsWith.set(keyword, value);
    } else if (text.includes(keyword)) {
      urls.keywords[relationship][type].includes.set(keyword, value);
    }
  }
}

function checkElementKeywords(
  urls: UrlsStore,
  keywords: string[],
  url: string,
  elementName: string,
  element: Element,
  relationship: InfyRelationship,
): void {
  if (!element) return;
  if (element.attributes) {
    for (const attr of Array.from(element.attributes)) {
      if (attr?.nodeValue && attr?.nodeName) {
        parseText(
          urls,
          keywords,
          'attribute',
          url,
          attr.nodeValue.replace(/\s/g, '').toLowerCase(),
          elementName,
          element,
          attr.nodeName.toLowerCase(),
          relationship,
        );
      }
    }
  }
  const innerText = (element as HTMLElement).innerText || element.textContent || '';
  if (innerText) {
    parseText(
      urls,
      keywords,
      'innerText',
      url,
      innerText.replace(/\s/g, '').toLowerCase(),
      elementName,
      element,
      undefined,
      relationship,
    );
  }
}

function checkChildrenKeywords(
  urls: UrlsStore,
  keywords: string[],
  url: string,
  elementName: string,
  children: HTMLCollection,
  level: number,
): void {
  for (const child of Array.from(children)) {
    checkElementKeywords(urls, keywords, url, elementName, child, 'child');
    if (child.children && child.children.length && level < 10) {
      checkChildrenKeywords(urls, keywords, url, elementName, child.children, level + 1);
    }
  }
}

function scanKeywords(urls: UrlsStore, keywords: string[], decodeURIEnabled: boolean, document_: Document): void {
  const elements = document_.querySelectorAll(
    'link[href], a[href], area[href], form[action], button[formaction]',
  );
  for (const element of Array.from(elements)) {
    const elementName = element.nodeName.toLowerCase();
    let url =
      (element as HTMLAnchorElement).href ||
      (elementName === 'form' && (element as HTMLFormElement).action) ||
      (element.tagName === 'BUTTON' && (element as HTMLButtonElement).formAction) ||
      '';
    if (decodeURIEnabled && url) {
      try {
        url = decodeURIComponent(url);
      } catch {
        // ignore
      }
    }
    url = fixURL(url);
    if (!isValidURL(url)) continue;
    checkElementKeywords(urls, keywords, url, elementName, element, 'self');
    const parent = element.parentNode as Element | null;
    if (parent?.nodeName) {
      const parentName = parent.nodeName.toLowerCase();
      if (parentName !== 'html' && parentName !== 'head' && parentName !== 'body') {
        checkElementKeywords(urls, keywords, url, elementName, parent, 'parent');
      }
    }
    if (element.children?.length && elementName !== 'form') {
      checkChildrenKeywords(urls, keywords, url, elementName, element.children, 1);
    }
  }
}

const ALGORITHM_ORDER: Array<{ relationship: InfyRelationship; type: InfyType; subtypes: InfySubtype[] }> = [
  { relationship: 'self', type: 'attribute', subtypes: ['equals'] },
  { relationship: 'self', type: 'innerText', subtypes: ['equals'] },
  { relationship: 'child', type: 'attribute', subtypes: ['equals'] },
  { relationship: 'child', type: 'innerText', subtypes: ['equals'] },
  { relationship: 'parent', type: 'attribute', subtypes: ['equals'] },
  { relationship: 'parent', type: 'innerText', subtypes: ['equals'] },
  { relationship: 'self', type: 'attribute', subtypes: ['startsWith', 'endsWith', 'includes'] },
  { relationship: 'self', type: 'innerText', subtypes: ['startsWith', 'endsWith', 'includes'] },
  { relationship: 'child', type: 'attribute', subtypes: ['startsWith', 'endsWith', 'includes'] },
  { relationship: 'child', type: 'innerText', subtypes: ['startsWith', 'endsWith', 'includes'] },
  { relationship: 'parent', type: 'attribute', subtypes: ['startsWith', 'endsWith', 'includes'] },
  { relationship: 'parent', type: 'innerText', subtypes: ['startsWith', 'endsWith', 'includes'] },
];

function traverseURLs(urls: UrlsStore, keywords: string[]): InfyResult | undefined {
  for (const algo of ALGORITHM_ORDER) {
    for (const keyword of keywords) {
      for (const subtype of algo.subtypes) {
        const m = urls.keywords[algo.relationship][algo.type][subtype];
        const hit = m.get(keyword);
        if (hit) {
          return {
            url: hit.url,
            method: 'keyword',
            relationship: algo.relationship,
            type: algo.type,
            subtype,
            keyword,
            element: hit.elementName,
            attribute: hit.attribute,
          };
        }
      }
    }
  }
  return undefined;
}

/**
 * Find next or prev URL in a document.
 *
 * @example
 *   const result = findInfyURL(document, { direction: 'next' });
 *   if (result) console.log(result.url);
 */
export function findInfyURL(document_: Document, options: InfyDetectOptions): InfyResult | undefined {
  const property = options.property || ['href'];
  const decodeURIEnabled = options.decodeURI ?? true;
  const keywords = options.keywords || (options.direction === 'next' ? NEXT_KEYWORDS : PREV_KEYWORDS);
  const urls = emptyUrls();
  if (options.selector || options.xpath) {
    const type = options.xpath ? 'xpath' : 'selector';
    checkRule(urls, type, options.selector, options.xpath, property, decodeURIEnabled, document_);
    if (urls.rule) {
      return { url: urls.rule.url, method: urls.rule.method, rule: urls.rule.rule, element: urls.rule.element.nodeName.toLowerCase() };
    }
  }
  if (options.keywordsEnabled === false) return undefined;
  scanKeywords(urls, keywords, decodeURIEnabled, document_);
  return traverseURLs(urls, keywords);
}

export const INFY_NEXT_KEYWORDS = NEXT_KEYWORDS;
export const INFY_PREV_KEYWORDS = PREV_KEYWORDS;
