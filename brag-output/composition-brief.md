# Hyperframes Composition Brief: AeroTeam

## Objective
Vidéo de lancement courte et soignée pour AeroTeam (app de gestion des consignes de maintenance aéronautique).

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4` (18 s, 1920×1080, 30 fps)
- Poster: `brag-output/brag.jpg`

## Source Material
- Project root: `aeroteam/`
- Primary files read: `README.md`, `index.html`, `src/App.jsx`, `src/index.css`, `src/pages/ImportConsignes.jsx`, `src/lib/consignesExcel.js`
- Product name: AeroTeam
- Claim: le fichier Excel hebdomadaire de consignes → effectif du jour + consignes par avion
- Copy verbatim utilisée : « Import consignes (rapport) », « Déposez ici votre fichier de consignes », « Feuilles jours lues », « Membres affectés », « Blocs de charge (avions) », « LEADER + ACL + IDT », « CAB SECU + PRELIM »
- Stand-ins : noms de membres fictifs (A. MARTIN, B. DIALLO, …), immats plausibles (F-GKXT, F-GSQB, F-GSPK)

## Creative Direction
- Tone preset: polished
- Direction: quiet premium ops film, aviation at dawn, copy française
- Angle / Hook / Outro : voir `brag-plan.md`
- Avoid: langage SaaS générique, visuels abstraits, redesign hors projet

## Visual Identity
- Background: #0a0f1e (nuit aéro) / #f1f5f9 (surfaces claires)
- Accent: #0ea5e9, #0284c7 ; secondaire #4f46e5
- Text: #e2e8f0 (sombre) / #0f172a (clair)
- Fonts: Inter/system-ui (display), Cascadia Mono (immatriculations, `@font-face` local)

## Storyboard
1. Hook — 3,2 s — `CONSIGNES S40.xlsm` + « Chaque semaine, le même fichier. »
2. Reveal — 4 s — dépôt du fichier + compteurs : 7 feuilles jours / 42 membres / 12 blocs
3. Highlights — 7 s — LUNDI (2026-09-28), cartes avion F-GKXT/F-GSQB/F-GSPK avec ★ leaders, consignes du shift Matin
4. Outro — 3,8 s — wordmark AeroTeam, « Les consignes du jour, avion par avion. », LUNDI 28/09 → DIMANCHE 04/10

## Audio
- Music: `assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (0.32, track 10)
- Beat sync: preset fourni (110 BPM) — `beat-grid` stats 4.39/4.91/5.34 et cartes avion 8.74/9.29/9.83 ; `beat-locked` consignes 10.93 s et dates 17.47 s (cues forts)
- SFX: drop_001/drop_002, card-place-1..3, card-slide-1..3, select_008, impactSoft_medium_001, bong_001 (0.5–0.65, tracks 11-21)
- Pas de voix (non demandée)
