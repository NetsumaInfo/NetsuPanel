/**
 * siteResolver.ts — Délègue maintenant au registre centralisé pour rester rétrocompatible.
 * @deprecated Use siteRegistry.resolveAdapter() directly.
 */
import { resolveAdapter } from './siteRegistry';

export { resolveAdapter as resolveSiteAdapter };
