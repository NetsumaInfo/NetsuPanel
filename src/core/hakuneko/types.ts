/**
 * HakuNeko-compatible template system.
 *
 * Port of github.com/manga-download/hakuneko (Unlicense) Connector architecture
 * adapted to NetsuPanel's MV3 WebExtension context.
 *
 * HakuNeko Connector → split into:
 *   - HakuNekoConnector: static site descriptor (id, url, label, template ref, overrides)
 *   - HakuNekoTemplate: shared extraction logic (chapter/page selectors + methods)
 *
 * One template covers many connectors via configuration overrides.
 */

export interface HakuNekoManga {
  id: string;
  title: string;
}

export interface HakuNekoChapter {
  id: string;
  title: string;
  language?: string;
}

export interface HakuNekoPage {
  url: string;
  referer?: string;
}

export interface HakuNekoContext {
  connector: HakuNekoConnector;
  /** Fetch HTML and parse with optional CSS selector. */
  fetchDOM(input: string | URL | RequestLike, selector?: string): Promise<HTMLElement[] | HTMLElement>;
  /** Fetch + JSON parse. */
  fetchJSON<T = unknown>(input: string | URL | RequestLike): Promise<T>;
  /** Fetch text + extract regex captures (group 1). */
  fetchRegex(input: string | URL | RequestLike, regex: RegExp): Promise<string[]>;
  /** Eval JS in active tab (Engine.Request.fetchUI substitute). Requires user to be on the tab. */
  fetchUI<T = unknown>(input: string | URL, script: string): Promise<T>;
  /** Resolve relative href against base. */
  getAbsolutePath(reference: string | URL | HTMLElement, base: string | URL): string;
  /** Same-host → path-only, cross-host → full URL. */
  getRootRelativeOrAbsoluteLink(reference: string | URL | HTMLElement, base: string | URL): string;
  /** Parse raw HTML into HTMLElement tree with <img>→<source> swap. */
  createDOM(html: string): HTMLElement;
}

export interface RequestLike {
  url: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  referer?: string;
}

export interface HakuNekoTemplate {
  /** Template identifier (e.g. "MangaNel", "WordPressMadara"). */
  name: string;
  /** List chapters for a manga (entry URL). */
  getChapters?(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]>;
  /** List page image URLs for a chapter. */
  getPages?(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]>;
  /** Optional: resolve manga descriptor from current URL. */
  getMangaFromURI?(uri: URL, ctx: HakuNekoContext): Promise<HakuNekoManga>;
}

export interface HakuNekoConnector {
  /** Stable id (e.g. "mangakakalot"). */
  id: string;
  /** Display label. */
  label: string;
  /** Origin URL (e.g. "https://mangakakalot.gg"). */
  url: string;
  /** Tags (e.g. ["manga","webtoon","english"]). */
  tags?: string[];
  /** Template name reference (see HakuNekoTemplate.name). */
  template: string;
  /**
   * Per-connector overrides for template fields.
   * Templates read these from connector.overrides when present.
   */
  overrides?: Record<string, unknown>;
  /** Optional: explicit hostname matchers in addition to derived from url. */
  hostnames?: string[];
  /** Marked unsupported in MV3 (DRM/Electron-only). */
  unsupported?: boolean;
  /** Reason if unsupported. */
  unsupportedReason?: string;
}
