import { madaraAdapter } from '@core/detection/adapters/madaraAdapter';

describe('madaraAdapter', () => {
  test('prefers ts_reader pages and preserves chapter referrer context', () => {
    document.body.innerHTML = `
      <script>
        ts_reader.run({
          "sources": [{
            "images": [
              "https://cdn.example.com/proxy.jpg?src=https%3A%2F%2Fimg.example.com%2F001.jpg",
              "https://i0.wp.com/img.example.com/002.jpg"
            ]
          }]
        });
      </script>
      <div class="reading-content">
        <img src="https://img.example.com/fallback.jpg" />
      </div>
      <a href="/series/chapter-9">Chapter 9</a>
      <a href="/series/chapter-11">Chapter 11</a>
    `;

    const result = madaraAdapter.scan({
      document,
      page: {
        url: 'https://sushiscan.fr/series/chapter-10/',
        title: 'Chapter 10',
        host: 'sushiscan.fr',
        pathname: '/series/chapter-10/',
      },
      origin: 'live-dom',
      imageCandidates: [],
    });

    expect(result.adapterId).toBe('madara');
    expect(result.currentPages.items).toHaveLength(2);
    expect(result.currentPages.items[0].url).toBe('https://img.example.com/001.jpg');
    expect(result.currentPages.items[0].referrer).toBe('https://sushiscan.fr/series/chapter-10/');
    expect(result.currentPages.items[1].url).toBe('https://img.example.com/002.jpg');
  });

  test('keeps chapter 2 from numeric labels and prefers chapter-list label over first chapter CTA label', () => {
    document.body.innerHTML = `
      <a href="/manga/series/chapitre-1/">Lire le premier chapitre</a>
      <ul class="main version-chap">
        <li class="wp-manga-chapter"><a href="/manga/series/chapitre-4/">Chapitre 4</a></li>
        <li class="wp-manga-chapter"><a href="/manga/series/chapitre-3/">Chapitre 3</a></li>
        <li class="wp-manga-chapter"><a href="/manga/series/chapitre-2/">2</a></li>
        <li class="wp-manga-chapter"><a href="/manga/series/chapitre-1/">Chapitre 1</a></li>
      </ul>
    `;

    const result = madaraAdapter.scan({
      document,
      page: {
        url: 'https://astral-manga.fr/manga/series/',
        title: 'Series',
        host: 'astral-manga.fr',
        pathname: '/manga/series/',
      },
      origin: 'live-dom',
      imageCandidates: [],
    });

    expect(result.chapters.map((chapter) => chapter.chapterNumber)).toEqual([1, 2, 3, 4]);
    const chapterOne = result.chapters.find((chapter) => chapter.chapterNumber === 1);
    expect(chapterOne?.label).toBe('Chapitre 1');
  });

  test('preserves Next image proxy URLs for Astral previews', () => {
    const proxyUrl =
      'https://astral-manga.fr/_next/image?url=https%3A%2F%2Fcdn.astral.test%2Fchapter%2F001.webp&w=1920&q=75';
    document.body.innerHTML = `
      <div class="reading-content">
        <img class="ts-main-image" src="${proxyUrl}" alt="Page 1" />
        <img class="ts-main-image" src="${proxyUrl.replace('001.webp', '002.webp')}" alt="Page 2" />
      </div>
    `;

    const result = madaraAdapter.scan({
      document,
      page: {
        url: 'https://astral-manga.fr/manga/series/chapter/abc',
        title: 'Chapitre 1',
        host: 'astral-manga.fr',
        pathname: '/manga/series/chapter/abc',
      },
      origin: 'live-dom',
      imageCandidates: [],
    });

    expect(result.currentPages.items).toHaveLength(2);
    expect(result.currentPages.items[0].url).toContain('/_next/image?url=');
  });
});
