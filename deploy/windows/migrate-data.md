# Migration des données — Supabase → PostgreSQL on-premise (Windows)

## 1. Récupérer le dump depuis Supabase
Sur une machine avec PostgreSQL 17 (client `pg_dump`) :

1. Supabase → **Project Settings → Database** :
   - noter l'hôte direct `db.<ref>.supabase.co` (port 5432),
   - (re)définir le mot de passe de la base si besoin (**Reset database password**).
2. Lancer le dump (schéma `public` uniquement) :
   ```powershell
   $env:PGPASSWORD = "MOT_DE_PASSE_BASE_SUPABASE"
   pg_dump "postgresql://postgres:MOT_DE_PASSE_BASE_SUPABASE@db.ifmvddwtzyopvghuxoua.supabase.co:5432/postgres" `
     --schema=public --no-owner -Fc -f aeroteam.dump
   ```
   > `-Fc` = format compressé (pg_restore). `--no-owner` évite les erreurs de rôles Supabase.
   > Les privilèges (GRANT) sont conservés : les rôles `anon` / `authenticated` doivent
   > exister AVANT la restauration (voir README section 2).

## 2. Restaurer sur le serveur Windows
```powershell
$env:PGPASSWORD = "MOT_DE_PASSE_POSTGRES_LOCAL"
& "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" -U postgres -d aeroteam --no-owner --clean --if-exists aeroteam.dump
```
> `--clean --if-exists` permet de rejouer la restauration (recette) sans erreur.

## 3. Finaliser
```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d aeroteam -f on-prem-setup.sql
```

## 4. Vérifications
```sql
select count(*) from public.profiles;
select count(*) from public.admins;
select name from public.profiles order by name;
```
Puis, depuis PostgREST (test rapide) :
```powershell
curl.exe -X POST "http://localhost:3000/rpc/profile_exists" -H "Content-Type: application/json" -H "Authorization: Bearer <CLE_ANON>" -d '{\"p_identifiant\":\"x\",\"p_code\":\"x\"}'
```

## 5. Images des consignes (Supabase Storage → base)
Les images des consignes étaient dans le bucket `consignes-images`.
Avant la bascule définitive :
- soit les télécharger et les re-uploader après le lot « images en base » (recommandé),
- soit considérer que les anciennes images ne sont plus nécessaires (à valider).
> Un petit lot de code est prévu pour stocker les images directement en base (comme la
> Messagerie), ce qui supprime le besoin de tout service de stockage on-premise.

## 6. Bascule finale (le jour J)
1. Prévenir les utilisateurs : gel des saisies (15 min).
2. Refaire un dump « à chaud » (étape 1) et restaurer (étape 2).
3. Vérifier la connexion sur `https://aeroteam.intra/` (leader + agent).
4. Conserver l'ancien site GitHub Pages en lecture seule quelques jours, puis le retirer.
