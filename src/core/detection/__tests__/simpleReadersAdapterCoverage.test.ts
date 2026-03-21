import { madaraAdapter } from '@core/detection/adapters/madaraAdapter';
import { asuracomicAdapter } from '@core/detection/adapters/asuracomicAdapter';

describe('simple reader adapter coverage', () => {
  test('madara adapter captures basic entry-content images', () => {
    document.body.innerHTML = `
      <main>
        <div class="entry-content">
          <img class="aligncenter" src="https://cdn.example.com/chapter-143/2.webp" alt="Page 2" />
          <img class="aligncenter" src="https://cdn.example.com/chapter-143/3.webp" alt="Page 3" />
        </div>
      </main>
    `;

    const result = madaraAdapter.scan({
      document,
      page: {
        url: 'https://ibecamethemalelead.com/manga/sample-chapter-143/',
        title: 'Sample chapter 143',
        host: 'ibecamethemalelead.com',
        pathname: '/manga/sample-chapter-143/',
      },
      origin: 'live-dom',
      imageCandidates: [],
    });

    expect(result.currentPages.items.map((item) => item.url)).toEqual([
      'https://cdn.example.com/chapter-143/2.webp',
      'https://cdn.example.com/chapter-143/3.webp',
    ]);
  });

  test('madara adapter captures ts-main-image readers', () => {
    document.body.innerHTML = `
      <div id="readerarea">
        <img class="ts-main-image curdown" src="https://site.example.com/wp-content/uploads/01_clean.webp" />
        <img class="ts-main-image" src="https://site.example.com/wp-content/uploads/02_clean.webp" />
      </div>
    `;

    const result = madaraAdapter.scan({
      document,
      page: {
        url: 'https://en-thunderscans.com/assassin-x-dragon-chapter-4/',
        title: 'Chapter 4',
        host: 'en-thunderscans.com',
        pathname: '/assassin-x-dragon-chapter-4/',
      },
      origin: 'live-dom',
      imageCandidates: [],
    });

    expect(result.currentPages.items).toHaveLength(2);
  });

  test('next-data adapter falls back to direct DOM scan placement images', () => {
    document.body.innerHTML = `
      <div id="scansPlacement">
        <img src="/s2/scans/Release That Witch/232/1.jpg" alt="Chapitre 232 - page 1" />
        <img src="/s2/scans/Release That Witch/232/2.jpg" alt="Chapitre 232 - page 2" />
      </div>
    `;

    const result = asuracomicAdapter.scan({
      document,
      page: {
        url: 'https://anime-sama.to/catalogue/release-that-witch/scan/vf/',
        title: 'Release that witch',
        host: 'anime-sama.to',
        pathname: '/catalogue/release-that-witch/scan/vf/',
      },
      origin: 'live-dom',
      imageCandidates: [],
    });

    expect(result.currentPages.items.map((item) => item.url)).toEqual([
      'https://anime-sama.to/s2/scans/Release%20That%20Witch/232/1.jpg',
      'https://anime-sama.to/s2/scans/Release%20That%20Witch/232/2.jpg',
    ]);
  });
});
