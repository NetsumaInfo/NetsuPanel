export interface SiteSupportInfo {
  status: 'supported' | 'experimental' | 'unsupported';
  family: string;
  matchedDomain?: string;
  note?: string;
}

interface SiteSupportRule {
  status: SiteSupportInfo['status'];
  family: string;
  domains: string[];
  note?: string;
}

const SITE_SUPPORT_RULES: SiteSupportRule[] = [
  {
    status: 'supported',
    family: 'Mangago Family',
    domains: ['utoon.net', 'mangago.me'],
  },
  {
    status: 'supported',
    family: 'WP-Manga / Madara',
    domains: [
      'manhwaclan.com',
      'vymanga.com',
      'kunmanga.com',
      'arenascan.com',
      'sushiscan.fr',
      'amiactuallythestrongest.com',
      'ibecamethemalelead.com',
      'raijin-scans.fr',
      'rimu-scans.fr',
      'poseidon-scans.co',
      'astral-manga.fr',
      'en-thunderscans.com',
      'mangaball.net',
      'scan-manga.com',
      'manhuaus.com',
      'mangaread.org',
      'flamecomics.xyz',
    ],
  },
  {
    status: 'supported',
    family: 'Next.js Reader',
    domains: [
      'asuracomic.net',
      'mangabuddy.com',
      'galaxymanga.io',
      'everythingmoe.com',
    ],
  },
  {
    status: 'supported',
    family: 'Webtoon / Naver',
    domains: [
      'webtoons.com',
      'comic.naver.com',
    ],
  },
  {
    status: 'supported',
    family: 'MangaDex',
    domains: ['mangadex.org'],
  },
  {
    status: 'unsupported',
    family: 'Locked Reader',
    domains: ['page.kakao.com', 'manga.bilibili.com', 'ac.qq.com', 'm.ac.qq.com'],
    note: 'Ce lecteur nécessite un adaptateur dédié ou un contournement anti-hotlink/anti-bot spécifique.',
  },
];

function hostnameMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function resolveSiteSupport(url: string): SiteSupportInfo {
  let hostname = '';

  try {
    hostname = new URL(url).hostname;
  } catch {
    return {
      status: 'experimental',
      family: 'Unknown',
      note: 'URL invalide ou non reconnue.',
    };
  }

  for (const rule of SITE_SUPPORT_RULES) {
    const matchedDomain = rule.domains.find((domain) => hostnameMatches(hostname, domain));
    if (matchedDomain) {
      return {
        status: rule.status,
        family: rule.family,
        matchedDomain,
        note: rule.note,
      };
    }
  }

  return {
    status: 'experimental',
    family: 'Generic / Heuristic',
    note: 'Aucun adaptateur dédié détecté. Extraction basée sur le pipeline générique.',
  };
}
