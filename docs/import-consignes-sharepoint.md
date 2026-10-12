# AeroTeam — Import consignes : comprendre et brancher une SharePoint List

> Document destiné à un agent IA (ou développeur) qui doit remplacer le **chargement du fichier Excel
> `CONSIGNES S*.xlsm`** par une **lecture d'une SharePoint List** via Microsoft Graph.
> Objectif : produire **exactement le même objet `report`** que le parseur Excel actuel, sans toucher
> au reste de l'application.

---

## 1. C'est quoi « Import consignes » ?

AeroTeam est une application web (React 19 + Vite + Tailwind 4, données Supabase/Postgres) pour la
gestion des équipes de maintenance aéronautique. Chaque semaine, un fichier Excel de consignes est
publié : `CONSIGNES S40.xlsm` — 7 feuilles jours (`DIMANCHE` → `SAMEDI`), 3 shifts par jour
(`Matin` / `Soir` / `Nuit`).

L'import analyse ce fichier et en extrait :

1. **L'effectif** : pour chaque jour × shift, la liste des membres avec leurs **avions affectés** et
   l'indication **leader** (nom sur fond bleu dans le fichier) ;
2. **Les blocs de charge par avion** : immatriculation, type de visite, date/heure d'entrée,
   OSM / Config / Position, date/heure de sortie, et les **consignes** par shift (listes de tâches).

Il y a **deux chemins d'entrée** :

| Chemin | Fichier | Rôle |
|---|---|---|
| Manuel (admin) | `src/pages/ImportConsignes.jsx` | Upload du fichier, choix jour/shift, **affectation des consignes aux profils leaders** (manuel) |
| Automatique | `supabase/functions/import-consignes/index.ts` | Réception POST du fichier (raccourci iPad / Power Automate), stockage côté admin |

**Règle métier importante** : l'automatisme met à jour le **stockage admin** (consignes + effectif par
avion) ; il ne modifie **jamais** les profils leaders. L'assignation à un leader reste **manuelle**
(page Import consignes).

---

## 2. Architecture — fichiers concernés

| Fichier | Contenu |
|---|---|
| `src/lib/consignesExcel.js` | **Le parseur** : Excel → objet `report`. Exporte `parseConsignesWorkbook`, `parseConsignesSheet`, `findSheetDate`, `findWorkbookWeek`, `weekMonday`, `toDateString`, `parseEffectif`, `parseBlocks`, `blockHeaderInfo`, `summarizeAircrafts`, `isBlueColor` |
| `supabase/functions/import-consignes/consignesExcel.js` | **Copie Deno** du parseur (à garder synchro avec `src/lib/`) |
| `supabase/functions/import-consignes/index.ts` | Edge Function : POST fichier → parse → insert `consignes_imports` + `import_runs` |
| `src/pages/ImportConsignes.jsx` | Page admin : upload, affichage par jour/shift, affectation aux profils |
| `src/lib/profileBuilder.js` | `buildProfileData()` : fusionne effectif + consignes dans un profil (notes `[C]`, `dayMembers`, `dayLeaders`) |
| `src/lib/profileStore.js` | Appels RPC Supabase (`get_consignes_import`, `get_aircraft_consignes`, `saveProfileData`, `adminSetProfileAircraft`…) |
| `supabase/migrations/lot-import-auto.sql` | Tables `consignes_imports` (colonne `report jsonb`) et `import_runs` (journal) + RPC `get_consignes_import`, `get_last_import` |
| `src/lib/consignesExcel.test.js` | Tests unitaires Vitest du parseur — **modèle à imiter** pour tester l'adaptateur |

---

## 3. Le contrat de données — LE point clé

**Tout le reste de l'application ne consomme QUE l'objet `report`.** Pour brancher SharePoint, il faut
produire **exactement** cette structure :

```json
{
  "LUNDI": {
    "date": "2026-09-28",
    "effectif": [
      {
        "shift": "matin",
        "members": [
          { "name": "AYAD (FARID)", "aircrafts": ["F-GZNO"], "leader": true },
          { "name": "PETIT (ANAIS)", "aircrafts": ["F-GSQB", "F-GSPK"], "leader": false }
        ]
      },
      { "shift": "soir", "members": [] },
      { "shift": "nuit", "members": [] }
    ],
    "blocks": [
      {
        "immat": "F-GZNO",
        "typeVisite": "A 04",
        "dateEntree": "2026-09-28",
        "heureEntree": "20H",
        "osm": "63994878",
        "config": "Y148",
        "position": "H1-1B",
        "dateSortie": "2026-10-02",
        "heureSortie": "12H",
        "shifts": {
          "matin": ["LEADER + ACL + IDT", "CAB SECU + PRELIM"],
          "soir": ["LEADER INSP LAVATORIES"],
          "nuit": ["WASTE"]
        }
      }
    ]
  },
  "MARDI": { "date": "2026-09-29", "effectif": [], "blocks": [] }
}
```

