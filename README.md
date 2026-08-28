# Caisse — Gestion des adhérents

Application web simple pour gérer les adhérents d'une association : fiche
adhérent, cotisations (montant, date, statut), déclarations de décès et de
dépenses, rapports financiers et documents de l'association.

- **Frontend** : HTML/CSS/JS, aucune installation ni compilation nécessaire.
  Se déploie gratuitement sur **GitHub Pages**.
- **Base de données** : une **Google Sheet**, via un petit script
  **Google Apps Script** qui sert d'API.
- **Mode démo** : si aucune source de données n'est configurée, l'appli
  fonctionne avec des données d'exemple en mémoire (rien n'est sauvegardé),
  ce qui permet de tester l'interface tout de suite.

## Navigation

L'appli est organisée en une seule page, avec un bouton **☰ Menu** en haut à
droite qui donne accès à :

- **Adhérents** — la vue par défaut : liste, recherche, fiche adhérent et
  tableau de bord des cotisations (total par année). Le bouton **Modifier**
  propose désormais un choix : **Infos personnelles** (nom, prénom,
  téléphone…) ou **Cotisations** (amène directement au formulaire de
  cotisations de la fiche, qui permet aussi bien d'en ajouter une nouvelle
  que de modifier ou supprimer une cotisation existante depuis le tableau).
  Un adhérent peut être
  **archivé** (bouton à côté de « Supprimer ») : il disparaît de la liste
  active, mais ses cotisations restent comptabilisées dans le total cotisé et
  le bilan par année — contrairement à « Supprimer », qui efface aussi ses
  cotisations. Sur la fiche adhérent, le bouton **« 📄 État PDF »** génère un
  PDF (infos + historique des cotisations) qui s'ouvre dans un nouvel onglet
  pour être consulté, imprimé ou téléchargé depuis la visionneuse du
  navigateur.
- **Adhérents archivés** (dans le menu) — liste les adhérents archivés (avec
  leur total cotisé) et permet de les réactiver.
- **Déclarations — Décès et dépenses** — déclarer un décès (nom, prénom,
  coût des funérailles, date, pièce jointe) ou une dépense (date, nature,
  montant, pièce jointe).
- **Rapports** — bilan financier par année (recettes des cotisations contre
  dépenses + frais funéraires, avec le solde) et détail des cotisations par
  adhérent ; chaque tableau peut être exporté en CSV, et la page dispose d'un
  bouton **Imprimer** (impression navigateur, utilisable pour exporter en PDF).
- **Documents** — une bibliothèque de documents de l'association (statuts, PV
  de réunion…) avec pièce jointe, et une vue qui regroupe automatiquement
  toutes les pièces jointes déjà attachées aux décès et dépenses.
- **Archives** — affiche en **lecture seule** le contenu de l'onglet `Archives`
  de votre Google Sheet, avec une recherche globale et des filtres par
  colonne. Rien ne s'ajoute, ne se modifie ni ne se supprime depuis l'appli :
  la gestion se fait directement dans Google Sheets.
- **Configuration** — pour renseigner l'URL de votre Google Apps Script (voir
  ci-dessous).

## 1. Tester tout de suite (mode démo)

Ouvrez simplement `index.html` dans votre navigateur (double-clic). L'appli
se lance avec deux adhérents d'exemple. Rien n'est sauvegardé tant que vous
n'avez pas configuré la Google Sheet (étape 2).

## 2. Créer la base de données (Google Sheet + Apps Script)

