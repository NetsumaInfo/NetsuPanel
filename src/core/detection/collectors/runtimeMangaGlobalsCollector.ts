function parseJsonCandidate(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const IMAGE_RESOURCE_RE = /\.(?:jpe?g|png|webp|avif|gif|bmp)(?:$|[?#])/i;
const RELATIVE_IMAGE_RE = /^(?:\/|\.\/|\.\.\/)[^"'<>]+\.(?:jpe?g|png|webp|avif|gif|bmp)(?:$|[?#])/i;

function isLikelyImageResource(value: string): boolean {
  return /^https?:\/\//i.test(value) || RELATIVE_IMAGE_RE.test(value) || IMAGE_RESOURCE_RE.test(value);
}

function extractStringArray(value: unknown, maxDepth = 6): string[] {
  const results: string[] = [];
  const seen = new Set<unknown>();

  function walk(node: unknown, depth: number): void {
    if (!node || depth > maxDepth || seen.has(node)) return;
    if (typeof node === 'string') {
      if (isLikelyImageResource(node)) {
        results.push(node);
      }
      return;
    }
    if (Array.isArray(node)) {
      seen.add(node);
      node.forEach((item) => walk(item, depth + 1));
      return;
    }
    if (typeof node === 'object') {
      seen.add(node);
      Object.values(node).forEach((item) => walk(item, depth + 1));
    }
  }

  walk(value, 0);
  return results;
}

function extractTsReaderSources(document: ParentNode): string[] {
  const scripts = Array.from((document as Document).querySelectorAll<HTMLScriptElement>('script:not([src])'));
  for (const script of scripts) {
    const text = script.textContent ?? '';
    const match = text.match(/ts_reader(?:\.run)?\s*\(\s*(\{[\s\S]*?\})\s*\)/);
    if (!match?.[1]) continue;
    const parsed = parseJsonCandidate(match[1]) as { sources?: Array<{ images?: string[] }> } | null;
    const images = parsed?.sources?.flatMap((source) => source.images || []) || [];
    if (images.length > 0) return images.filter((value) => /^https?:\/\//i.test(value));
  }
  return [];
}

function extractArrayAssignment(document: ParentNode, variableName: string): string[] {
  const scripts = Array.from((document as Document).querySelectorAll<HTMLScriptElement>('script:not([src])'));
  const pattern = new RegExp(`(?:var|let|const)\\s+${variableName}\\s*=\\s*(\\[[\\s\\S]*?\\])`, 'i');

  for (const script of scripts) {
    const text = script.textContent ?? '';
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const parsed = parseJsonCandidate(match[1]);
    if (Array.isArray(parsed)) {
      const urls = parsed.filter((value): value is string => typeof value === 'string' && isLikelyImageResource(value));
      if (urls.length > 0) return urls;
    }
  }

  return [];
}

function extractStringAssignmentImages(document: ParentNode, variableName: string): string[] {
  const scripts = Array.from((document as Document).querySelectorAll<HTMLScriptElement>('script:not([src])'));
  const pattern = new RegExp(`(?:var|let|const)\\s+${variableName}\\s*=\\s*(['"\`])([\\s\\S]*?)\\1`, 'i');

  for (const script of scripts) {
    const text = script.textContent ?? '';
    const match = text.match(pattern);
    if (!match?.[2]) continue;

    const values = match[2]
      .split(',')
      .map((value) => value.trim().replace(/\\\//g, '/'))
      .filter((value) => isLikelyImageResource(value));
    if (values.length > 0) return values;
  }

  return [];
}

function extractJsonParseAssignmentImages(document: ParentNode, variableName: string): string[] {
  const scripts = Array.from((document as Document).querySelectorAll<HTMLScriptElement>('script:not([src])'));
  const pattern = new RegExp(
    `(?:var|let|const)\\s+${variableName}\\s*=\\s*JSON\\.parse\\(\\s*(['"\`])([\\s\\S]*?)\\1\\s*\\)`,
    'i'
  );

  for (const script of scripts) {
    const text = script.textContent ?? '';
    const match = text.match(pattern);
    if (!match?.[2]) continue;
    const rawJson = match[2].replace(/\\`/g, '`').replace(/\\"/g, '"').replace(/\\\//g, '/');
    const parsed = parseJsonCandidate(rawJson);
    const urls = extractStringArray(parsed);
    if (urls.length > 0) return urls;
  }

  return [];
}

function extractNextDataImages(document: ParentNode): string[] {
  const nextData = (document as Document).getElementById('__NEXT_DATA__');
  if (!nextData?.textContent) return [];

  const parsed = parseJsonCandidate(nextData.textContent);
  return extractStringArray(parsed).filter((value) => /\.(?:jpe?g|png|webp|avif|gif)(?:$|[?#])/i.test(value));
}

function unique(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }

  return result;
}

export interface RuntimeMangaGlobalExtraction {
  tsReaderImages: string[];
  chapterPages: string[];
  mangagoImages: string[];
  nextDataImages: string[];
}

export function collectRuntimeMangaGlobals(document: ParentNode): RuntimeMangaGlobalExtraction {
  return {
    tsReaderImages: unique(extractTsReaderSources(document)),
    chapterPages: unique(extractArrayAssignment(document, 'chapterPages')),
    mangagoImages: unique([
      ...extractArrayAssignment(document, 'imglist'),
      ...extractArrayAssignment(document, 'chapImages'),
      ...extractArrayAssignment(document, 'chapterImages'),
      ...extractStringAssignmentImages(document, 'chapImages'),
      ...extractStringAssignmentImages(document, 'chapterImages'),
      ...extractJsonParseAssignmentImages(document, 'chapterImages'),
    ]),
    nextDataImages: unique(extractNextDataImages(document)),
  };
}
