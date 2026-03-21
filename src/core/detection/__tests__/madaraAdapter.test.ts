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
});
