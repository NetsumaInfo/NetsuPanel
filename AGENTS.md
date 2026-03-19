# AGENT.md

## Architecture cible
- `src/app/`
  - `App.tsx`: shell UI, layout principal, orchestration des panneaux.
  - `components/`: composants réutilisables (`ModeSwitch`, `GeneralGrid`, `ChapterAccordion`, `UpscalePanel`, `StatusStrip`, `SafeImage`).
  - `hooks/useNetsuController.ts`: bootstrap du tab source, actions UI, previews, téléchargements.
  - `services/`: bridge runtime (`runtimeClient`) et coordination téléchargement.
  - `state/appState.ts`: reducer central, état global et transitions.
- `src/content/`
  - `index.ts`: content script idempotent, stabilisation DOM, scan live, capture `blob/canvas`.
- `src/background/`
  - `index.ts`: ouvre `app.html` au clic sur l’extension, injecte le content script, expose scan/fetch/capture.
  - `fetch.ts`: fetch HTML/binaire avec retry borné.
- `src/core/detection/`
  - `collectors/`: extraction DOM/HTML statique pour images et chapitres.
  - `pipeline/`: normalisation, scoring, déduplication, tri, sélection cluster manga.
  - `parsers/`: parsing chapitre/page depuis texte et URL.
  - `adapters/`: contrat `SiteAdapter` et adapter générique.
  - `scanPage.ts`: assembleur de scan document -> `PageScanResult`.
- `src/core/manga/`
  - `chapterCrawler.ts`: agrégation listing + précédent/suivant + preview distant.
- `src/core/download/`
  - `fileNaming.ts`: conventions de nommage stables.
  - `zipBuilder.ts`: construction archives chapitre/global.
- `src/core/upscale/`
  - `waifu2x.worker.ts`: worker dédié waifu2x, cache predictor, fallback backend.
  - `waifu2xRuntime.ts`: queue, cache résultat, progression.
  - `waifu2xModels.ts`: mapping mode -> modèle embarqué.
- `src/shared/`
  - `types.ts`: modèles typés partagés.
  - `messages.ts`: protocole runtime/content.
  - `browser.ts`: wrapper `webextension-polyfill`.
  - `utils/`: helpers transverses.

## Conventions de code et structure
- TypeScript strict obligatoire. `tsc --noEmit` doit rester vert.
- Pas de logique métier dans les composants React. Les composants rendent et déclenchent des handlers.
- Les modules `core/` restent framework-agnostiques autant que possible.
- Les collecteurs ne décident pas de la sélection finale: ils collectent, les pipelines filtrent/trient.
- Les téléchargements et l’upscale doivent toujours exposer progression, message clair et erreur explicite.
- Tout nouveau parser/adaptateur de site doit implémenter `SiteAdapter` et vivre sous `src/core/detection/adapters/`.
- Pas de fichiers monolithiques: un fichier = une responsabilité claire.

## Workflow dev/test
1. Installer les dépendances:
   - `npm install`
2. Vérifier le typage:
   - `npm run typecheck`
3. Builder l’extension:
   - Chrome: `npm run start:chrome`
   - Firefox: `npm run start:firefox`
4. Exécuter les tests critiques:
   - `npm test`
5. Auditer React:
   - `npx -y react-doctor@latest . --verbose --diff`
6. Après correction React Doctor:
   - relancer `npm run typecheck`
   - relancer `npm test`

## Checklist qualité avant livraison
- Le clic sur l’icône extension ouvre `app.html`, pas une popup legacy.
- `Mode Manga` et `Mode Général` sont visibles et fonctionnels.
- Détection images: collecte -> normalisation -> déduplication -> tri -> validation.
- Détection manga: chapitre courant + précédent + suivant + listing si disponible.
- Préviews de chapitre chargeables à la demande sans casser l’état global.
- Téléchargements opérationnels:
  - sélection générale,
  - chapitre individuel (`cbz`/`zip`),
  - archive globale multi-chapitres (`zip`).
- Upscale opérationnel:
  - checkbox on/off,
  - comparaison avant/après,
  - worker dédié,
  - cache,
  - backend label visible,
  - fallback CPU.
- Tests critiques verts:
  - pipeline pages,
  - pipeline chapitres,
  - zip,
  - mode switch,
  - perf gros chapitre.
- `react-doctor` exécuté et les points prioritaires traités avant livraison.

## Workflow branches Git
- Branche de travail par défaut: `codex`.
- Très important: pendant le travail sur `codex`, faire un commit à chaque étape significative. Ne pas accumuler de gros changements non commités.
- Ne pas commit sur `Beta` automatiquement.
- Quand l'utilisateur le demande explicitement, alors commit les changements dans la branche `Beta`.
