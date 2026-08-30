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
  ce qui permet de tester l'interface tout de suite — y compris la connexion,
  les comptes et les notifications (voir plus bas).
- **Comptes et connexion** : l'accès à l'application nécessite désormais de se
  connecter avec un nom d'utilisateur et un mot de passe. Trois rôles
  existent : **Administrateur** (accès complet en lecture et écriture),
  **Consultation** (lecture seule, éventuellement restreinte aux adhérents qui
  lui sont affectés) et **Collecteur** (peut ajouter des cotisations pour ses
  adhérents affectés, mises en attente de validation par un Administrateur).
  Voir « Comptes utilisateurs, rôles et connexion » ci-dessous.

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
- **Utilisateurs** (réservé aux Administrateurs) — créer des comptes, changer
  leur rôle, réinitialiser un mot de passe oublié, supprimer un compte. Voir
  « Comptes utilisateurs, rôles et connexion » ci-dessous.
- **Cotisations à valider** (réservé aux Administrateurs) — valide les
  cotisations saisies par un compte Collecteur avant qu'elles ne comptent
  dans les totaux. Voir « Le rôle Collecteur et la validation des
  cotisations » ci-dessous.
- **Configuration** — pour renseigner l'URL de votre Google Apps Script, le
  dossier Google Drive des pièces jointes et la durée des notifications (voir
  ci-dessous), et pour changer son propre mot de passe.

En haut à droite, une icône **🔔 Notifications** signale les nouveaux
adhérents et les nouvelles déclarations de décès ou de dépenses (voir
« Notifications » ci-dessous), un bouton **☀️/🌙** permet de basculer entre
thème clair et thème sombre à tout moment (voir « Thème sombre » ci-dessous),
et l'appli peut être **installée sur téléphone** comme une application (voir
« Installer l'application sur un téléphone »).

## 1. Tester tout de suite (mode démo)

Ouvrez simplement `index.html` dans votre navigateur (double-clic). L'appli
demande de se connecter : quatre comptes de démonstration sont prêts à
l'emploi (aucun ne persiste rien, tout revient à l'état initial en rechargeant
la page depuis zéro) :

| Nom d'utilisateur | Mot de passe | Rôle | Particularité |
|---|---|---|---|
| `admin` | `admin123` | Administrateur | accès complet |
| `consultation` | `consultation123` | Consultation | lecture seule, voit tout |
| `restreint` | `restreint123` | Consultation | lecture seule, ne voit que l'adhérent qui lui est affecté |
| `mfall` | `collecteur123` | Collecteur | ajoute des cotisations (en attente de validation) pour son seul adhérent affecté |

L'appli se lance avec quelques adhérents d'exemple. Rien n'est sauvegardé tant
que vous n'avez pas configuré la Google Sheet (étape 2) — une fois connecté à
une vraie Google Sheet, ces comptes de démonstration disparaissent et seul le
compte **administrateur créé automatiquement** (voir plus bas) existe.

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

Un écran de connexion apparaît alors, car un vrai compte est nécessaire pour
accéder à des données réelles. Au tout premier chargement, l'application crée
automatiquement un compte Administrateur avec les identifiants suivants :

- **Nom d'utilisateur** : `admin`
- **Mot de passe temporaire** : `ChangezMoi123!`

