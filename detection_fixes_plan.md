# NetsuPanel - Detection Fixes Plan

## Issues Identified

### 1. 🔴 64MiB Message Size Limit
**Root Cause**: [previewFromImage()](file:///S:/projet_app/NetsuPanel/src/core/detection/collectors/liveDomImageCollector.ts#47-62) in [liveDomImageCollector.ts](file:///S:/projet_app/NetsuPanel/src/core/detection/collectors/liveDomImageCollector.ts) generates full-resolution PNG data URIs for every image on the page via `canvas.toDataURL('image/png')`. These data URIs are embedded in `RawImageCandidate.previewUrl` and travel through `sendMessage()` from content script → background → app.

**Fix**: 
- Generate preview thumbnails at a capped resolution (max 200px) instead of full-size
- For network-fetchable images, just use the URL as `previewUrl` (don't generate a data URI)
- Only use canvas capture for `blob:` / `data:` / cross-origin-tainted images

### 2. 🔴 DOM vs Static Detection Switch Problem
**Root Cause**: The content script [scanCurrentPage()](file:///S:/projet_app/NetsuPanel/src/content/index.ts#185-210) only uses `liveDomImageCollector` (which reads actual DOM elements). If images haven't loaded yet (lazy-loading), it finds no `<img>` elements or elements with `naturalWidth=0`. Conversely, when images are in `<script>` tags or inline code, the liveDom collector finds them but the [previewFromImage()](file:///S:/projet_app/NetsuPanel/src/core/detection/collectors/liveDomImageCollector.ts#47-62) fails silently (canvas tainted).

The key issue: there's no fallback from live-DOM to static/script-based extraction when live-DOM images fail, and vice versa. The [scanCurrentPage](file:///S:/projet_app/NetsuPanel/src/content/index.ts#185-210) does retry collection 3 times but it only re-collects from the same source (live DOM).

**Fix**:
- Add `staticDocumentImageCollector` as a fallback source in [scanCurrentPage()](file:///S:/projet_app/NetsuPanel/src/content/index.ts#185-210)
- When live DOM images are sparse, also inject inline script and JSON candidates
- Improve the stabilization loop: wait for lazy-loaded images
- Use `data-src`, `data-lazy-src` etc. from the live DOM even if the image hasn't loaded yet

### 3. 🔴 Chapter Page Detection
**Root Cause**: The `PAGE_NUMBER_RE` in [imageCandidatePipeline.ts](file:///S:/projet_app/NetsuPanel/src/core/detection/pipeline/imageCandidatePipeline.ts) is too greedy - it matches any number, causing false positives. The [selectNarrativeCluster](file:///S:/projet_app/NetsuPanel/src/core/detection/pipeline/imageCandidatePipeline.ts#73-113) uses `familyKey + containerSignature` to group pages, but:
- Images from script collectors have `containerSignature: 'script'`, which clusters all unrelated script images together
- Images with `width:0, height:0` (from script/json collectors) get a neutral score but can't be area-filtered
- The narrative cluster scoring heavily weights group size, which can pick the wrong cluster

**Fix**:
- Improve page number regex to be more specific
- Give script/json-sourced images a unique container signature based on the extraction context
- Improve narrative cluster selection to prefer images that pass basic quality criteria

### 4. 🔴 Chapter Link Detection
**Root Cause**: The `chapterLinkCollector` scores are too permissive (threshold 8 is too low) and there's no differentiation between actual chapter links and navigation/menu links. The `CHAPTER_HINT_RE` matches common navigation words that appear in headers/footers.

The [pickBestChapterSet](file:///S:/projet_app/NetsuPanel/src/core/detection/pipeline/chapterPipeline.ts#79-92) uses container signature for clustering, but many non-chapter links share the same container signature (e.g., sidebar menus).

**Fix**:
- Add URL path analysis: chapter links typically have chapter numbers in the URL path
- Add negative scoring for common non-chapter patterns (header/footer/sidebar links)
- Add scoring for links whose URL path structure matches the current page
- Improve [parseChapterIdentity](file:///S:/projet_app/NetsuPanel/src/core/detection/parsers/parseChapterIdentity.ts#21-34) to handle more chapter URL patterns
