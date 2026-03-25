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

  test('madara adapter picks series chapter list from wp-manga markup', () => {
    document.body.innerHTML = `
      <ul class="main version-chap">
        <li class="wp-manga-chapter"><a href="https://sushiscan.fr/series/chapter-11/">Chapter 11</a></li>
        <li class="wp-manga-chapter"><a href="https://sushiscan.fr/series/chapter-10/">Chapter 10</a></li>
        <li class="wp-manga-chapter"><a href="https://sushiscan.fr/series/chapter-9/">Chapter 9</a></li>
      </ul>
    `;

    const result = madaraAdapter.scan({
      document,
      page: {
        url: 'https://sushiscan.fr/series/',
        title: 'Series',
        host: 'sushiscan.fr',
        pathname: '/series/',
      },
      origin: 'live-dom',
      imageCandidates: [],
    });

    expect(result.chapters.filter((item) => item.chapterNumber !== null).length).toBeGreaterThanOrEqual(3);
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

  test('asura adapter reads chapter list from astro island props on series pages', () => {
    document.body.innerHTML = `
      <astro-island
        component-url="/_astro/ChapterListReact.js"
        props='{"seriesSlug":[0,"nano-machine-f6174291"],"chapters":[1,[[0,{"number":[0,305],"title":[0,"Chapter 305"]}],[0,{"number":[0,304],"title":[0,"Chapter 304"]}],[0,{"number":[0,303],"title":[0,"Chapter 303"]}]]]}'
      ></astro-island>
    `;

    const result = asuracomicAdapter.scan({
      document,
      page: {
        url: 'https://asurascans.com/comics/nano-machine-f6174291',
        title: 'Nano Machine',
        host: 'asurascans.com',
        pathname: '/comics/nano-machine-f6174291',
      },
      origin: 'live-dom',
      imageCandidates: [],
    });

    expect(result.chapters.map((item) => item.chapterNumber)).toEqual([303, 304, 305]);
  });

  test('asura adapter reads prev and next from chapter reader props', () => {
    document.body.innerHTML = `
      <astro-island
        component-url="/_astro/ChapterReader.js"
        props='{"seriesSlug":[0,"nano-machine-f6174291"],"chapterNumber":[0,304],"prevChapter":[0,{"number":[0,303],"title":[0,"Chapter 303"]}],"nextChapter":[0,{"number":[0,305],"title":[0,"Chapter 305"]}],"chapterList":[1,[[0,{"number":[0,305],"title":[0,"Chapter 305"]}],[0,{"number":[0,304],"title":[0,"Chapter 304"]}],[0,{"number":[0,303],"title":[0,"Chapter 303"]}]]]}'
      ></astro-island>
    `;

    const result = asuracomicAdapter.scan({
      document,
      page: {
        url: 'https://asurascans.com/comics/nano-machine-f6174291/chapter/304',
        title: 'Nano Machine Chapter 304',
        host: 'asurascans.com',
        pathname: '/comics/nano-machine-f6174291/chapter/304',
      },
      origin: 'live-dom',
      imageCandidates: [],
    });

    expect(result.navigation.previous?.chapterNumber).toBe(303);
    expect(result.navigation.next?.chapterNumber).toBe(305);
  });
});
