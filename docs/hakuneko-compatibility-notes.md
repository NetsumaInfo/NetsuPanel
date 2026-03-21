# HakuNeko Compatibility Notes

Date: 2026-03-21
Source repository: [manga-download/hakuneko](https://github.com/manga-download/hakuneko)

## What HakuNeko actually does

HakuNeko does not rely on one universal scraper. It combines:

- a generic connector base with shared request behavior
- a very large catalog of site-specific connectors
- reusable connector templates for common CMS families
- a browser-executed path for sites where plain HTTP fetch is not enough
- per-site image download handling when headers, cookies, tokens, or descrambling are required

The current upstream tree contains about `1334` connector files under `src/web/mjs/connectors/`.

Relevant upstream files:

- `src/web/mjs/engine/Connector.mjs`
- `src/web/mjs/engine/Request.mjs`
- `src/web/mjs/engine/DownloadJob.mjs`
- `src/web/mjs/connectors/templates/WordPressMadara.mjs`
- `src/web/mjs/connectors/templates/WordPressMangastream.mjs`
- `src/web/mjs/connectors/templates/Genkan.mjs`
- `src/web/mjs/connectors/templates/SpeedBinb.mjs`
- `src/web/mjs/connectors/MangaDex.mjs`
- `src/web/mjs/connectors/WeebCentral.mjs`

## Patterns worth copying

### 1. Template families, not one adapter per exact site first

This is the biggest reason HakuNeko supports many sites.

Examples:

- `WordPressMadara`
- `WordPressMangastream`
- `Genkan`
- `SpeedBinb`
- `LineWebtoon`
- `MadTheme`
- `HeanCms`

For the extension, this maps well to your `SiteAdapter` model. The right move is to add adapter families with per-site overrides, not only isolated one-off adapters.

Recommended first families for NetsuPanel:

- `madaraAdapter`
- `mangastreamAdapter`
- `genkanAdapter`
- `weebcentralAdapter`
- `mangadexAdapter` as API-first
- `lineWebtoonAdapter`
- `speedbinbAdapter`

### 2. Two extraction modes are required

HakuNeko uses both:

- plain request parsing: `fetchDOM`, `fetchJSON`, `fetchGraphQL`
- live browser execution: `Engine.Request.fetchUI(...)`

This matters because many sites only expose page URLs through:

- hydrated JS globals
- delayed DOM rendering
- inline JSON blobs
- API calls triggered after page load
- cookies or anti-bot flows only solved in a real browser context

Your codebase already has the right split:

- static parse path in [`src/core/detection/scanPage.ts`](/mnt/s/projet_app/NetsuPanel/src/core/detection/scanPage.ts)
- live content-script path in [`src/content/index.ts`](/mnt/s/projet_app/NetsuPanel/src/content/index.ts)
- background fetch bridge in [`src/background/fetch.ts`](/mnt/s/projet_app/NetsuPanel/src/background/fetch.ts)

The missing piece is to make this split explicit in adapters:

- `scan()` should identify the family and extract what is cheap locally
- adapter-specific `resolveChapterPages()` should choose `static-html`, `content-script`, or `api`

### 3. Per-image payload metadata is essential

HakuNeko often does not return a bare image URL. It returns a connector payload that carries:

- target image URL
- referer
- sometimes host override
- sometimes origin override
- sometimes cookies
- sometimes network seed / hash / file
- sometimes image descrambling instructions

Examples:

- `WordPressMadara._getPages()` wraps page URLs with `createConnectorURI({ url, referer })`
- `MangaDex._getPages()` wraps `{ networkNode, hash, file }`
- `SpeedBinb` wraps image resources that must later be descrambled

For NetsuPanel, image candidates should support a richer downloadable form than only `url`.

Recommended shared shape extension:

- `download.url`
- `download.referrer`
- `download.headers`
- `download.cookies` only if unavoidable
- `download.transform`
- `download.sourceKind`

Where `transform` can describe:

- none
- `descramble-speedbinb`
- `resolve-src-param`
- `strip-cdn-proxy`

### 4. Referer handling is mandatory for compatibility

HakuNeko spends a lot of effort on referer/header shaping:

- connector default `requestOptions`
- `x-referer` pseudo-header rewritten into real `Referer`
- custom UA and fetch headers
- cookie merge
- per-download override

Your current [`src/background/fetch.ts`](/mnt/s/projet_app/NetsuPanel/src/background/fetch.ts) already does one important part:

- referrer normalization
- Chrome DNR workaround to inject `Referer`
- retries

That is the correct direction. To get closer to HakuNeko compatibility, add:

- optional custom headers per download
- optional origin override
- per-host throttle policy
- explicit distinction between chapter-page HTML fetch and binary image fetch

### 5. Some sites require browser execution, not network replay

Representative HakuNeko examples:

- `WordPressMangastream` resolves pages by reading `window.ts_reader.params.sources`
- `WeebCentral` waits for rendered `img` nodes in the live page
- `Genkan` can read `chapterPages` from runtime state
- many connectors rely on `fetchUI(...)` to survive Cloudflare, DDoS-Guard, redirects, or delayed hydration

For a browser extension this is even more practical than in Electron:

- use the already open tab as the source of truth
- read live DOM, runtime globals, and in-page JSON
- only fall back to background fetch when chapter listing or remote preview is needed

### 6. A generic fallback still matters, but only as a fallback

HakuNeko has broad coverage because it layers:

1. exact connector
2. connector template family
3. browser execution fallback

It does not pretend that the fallback alone solves everything.

Your current generic detection pipeline is still valuable for:

- unknown WordPress readers
- webtoon-like image stacks
- basic single-chapter pages
- emergency degradation when a site-specific adapter breaks

But it should sit behind family adapters, not replace them.

### 7. Download pipeline and extraction pipeline should stay separate

HakuNeko separates:

- finding manga / chapters / pages
- downloading binaries
- post-processing binaries

This matches your architecture goal from `AGENTS.md`.

Do not push host-specific scraping logic into React components or ZIP code.

## Site-family behavior observed upstream

### WordPress Madara

Important upstream behavior:

- manga list via `wp-admin/admin-ajax.php`
- chapter list sometimes in DOM, sometimes via `ajax/chapters/`, sometimes older AJAX
- page list from `div.page-break source`
- retries alternate page URL variants like `?style=list` and without it
- strips WordPress CDN proxying and can unwrap `src=` passthrough URLs
- downloads images with chapter referer

Implication for NetsuPanel:

- your `wordpressMangaAdapter` should likely split into `madara` and non-Madara variants
- page extraction should explicitly support `source[data-url]`, `data-src`, `srcset`, and proxy-unwrapping

### WordPress MangaStream / ThemeSia-like readers

Important upstream behavior:

- manga list and chapter list are simple DOM
- page list may be exposed in `window.ts_reader.params.sources`
- fallback to delayed DOM image read if runtime object is absent

Implication:

- add a live-runtime collector for known globals before generic image scan

### Genkan

Important upstream behavior:

- listing paginated through site pages
- chapters via DOM
- pages via runtime variable `chapterPages`

Implication:

- add adapter hooks for page globals, not only HTML selectors

### MangaDex

Important upstream behavior:

- API-first for manga and chapters
- separate At-Home endpoint to obtain image server data
- page payloads are not just URLs
- download logic retries alternate network seeds
- explicit throttling for API and images

Implication:

- keep API-first sites separate from DOM family adapters
- your existing [`src/core/detection/adapters/mangadexAdapter.ts`](/mnt/s/projet_app/NetsuPanel/src/core/detection/adapters/mangadexAdapter.ts) is the correct model for this class of sites
- add host-specific throttle and fallback mirrors if needed

### SpeedBinb

Important upstream behavior:

- page data comes from reader config, not ordinary image tags
- images may require descrambling
- multiple protocol versions exist

Implication:

- generic image detection will not be enough
- this needs a dedicated adapter and a download-time transform stage

## What to build in NetsuPanel

### 1. Introduce richer adapter responsibilities

Current interface:

- [`src/core/detection/adapters/types.ts`](/mnt/s/projet_app/NetsuPanel/src/core/detection/adapters/types.ts)

Current shape is too small if you want HakuNeko-level compatibility.

Recommended future shape:

- `matches(url)`
- `scan(input)`
- `discoverChapters?(context)`
- `resolvePages?(chapter, context)`
- `prepareDownload?(page)`

This keeps simple adapters simple, while enabling advanced families.

### 2. Add a runtime extraction layer in content script

Add targeted collectors for:

- known globals like `ts_reader`, `chapterPages`, `__NEXT_DATA__`, `NUXT`, `apollo`, `redux`, `window.__DATA__`
- JSON-LD and embedded hydration blobs
- delayed lazy image attributes after short stabilization

This belongs near [`src/content/index.ts`](/mnt/s/projet_app/NetsuPanel/src/content/index.ts) and `collectors/`, not in UI.

### 3. Extend binary fetch contract

Recommended extension over [`src/background/fetch.ts`](/mnt/s/projet_app/NetsuPanel/src/background/fetch.ts):

- accept optional arbitrary safe headers whitelist
- support per-request throttle bucket
- support image transform stage after fetch
- keep current validation and decode checks

### 4. Add download transforms

Create a small transform registry under `src/core/download/` or `src/core/detection/`.

First transforms worth supporting:

- `unwrapSrcProxy`
- `stripWordpressImageCdn`
- `speedbinbDescramble`
- `canvasCaptureFallback`

### 5. Prioritize CMS families, not random sites

Highest ROI order:

1. Madara
2. MangaStream / ThemeSia variants
3. Genkan
4. Webtoon families
5. MangaDex-like API readers
6. SpeedBinb / scrambled readers

## Practical conclusion

If the target is "most compatible with all sites", the HakuNeko lesson is:

- keep your generic pipeline
- add family adapters
- add runtime/global extraction in the live tab
- pass per-image download metadata
- support post-fetch transforms for protected readers

Trying to solve everything with only static DOM scanning will hit a hard ceiling quickly.

## Recommended next implementation slice

Smallest high-value slice:

1. split WordPress support into explicit `madara` and `mangastream` families
2. enrich image candidates with `referrer` and optional `transform`
3. add a content-script runtime collector for common globals
4. add one dedicated advanced adapter: `speedbinb`

That combination should materially increase compatibility without importing HakuNeko’s full connector model.
