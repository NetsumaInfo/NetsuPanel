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
      'asurascans.com',
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
      'm.comic.naver.com',
    ],
  },
  {
    status: 'supported',
    family: 'Manga Downloader Plus reader patterns',
    domains: [
      'mangakiss.org',
      'toonily.com',
      'manhuaplus.com',
      'toonclash.com',
      'mangakakalot.gg',
      'manganato.gg',
      'mangatown.com',
      'readopm.com',
      'readberserk.com',
      'readblackclover.com',
      'readhaikyuu.com',
      'readsnk.com',
      'readonepiece.com',
      'readmha.com',
      'readjujutsukaisen.com',
      'readchainsawman.com',
      'demonslayermanga.com',
      'readnaruto.com',
      'tokyoghoulre.com',
      'readfairytail.com',
      'readkingdom.com',
      'readsololeveling.org',
      'read7deadlysins.com',
      'readkagurabachimanga.com',
      'readichithewitch.com',
      'bluelockread.com',
      'readjojos.com',
      'readsakadays.com',
      'mangabolt.com',
      'mangabuddy.com',
      'mangaball.net',
    ],
  },
  {
    status: 'supported',
    family: 'MangaDex',
    domains: ['mangadex.org'],
  },
  {
    status: 'experimental',
    family: 'Manga Downloader Plus protected readers',
    domains: ['fanfox.net', 'mangafire.to'],
    note: 'Lecture partielle via scan live; certains endpoints AJAX/obfusqués peuvent encore dépendre du rendu du site.',
  },
  {
    status: 'experimental',
    family: 'Bilibili / Tencent Comic',
    domains: ['manga.bilibili.com', 'ac.qq.com', 'm.ac.qq.com'],
    note: 'Ces sites requirent une authentification. Certaines fonctionnalités peuvent être limitées.',
  },
  {
    status: 'unsupported',
    family: 'Locked Reader',
    domains: ['page.kakao.com'],
    note: 'Kakao (DRM) : nécessite un compte et peut avoir des restrictions.',
  },
  {
    status: 'unsupported',
    family: 'Locked Reader',
    domains: [],
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
