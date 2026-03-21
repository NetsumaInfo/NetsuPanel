import { collectRuntimeMangaGlobals } from '@core/detection/collectors/runtimeMangaGlobalsCollector';

describe('collectRuntimeMangaGlobals', () => {
  test('extracts common runtime arrays and next data image URLs', () => {
    document.body.innerHTML = `
      <script>
        ts_reader.run({"sources":[{"images":["https://cdn.example.com/001.jpg","https://cdn.example.com/002.jpg"]}]});
      </script>
      <script>
        var chapterPages = ["https://cdn.example.com/ch-1.jpg"];
      </script>
      <script>
        var imglist = ["https://cdn.example.com/mg-1.png"];
      </script>
      <script id="__NEXT_DATA__" type="application/json">
        {"props":{"pageProps":{"images":["https://cdn.example.com/next-1.webp"]}}}
      </script>
    `;

    const result = collectRuntimeMangaGlobals(document);

    expect(result.tsReaderImages).toEqual([
      'https://cdn.example.com/001.jpg',
      'https://cdn.example.com/002.jpg',
    ]);
    expect(result.chapterPages).toEqual(['https://cdn.example.com/ch-1.jpg']);
    expect(result.mangagoImages).toEqual(['https://cdn.example.com/mg-1.png']);
    expect(result.nextDataImages).toEqual(['https://cdn.example.com/next-1.webp']);
  });
});