### Règles du contrat (à respecter à la lettre)

- Clés de jour : `DIMANCHE`, `LUNDI`, `MARDI`, `MERCREDI`, `JEUDI`, `VENDREDI`, `SAMEDI` (majuscules).
- `date` : chaîne ISO `YYYY-MM-DD` (une date par jour).
- `shift` : `"matin"` | `"soir"` | `"nuit"` (minuscules).
- `members[].aircrafts` : tableau d'immatriculations `F-…` (regex `^F-[\w-]+$`).
- Les membres **ABSENT / MANAGER / TSP** (aucun avion) sont **ignorés**.
- `blocks[].immat` : immatriculation valide uniquement (regex `^F-[\w-]+$`).
- `blocks[].shifts` : listes de **textes**, une consigne par ligne ; un shift sans consigne = `[]`.
- `summarizeAircrafts(report)` (fourni) agrège ensuite par avion : `days[day][shift] = [membres]`,
  `days[day].leaders[shift] = [leaders]`, `days[day].consignes[shift] = [tâches]`,
  `days[day].infos = { typeVisite, dateEntree, heureEntree, osm, config, position, dateSortie, heureSortie }`.
- `buildProfileData(existing, aircraftInfo, { day, shift })` transforme ensuite tout ça en notes
  `[C] <IMMAT> <JOUR> <Shift>` dans le profil, + `dayMembers` / `dayLeaders`. **Rien à changer là.**

---

## 4. Comment fonctionne le parseur Excel (pour comprendre quoi reproduire)

Le parseur est **100 % basé sur le contenu** (libellés détectés par texte normalisé), jamais sur des
positions fixes :

- Effectif : repère les en-têtes `Matin` / `Soir` / `Nuit`, puis la colonne `Nom` et les colonnes
  `Affectation` ; ignore les lignes sans immatriculation ; **leader = cellule au fond/police bleue**
  (`isBlueColor`, gère `#AFEEEE` et la palette indexée).
- Blocs : repère `Immat` + `F-…`, puis les en-têtes `Type de visite`, `Date/Heure d'entrée`,
  `OSM`, `Config`, `Position`, `Date/Heure de sortie`, et les listes `Consignes Matin/Soir/Nuit`
  (retrouvées aussi via le marqueur `A faire / Non réalisé…` si le libellé a été remplacé).
- **Dates des jours** : les 7 feuilles portent **la même** cellule `Date` (date du fichier, ex.
  `2026-09-27`) → inutilisable telle quelle. Le parseur lit le **numéro de semaine** dans la feuille
  `Consignes CHECK` (`Semaine` → `S40`) et **calcule** la date de chaque jour :
  `LUNDI` = lundi de la semaine ISO, `DIMANCHE` = +6 (`findWorkbookWeek` + `weekMonday`, année
  déduite de la date de référence du fichier). Si la semaine est introuvable, il garde la date du
  fichier (repli).
- `parseConsignesWorkbook(workbook)` = `{ [JOUR]: { date, effectif, blocks } }` (contrat §3).

---

## 5. Adaptation SharePoint — approche recommandée

**Principe : découpler la source de données du contrat.**
Écrire un **adaptateur** `parseConsignesFromSharePoint(items) → report` qui remplace
`parseConsignesWorkbook`, et ne changer QUE la partie « récupération » en amont.

Deux points d'intégration possibles :

- **A. Edge Function `import-consignes` (recommandé)** — elle *fetch* la liste Graph au lieu de
  recevoir un fichier. Le stockage admin (`consignes_imports` / `import_runs`) et le front restent
  inchangés.
- **B. Page `ImportConsignes.jsx` (option)** — remplacer `handleFile()` par un bouton
  « Charger depuis SharePoint » qui appelle Graph puis `setReport(parseConsignesFromSharePoint(items))`.
  Attention : ne jamais exposer un secret client côté navigateur → passer par une Edge Function
  intermédiaire.

