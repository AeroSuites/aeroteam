# Import Victory — Présentation et tutoriel

**Version testée avec :** `Complete test Workpackage-Report_08-Oct-2026 07_47.xlsx`
(feuille `in`, 277 lignes, avion **F-GSPF**)

---

## 1. À quoi sert l'Import Victory ?

L'Import Victory transforme un **export Workpackage Report** (fichier Victory) en tâches
exploitables dans AeroTeam : JIC, Found Fault, MPC, ADHOC, EO.

L'import fait automatiquement :

- le **filtrage** des lignes (skills, statuts, types de bloc) ;
- la **classification** par bloc, par sous-tâche (zone) et par n° de ligne ;
- la récupération des informations utiles : TRFX, immatriculation, description détaillée,
  étapes (Task_Steps), priorités MEL / EXMP / NSRE / TLI / IDT ;
- le **signalement des lignes à risque** (sans skill, mauvais skill Found Fault) pour ne
  rien oublier ;
- la possibilité d'**inclure les lignes COMPLETE** du fichier pour synchroniser les statuts.

L'import **ne touche pas** aux équipes, aux consignes ni aux affectations existantes : il
ajoute les tâches à la charge en cours.

---

## 2. Avant de commencer

- Être sur le **réseau de l'entreprise ou en VPN** pour accéder à Victory.
- La page Import Victory contient un bouton **« Open Victory tracking »** qui ouvre
  `www.vic.klm.com` dans un nouvel onglet.
- Avoir téléchargé le **Workpackage Report** (formats acceptés : `.xlsx`, `.xls`, `.csv`).

---

## 3. Ce que lit le fichier et ce qui est filtré

**Colonnes lues** (détection automatique par le nom des colonnes, jamais par position) :

| Information | Colonne Victory |
|---|---|
| N° de ligne | `Seq._Nr.` |
| TRFX | `Task_Barcode` |
| Titre | `Task_Name` |
| Slot (ATA) | `Config_Slot` |
| Skills | `Skills` |
| Statut | `MTX_Status` |
| Bloc | `Task_Type` |
| Sous-tâche (zone) | `Work_Area` |
| Description / étapes | `Task_Description`, `Task_Steps` |
| Avion | `Aircraft_Registration`, `Aircraft_Type` |

**Filtres d'import actifs :**

1. **Skills** : on garde les lignes dont **au moins un skill commence par CABB**
   (ex. `B1B2/CABB1B2`). Les lignes sans skill ou avec un autre skill sont exclues —
   mais **signalées** (voir §4.5 et §4.6).
2. **MTX Status** : seules les lignes `ACTV`, `PAUSE` et `IN WORK` sont importées.
3. **Task Type** : tous les blocs sont acceptés (JIC, Found Fault, MPC, ADHOC, EO).

**Résultat sur le fichier de test :**

| | Nombre |
|---|---|
| Lignes du fichier | 277 |
| Lignes retenues après filtres | **83** (49 JIC · 28 Found Fault · 6 MPC) |
| Lignes exclues | 194 |
| Immatriculation | F-GSPF |
| Lignes COMPLETE (hors import standard) | 2 |
| Lignes sans skill | 0 |
| Found Fault au mauvais skill | 4 |

---

## 4. Tutoriel pas à pas

### 4.1 Ouvrir la page

Menu principal → **Import Victory**. La page rappelle les filtres actifs.

### 4.2 Charger le fichier

Cliquer dans la zone pointillée (ou glisser-déposer le fichier). Le nom du fichier
s'affiche. L'analyse est immédiate.

### 4.3 Lire les statistiques

Trois compteurs apparaissent :

- **Total lines** : toutes les lignes du fichier (ici 277) ;
- **After filters** : lignes qui seront proposées à l'import (ici 83) ;
- **Excluded** : lignes écartées par les filtres (ici 194).

> **À retenir :** un grand nombre d'exclues est normal (lignes déjà COMPLETE, skills hors
> périmètre, statuts non actifs, etc.). Les alertes ci-dessous couvrent les cas où une
> exclusion pourrait être une erreur.

### 4.4 (Optionnel) Ouvrir Victory tracking

Le bouton **« Open Victory tracking »** ouvre le site Victory dans un nouvel onglet pour
aller chercher un nouveau rapport. L'application reste ouverte.

### 4.5 Traiter l'alerte « lignes sans skill » (ambre)

Si le fichier contient des lignes dont la colonne **Skills est vide**, un encart ambre les
liste : **N°, titre, TRFX** (TRFX cliquable → Maintenix).

Pour chacune :

1. remplir le **Skill** (prérempli `CAB1B2`, modifiable) ;
2. choisir le **Bloc** dans le menu déroulant ;
3. choisir la **Sous-tâche** dans le menu déroulant (sous-tâches existantes du fichier) —
   ou **« ➕ New sub-task… »** pour en créer une nouvelle ;
4. cocher les lignes à intégrer (les cases sont **décochées par défaut**) ;
5. cliquer **« Import checked lines into Tasks »**.

Les lignes intégrées passent en « imported » dans la liste ; un message indique le nombre
ajouté (et le nombre ignoré si le statut ne le permet pas).

> Sur le fichier de test : **0 ligne** dans cette alerte.

### 4.6 Traiter l'alerte « Found Fault au mauvais skill » (rouge)

