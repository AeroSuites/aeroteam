# AeroTeam — Déploiement on-premise Windows

Kit d'installation complète sur les serveurs de l'entreprise (Windows Server).
Architecture : **PostgreSQL + PostgREST + IIS** (aucun service cloud).

```
iPad / PC  →  IIS (HTTPS, aeroteam.intra)
                ├─ site statique  C:\AeroTeam\www      (build React)
                └─ /rest/v1/*  →  PostgREST (localhost:3000)  →  PostgreSQL (localhost:5432)
```

## Prérequis (à demander à l'IT)
- Windows Server 2019/2022, droits administrateur.
- Nom DNS interne (ex. `aeroteam.intra`) + **certificat de la CA interne** (HTTPS obligatoire pour la PWA sur iPad).
- Les iPad doivent pouvoir joindre le serveur (WiFi interne) et **faire confiance à la CA interne**.
- Une machine avec Node.js 20+ pour construire le front (ou utiliser le dossier `dist` fourni).

## 1. Installer PostgreSQL
1. Télécharger **PostgreSQL 17 (installateur EDB)** : https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
2. Installer avec : port `5432`, mot de passe du superutilisateur `postgres` (le noter), composants : Server + Command Line Tools (pg_dump/psql).
3. Vérifier : `& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -c "select version();"`

## 2. Créer la base et les rôles
Dans `psql` (en tant que `postgres`) :
```sql
create database aeroteam;
create role authenticator login password 'MOT_DE_PASSE_AUTHENTICATOR';
create role anon nologin;
create role authenticated nologin;
grant anon to authenticator;
grant authenticated to authenticator;
```
(Le mot de passe `authenticator` servira dans `postgrest.conf`.)

## 3. Restaurer les données
Voir **`migrate-data.md`** (dump depuis Supabase → restauration ici).
À faire **avant** `on-prem-setup.sql`.

## 4. Finaliser la base
```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d aeroteam -f on-prem-setup.sql
```
Ce script : active `pgcrypto`, re-grant les RPC, **désactive les emails** (trigger + cron) et prépare les rôles PostgREST.

## 5. Installer PostgREST (API)
1. Télécharger le binaire Windows : https://github.com/PostgREST/postgrest/releases (`postgrest-v12.x-windows-x64.zip`).
2. Décompresser dans `C:\AeroTeam\postgrest\` (postgrest.exe + `postgrest.conf` fourni, à compléter).
3. Générer le secret JWT et la clé anon :
   ```powershell
   .\make-anon-key.ps1 -Secret "SECRET_TRES_LONG_A_CONSERVER"
   ```
   → reporter le secret dans `postgrest.conf` (`jwt-secret`) et la clé anon dans le build du front (`VITE_SUPABASE_ANON_KEY`).
4. Enregistrer comme service Windows (NSSM : https://nssm.cc/download) :
   ```powershell
   .\install-services.ps1 -NssmPath C:\AeroTeam\nssm\nssm.exe
   ```
5. Tester : `http://localhost:3000/` doit répondre (liste des routes PostgREST).

## 6. Installer IIS (site + reverse proxy)
1. Rôles IIS : `Web-Server`, `Web-Static-Content`, `Web-Http-Redirect`.
2. Installer les modules **URL Rewrite 2.1** et **Application Request Routing 3.0** (téléchargements Microsoft).
3. Dans **ARR** : activer « Enable proxy » (Server Proxy Settings).
4. Créer un site `AeroTeam` :
   - Chemin physique : `C:\AeroTeam\www`
   - Liaison : `https` + certificat CA interne, hôte `aeroteam.intra`
   - Copier **`web.config`** à la racine de `C:\AeroTeam\www` (règles : `/rest/v1/*` → PostgREST, sinon `index.html`).
5. DNS interne : `aeroteam.intra` → IP du serveur.

## 7. Construire et copier le front
Sur une machine avec Node.js (ou avec le `dist/` fourni) :
```powershell
# .env (à la racine du projet) :
#   VITE_SUPABASE_URL=https://aeroteam.intra
#   VITE_SUPABASE_ANON_KEY=<clé anon générée à l'étape 5.3>
$env:VITE_BASE = "/"          # racine du domaine (au lieu de /aeroteam/ pour GitHub Pages)
npm ci
npm run build
# Copier dist\* vers C:\AeroTeam\www
```
Puis sur les iPad : ouvrir `https://aeroteam.intra/` (se connecter avec identifiant + code du profil).

## 8. Sauvegardes
Créer une tâche planifiée quotidienne :
```powershell
schtasks /create /tn "AeroTeam Backup" /sc daily /st 03:00 /ru SYSTEM ^
  /tr "powershell -ExecutionPolicy Bypass -File C:\AeroTeam\scripts\backup.ps1"
```
(`backup.ps1` fourni : dump compressé + purge > 30 jours. Prévoir une copie hors VM.)

## 9. Recette (à tester après installation)
- Connexion identifiant + code (profil leader et profil agent).
- Import Victory, Tâches, Affectation, Équipes, Préparation.
- Consignes (dossiers, messages, coches) + Messagerie (pièces jointes).
- Charge agent : envoi, statuts, notes, archives ; suivi leader.
- Impression PDF (récap, pochettes).
- Mode avion (hors-ligne) : l'app doit se recharger (PWA) si le certificat est approuvé.

## Annexe — Migrer le code source vers le Git interne
```powershell
git clone --mirror https://github.com/AeroSuites/aeroteam.git aeroteam.git
cd aeroteam.git
git push --mirror https://git.intra/<groupe>/aeroteam.git
```
Ensuite : builder depuis le Git interne. **Ne jamais committer le `.env`** (secrets locaux).

## Notes
- **Emails désactivés** (choix entreprise) : la notification d'inscription et le récap primes ne partent plus ; l'admin valide les inscriptions depuis l'app.
- **Images des consignes** : elles étaient stockées dans Supabase Storage ; avant la bascule, elles seront migrées en base de données (petit lot de code à appliquer — voir avec le développeur).
- Les réglages « email » de la page Primes peuvent rester affichés mais ne servent plus.
