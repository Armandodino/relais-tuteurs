# Relais — Suivi du travail des tuteurs

Comptes responsable et tuteurs, niveaux et groupes, tâches attendues, temps d’intervention, travail réalisé, résultats, justificatifs par lien, validation et historique.

## Démarrage

Node.js 24 ou plus récent est nécessaire, déjà présent sur cet ordinateur. Aucune dépendance à télécharger.

1. Décompressez l’archive dans un dossier permanent.
2. Double-cliquez sur `Demarrer.cmd` et laissez la fenêtre ouverte.
3. Ouvrez http://127.0.0.1:4173 dans votre navigateur.
4. Créez votre compte responsable : adresse e-mail et mot de passe d’au moins 10 caractères. Aucun compte ni mot de passe prédéfini.

Si l’application est déjà lancée, ouvrez simplement l’adresse. Fermez la fenêtre ou utilisez Ctrl+C pour arrêter le service.

## Configuration

Dans « Tuteurs & groupes », ajoutez d’abord les groupes avec leur niveau, puis les tuteurs avec leur adresse e-mail et leurs groupes affectés. Pour sélectionner plusieurs groupes : Ctrl+clic sous Windows.

Sur la ligne du tuteur, « Créer / réinitialiser l’accès » permet de définir un mot de passe à lui communiquer. « Modifier / affecter » met à jour ses informations et ses groupes. Un groupe associé à une intervention existante doit rester affecté pour conserver la cohérence de l’historique.

## Utilisation

Le responsable crée les tâches attendues avec une échéance. Chaque tuteur se connecte avec son adresse e-mail et son mot de passe ; il voit uniquement ses groupes, ses tâches et ses interventions.

Il renseigne la date, les heures de début et de fin, le travail effectué, le résultat et éventuellement un lien justificatif. La durée est calculée et les chevauchements sont refusés. Chaque intervention commence et finit le même jour : découpez les interventions de nuit en deux saisies.

Le responsable ouvre « Examiner », ajoute une observation puis valide ou demande un complément. Un tuteur ne peut ni valider ni supprimer une intervention. Une modification remet l’intervention « À vérifier ». L’historique antérieur est conservé ; les événements sont datés côté serveur. Les horaires sont déclaratifs : une durée saisie ne prouve pas à elle seule le travail réalisé.

Les filtres portent sur le niveau, le groupe, le statut, la semaine et le texte. L’export CSV reprend la sélection affichée. Rechargez la page pour consulter les nouvelles saisies des autres comptes. Si deux personnes modifient en même temps, le système recharge les données et demande de recommencer la modification.

La démonstration comporte des données fictives isolées de la base réelle. Elle peut être quittée à tout moment.

## Sauvegardes et comptes

Les données et comptes sont conservés dans `data/relais.sqlite` et éventuellement les fichiers `-wal` et `-shm`. Ils subsistent après fermeture de l’application. Les mots de passe sont dérivés avec scrypt et un sel aléatoire. Les sessions expirent après 8 heures ; une réinitialisation ferme les sessions du tuteur.

Pour sauvegarder complètement : arrêtez l’application, puis copiez le dossier `data` dans un emplacement protégé. Restaurez-le application arrêtée. L’export JSON conserve les données de suivi mais pas les comptes. Sa restauration reste soumise aux règles de vérification. En cas d’oubli du mot de passe responsable, une intervention d’administration sur la base sera nécessaire ; aucune récupération par e-mail n’est incluse.

## Nouveau serveur

Transférez le dossier de l’application et le dossier `data` sur un serveur avec Node.js 24+. Lancez `node local-server.mjs` avec un processus supervisé et un proxy HTTPS pour un accès collectif.

- `RELAIS_PORT` : port, par défaut `4173`.
- `RELAIS_HOST` : écoute, par défaut `127.0.0.1`, cet ordinateur uniquement.
- `RELAIS_ORIGIN` : origine publique exacte, par exemple `https://tuteurs.votre-domaine.fr`.
- `RELAIS_DATA_DIR` : dossier permanent de la base.

Pour une écoute réseau, une origine HTTPS est exigée. Derrière un proxy sur le même serveur, gardez `127.0.0.1` et définissez l’origine HTTPS publique. Ne servez pas le dossier `data` comme fichiers statiques. Les justificatifs restent des liens externes ; aucun téléversement n’est inclus.

## Variante Sites

`server.mjs`, `build.mjs`, `.openai/hosting.json` et `drizzle/` préparent une variante Worker avec D1 et identité ChatGPT. `node build.mjs` produit `dist/server/index.js`. Cette variante n’a pas été publiée : le contrôle automatique d’autorisation a refusé l’envoi du code. La version autonome fonctionne indépendamment de Sites, avec ses propres comptes.

## Vérification

Tests des durées, filtres et données ; tests du stockage partagé, des rôles côté serveur, de l’isolation des groupes, de la validation, de l’historique, des conflits et chevauchements ; tests HTTP des comptes, connexions, sessions, réinitialisation et déconnexion.

L’aperçu visuel automatisé était bloqué par la politique du navigateur. Le rendu n’a donc pas été vérifié par captures d’écran.
