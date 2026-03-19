/**
 * Tests du jsonEmbeddedCollector
 */
import { collectJsonEmbeddedImages } from '@core/detection/collectors/jsonEmbeddedCollector';

function createDocument(scriptContent: string): ParentNode {
  const dom = new DOMParser().parseFromString(
    `<html><body><script type="application/json">${scriptContent}</script></body></html>`,
    'text/html'
  );
  return dom;
}

function createInlineDocument(scriptContent: string, type = ''): ParentNode {
  const dom = new DOMParser().parseFromString(
    `<html><body><script${type ? ` type="${type}"` : ''}>${scriptContent}</script></body></html>`,
    'text/html'
  );
  return dom;
}

const BASE = 'https://example.com';

describe('collectJsonEmbeddedImages', () => {
  it('returns empty array for empty document', () => {
    const dom = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
    const result = collectJsonEmbeddedImages(dom, BASE);
    expect(result).toHaveLength(0);
  });

  it('extracts image URLs from application/json script tags', () => {
    const json = JSON.stringify({
      pages: [
        'https://cdn.example.com/ch1/001.jpg',
        'https://cdn.example.com/ch1/002.jpg',
        'https://cdn.example.com/ch1/003.jpg',
      ],
    });
    const doc = createDocument(json);
    const result = collectJsonEmbeddedImages(doc, BASE);
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result[0].url).toContain('001.jpg');
  });

  it('deduplicates the same URL', () => {
    const url = 'https://cdn.example.com/ch1/001.jpg';
    const json = JSON.stringify({ pages: [url, url, url] });
    const doc = createDocument(json);
    const result = collectJsonEmbeddedImages(doc, BASE);
    const urls = result.map((c) => c.url);
    expect([...new Set(urls)].length).toBe(urls.length);
  });

  it('extracts image URLs from inline JS script via regex fallback', () => {
    const script = `var pages = ["https://cdn.example.com/001.png", "https://cdn.example.com/002.png"];`;
    const doc = createInlineDocument(script);
    const result = collectJsonEmbeddedImages(doc, BASE);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('ignores non-image URLs', () => {
    const json = JSON.stringify({
      config: { apiUrl: 'https://api.example.com/v1', debug: true },
      avatarUrl: 'https://example.com/avatar.png',
    });
    const doc = createDocument(json);
    const result = collectJsonEmbeddedImages(doc, BASE);
    // Avatar might be picked up, but non-image URLs should not
    for (const cand of result) {
      expect(cand.url).toMatch(/\.(jpe?g|png|webp|avif|gif)/i);
    }
  });
});