> ⚠️ **Connectez-vous immédiatement avec ce compte et changez ce mot de passe**
> (l'appli vous y invite d'ailleurs automatiquement à la première connexion,
> avant de laisser accéder au reste de l'application) — depuis
> **☰ Menu → Configuration**, section « Changer mon mot de passe ». Tant que ce
> mot de passe n'a pas été changé, n'importe qui connaissant cette valeur par
> défaut pourrait accéder à toute votre Google Sheet.

Une fois connecté en tant qu'Administrateur, vous pouvez créer les comptes des
autres personnes qui doivent utiliser l'application (voir « Comptes
utilisateurs, rôles et connexion » ci-dessous).

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
En revanche, chaque personne aura toujours besoin de son **propre compte**
(nom d'utilisateur + mot de passe) pour se connecter — l'URL configurée ne
donne accès à rien tant qu'on n'est pas authentifié.

## 5. Comptes utilisateurs, rôles et connexion

L'accès à toute l'application (y compris en mode démo) nécessite de se
connecter. La vérification du mot de passe se fait **côté serveur**, dans le
script Apps Script : ce n'est pas une simple protection d'écran, un compte
Consultation ne peut pas non plus écrire de données même en appelant l'API
directement en contournant l'interface.

### Créer un compte, changer un rôle

Réservé aux Administrateurs, depuis **☰ Menu → Utilisateurs → Nouvel
utilisateur** :

1. Choisissez d'abord le **type de compte** : **local** (vous choisissez
   vous-même le nom d'utilisateur) ou **lié à un adhérent** (vous choisissez
   l'adhérent dans une liste déroulante ; l'identifiant de connexion est alors
   généré automatiquement — 1ère lettre du prénom + nom, ex. *Amadou Diop* →
   `adiop` — et un suffixe numérique est ajouté en cas de doublon ; le nom
   complet se pré-remplit aussi depuis l'adhérent choisi). Ce choix ne se
   change plus une fois le compte créé.
2. Renseignez un nom complet (sauf s'il a déjà été pré-rempli), un mot de
   passe initial et le rôle : **Administrateur** (accès complet), **Consultation**
   (lecture seule) ou **Collecteur** (peut ajouter des cotisations, voir
   ci-dessous).
3. Pour un compte Consultation, une case **« Restreindre aux adhérents
   affectés »** est disponible : voir « Adhérent affecté à un utilisateur »
   ci-dessous. Elle est **réglable individuellement pour chaque compte** — vous
   pouvez avoir des comptes Consultation qui voient tout, et d'autres qui ne
   voient que leurs adhérents affectés. Un compte **Collecteur** est, lui,
   **toujours** restreint à ses adhérents affectés (pas de case à cocher :
   c'est le fonctionnement normal de ce rôle).
4. Le rôle et la restriction peuvent être modifiés à tout moment depuis le
   bouton **Modifier** de la liste des utilisateurs (le type de compte et
   l'identifiant, eux, ne changent plus après création).

Le dernier compte Administrateur restant ne peut pas être supprimé (ni voir
son rôle rétrogradé de façon à ne plus laisser aucun Administrateur), pour
éviter de se retrouver bloqué hors de l'application.

### Le rôle Collecteur et la validation des cotisations

Un compte **Collecteur** est pensé pour une personne qui collecte les
cotisations sur le terrain (souvent un adhérent lui-même, d'où l'intérêt du
compte « lié à un adhérent ») sans avoir le plein accès d'un Administrateur :

- Il ne voit et ne peut ajouter une cotisation que pour les adhérents qui lui
  ont été **affectés** (voir « Adhérent affecté à un utilisateur » ci-dessous)
  — jamais pour un autre, même en forçant un appel à l'API directement : la
  vérification est faite côté serveur.
- Toute cotisation qu'il ajoute est enregistrée **« en attente de
  validation »** : elle apparaît avec une étiquette « En attente » sur la
  fiche de l'adhérent, mais **ne compte dans aucun total** (tableau de bord,
  bilan financier, état PDF, rapports) tant qu'elle n'a pas été validée.
- Il ne peut ni modifier ni supprimer une cotisation, même la sienne : seul
  un Administrateur le peut.
- Comme un compte Consultation restreint, il ne voit pas les sections
  Déclarations, Rapports, Documents, Archives ni Utilisateurs.

Un Administrateur valide les cotisations en attente depuis **☰ Menu →
Cotisations à valider** : la liste indique l'adhérent, le montant, qui l'a
soumise et quand. Le bouton **Valider** la fait alors compter dans les totaux.
Il n'y a volontairement pas de bouton « Rejeter » : pour refuser une saisie
erronée, supprimez-la simplement depuis la fiche de l'adhérent concerné,
comme n'importe quelle autre cotisation.

### Réinitialiser un mot de passe oublié

Toujours depuis **☰ Menu → Utilisateurs**, bouton **Réinitialiser** sur la
ligne du compte concerné. L'application ne peut pas envoyer d'email (aucun
serveur de messagerie n'est configuré) : un **mot de passe temporaire** est
généré et **affiché à l'écran** à l'Administrateur, à communiquer ensuite
manuellement (téléphone, message…) à la personne concernée. Comme pour le
compte `admin` créé automatiquement, la personne devra changer ce mot de
passe temporaire dès sa prochaine connexion — l'application le lui impose
avant de la laisser continuer.

### Changer son propre mot de passe

Depuis **☰ Menu → Configuration**, section « Changer mon mot de passe » —
disponible pour tous les comptes, Administrateur comme Consultation.

### Adhérent affecté à un utilisateur

Sur la fiche d'un adhérent (bouton **Modifier → Infos personnelles**), un
Administrateur peut choisir un **« Utilisateur affecté »** dans une liste
déroulante des comptes Consultation et Collecteur (un même compte peut se
voir affecter plusieurs adhérents, en le choisissant sur chacune de leurs
fiches). Pour un compte **restreint** — Consultation avec la case cochée, ou
Collecteur (toujours) :

- la liste des adhérents ne montre que les adhérents qui lui ont été
  affectés (et son tableau de bord/cotisations ne porte que sur ceux-ci) ;
- les sections **Déclarations**, **Rapports**, **Documents** et **Archives**
  du menu sont entièrement masquées, car ces données ne sont pas rattachées à
  un adhérent en particulier et concerneraient donc l'ensemble de
  l'association plutôt que ses seuls adhérents affectés.

Un compte Consultation **non restreint** garde, lui, une vue en lecture seule
sur l'ensemble des données (tous les adhérents, toutes les déclarations,
etc.).

## 6. Notifications

L'icône **🔔** à côté du menu signale l'ajout récent d'un nouvel adhérent,
d'une déclaration de décès ou d'une déclaration de dépense (ces deux
dernières n'apparaissent pas pour un compte restreint — Consultation
restreinte ou Collecteur, voir ci-dessus). Pour un Administrateur uniquement,
elle signale aussi une **cotisation en attente de validation** saisie par un
compte Collecteur ; cliquer dessus amène directement à la page « Cotisations
à valider ». Un badge affiche le nombre de notifications non lues ; ouvrir le
menu déroulant marque tout comme lu. Cliquer sur une notification amène
directement à l'adhérent (ou à la page Déclarations) concerné.

Un élément reste « récent » — donc visible dans les notifications — pendant
un nombre de jours réglable depuis **☰ Menu → Configuration → Durée des
notifications (jours)**, réservé aux Administrateurs. Par défaut : 3 jours.
Une valeur inférieure à 1 revient automatiquement à la valeur par défaut (3).

## 7. Dossier Google Drive pour les pièces jointes

Par défaut, les pièces jointes (décès, dépenses, documents, et désormais
aussi les fiches adhérents) sont déposées dans un dossier créé automatiquement
à côté de votre Google Sheet, nommé **« Caisse - Pieces jointes »**. Vous
pouvez à la place choisir votre propre dossier Google Drive, avec des
sous-dossiers organisés par catégorie :

1. Créez (ou choisissez) un dossier dans votre Google Drive, et copiez son
   lien de partage (bouton **Partager → Copier le lien**, ou l'URL affichée
   dans la barre d'adresse quand le dossier est ouvert).
2. Depuis **☰ Menu → Configuration → Dossier Google Drive**, réservé aux
   Administrateurs, collez ce lien puis **Enregistrer**.
3. Au dépôt de la prochaine pièce jointe, l'application crée automatiquement,
   **à l'intérieur** de ce dossier, les sous-dossiers **Adherents**,
   **Deces**, **Depenses** et **Documents**, et y range chaque fichier selon
   sa catégorie.

Si le lien collé n'est pas valide ou n'est pas accessible par le script (par
exemple un dossier appartenant à quelqu'un d'autre sans droit de modification
accordé), l'application revient silencieusement au dossier
« Caisse - Pieces jointes » créé automatiquement, pour ne jamais bloquer un
dépôt de pièce jointe.

> ℹ️ Aucune nouvelle autorisation Google Drive n'est nécessaire pour cette
> fonctionnalité si vous aviez déjà autorisé l'accès à Drive lors d'une
> version précédente de l'application (les pièces jointes existaient déjà
> pour les décès et dépenses). Si c'est la toute première fois que le script
> accède à Drive, l'autorisation sera demandée à la prochaine pièce jointe.

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
| DateCreation | date d'ajout dans l'appli (sert notamment aux notifications) |
| UtilisateurAffecteID | référence vers le compte Consultation auquel cet adhérent est affecté (optionnel) |
| PieceJointeUrl / PieceJointeNom | lien Drive et nom du fichier joint à la fiche adhérent (optionnel) |

> Les colonnes `Civilite`, `Archive`, `DateCreation`, `UtilisateurAffecteID`,
> `PieceJointeUrl` et `PieceJointeNom` sont ajoutées automatiquement en fin de
> ligne 1 pour rester compatibles avec une Google Sheet déjà en place : si
> vous aviez déjà des adhérents, les en-têtes manquants sont ajoutés au
> prochain chargement, sans toucher aux données existantes.

**Onglet `Cotisations`**

| Colonne | Description |
|---|---|
| ID | identifiant unique (généré automatiquement) |
| AdherentID | référence vers l'adhérent |
| Montant | montant versé |
| Date | date du versement |
| Statut | situation de l'adhérent à cette date : Travail, Sans travail, Malade, Retraite, Conges, Etudiant |
| StatutValidation | `Valide` (ou vide) ou `EnAttente` — voir « Le rôle Collecteur et la validation des cotisations » |
| CreeParUtilisateurID | référence vers le compte qui a saisi la cotisation |
| DateCreation | date de saisie dans l'appli (sert aux notifications) |

Le tableau de bord (et tous les totaux/rapports) n'additionne que les
cotisations **validées** — une cotisation `EnAttente` n'y figure pas tant
qu'un Administrateur ne l'a pas validée depuis « Cotisations à valider ».

**Onglet `Deces`** (déclarations de décès)

| Colonne | Description |
|---|---|
| ID | identifiant unique |
| Nom, Prenom | de la personne décédée |
| CoutFuneraire | coût total de préparation des funérailles |
| Date | date du décès (ou de la déclaration) |
| PieceJointeUrl / PieceJointeNom | lien Drive et nom du justificatif joint (optionnel) |
| DateCreation | date d'ajout dans l'appli (sert aux notifications) |

**Onglet `Depenses`** (déclarations de dépenses diverses)

| Colonne | Description |
|---|---|
| ID | identifiant unique |
| Date | date de la dépense |
| Nature | description de la dépense |
| Montant | montant de la dépense |
| PieceJointeUrl / PieceJointeNom | lien Drive et nom du justificatif joint (optionnel) |
| DateCreation | date d'ajout dans l'appli (sert aux notifications) |

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

**Onglets `Utilisateurs`, `Sessions` et `Config`** (gérés automatiquement)

Ces trois onglets sont créés et entretenus automatiquement par
l'application pour la connexion, les rôles et la configuration — ils ne sont
pas destinés à être modifiés à la main dans Google Sheets :

- `Utilisateurs` : un compte par ligne (nom d'utilisateur, nom complet, mot de
  passe **haché** — jamais en clair, rôle, restriction éventuelle aux
  adhérents affectés, et l'adhérent auquel le compte est lié le cas échéant).
  Se gère depuis **☰ Menu → Utilisateurs**.
- `Sessions` : les connexions actives (jetons de session, valables 30 jours).
  Se vide automatiquement des sessions expirées.
- `Config` : réglages globaux (dossier Google Drive des pièces jointes, durée
  des notifications). Se gère depuis **☰ Menu → Configuration**.

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

### Thème sombre

Le bouton **☀️/🌙** en haut à droite bascule instantanément entre thème clair
et thème sombre. Le choix est mémorisé sur l'appareil (`localStorage`) et
réappliqué à chaque ouverture ; si vous n'avez jamais touché au bouton,
l'appli suit automatiquement le thème (clair ou sombre) déjà choisi dans les
réglages de votre téléphone ou navigateur. L'impression (page Rapports) reste
toujours en clair, quel que soit le thème affiché à l'écran, pour rester
lisible sur papier.

### Installer l'application sur un téléphone

Une fois l'appli publiée sur GitHub Pages (ou tout autre hébergement HTTPS),
elle peut être installée comme une application, avec sa propre icône sur
l'écran d'accueil, et s'ouvre alors en plein écran (sans la barre d'adresse
du navigateur) :

- **Android (Chrome)** : ouvrez le lien de l'appli, appuyez sur le menu ⋮ en
  haut à droite, puis **« Installer l'application »** (ou **« Ajouter à
  l'écran d'accueil »**).
- **iPhone / iPad (Safari)** : ouvrez le lien de l'appli, appuyez sur le
  bouton de partage (le carré avec une flèche vers le haut), puis
  **« Sur l'écran d'accueil »**.

Une fois installée, l'appli se lance instantanément et l'écran d'accueil
récent (mise en cache locale) reste consultable même sans connexion — mais
une connexion internet reste nécessaire pour charger ou enregistrer des
données dans la Google Sheet : seule l'« coquille » de l'application
(l'interface elle-même) fonctionne hors-ligne, pas les données.

> ℹ️ Si vous mettez à jour les fichiers de l'application (nouvelle version
> déployée sur GitHub Pages), les appareils qui l'ont déjà installée
> récupèrent automatiquement la nouvelle version au prochain lancement avec
> connexion (le service worker vérifie toujours le réseau en priorité) — un
> simple rechargement de la page suffit aussi si l'appli est ouverte dans un
> onglet de navigateur classique.

### Pièces jointes (adhérents / décès / dépenses / documents)

Quand une pièce jointe est ajoutée depuis l'appli, le script la dépose dans
Google Drive (par défaut dans un dossier créé automatiquement, ou dans le
dossier de votre choix — voir « Dossier Google Drive pour les pièces jointes »
ci-dessus), puis enregistre le lien du fichier dans la feuille correspondante.

- Si vous avez déjà déployé le script avant d'ajouter cette fonctionnalité,
  créez un **nouveau déploiement** (voir l'avertissement à l'étape 2) pour que
  les actions concernées (`createAdherent`, `createDeces`, `createDepense`,
  `createDocument`, etc.) soient prises en compte.
- La première utilisation d'une pièce jointe peut redemander une autorisation
  Google, car le script a besoin d'accéder à Google Drive.
- Gardez les fichiers joints raisonnables (quelques Mo) : ils transitent en
  base64 dans la requête, ce qui est plus lent pour de très gros fichiers.

## Structure du dossier

```
index.html            page principale
manifest.json           déclaration PWA (installation sur téléphone)
sw.js                    service worker (installation + coquille hors-ligne)
icons/                   icônes de l'application (PWA / écran d'accueil)
css/style.css          mise en forme (thèmes clair et sombre)
js/api.js               accès aux données (Google Sheets ou mode démo)
js/app.js                logique de l'interface
apps-script/Code.gs       script à coller dans Google Apps Script
README.md                 ce fichier
```