### 5.1 Prérequis Microsoft Graph

1. **App registration** Entra ID (Azure AD) → noter `tenant_id`, `client_id`, `client_secret`.
2. **Permission** : `Sites.Read.All` (application) — ou mieux `Sites.Selected` (accès limité au seul
   site, plus sûr) ; consentement administrateur accordé.
3. Récupérer les identifiants du site et de la liste :

```bash
# Token (client_credentials)
curl -X POST "https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token" \
  -d "client_id={CLIENT_ID}&client_secret={CLIENT_SECRET}&scope=https://graph.microsoft.com/.default&grant_type=client_credentials"

# Site par chemin : contoso.sharepoint.com:/sites/MonSite
curl -H "Authorization: Bearer {TOKEN}" \
  "https://graph.microsoft.com/v1.0/sites/contoso.sharepoint.com:/sites/MonSite"

# Listes du site
curl -H "Authorization: Bearer {TOKEN}" \
  "https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists?\$select=id,name,displayName"

# Items de la liste (avec pagination via @odata.nextLink)
curl -H "Authorization: Bearer {TOKEN}" \
  "https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_ID}/items?expand=fields&\$top=999"
```

### 5.2 Structure de liste attendue (mapping proposé)

Deux organisations possibles — l'adaptateur ci-dessous fonctionne pour les deux :

- **Une seule liste « Consignes »** avec des lignes de deux natures : lignes *effectif* (champs
  `Jour/Shift/Nom/Avions/Leader`) et lignes *bloc* (champs `Immat/TypeVisite/OSM/...`). Une ligne
  sans `Nom` est ignorée par la passe effectif ; une ligne sans `Immat` est ignorée par la passe blocs.
- **Ou deux listes** (`Effectif` et `Blocs`) → concaténer les items avant d'appeler l'adaptateur.

| Colonne SharePoint | Type conseillé | → Contrat |
|---|---|---|
| `Jour` | Choice `LUNDI`…`DIMANCHE` | clé de jour du `report` |
| `Semaine` | Texte `S40` (ou nombre 40) | calcul des dates de chaque jour |
| `Shift` | Choice `Matin`/`Soir`/`Nuit` | `shift` en minuscules |
| `Nom` | Texte | `effectif[].members[].name` |
| `Avions` | Texte `F-GZNO, F-GSQB` | `members[].aircrafts` (split `,` `/` `;`) |
| `Leader` | Oui/Non | `members[].leader` |
| `Immat` | Texte | `blocks[].immat` |
| `TypeVisite`, `OSM`, `Config`, `Position` | Texte | `blocks[]` (infos) |
| `DateEntree`, `DateSortie` | Date (ou texte) | ISO `YYYY-MM-DD` |
| `HeureEntree`, `HeureSortie` | Texte `20H` / `20:00` | `blocks[]` |
| `ConsigneMatin`, `ConsigneSoir`, `ConsigneNuit` | Texte multiligne | `shifts.matin/soir/nuit` (split `\n`) |

> Si la liste contient déjà une **vraie date par jour** (colonne `Date`), utiliser cette colonne en
> priorité et ne calculer depuis `Semaine` qu'en repli (voir commentaire dans l'adaptateur).

### 5.3 Adaptateur complet (à copier, zéro dépendance)

