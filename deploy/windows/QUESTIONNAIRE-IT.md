# Questionnaire — Migration AeroTeam sur les serveurs de l'entreprise

**À l'attention de :** l'équipe informatique / le collègue Power Platform
**Objet :** héberger AeroTeam entièrement en interne (fin de GitHub Pages + Supabase)

**Fiche technique en 4 lignes (pour comprendre)**
- AeroTeam = application web (React) utilisée sur iPad et PC par les leaders et les agents.
- Elle parle à une **API PostgREST** qui lit/écrit dans une **base PostgreSQL**.
- Aujourd'hui : le site est sur GitHub Pages et la base chez Supabase (cloud). Cible : **tout sur un serveur interne**.
- Aucune notification par mail souhaitée ; l'authentification est **interne à l'app** (identifiant + code par profil, sans Active Directory).

---

## 1. Serveur et système
1.1 Un serveur Windows Server est-il disponible (VM ou physique) ? Quelle version ?
1.2 Ressources prévues : vCPU / RAM / disque (minimum conseillé : 4 vCPU, 8 Go, 100 Go).
1.3 Puis-je installer : **PostgreSQL 17**, un **service Windows** pour l'API (PostgREST), les modules IIS **URL Rewrite** et **ARR** ? Sinon, quelles solutions sont autorisées (Docker ? nginx ? autre) ?
1.4 Le serveur est-il joignable depuis le **WiFi des hangars (iPad)** et depuis les postes de bureau ?
1.5 Qui aura les droits administrateur sur la VM (nom / contact) ?

## 2. Réseau, domaine, sécurité
2.1 Nom DNS interne à utiliser (ex. `aeroteam.intra.<domaine>`) ?
2.2 Certificat : pouvez-vous fournir un **certificat de la CA interne** et le déployer sur les **iPad (MDM)** ? (nécessaire pour le mode hors-ligne PWA)
2.3 HTTPS uniquement, ou HTTP toléré sur le réseau interne ?
2.4 Accès hors site (télétravail) : VPN ou exposition ?
2.5 L'authentification interne de l'app (identifiant + code par profil, sans AD) est-elle acceptée ? Ou faut-il prévoir un **SSO AD** (adaptation lourde) ?
2.6 Contraintes particulières (antivirus sur le serveur, exclusions PostgreSQL, journalisation) ?

## 3. Code source et déploiement
3.1 Sur quel **Git interne** baser le dépôt (GitLab / Gitea / Azure DevOps Server) ? Qui crée le projet ?
3.2 Le dépôt GitHub actuel peut-il rester (public, sans données) ou faut-il tout rapatrier en interne ?
3.3 Y a-t-il une machine avec **Node.js 20** pour construire l'application, ou dois-je livrer un paquet prêt à copier ?
3.4 Comment se fera une **mise à jour** de l'app : qui copie le nouveau build, à quelle fréquence, avec fenêtre de maintenance ?

## 4. Base de données et données
4.1 PostgreSQL 17 accepté ? Sinon, version imposée ?
4.2 Pour récupérer les données actuelles de Supabase : qui exécute le dump et peut **réinitialiser le mot de passe** de la base Supabase (accès admin) ?
4.3 Quelle **fenêtre de bascule** (gel des saisies ~15 min) : date / heure ?
4.4 Extension PostgreSQL **pgcrypto** autorisée (nécessaire pour les codes des profils) ?
4.5 Sauvegardes : fréquence et rétention souhaitées (proposé : dump quotidien, 30 jours, copie hors VM) ?

## 5. Emails
5.1 Confirmé : **aucune notification par mail** (inscription, récap) — validation des inscriptions manuelle dans l'app ?
5.2 Si besoin plus tard : un **relais SMTP interne** est-il disponible (adresse / port) ?

## 6. Intégration Power Platform (projet du collègue)
6.1 Besoin exact : afficher AeroTeam dans **Power Apps (iframe)** ? lire les données AeroTeam dans ses propres écrans (**via API**) ? les deux ?
6.2 Power Apps : application **Canvas** ou **modèle** ? Le composant « **Web Viewer** » est-il disponible ?
6.3 Power Automate : licence **Premium** (action HTTP) disponible pour appeler l'API interne ?
6.4 **SharePoint lists** : que souhaite-t-il y mettre exactement (pour éviter de dupliquer les données) ?
6.5 Fréquence de synchronisation attendue (temps réel, toutes les X min, quotidienne) ?
6.6 Sens de la synchronisation : **lecture seule** depuis AeroTeam, ou écriture aussi ?
6.7 Authentification : les utilisateurs de son app ont-ils un compte interne (AD) ? Faut-il un **jeton dédié** pour l'API ?

## 7. Exploitation après migration
7.1 Qui sera l'exploitant (démarrage des services, logs, incidents) ? Contact ?
7.2 Sauvegarde / restauration : votre équipe ou la mienne (scripts fournis) ?
7.3 Recette : qui teste (moi + un leader) et quand ? Critères d'acceptation ?

## 8. Pour démarrer, j'ai besoin de
- ☐ Les réponses à ce questionnaire
- ☐ Le nom du serveur + accès (ou un contact qui exécute mes scripts)
- ☐ Le nom DNS + le certificat
- ☐ L'accès au Git interne (ou la personne qui fait l'import)
- ☐ La fenêtre de bascule

---
*Documents techniques déjà prêts : dossier `deploy/windows/` du projet (procédure complète, scripts d'installation, sauvegarde, migration des données).*