Règle métier : les **Found Fault** dont le **Config Slot** commence par **11, 12, 21, 23,
25, 33, 35, 38, 44 ou 56** doivent avoir le skill **CABB1B2**. Si ce n'est pas le cas, la
ligne est exclue par le filtre Skills → l'encart rouge la liste (N°, titre, TRFX, slot,
skill actuel).

Sur le fichier de test, **4 lignes** sont concernées :

| N° | Titre (extrait) | TRFX | Slot | Skill actuel |
|---|---|---|---|---|
| 232 | ATL / LEFT BUNK OF PEDESTAL DAMAGED | TRFX900WMYNZ | 25-15-00 | B1B2 |
| 269 | CAB/JC/ SEAT PAN /BOTTOM COVER DIRTY… | TRFX900WFYGR | 25-00-00 | SUB |
| 270 | NSRE_AF_25X42//SUB/CURTAINS REPLACEMENT. | TRFX900U47QA | 25-00-00 | SUB |
| 275 | MEL 25-28-01B / GALLEY 2 DOOR 131/132 STUCK CLOSED | TRFX900X6497 | 25-31-00 | B1B2 |

Pour chacune : choisir le **Bloc** (prérempli Found Fault) et la **Sous-tâche**, cocher, puis
**« Import checked lines into Tasks »** : les lignes sont intégrées avec le **skill corrigé
en CABB1B2**.

### 4.7 Vérifier la sélection

Les lignes importables sont regroupées en arbre **Bloc → Sous-tâche → ligne** :

- cocher/décocher une ligne, une sous-tâche ou un bloc entier ;
- boutons **Check all / Uncheck all** ;
- chaque ligne affiche N°, titre, skill, statut, heures, immatriculation.

> Sur le fichier de test : 83 lignes cochées par défaut, dont 49 JIC, 28 Found Fault et 6 MPC.

### 4.8 Lignes COMPLETE (fichier du même avion)

Une case à cocher s'affiche sous l'en-tête de sélection :

> ☐ **Include the N COMPLETE line(s) with status COMPLETE.** Lines already present (same
> number) are set to COMPLETE. Unchecked = the COMPLETE lines are excluded.

- **Cochée** : les lignes COMPLETE du fichier sont intégrées avec le statut **COMPLETE** ;
  si une ligne de même n° existe déjà dans AeroTeam, elle passe à COMPLETE (et sa copie en
  Next shift prep est synchronisée).
- **Décochée** (par défaut) : les COMPLETE sont ignorées.

> Sur le fichier de test : **2 lignes COMPLETE** proposées.

### 4.9 Importer

Cliquer sur **« Import X task(s) »**. Un bandeau vert confirme l'import, par exemple :

> ✓ 83 tasks imported successfully! · 2 COMPLETE line(s) included

### 4.10 Vérifier dans Tasks

Menu → **Tasks** :

- retrouver les lignes par bloc, sous-tâche, priorité (MEL / EXMP / NSRE / TLI / IDT) ;
- ouvrir la popup **📄 Task Steps** (description détaillée + étapes) ;
- renommer une ligne (✏️), ajouter une note, changer le statut ;
- le TRFX est un **lien Maintenix** cliquable.

Ensuite : **Teams & Assignment** pour créer les équipes et affecter, puis **Next shift prep**
pour préparer le shift suivant.

---

## 5. Messages et erreurs courantes

| Message | Signification / action |
|---|---|
| The file is empty or does not contain enough lines. | Mauvais fichier ou fichier vide → vérifier l'export. |
| Column "Task_Name" not found. Check the file format. | Ce n'est pas un Workpackage Report → réexporter depuis Victory. |
| ⚠ This file contains multiple registrations… | Le fichier couvre plusieurs avions → confirmer ou séparer les imports. |
| ⚠ This file is for aircraft X while the current workload is for Y. | Risque de mélange avec la charge en cours → confirmer, ou faire **Export/Reset** d'abord. |
| N line(s) added to Tasks · M ignored (status filter) | Certaines lignes choisies ne sont pas dans un statut importable (COMPLETE, etc.). |
| Invalid file… (sessions import) | Ce fichier n'est pas un export de sessions AeroTeam. |

**Rappels :**

- L'import **ajoute** les tâches ; il ne remplace pas la charge existante. Pour repartir de
  zéro : **Export & Backup → Reset all** (les membres permanents et le Bloc-notes sont conservés).
- Les alertes sans/mauvais skill sont **décochées par défaut** : rien n'est intégré sans
  validation volontaire.
- Tout est sauvegardé automatiquement dans le profil (en ligne) ; en cas de coupure réseau,
  l'app garde les modifications en attente et réessaie.

---

## 6. Checklist express

☐ Je suis sur le réseau entreprise / VPN
☐ Le fichier Victory concerne le bon avion
☐ J'ai lu les statistiques (Total / After filters / Excluded)
☐ J'ai traité les alertes « sans skill » et « mauvais skill » (si présentes)
☐ J'ai vérifié la sélection (blocs / sous-tâches / lignes)
☐ J'ai coché « Include COMPLETE » si je veux synchroniser les lignes terminées
☐ J'ai cliqué sur « Import X task(s) »
☐ J'ai contrôlé le résultat dans Tasks
