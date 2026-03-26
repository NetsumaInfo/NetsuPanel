const IMAGE_ATTRIBUTES = [
  // Cloudflare Rocket Loader / Mirage - replaces src with data-cfsrc
  ['data-cfsrc', 'data-cfsrc'],
  // Common lazy-load data attributes (highest priority = true image)
  ['data-src', 'data-src'],
  ['data-lazy-src', 'data-lazy-src'],
  ['data-original', 'data-original'],
  ['data-url', 'data-url'],
  ['data-echo', 'data-echo'],
  ['data-srcset', 'data-srcset'],
  // Cloudflare + WordPress lazy-load
  ['data-wpfc-original-src', 'data-wpfc-original-src'],
  ['data-wpfc-original-srcset', 'data-wpfc-original-srcset'],
  ['data-wpel-url', 'data-wpel-url'],
  // Additional lazy-load attributes used by various sites/manga readers
  ['data-bg', 'data-bg'],
  ['data-background', 'data-background'],
  ['data-lazy', 'data-lazy'],
  ['data-lazy-original', 'data-lazy-original'],
  ['data-original-src', 'data-original-src'],
  ['data-retina-src', 'data-retina-src'],
  ['data-full', 'data-full'],
  ['data-hi-res', 'data-hi-res'],
  ['data-zoom-src', 'data-zoom-src'],
  ['data-img', 'data-img'],
  ['data-image', 'data-image'],
  ['data-large', 'data-large'],
  ['loading-src', 'loading-src'],
  // Madara / WP-Manga specific
  ['data-pagespeed-lazy-src', 'data-pagespeed-lazy-src'],
  ['data-pagespeed-high-res-src', 'data-pagespeed-high-res-src'],
  // Standard attributes (checked last so lazy attrs take priority)
  ['srcset', 'img-srcset'],
  ['currentSrc', 'img-current-src'],
  ['src', 'img-src'],
] as const;

function pickBestSrcsetCandidate(srcset: string): string | null {
  const options = srcset
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [url, descriptor] = entry.split(/\s+/);
      const weight = descriptor?.endsWith('w')
        ? Number(descriptor.slice(0, -1))
        : descriptor?.endsWith('x')
          ? Number(descriptor.slice(0, -1)) * 1000
          : 0;
      return { url, weight };
    })
    .sort((left, right) => right.weight - left.weight);

  return options[0]?.url || null;
}

export interface ImageSourceDescriptor {
  sourceKind: string;
  value: string;
}

export function readImageSourceDescriptors(element: Element): ImageSourceDescriptor[] {
  const results: ImageSourceDescriptor[] = [];

  for (const [attribute, sourceKind] of IMAGE_ATTRIBUTES) {
    const raw =
      attribute in element
        ? (element as unknown as Record<string, string | undefined>)[attribute]
        : element.getAttribute(attribute);
    if (!raw) continue;

    const value = attribute.includes('srcset') ? pickBestSrcsetCandidate(raw) : raw;
    if (!value) continue;
    results.push({ sourceKind, value });
  }

  return results;
}

export function readBackgroundImageUrls(styleValue: string): ImageSourceDescriptor[] {
  const matches = [...styleValue.matchAll(/url\((['"]?)(.*?)\1\)/g)];
  return matches
    .map((match) => match[2])
    .filter(Boolean)
    .map((value) => ({ sourceKind: 'background-image', value }));
}
