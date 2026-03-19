const IMAGE_ATTRIBUTES = [
  ['data-src', 'data-src'],
  ['data-lazy-src', 'data-lazy-src'],
  ['data-original', 'data-original'],
  ['data-url', 'data-url'],
  ['data-cfsrc', 'data-cfsrc'],
  ['data-echo', 'data-echo'],
  ['data-srcset', 'data-srcset'],
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
