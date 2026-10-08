# Transfert du projet AeroTeam — Questions préalables à la reprise

**À l'attention de :** l'équipe informatique / le collègue Power Platform
**Objet :** transfert complet du projet AeroTeam + hébergement en interne (fin de GitHub Pages + Supabase)

## Contexte du transfert
- Le projet **AeroTeam** (application web + base de données) est **transféré à l'équipe informatique**.
- Après la migration, le cédant **n'assurera ni développement ni support (SAV)** — il participera uniquement à une **recette de test** après migration.
- Toutes les décisions d'hébergement, d'exploitation et d'évolution seront désormais **de votre ressort**.
- Un **dossier de reprise complet** est fourni (`deploy/windows/` : procédure d'installation, scripts, sauvegarde, migration des données).

**Fiche technique en 4 lignes (pour comprendre)**
- AeroTeam = application web (React) utilisée sur iPad et PC par les leaders et les agents.
- Elle parle à une **API PostgREST** qui lit/écrit dans une **base PostgreSQL**.
- Aujourd'hui : site sur GitHub Pages + base chez Supabase (cloud). Cible : **tout sur un serveur interne**.
- Aucune notification par mail souhaitée ; l'authentification est **interne à l'app** (identifiant + code par profil, sans Active Directory).

---

## 1. Serveur et système
1.1 Un serveur Windows Server est-il disponible (VM ou physique) ? Quelle version ?
1.2 Ressources prévues : vCPU / RAM / disque (minimum conseillé : 4 vCPU, 8 Go, 100 Go).
1.3 L'installation prévue est : **PostgreSQL 17 + API PostgREST (service Windows) + IIS (modules URL Rewrite et ARR)**. Ces briques sont-elles autorisées ? Sinon, quelles solutions imposez-vous (Docker ? nginx ? autre) ?
1.4 Le serveur est-il joignable depuis le **WiFi des hangars (iPad)** et depuis les postes de bureau ?
1.5 Qui sera l'administrateur du serveur (nom / contact) ?

## 2. Réseau, domaine, sécurité
2.1 Nom DNS interne à utiliser (ex. `aeroteam.intra.<domaine>`) ?
2.2 Certificat : fournirez-vous un **certificat de la CA interne** et le déploiement sur les **iPad (MDM)** ? (nécessaire pour le mode hors-ligne PWA)
2.3 HTTPS uniquement, ou HTTP toléré sur le réseau interne ?
2.4 Accès hors site (télétravail) : VPN ou exposition ?
2.5 L'authentification interne de l'app (identifiant + code par profil, sans AD) est-elle acceptée ? Ou faut-il prévoir un **SSO AD** (adaptation lourde à votre charge) ?
2.6 Contraintes particulières (antivirus sur le serveur, exclusions PostgreSQL, journalisation) ?

## 3. Reprise du code et des mises à jour
3.1 Sur quel **Git interne** importer le dépôt (GitLab / Gitea / Azure DevOps Server) ? Qui crée le projet ?
3.2 Une machine avec **Node.js 20** est-elle disponible pour construire l'application ? (sinon, un dossier de build prêt à copier est fourni une fois)
3.3 **Qui réalisera les mises à jour futures** (build + copie sur le serveur) et selon quelle procédure interne ?
3.4 Souhaitez-vous une **session de passation** (≈1 h) avec le dossier de reprise ?

## 4. Base de données et données
4.1 PostgreSQL 17 accepté ? Sinon, version imposée ?
4.2 Pour récupérer les données actuelles de Supabase : l'**accès à la base Supabase sera transmis pour la migration** (puis retiré) — **qui exécute le dump**, et quand ?
4.3 Quelle **fenêtre de bascule** (gel des saisies ~15 min) : date / heure ?
4.4 Extension PostgreSQL **pgcrypto** autorisée (nécessaire pour les codes des profils) ?
4.5 Sauvegardes : **qui** les met en place, fréquence et rétention souhaitées (proposé : dump quotidien, 30 jours, copie hors VM) ?

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

## 7. Exploitation (entièrement à votre charge après transfert)
7.1 Qui exploitera l'application (démarrage des services, logs, incidents) ? Contact ?
7.2 Procédure interne de sauvegarde / restauration ?
7.3 Gestion des mises à jour et des correctifs (fréquence, fenêtre) ?
7.4 Que se passe-t-il en cas de panne (astreinte, délai d'intervention) ?

## 8. Passation — ce qui est fourni lors du transfert
- ☐ Le **code source complet** (dépôt Git + historique)
- ☐ La **procédure d'installation on-premise** (`deploy/windows/README.md`)
- ☐ Les **scripts** : installation du service, sauvegarde, génération de clé API
- ☐ La **procédure de migration des données** (dump Supabase → PostgreSQL interne)
- ☐ Les **accès nécessaires à la migration** (Supabase, dépôt) — à retirer ensuite
- ☐ Une **recette de test** post-migration (participants : le cédant + un leader)
- ☐ Une **session de passation** (≈1 h) si souhaitée

## 9. Décisions à trancher par l'informatique (aucun retour en arrière ensuite)
9.1 Hébergement définitif (serveur, nom DNS, certificat)
9.2 Authentification : on garde le système interne, ou SSO AD (nouveau développement à prévoir)
9.3 Pérennité et propriété du code (licence interne, qui maintient)
9.4 **Fin des services cloud actuels** : suppression de GitHub Pages et de Supabase après la bascule
9.5 Reprise du domaine / des emails internes si AeroTeam doit un jour en envoyer

---
*Le dossier `deploy/windows/` du projet contient tout le nécessaire technique pour la reprise.*
