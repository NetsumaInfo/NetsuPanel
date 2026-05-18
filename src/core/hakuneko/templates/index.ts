/**
 * Template registry: name → HakuNekoTemplate.
 *
 * To add a template: implement it as `templates/<Name>.ts`, then import + register here.
 */

import type { HakuNekoTemplate } from '../types';

import { AnyACGTemplate } from './AnyACG';
import { BloggerMangaTemplate } from './BloggerManga';
import { CiayoTemplate } from './Ciayo';
import { ComiCakeTemplate } from './ComiCake';
import { CoreViewTemplate } from './CoreView';
import { FlatMangaTemplate } from './FlatManga';
import { FoolSlideTemplate } from './FoolSlide';
import { GenkanTemplate } from './Genkan';
import { GnuBoard5BootstrapBasic2Template } from './GnuBoard5BootstrapBasic2';
import { HeanCmsTemplate } from './HeanCms';
import { MHTemplate } from './MH';
import { MHXKTemplate } from './MHXK';
import { MadThemeTemplate } from './MadTheme';
import { MangaEdenTemplate } from './MangaEden';
import { MangaNelTemplate } from './MangaNel';
import { MangaReaderCMSTemplate } from './MangaReaderCMS';
import { MangaToonTemplate } from './MangaToon';
import { MojoPortalComicTemplate } from './MojoPortalComic';
import { NovelCoolTemplate } from './NovelCool';
import { PizzaReaderTemplate } from './PizzaReader';
import { ReaderFrontTemplate } from './ReaderFront';
import { SinMHTemplate } from './SinMH';
import { SixParkbbsTemplate } from './SixParkbbs';
import { SoraOneTemplate } from './SoraOne';
import { WordPressClarityMangaReaderTemplate } from './WordPressClarityMangaReader';
import { WordPressJaridaTemplate } from './WordPressJarida';
import { WordPressMadaraTemplate } from './WordPressMadara';
import { WordPressMangastreamTemplate } from './WordPressMangastream';
import { WordPressZbuluTemplate } from './WordPressZbulu';
import { ZYMKTemplate } from './ZYMK';

const TEMPLATES: HakuNekoTemplate[] = [
  AnyACGTemplate,
  BloggerMangaTemplate,
  CiayoTemplate,
  ComiCakeTemplate,
  CoreViewTemplate,
  FlatMangaTemplate,
  FoolSlideTemplate,
  GenkanTemplate,
  GnuBoard5BootstrapBasic2Template,
  HeanCmsTemplate,
  MHTemplate,
  MHXKTemplate,
  MadThemeTemplate,
  MangaEdenTemplate,
  MangaNelTemplate,
  MangaReaderCMSTemplate,
  MangaToonTemplate,
  MojoPortalComicTemplate,
  NovelCoolTemplate,
  PizzaReaderTemplate,
  ReaderFrontTemplate,
  SinMHTemplate,
  SixParkbbsTemplate,
  SoraOneTemplate,
  WordPressClarityMangaReaderTemplate,
  WordPressJaridaTemplate,
  WordPressMadaraTemplate,
  WordPressMangastreamTemplate,
  WordPressZbuluTemplate,
  ZYMKTemplate,
];

const BY_NAME: Map<string, HakuNekoTemplate> = new Map(TEMPLATES.map((t) => [t.name, t]));

export function getTemplate(name: string): HakuNekoTemplate | undefined {
  return BY_NAME.get(name);
}

export function listTemplates(): HakuNekoTemplate[] {
  return TEMPLATES;
}

export {
  AnyACGTemplate,
  BloggerMangaTemplate,
  CiayoTemplate,
  ComiCakeTemplate,
  CoreViewTemplate,
  FlatMangaTemplate,
  FoolSlideTemplate,
  GenkanTemplate,
  GnuBoard5BootstrapBasic2Template,
  HeanCmsTemplate,
  MHTemplate,
  MHXKTemplate,
  MadThemeTemplate,
  MangaEdenTemplate,
  MangaNelTemplate,
  MangaReaderCMSTemplate,
  MangaToonTemplate,
  MojoPortalComicTemplate,
  NovelCoolTemplate,
  PizzaReaderTemplate,
  ReaderFrontTemplate,
  SinMHTemplate,
  SixParkbbsTemplate,
  SoraOneTemplate,
  WordPressClarityMangaReaderTemplate,
  WordPressJaridaTemplate,
  WordPressMadaraTemplate,
  WordPressMangastreamTemplate,
  WordPressZbuluTemplate,
  ZYMKTemplate,
};