1. Allez sur [sheets.google.com](https://sheets.google.com) et créez une
   nouvelle feuille de calcul, par exemple nommée **Caisse - Données**.
   Vous n'avez pas besoin de créer les onglets ou les colonnes : le script
   les crée automatiquement au premier lancement.

2. Dans cette feuille, ouvrez **Extensions → Apps Script**.

3. Supprimez le contenu du fichier `Code.gs` proposé par défaut, puis
   collez-y le contenu du fichier [`apps-script/Code.gs`](apps-script/Code.gs)
   de ce dossier.

4. Enregistrez (icône disquette ou `Ctrl+S`).

5. Cliquez sur **Déployer → Nouveau déploiement**.
   - Cliquez sur l'icône en forme d'engrenage à côté de « Sélectionner le
     type » et choisissez **Application web**.
   - **Exécuter en tant que** : *Moi (votre adresse email)*.
   - **Qui a accès** : *Tout le monde*.
   - Cliquez sur **Déployer**.

6. Google va demander d'autoriser le script à accéder à votre feuille de
   calcul : suivez les étapes (cela peut afficher un écran « Application non
   vérifiée » — c'est normal pour un script personnel, cliquez sur
   *Paramètres avancés* puis *Accéder à [nom du projet] (non sécurisé)*).

7. Une fois déployé, copiez l'**URL de l'application web** affichée
   (elle ressemble à `https://script.google.com/macros/s/AKfycb.../exec`).
   C'est l'URL de votre API.

> ⚠️ Si vous modifiez le script plus tard, il faut créer un **nouveau
> déploiement** (ou gérer les déploiements → modifier la version) pour que
> les changements soient pris en compte par l'application web.

## 3. Connecter l'application à la Google Sheet

1. Ouvrez `index.html` (localement, ou depuis GitHub Pages une fois publié).
2. Cliquez sur **☰ Menu** en haut à droite, puis sur **Configuration**.
3. Collez l'URL de l'application web copiée à l'étape précédente.
4. Cliquez sur **Enregistrer**.

Le bandeau « Mode démo » disparaît : les adhérents et cotisations que vous
créez sont désormais écrits directement dans votre Google Sheet.

L'URL est stockée dans le navigateur (`localStorage`), sur l'appareil
utilisé — à refaire une fois par appareil/navigateur.

## 4. Publier sur GitHub Pages

1. Créez un nouveau dépôt GitHub (par exemple `caisse`) et poussez-y
   l'ensemble de ce dossier (`index.html`, `css/`, `js/`, `apps-script/`,
   `README.md`).

   ```bash
   git init
   git add .
   git commit -m "Application caisse - gestion des adhérents"
   git branch -M main
   git remote add origin https://github.com/<votre-compte>/caisse.git
   git push -u origin main
   ```

2. Sur GitHub, allez dans **Settings → Pages**.
3. Dans **Source**, sélectionnez la branche `main` et le dossier `/ (root)`.
4. Enregistrez. Après quelques instants, votre application est disponible à
   une adresse du type `https://<votre-compte>.github.io/caisse/`.

Chaque personne qui ouvre cette adresse devra configurer une fois l'URL de
l'application web (étape 3) — ou vous pouvez, si vous préférez que ce soit
automatique pour tout le monde, coller l'URL directement en dur dans
`js/api.js` (variable `STORAGE_KEY`/`getApiUrl`) avant de publier. Attention
dans ce cas : l'URL du script sera visible publiquement dans le code source.

## Structure des données

**Onglet `Adherents`**

| Colonne | Description |
|---|---|
| ID | identifiant unique (généré automatiquement) |
| Nom | nom de famille |
| Prenom | prénom |
| Telephone | téléphone (optionnel) |
| Email | email (optionnel) |
| DateAdhesion | date d'adhésion (optionnel) |
| Civilite | civilité : `M.`, `Mme` ou `Mlle` |
| Archive | `1` si l'adhérent a été archivé depuis l'appli, vide sinon |

> Les colonnes `Civilite` et `Archive` sont ajoutées en dernière position
> (après `DateAdhesion`) pour rester compatibles avec une Google Sheet déjà en
> place : si vous aviez déjà des adhérents, les en-têtes manquants sont
> ajoutés automatiquement en fin de ligne 1 au prochain chargement, sans
> toucher aux données existantes.

**Onglet `Cotisations`**

| Colonne | Description |
|---|---|
| ID | identifiant unique (généré automatiquement) |
| AdherentID | référence vers l'adhérent |
| Montant | montant versé |
| Date | date du versement |
| Statut | situation de l'adhérent à cette date : Travail, Sans travail, Malade, Retraite, Conges, Etudiant |

Le tableau de bord additionne automatiquement les montants et les regroupe
par année (à partir de la date de chaque cotisation).

**Onglet `Deces`** (déclarations de décès)