```js
// ============================================================================
// Adaptateur SharePoint → report AeroTeam
// Entrée : items Graph (GET /sites/{site}/lists/{list}/items?expand=fields)
// Sortie : contrat identique à parseConsignesWorkbook(workbook) — cf. §3
// Peut tourner côté Deno (Edge Function) ou Node — aucune dépendance.
// ============================================================================

const DAY_NAMES = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']
const SHIFT_ORDER = ['matin', 'soir', 'nuit']
const IMMAT_RE = /^F-[\w-]+$/i

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // accents
    .replace(/\s+/g, '')
    .trim()

function normalizeDay(v) {
  const n = norm(v)
  return DAY_NAMES.find((d) => norm(d) === n) || ''
}

function normalizeShift(v) {
  const n = norm(v)
  return SHIFT_ORDER.find((s) => n.startsWith(s)) || ''
}

function toIsoDate(v) {
  if (!v) return ''
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/) // 2026-09-28 (Graph renvoie souvent ça)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{2})[/.](\d{2})[/.](\d{4})/) // 28/09/2026
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return ''
}

// Lundi (UTC) de la semaine ISO — identique à src/lib/consignesExcel.js
export function weekMonday(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const offset = (jan4.getUTCDay() + 6) % 7
  const monday = new Date(jan4.getTime() - offset * 86400000)
  return new Date(monday.getTime() + (week - 1) * 7 * 86400000)
}

function parseWeekLabel(v) {
  const m = String(v ?? '').match(/(\d{1,2})/)
  const w = m ? Number(m[1]) : 0
  return w >= 1 && w <= 53 ? w : 0
}

function resolveWeekYear(week, refIso) {
  const ref = refIso ? Date.parse(`${refIso}T00:00:00Z`) : NaN
  if (Number.isNaN(ref)) return new Date().getUTCFullYear()
  const base = new Date(ref).getUTCFullYear()
  let best = base
  let bestDist = Infinity
  for (const y of [base - 1, base, base + 1]) {
    const dist = Math.abs(weekMonday(y, week).getTime() - ref)
    if (dist < bestDist) { bestDist = dist; best = y }
  }
  return best
}

const splitLines = (v) =>
  String(v ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)

const splitAircrafts = (v) =>
  [...new Set(String(v ?? '').split(/[,;/]+/).map((s) => s.trim()).filter((s) => IMMAT_RE.test(s)))]

// Noms internes des colonnes SharePoint — À ADAPTER si les vôtres diffèrent
const F = {
  day: 'Jour', week: 'Semaine', shift: 'Shift', name: 'Nom', aircrafts: 'Avions',
  leader: 'Leader', immat: 'Immat', typeVisite: 'TypeVisite', osm: 'OSM',
  config: 'Config', position: 'Position',
  dateEntree: 'DateEntree', heureEntree: 'HeureEntree',
  dateSortie: 'DateSortie', heureSortie: 'HeureSortie',
  consigneMatin: 'ConsigneMatin', consigneSoir: 'ConsigneSoir', consigneNuit: 'ConsigneNuit',
}

export function parseConsignesFromSharePoint(items, options = {}) {
  const rows = (items || []).map((it) => it.fields || it)
  const report = {}

  // ---- 1) Dates des jours : via « Semaine » (repli : colonne Date si fournie) ----
  const week = rows.map((r) => parseWeekLabel(r[F.week])).find((w) => w > 0) || 0
  const refIso =
    rows.map((r) => toIsoDate(r[F.dateEntree])).find(Boolean) ||
    toIsoDate(options.refDate) ||
    new Date().toISOString().slice(0, 10)

  const dayDate = (dayName, row) => {
    const direct = toIsoDate(row?.Date) // colonne « Date » par ligne si elle existe
    if (direct) return direct
    if (!week) return ''
    const monday = weekMonday(resolveWeekYear(week, refIso), week)
    const idx = DAY_NAMES.indexOf(dayName)
    return new Date(monday.getTime() + ((idx + 6) % 7) * 86400000).toISOString().slice(0, 10)
  }

  const ensureDay = (day, row) => {
    if (!report[day]) report[day] = { date: dayDate(day, row), effectif: [], blocks: [] }
    return report[day]
  }

  // ---- 2) Effectif : (jour, shift) → membres ----
  rows.forEach((r) => {
    const day = normalizeDay(r[F.day])
    const shift = normalizeShift(r[F.shift])
    const name = String(r[F.name] ?? '').trim()
    if (!day || !shift || !name) return
    const aircrafts = splitAircrafts(r[F.aircrafts])
    if (!aircrafts.length) return // ABSENT / MANAGER / TSP → ignorés
    const leader =
      r[F.leader] === true || ['oui', 'yes', 'true', '1'].includes(norm(r[F.leader]))
    const d = ensureDay(day, r)
    let sh = d.effectif.find((e) => e.shift === shift)
    if (!sh) { sh = { shift, members: [] }; d.effectif.push(sh) }
    sh.members.push({ name, aircrafts, leader })
  })

  // ---- 3) Blocs de charge : (jour, immat) → infos + consignes par shift ----
  rows.forEach((r) => {
    const day = normalizeDay(r[F.day])
    const immat = String(r[F.immat] ?? '').trim()
    if (!day || !IMMAT_RE.test(immat)) return
    const d = ensureDay(day, r)
    let block = d.blocks.find((b) => b.immat === immat)
    if (!block) {
      block = {
        immat,
        typeVisite: String(r[F.typeVisite] ?? '').trim(),
        dateEntree: toIsoDate(r[F.dateEntree]),
        heureEntree: String(r[F.heureEntree] ?? '').trim(),
        osm: String(r[F.osm] ?? '').trim(),
        config: String(r[F.config] ?? '').trim(),
        position: String(r[F.position] ?? '').trim(),
        dateSortie: toIsoDate(r[F.dateSortie]),
        heureSortie: String(r[F.heureSortie] ?? '').trim(),
        shifts: { matin: [], soir: [], nuit: [] },
      }
      d.blocks.push(block)
    }
    const byShift = {
      matin: splitLines(r[F.consigneMatin]),
      soir: splitLines(r[F.consigneSoir]),
      nuit: splitLines(r[F.consigneNuit]),
    }
    SHIFT_ORDER.forEach((s) => {
      if (byShift[s].length) block.shifts[s] = [...new Set([...block.shifts[s], ...byShift[s]])]
    })
  })

  // ---- 4) Normalisation finale (tri stable, shifts complets) ----
  Object.values(report).forEach((d) => {
    d.effectif.sort((a, b) => SHIFT_ORDER.indexOf(a.shift) - SHIFT_ORDER.indexOf(b.shift))
    d.blocks.sort((a, b) => a.immat.localeCompare(b.immat))
    d.blocks.forEach((b) => SHIFT_ORDER.forEach((s) => { if (!b.shifts[s]) b.shifts[s] = [] }))
  })
  return report
}
```

