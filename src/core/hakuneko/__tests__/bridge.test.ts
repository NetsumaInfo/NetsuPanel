import { fetchChaptersForUrl, resolveConnector, findInfyURL } from '../index';

describe('hakuneko registry', () => {
  it('resolves manganato.gg → MangaNel template', () => {
    const c = resolveConnector('https://www.manganato.gg/manga/foo/chapter-1');
    expect(c?.id).toBe('manganato');
    expect(c?.template).toBe('MangaNel');
  });

  it('resolves toonily.com → WordPressMadara template', () => {
    const c = resolveConnector('https://toonily.com/serie/bar/chapter-12/');
    expect(c?.template).toBe('WordPressMadara');
  });

  it('returns undefined for unknown host', () => {
    expect(resolveConnector('https://random-unknown-site.com/x')).toBeUndefined();
  });
});

describe('hakuneko bridge — MangaNel', () => {
  it('extracts chapter list from manganato static HTML', async () => {
    const html = `<!doctype html><html><body>
      <div class="chapter-list">
        <div class="row"><span><a href="/manga/foo/chapter-1">Chapter 1</a></span></div>
        <div class="row"><span><a href="/manga/foo/chapter-2">Chapter 2</a></span></div>
      </div>
    </body></html>`;
    const fetchHtml = jest.fn().mockResolvedValue(html);
    const result = await fetchChaptersForUrl({
      pageUrl: 'https://www.manganato.gg/manga/foo/chapter-1',
      deps: { fetchHtml },
    });
    expect(result?.chapters).toHaveLength(2);
    expect(result?.chapters[0]).toMatchObject({ id: '/manga/foo/chapter-1', title: 'Chapter 1' });
  });
});

describe('hakuneko bridge — WordPressMadara DOM fallback', () => {
  it('extracts chapters from body when no AJAX placeholder is present', async () => {
    const html = `<!doctype html><html><body>
      <ul class="version-chap">
        <li class="wp-manga-chapter"><a href="https://toonily.com/serie/foo/chapter-10">Chapter 10</a></li>
        <li class="wp-manga-chapter"><a href="https://toonily.com/serie/foo/chapter-9">Chapter 9</a></li>
      </ul>
    </body></html>`;
    const fetchHtml = jest.fn().mockResolvedValue(html);
    const result = await fetchChaptersForUrl({
      pageUrl: 'https://toonily.com/serie/foo/chapter-10/',
      deps: { fetchHtml },
    });
    expect(result?.chapters.length).toBeGreaterThanOrEqual(2);
  });
});

describe('infy next/prev detector', () => {
  it('finds next URL via rel=next keyword', () => {
    document.body.innerHTML = `
      <a href="https://example.com/c1">previous</a>
      <a href="https://example.com/c3">next chapter</a>
    `;
    const result = findInfyURL(document, { direction: 'next' });
    expect(result?.url).toContain('/c3');
  });

  it('finds prev URL via keyword scan', () => {
    document.body.innerHTML = `
      <a href="https://example.com/c1">previous chapter</a>
      <a href="https://example.com/c3">next</a>
    `;
    const result = findInfyURL(document, { direction: 'prev' });
    expect(result?.url).toContain('/c1');
  });

  it('honors explicit CSS selector when provided', () => {
    document.body.innerHTML = `<a id="custom" href="https://example.com/x">go</a>`;
    const result = findInfyURL(document, { direction: 'next', selector: '#custom' });
    expect(result?.url).toContain('/x');
    expect(result?.method).toBe('selector');
  });
});