| Colonne | Description |
|---|---|
| ID | identifiant unique |
| Nom, Prenom | de la personne décédée |
| CoutFuneraire | coût total de préparation des funérailles |
| Date | date du décès (ou de la déclaration) |
| PieceJointeUrl / PieceJointeNom | lien Drive et nom du justificatif joint (optionnel) |

**Onglet `Depenses`** (déclarations de dépenses diverses)

| Colonne | Description |
|---|---|
| ID | identifiant unique |
| Date | date de la dépense |
| Nature | description de la dépense |
| Montant | montant de la dépense |
| PieceJointeUrl / PieceJointeNom | lien Drive et nom du justificatif joint (optionnel) |

**Onglet `Documents`** (bibliothèque de documents de l'association)

| Colonne | Description |
|---|---|
| ID | identifiant unique |
| Nom | titre du document |
| Description | précisions (optionnel) |
| Date | date du document (optionnel) |
| PieceJointeUrl / PieceJointeNom | lien Drive et nom du fichier joint (optionnel) |

La page **Documents** affiche aussi, dans un second tableau en lecture seule,
toutes les pièces jointes déjà attachées à des décès ou des dépenses — pas
besoin de les rajouter manuellement ici.

**Onglet `Archives`** (lecture seule)

Contrairement aux autres onglets, celui-ci n'a **pas de colonnes fixes** : la
première ligne de l'onglet définit les titres de colonnes que vous voulez
(en général 5 ou 6, par exemple `Référence`, `Nom`, `Prénom`, `Catégorie`,
`Année`). L'application les lit automatiquement et affiche vos données telles
quelles, avec une recherche globale et un filtre déroulant par colonne (les
colonnes ayant trop de valeurs différentes n'ont pas de filtre, pour rester
lisibles).

- Si l'onglet `Archives` n'existe pas encore, il est créé automatiquement
  (avec des en-têtes de remplacement `Colonne 1`, `Colonne 2`…) dès le premier
  chargement de l'application — remplacez ensuite ces en-têtes par les vôtres
  directement dans Google Sheets.
- Tout se gère dans Google Sheets : ajout, modification ou suppression de
  lignes ou de colonnes. L'application se contente d'afficher le contenu à
  jour à chaque rechargement de la page Archives.

### État PDF d'un adhérent

Le bouton **« 📄 État PDF »** de la fiche adhérent utilise la bibliothèque
[jsPDF](https://github.com/parallax/jsPDF), chargée depuis un CDN
(`cdnjs.cloudflare.com`) directement dans `index.html`. Le PDF (civilité, nom,
prénom, téléphone, email, date d'adhésion, total cotisé et historique complet
des cotisations) est généré entièrement dans le navigateur — aucune donnée
n'est envoyée à un serveur externe. Une connexion internet est nécessaire
pour charger cette bibliothèque la première fois ; si elle ne peut pas se
charger, un message d'erreur s'affiche au lieu de planter la page.

### Pièces jointes (décès / dépenses / documents)

Quand une pièce jointe est ajoutée depuis l'appli, le script la dépose dans un
dossier Google Drive nommé **« Caisse - Pieces jointes »**, créé automatiquement
à côté de votre Google Sheet, puis enregistre le lien du fichier dans la feuille.

- Si vous avez déjà déployé le script avant d'ajouter cette fonctionnalité,
  créez un **nouveau déploiement** (voir l'avertissement à l'étape 2) pour que
  les nouvelles actions (`createDeces`, `createDepense`, `createDocument`, etc.)
  soient prises en compte.
- La première utilisation d'une pièce jointe peut redemander une autorisation
  Google, car le script a désormais aussi besoin d'accéder à Google Drive.
- Gardez les fichiers joints raisonnables (quelques Mo) : ils transitent en
  base64 dans la requête, ce qui est plus lent pour de très gros fichiers.

## Structure du dossier

```
index.html            page principale
css/style.css          mise en forme
js/api.js               accès aux données (Google Sheets ou mode démo)
js/app.js                logique de l'interface
apps-script/Code.gs       script à coller dans Google Apps Script
README.md                 ce fichier
```