### 5.4 Helpers Microsoft Graph (Deno / Edge Function)

```ts
// Token application (client_credentials)
async function getGraphToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: Deno.env.get('GRAPH_CLIENT_ID')!,
    client_secret: Deno.env.get('GRAPH_CLIENT_SECRET')!,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })
  const res = await fetch(
    `https://login.microsoftonline.com/${Deno.env.get('GRAPH_TENANT_ID')}/oauth2/v2.0/token`,
    { method: 'POST', body }
  )
  const json = await res.json()
  if (!json.access_token) throw new Error(`Graph token: ${JSON.stringify(json)}`)
  return json.access_token as string
}

// Items de la liste, pagination incluse + backoff 429
async function fetchListItems(token: string): Promise<any[]> {
  const siteId = Deno.env.get('SHAREPOINT_SITE_ID')!
  const listId = Deno.env.get('SHAREPOINT_LIST_ID')!
  let url: string =
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items?expand=fields&$top=999`
  const out: any[] = []
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') || 5)
      await new Promise((r) => setTimeout(r, retry * 1000))
      continue
    }
    if (!res.ok) throw new Error(`Graph ${res.status}: ${await res.text()}`)
    const page = await res.json()
    out.push(...(page.value || []))
    url = page['@odata.nextLink'] || ''
  }
  return out
}
```

### 5.5 Branchement dans l'Edge Function (option A, recommandée)

Dans `supabase/functions/import-consignes/index.ts`, remplacer la réception du fichier :

```ts
// AVANT
// const buf = new Uint8Array(await req.arrayBuffer())
// const wb = XLSX.read(buf, { type: 'array' })
// const report = parseConsignesWorkbook(wb)

// APRÈS
import { parseConsignesFromSharePoint } from './sharepointConsignes.js'

const token = await getGraphToken()
const items = await fetchListItems(token)
const report = parseConsignesFromSharePoint(items) as Record<string, any>

const fileName = `SharePoint · Semaine ${/* semaine lue dans les items */ ''}`.trim()
// ... le reste NE CHANGE PAS : calcul des immats, days, insert consignes_imports / import_runs
```

- Secrets à définir une seule fois :
  `supabase secrets set GRAPH_TENANT_ID=… GRAPH_CLIENT_ID=… GRAPH_CLIENT_SECRET=… SHAREPOINT_SITE_ID=… SHAREPOINT_LIST_ID=…`
- Déploiement : `supabase functions deploy import-consignes`
- **Test sans écrire** : la fonction supporte déjà `?dry=1` (analyse + réponse JSON, aucune insertion).
- Déclenchement : Power Automate, cron Supabase, ou raccourci — inchangé.
- Sécurité : garder le header `x-sync-secret` ou passer au planificateur ; **ne jamais** exposer
  `client_secret` côté front.

### 5.6 Branchement dans la page (option B)

Dans `src/pages/ImportConsignes.jsx`, `handleFile(file)` est le seul point à remplacer :

```js
const loadFromSharePoint = async () => {
  setError('')
  setFileName('SharePoint · Semaine 40')
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-consignes?dry=1`, {
    method: 'POST',
    headers: { 'x-sync-secret': import.meta.env.VITE_SYNC_SECRET },
  })
  const json = await res.json()
  if (!json.ok) { setError(json.error || 'Échec SharePoint'); return }
  setReport(json.report)              // même contrat que le parseur Excel
  setSelectedDay(defaultDayOf(Object.keys(json.report)))
  setSelectedShift('matin')
}
```

> Variante plus simple : faire renvoyer `report` par la fonction en `?dry=1` (déjà prévu pour les
> tests) et ne toucher à rien d'autre dans la page.

---

## 6. Ce qui ne doit PAS changer

- **Le contrat `report`** (§3) — tout le reste en dépend.
- `summarizeAircrafts`, `buildProfileData`, RPC `get_aircraft_consignes`, tables
  `consignes_imports` / `import_runs`.
- La règle métier : **jamais de modification automatique des profils leaders** (l'affectation reste
  manuelle dans la page Import consignes).
- Les deux copies du parseur (`src/lib/consignesExcel.js` et
  `supabase/functions/import-consignes/consignesExcel.js`) doivent rester **synchronisées** — idem
  pour le nouvel adaptateur si vous le dupliquez.

---

## 7. Pièges connus

- **Encodage/accents** : toujours normaliser (`normalize('NFD')` + suppression diacritiques) pour
  comparer jours/shifts, comme le fait `norm()` dans le parseur.
- **Pagination Graph** : `@odata.nextLink` obligatoire (> 999 items) ; gérer les `429` (backoff
  `Retry-After`).
- **Dates** : comparer en **UTC** ; Graph renvoie souvent `YYYY-MM-DD` (bien) mais peut renvoyer
  `28/09/2026` ou un datetime ISO complet → `toIsoDate()` gère les deux.
- **Semaine** : `S40` vs `40` vs `Semaine 40` → `parseWeekLabel` tolère les trois ; l'année est
  déduite de la date de référence (gestion des passages d'année, ex. semaine 1 en décembre).
- **Choix SharePoint** : les libellés peuvent être `Matin`/`MATIN`/`matin` → `normalizeShift`.
- **Lignes vides / multi-lignes** : une consigne par ligne dans les cellules texte → `splitLines`
  (trim + retrait des vides).
- **Multi-avions** : une personne peut avoir plusieurs avions (`F-GSQB, F-GSPK`) → `splitAircrafts`.
- **ABSENT / MANAGER / TSP** : aucune immatriculation → ligne ignorée (comme le parseur).
- **Fuseau du poste** : `weekMonday` travaille en UTC — ne pas « corriger » avec l'heure locale.

---

## 8. Checklist de validation

- [ ] `report` conforme au §3 (clés jours, dates ISO, shifts minuscules, listes non-null).
- [ ] Tests : écrire `sharepointConsignes.test.js` sur le modèle de `consignesExcel.test.js`
      (fixtures d'items Graph → `expect(report).toEqual(...)`), puis `npm test` vert.
- [ ] `npm run lint` sans erreur.
- [ ] Edge Function testée en `?dry=1` (réponse `ok: true`, `days`, `aircraft`).
- [ ] Vérification manuelle dans la page Import consignes : dates des jours correctes, effectif,
      consignes, puis affectation à un profil → la note `[C] <IMMAT> <JOUR> <Shift>` est créée.
- [ ] `import_runs` / `consignes_imports` remplis (hors dry-run).
- [ ] Aucune modification des profils sans action manuelle.

---

## 9. Résumé pour l'agent IA

1. Le code à réutiliser tel quel : `src/lib/consignesExcel.js` (référence du contrat + helpers
   `weekMonday`), `profileBuilder.js`, `profileStore.js`, tables/RPC dans
   `supabase/migrations/lot-import-auto.sql`.
2. Le travail : écrire `parseConsignesFromSharePoint()` (§5.3) + les helpers Graph (§5.4), puis
   remplacer la lecture du fichier dans l'Edge Function (§5.5) ou la page (§5.6).
3. La garantie de non-régression : **ne rien changer en aval du `report`**. Si le contrat est
   respecté, `summarizeAircrafts`, l'affectation aux profils, le Dashboard et la page Consignes
   fonctionnent sans modification.
