/**
 * Caisse - API Google Apps Script
 * ---------------------------------
 * Sert de backend (base de données) pour l'application web "Caisse".
 * A coller dans l'éditeur Apps Script d'une Google Sheet, puis à déployer
 * en tant qu'application web (voir README.md pour les instructions).
 *
 * Structure des feuilles (créées automatiquement si absentes) :
 *
 * Adherents
 *   ID | Nom | Prenom | Telephone | Email | DateAdhesion | Civilite | Archive
 *   | DateCreation | UtilisateurAffecteID | PieceJointeUrl | PieceJointeNom
 *   (Archive : '1' si l'adhérent a été archivé depuis l'appli, vide sinon —
 *   un adhérent archivé disparaît de la liste active mais ses cotisations
 *   restent comptabilisées dans les totaux. DateCreation est posée une seule
 *   fois par le serveur à la création, jamais modifiable depuis l'appli :
 *   elle sert à déterminer les notifications "nouvel adhérent". Utilisateur
 *   AffecteID référence Utilisateurs.ID : l'adhérent affecté à ce compte.)
 *
 * Cotisations
 *   ID | AdherentID | Montant | Date | Statut | StatutValidation
 *   | CreeParUtilisateurID | DateCreation
 *   (StatutValidation : 'Valide' — ou vide, pour compatibilité avec les
 *   lignes existantes avant cette fonctionnalité — ou 'EnAttente'. Une
 *   cotisation saisie par un compte "Collecteur" est créée 'EnAttente' et
 *   n'est comptée dans aucun total/rapport tant qu'un Administrateur ne l'a
 *   pas validée depuis la page Validation. Une cotisation saisie par un
 *   Administrateur est directement 'Valide'. CreeParUtilisateurID référence
 *   Utilisateurs.ID : qui a saisi la cotisation.)
 *
 * Deces
 *   ID | Nom | Prenom | CoutFuneraire | Date | PieceJointeUrl | PieceJointeNom
 *   | DateCreation
 *
 * Depenses
 *   ID | Date | Nature | Montant | PieceJointeUrl | PieceJointeNom | DateCreation
 *
 * Documents
 *   ID | Nom | Description | Date | PieceJointeUrl | PieceJointeNom
 *
 * Archives (lecture seule — gérée directement dans Google Sheets)
 *   Colonnes libres, définies par la ligne 1 de l'onglet "Archives" (5 ou 6
 *   colonnes en général). L'application affiche ces colonnes et ces lignes
 *   telles quelles, sans possibilité d'ajout/modification/suppression depuis
 *   l'appli. Si l'onglet n'existe pas encore, il est créé automatiquement
 *   avec des en-têtes de remplacement à personnaliser dans Google Sheets.
 *
 * Utilisateurs
 *   ID | NomUtilisateur | NomComplet | MotDePasseHash | Sel | Role
 *   | RestreintAAdherents | DoitChangerMotDePasse | DerniereNotifVue
 *   | DateCreation | AdherentLieID
 *   (Role : "Administrateur" (lecture/écriture complète), "Consultation"
 *   (lecture seule) ou "Collecteur" (peut saisir des cotisations, mises en
 *   attente de validation par un Administrateur — voir Cotisations
 *   ci-dessus ; toujours restreint à ses adhérents affectés, sans bascule).
 *   RestreintAAdherents : '1' si ce compte Consultation ne doit voir que les
 *   adhérents qui lui sont affectés (n'a pas d'effet sur un compte
 *   Collecteur, déjà toujours restreint). MotDePasseHash/Sel : jamais de mot
 *   de passe en clair, hachage SHA-256 salé. DerniereNotifVue et
 *   DateCreation sont des horodatages internes en millisecondes (nombre) —
 *   ne pas modifier ces colonnes à la main dans la feuille. AdherentLieID
 *   (optionnel) référence Adherents.ID : quand un compte est créé "lié à un
 *   adhérent" plutôt que "local", son identifiant de connexion est généré
 *   automatiquement (1ère lettre du prénom + nom de cet adhérent) et cette
 *   colonne garde la trace du lien. Un compte Administrateur "admin" est créé
 *   automatiquement au tout premier chargement si cette feuille est vide —
 *   voir README.md pour le mot de passe par défaut à changer immédiatement.)
 *
 * Sessions (technique, ne pas modifier à la main)
 *   Token | UtilisateurID | Expiration | DateCreation
 *
 * Config (réglages généraux, une ligne par clé)
 *   Cle | Valeur
 *   Clés utilisées : DossierDriveUrl, DureeNotificationsJours
 *
 * Statuts possibles (Cotisations) : "Sans travail", "Travail", "Malade", "Retraite", "Conges", "Etudiant"
 *
 * Les pièces jointes (Adherents / Deces / Depenses / Documents) sont envoyées
 * par le frontend en base64 et enregistrées dans un dossier Google Drive,
 * dans un sous-dossier par catégorie (Adherents / Deces / Depenses /
 * Documents). Par défaut ce dossier est créé automatiquement à côté de la
 * feuille de calcul ("Caisse - Pieces jointes") ; un administrateur peut le
 * remplacer par le lien d'un dossier Drive existant depuis la page
 * Configuration. Seule l'URL du fichier est stockée dans la feuille.
 *
 * SÉCURITÉ : toute action d'écriture (créer/modifier/supprimer/archiver un
 * adhérent, une cotisation, un décès, une dépense, un document, gérer les
 * utilisateurs, changer la configuration) exige un jeton de session valide
 * appartenant à un compte de rôle "Administrateur" — vérifié ici, côté
 * serveur, pas seulement caché côté interface. Un compte "Consultation" ne
 * peut donc jamais écrire, même en appelant l'API directement. Seule
 * exception : un compte "Collecteur" peut créer une cotisation (jamais la
 * modifier ni la supprimer), et uniquement pour un adhérent qui lui est
 * affecté — vérifié également côté serveur, dans createCotisation_.
 */

var SHEET_ADHERENTS = 'Adherents';
var SHEET_COTISATIONS = 'Cotisations';
var SHEET_DECES = 'Deces';
var SHEET_DEPENSES = 'Depenses';
var SHEET_DOCUMENTS = 'Documents';
var SHEET_ARCHIVES = 'Archives';
var SHEET_UTILISATEURS = 'Utilisateurs';
var SHEET_SESSIONS = 'Sessions';
var SHEET_CONFIG = 'Config';

var ADHERENTS_HEADERS = ['ID', 'Nom', 'Prenom', 'Telephone', 'Email', 'DateAdhesion', 'Civilite', 'Archive', 'DateCreation', 'UtilisateurAffecteID', 'PieceJointeUrl', 'PieceJointeNom'];
var COTISATIONS_HEADERS = ['ID', 'AdherentID', 'Montant', 'Date', 'Statut', 'StatutValidation', 'CreeParUtilisateurID', 'DateCreation'];
var DECES_HEADERS = ['ID', 'Nom', 'Prenom', 'CoutFuneraire', 'Date', 'PieceJointeUrl', 'PieceJointeNom', 'DateCreation'];
var DEPENSES_HEADERS = ['ID', 'Date', 'Nature', 'Montant', 'PieceJointeUrl', 'PieceJointeNom', 'DateCreation'];
var DOCUMENTS_HEADERS = ['ID', 'Nom', 'Description', 'Date', 'PieceJointeUrl', 'PieceJointeNom'];
var ARCHIVES_PLACEHOLDER_HEADERS = ['Colonne 1', 'Colonne 2', 'Colonne 3', 'Colonne 4', 'Colonne 5'];
var UTILISATEURS_HEADERS = ['ID', 'NomUtilisateur', 'NomComplet', 'MotDePasseHash', 'Sel', 'Role', 'RestreintAAdherents', 'DoitChangerMotDePasse', 'DerniereNotifVue', 'DateCreation', 'AdherentLieID'];
var SESSIONS_HEADERS = ['Token', 'UtilisateurID', 'Expiration', 'DateCreation'];
var CONFIG_HEADERS = ['Cle', 'Valeur'];

var ROLE_ADMIN = 'Administrateur';
var ROLE_CONSULTATION = 'Consultation';
var ROLE_COLLECTEUR = 'Collecteur';
var STATUT_VALIDATION_VALIDE = 'Valide';
var STATUT_VALIDATION_EN_ATTENTE = 'EnAttente';
var SESSION_DUREE_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours
var DEFAULT_NOTIF_DUREE_JOURS = 3;
var DEFAULT_ADMIN_USERNAME = 'admin';
var DEFAULT_ADMIN_PASSWORD = 'ChangezMoi123!';

var PIECES_JOINTES_FOLDER = 'Caisse - Pieces jointes';

/* ---------------------------------------------------------------------- */
/* Utilitaires feuilles                                                   */
/* ---------------------------------------------------------------------- */

function getOrCreateSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  } else {
    // Migration douce : si de nouvelles colonnes ont été ajoutées à `headers`
    // depuis la création de cette feuille (ex: ajout du champ Civilite), on
    // complète juste les en-têtes manquants en fin de ligne 1, sans jamais
    // toucher aux colonnes/données existantes.
    var lastCol = sheet.getLastColumn();
    if (lastCol < headers.length) {
      sheet.getRange(1, lastCol + 1, 1, headers.length - lastCol).setValues([headers.slice(lastCol)]);
    }
  }
  return sheet;
}

function sheetToObjects_(sheet, headers) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    // Ignorer les lignes totalement vides
    if (row.join('') === '') continue;
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var val = row[j];
      if (val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
      obj[headers[j]] = val;
    }
    obj._row = i + 2; // ligne réelle dans la feuille (1-indexed + en-tête)
    out.push(obj);
  }
  return out;
}

function findRowById_(sheet, headers, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

/**
 * L'onglet Archives a une structure de colonnes libre (définie par l'utilisateur
 * directement dans Google Sheets), contrairement aux autres onglets. On crée un
 * onglet de remplacement s'il n'existe pas encore, mais on ne force jamais ses
 * en-têtes ensuite : ils sont relus dynamiquement à chaque appel.
 */
function getOrCreateArchivesSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_ARCHIVES);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_ARCHIVES);
    sheet.appendRow(ARCHIVES_PLACEHOLDER_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Lit dynamiquement les en-têtes (ligne 1) de l'onglet Archives : nombre de
 * colonnes variable, en-têtes définis librement dans Google Sheets. Les
 * cellules vides en fin de ligne sont ignorées.
 */
function getArchivesHeaders_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  var values = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var headers = [];
  for (var i = 0; i < values.length; i++) {
    var h = String(values[i] === null || values[i] === undefined ? '' : values[i]).trim();
    if (h !== '') headers.push(h);
  }
  return headers;
}

/* ---------------------------------------------------------------------- */
/* Config (clé/valeur)                                                    */
/* ---------------------------------------------------------------------- */

function getOrCreateConfigSheet_() {
  return getOrCreateSheet_(SHEET_CONFIG, CONFIG_HEADERS);
}

function getConfigValue_(key, defaultVal) {
  var sheet = getOrCreateConfigSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]) === key) return values[i][1];
    }
  }
  return defaultVal;
}

function setConfigValue_(key, val) {
  var sheet = getOrCreateConfigSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]) === key) {
        sheet.getRange(i + 2, 2).setValue(val);
        return;
      }
    }
  }
  sheet.appendRow([key, val]);
}

/* ---------------------------------------------------------------------- */
/* Authentification / utilisateurs                                        */
/* ---------------------------------------------------------------------- */

function hashPassword_(password, salt) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(password) + String(salt));
  var hex = '';
  for (var i = 0; i < digest.length; i++) {
    var v = digest[i];
    if (v < 0) v += 256;
    var h = v.toString(16);
    hex += h.length === 1 ? '0' + h : h;
  }
  return hex;
}

function generateSalt_() {
  return Utilities.getUuid();
}

function generateToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

function generateTempPassword_() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  var out = '';
  for (var i = 0; i < 10; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

function getUtilisateursSheet_() {
  return getOrCreateSheet_(SHEET_UTILISATEURS, UTILISATEURS_HEADERS);
}

/**
 * Identifiant de connexion généré à partir du nom d'un adhérent, pour un
 * compte créé "lié à un adhérent" plutôt que "local" : 1ère lettre du
 * prénom + nom, en minuscules, sans accents ni espaces (ex: "Amadou Diop"
 * → "adiop"). Un suffixe numérique est ajouté en cas de doublon avec un
 * identifiant déjà utilisé (adiop, adiop2, adiop3…).
 */
function slugifyForUsername_(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // enlève les accents
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function generateUsernameFromAdherent_(prenom, nom) {
  var base = (slugifyForUsername_(prenom).charAt(0) + slugifyForUsername_(nom)) || 'membre';
  var existing = getAllUsers_().map(function (u) { return String(u.NomUtilisateur).toLowerCase(); });
  if (existing.indexOf(base) === -1) return base;
  var i = 2;
  while (existing.indexOf(base + i) !== -1) i++;
  return base + i;
}

/**
 * Crée le tout premier compte Administrateur si la feuille Utilisateurs est
 * vide (tout premier chargement de l'appli). Voir README.md pour le mot de
 * passe par défaut — à changer immédiatement après la première connexion.
 */
function ensureDefaultAdmin_() {
  var sheet = getUtilisateursSheet_();
  if (sheet.getLastRow() < 2) {
    var salt = generateSalt_();
    var hash = hashPassword_(DEFAULT_ADMIN_PASSWORD, salt);
    sheet.appendRow([
      Utilities.getUuid(), DEFAULT_ADMIN_USERNAME, 'Administrateur', hash, salt,
      ROLE_ADMIN, '', '1', '', Date.now(), ''
    ]);
  }
}

function getAllUsers_() {
  return sheetToObjects_(getUtilisateursSheet_(), UTILISATEURS_HEADERS);
}

function userToPublic_(u) {
  return {
    id: u.ID,
    nomUtilisateur: u.NomUtilisateur,
    nomComplet: u.NomComplet,
    role: u.Role,
    restreintAAdherents: String(u.RestreintAAdherents || '') === '1',
    doitChangerMotDePasse: String(u.DoitChangerMotDePasse || '') === '1',
    dateCreation: u.DateCreation || '',
    adherentLieId: u.AdherentLieID || ''
  };
}

function login_(payload) {
  ensureDefaultAdmin_();
  var username = String(payload.nomUtilisateur || '').trim();
  var password = String(payload.motDePasse || '');
  if (!username || !password) throw new Error('Identifiants incomplets.');
  var users = getAllUsers_();
  var user = null;
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].NomUtilisateur).toLowerCase() === username.toLowerCase()) { user = users[i]; break; }
  }
  if (!user || hashPassword_(password, user.Sel) !== user.MotDePasseHash) {
    throw new Error('Nom d\'utilisateur ou mot de passe incorrect.');
  }
  var token = createSession_(user.ID);
  return { token: token, user: userToPublic_(user) };
}

function createSession_(userId) {
  var sheet = getOrCreateSheet_(SHEET_SESSIONS, SESSIONS_HEADERS);
  var token = generateToken_();
  sheet.appendRow([token, userId, Date.now() + SESSION_DUREE_MS, Date.now()]);
  return token;
}

function deleteSession_(token) {
  if (!token) return;
  var sheet = getOrCreateSheet_(SHEET_SESSIONS, SESSIONS_HEADERS);
  var row = findRowById_(sheet, SESSIONS_HEADERS, token);
  if (row !== -1) sheet.deleteRow(row);
}

function getSessionUser_(token) {
  if (!token) return null;
  var sheet = getOrCreateSheet_(SHEET_SESSIONS, SESSIONS_HEADERS);
  var sessions = sheetToObjects_(sheet, SESSIONS_HEADERS);
  var session = null;
  for (var i = 0; i < sessions.length; i++) {
    if (sessions[i].Token === token) { session = sessions[i]; break; }
  }
  if (!session) return null;
  if (Number(session.Expiration) < Date.now()) return null;
  var users = getAllUsers_();
  for (var j = 0; j < users.length; j++) {
    if (users[j].ID === session.UtilisateurID) return users[j];
  }
  return null;
}

function requireAuth_(payload) {
  var user = getSessionUser_(payload && payload.token);
  if (!user) {
    var err = new Error('Session invalide ou expirée. Veuillez vous reconnecter.');
    err.authRequired = true;
    throw err;
  }
  return user;
}

function requireAdmin_(payload) {
  var user = requireAuth_(payload);
  if (user.Role !== ROLE_ADMIN) {
    throw new Error('Action réservée aux administrateurs.');
  }
  return user;
}

/**
 * Un compte Administrateur peut créer une cotisation pour n'importe quel
 * adhérent. Un compte Collecteur le peut aussi, mais uniquement (vérifié
 * dans createCotisation_) pour un adhérent qui lui est affecté — jamais un
 * autre, même en appelant l'API directement.
 */
function requireCotisationWriter_(payload) {
  var user = requireAuth_(payload);
  if (user.Role !== ROLE_ADMIN && user.Role !== ROLE_COLLECTEUR) {
    throw new Error('Action réservée aux administrateurs et aux collecteurs.');
  }
  return user;
}

function changePassword_(payload) {
  var user = requireAuth_(payload);
  var nouveau = String(payload.nouveauMotDePasse || '');
  if (!nouveau || nouveau.length < 6) throw new Error('Le nouveau mot de passe doit contenir au moins 6 caractères.');
  if (hashPassword_(String(payload.ancienMotDePasse || ''), user.Sel) !== user.MotDePasseHash) {
    throw new Error('Ancien mot de passe incorrect.');
  }
  var sheet = getUtilisateursSheet_();
  var row = findRowById_(sheet, UTILISATEURS_HEADERS, user.ID);
  if (row === -1) throw new Error('Utilisateur introuvable.');
  var newSalt = generateSalt_();
  sheet.getRange(row, UTILISATEURS_HEADERS.indexOf('MotDePasseHash') + 1).setValue(hashPassword_(nouveau, newSalt));
  sheet.getRange(row, UTILISATEURS_HEADERS.indexOf('Sel') + 1).setValue(newSalt);
  sheet.getRange(row, UTILISATEURS_HEADERS.indexOf('DoitChangerMotDePasse') + 1).setValue('');
  return { ok: true };
}

function roleFromPayload_(role) {
  if (role === ROLE_ADMIN) return ROLE_ADMIN;
  if (role === ROLE_COLLECTEUR) return ROLE_COLLECTEUR;
  return ROLE_CONSULTATION;
}

function createUtilisateur_(payload) {
  requireAdmin_(payload);
  var password = String(payload.motDePasse || '');
  if (!password || password.length < 6) throw new Error('Le mot de passe doit contenir au moins 6 caractères.');

  var adherentLieId = '';
  var nomComplet = String(payload.nomComplet || '').trim();
  var username;
  if (payload.typeCompte === 'adherent') {
    if (!payload.adherentLieId) throw new Error('Choisissez l\'adhérent auquel lier ce compte.');
    var aSheet = getOrCreateSheet_(SHEET_ADHERENTS, ADHERENTS_HEADERS);
    var aRow = findRowById_(aSheet, ADHERENTS_HEADERS, payload.adherentLieId);
    if (aRow === -1) throw new Error('Adhérent introuvable.');
    var aValues = aSheet.getRange(aRow, 1, 1, ADHERENTS_HEADERS.length).getValues()[0];
    var aNom = aValues[ADHERENTS_HEADERS.indexOf('Nom')];
    var aPrenom = aValues[ADHERENTS_HEADERS.indexOf('Prenom')];
    adherentLieId = payload.adherentLieId;
    username = generateUsernameFromAdherent_(aPrenom, aNom);
    if (!nomComplet) nomComplet = (String(aPrenom || '') + ' ' + String(aNom || '')).trim();
  } else {
    username = String(payload.nomUtilisateur || '').trim();
    if (!username) throw new Error('Nom d\'utilisateur requis.');
    var users = getAllUsers_();
    for (var i = 0; i < users.length; i++) {
      if (String(users[i].NomUtilisateur).toLowerCase() === username.toLowerCase()) {
        throw new Error('Ce nom d\'utilisateur existe déjà.');
      }
    }
  }

  var role = roleFromPayload_(payload.role);
  var salt = generateSalt_();
  var id = Utilities.getUuid();
  getUtilisateursSheet_().appendRow([
    id, username, nomComplet, hashPassword_(password, salt), salt,
    role, payload.restreintAAdherents ? '1' : '', '', '', Date.now(), adherentLieId
  ]);
  return { id: id, nomUtilisateur: username };
}

function updateUtilisateur_(payload) {
  requireAdmin_(payload);
  var sheet = getUtilisateursSheet_();
  var row = findRowById_(sheet, UTILISATEURS_HEADERS, payload.id);
  if (row === -1) throw new Error('Utilisateur introuvable.');
  var role = roleFromPayload_(payload.role);
  sheet.getRange(row, UTILISATEURS_HEADERS.indexOf('NomComplet') + 1).setValue(String(payload.nomComplet || '').trim());
  sheet.getRange(row, UTILISATEURS_HEADERS.indexOf('Role') + 1).setValue(role);
  sheet.getRange(row, UTILISATEURS_HEADERS.indexOf('RestreintAAdherents') + 1).setValue(payload.restreintAAdherents ? '1' : '');
  return { id: payload.id };
}

function resetPasswordUtilisateur_(payload) {
  requireAdmin_(payload);
  var sheet = getUtilisateursSheet_();
  var row = findRowById_(sheet, UTILISATEURS_HEADERS, payload.id);
  if (row === -1) throw new Error('Utilisateur introuvable.');
  var temp = generateTempPassword_();
  var salt = generateSalt_();
  sheet.getRange(row, UTILISATEURS_HEADERS.indexOf('MotDePasseHash') + 1).setValue(hashPassword_(temp, salt));
  sheet.getRange(row, UTILISATEURS_HEADERS.indexOf('Sel') + 1).setValue(salt);
  sheet.getRange(row, UTILISATEURS_HEADERS.indexOf('DoitChangerMotDePasse') + 1).setValue('1');
  return { temporaryPassword: temp };
}

function deleteUtilisateur_(payload) {
  requireAdmin_(payload);
  var sheet = getUtilisateursSheet_();
  var row = findRowById_(sheet, UTILISATEURS_HEADERS, payload.id);
  if (row === -1) throw new Error('Utilisateur introuvable.');
  var users = getAllUsers_();
  var target = null;
  for (var i = 0; i < users.length; i++) { if (users[i].ID === payload.id) { target = users[i]; break; } }
  if (target && target.Role === ROLE_ADMIN) {
    var adminCount = 0;
    for (var j = 0; j < users.length; j++) { if (users[j].Role === ROLE_ADMIN) adminCount++; }
    if (adminCount <= 1) throw new Error('Impossible de supprimer le dernier compte Administrateur.');
  }
  sheet.deleteRow(row);

  // Désaffecter les adhérents qui pointaient vers ce compte supprimé.
  var aSheet = getOrCreateSheet_(SHEET_ADHERENTS, ADHERENTS_HEADERS);
  var lastRow = aSheet.getLastRow();
  if (lastRow >= 2) {
    var col = ADHERENTS_HEADERS.indexOf('UtilisateurAffecteID') + 1;
    var values = aSheet.getRange(2, col, lastRow - 1, 1).getValues();
    for (var k = 0; k < values.length; k++) {
      if (String(values[k][0]) === String(payload.id)) {
        aSheet.getRange(k + 2, col).setValue('');
      }
    }
  }
  return { id: payload.id };
}

function updateConfig_(payload) {
  requireAdmin_(payload);
  if (payload.dossierDriveUrl !== undefined) {
    setConfigValue_('DossierDriveUrl', String(payload.dossierDriveUrl || '').trim());
  }
  if (payload.dureeNotificationsJours !== undefined) {
    var jours = parseInt(payload.dureeNotificationsJours, 10);
    if (!jours || jours < 1) jours = DEFAULT_NOTIF_DUREE_JOURS;
    setConfigValue_('DureeNotificationsJours', String(jours));
  }
  return { ok: true };
}

function markNotificationsVues_(payload) {
  var user = requireAuth_(payload);
  var sheet = getUtilisateursSheet_();
  var row = findRowById_(sheet, UTILISATEURS_HEADERS, user.ID);
  if (row !== -1) {
    sheet.getRange(row, UTILISATEURS_HEADERS.indexOf('DerniereNotifVue') + 1).setValue(Date.now());
  }
  return { ok: true };
}

/**
 * Calcule les notifications (nouvel adhérent / décès / dépense / cotisation
 * en attente de validation) des derniers jours (durée réglable depuis
 * Configuration). Un compte "restreint" (Consultation avec la case cochée,
 * ou Collecteur, toujours restreint) ne voit que les notifications de ses
 * propres adhérents affectés ; les décès/dépenses ne sont pas rattachés à un
 * adhérent en particulier et sont donc exclus pour ces comptes-là. Les
 * cotisations en attente de validation ne sont notifiées qu'aux comptes
 * Administrateur, seuls habilités à les valider.
 */
function computeNotifications_(user, adherents, cotisations, deces, depenses) {
  var dureeJours = parseInt(getConfigValue_('DureeNotificationsJours', DEFAULT_NOTIF_DUREE_JOURS), 10) || DEFAULT_NOTIF_DUREE_JOURS;
  var tz = Session.getScriptTimeZone();
  var cutoffStr = Utilities.formatDate(new Date(Date.now() - dureeJours * 24 * 60 * 60 * 1000), tz, 'yyyy-MM-dd');
  var lastSeenStr = user.DerniereNotifVue ? Utilities.formatDate(new Date(Number(user.DerniereNotifVue)), tz, 'yyyy-MM-dd') : '';
  var restreint = (user.Role === ROLE_CONSULTATION && String(user.RestreintAAdherents || '') === '1') || user.Role === ROLE_COLLECTEUR;

  var items = [];
  function consider(type, id, label, dateCreation) {
    if (!dateCreation) return;
    var dateStr = String(dateCreation);
    if (dateStr < cutoffStr) return;
    items.push({ type: type, id: id, label: label, date: dateStr, unread: !lastSeenStr || dateStr > lastSeenStr });
  }

  adherents.forEach(function (a) {
    if (restreint && String(a.UtilisateurAffecteID || '') !== String(user.ID)) return;
    consider('adherent', a.ID, (String(a.Nom || '') + ' ' + String(a.Prenom || '')).trim(), a.DateCreation);
  });
  if (!restreint) {
    deces.forEach(function (d) {
      consider('deces', d.ID, (String(d.Nom || '') + ' ' + String(d.Prenom || '')).trim(), d.DateCreation);
    });
    depenses.forEach(function (d) {
      consider('depense', d.ID, String(d.Nature || ''), d.DateCreation);
    });
  }
  if (user.Role === ROLE_ADMIN) {
    var adherentsById = {};
    adherents.forEach(function (a) { adherentsById[a.ID] = a; });
    cotisations.forEach(function (c) {
      if (String(c.StatutValidation) !== STATUT_VALIDATION_EN_ATTENTE) return;
      var a = adherentsById[c.AdherentID];
      var label = (a ? (String(a.Nom || '') + ' ' + String(a.Prenom || '')).trim() : 'Adhérent') + ' — ' + formatMontantForNotif_(c.Montant);
      consider('cotisation', c.ID, label, c.DateCreation);
    });
  }

  items.sort(function (a, b) { return b.date < a.date ? -1 : (b.date > a.date ? 1 : 0); });
  var count = 0;
  for (var i = 0; i < items.length; i++) { if (items[i].unread) count++; }
  return { count: count, items: items.slice(0, 30) };
}

function formatMontantForNotif_(montant) {
  var n = Number(montant || 0);
  return n.toFixed(2).replace('.', ',') + ' €';
}

/**
 * Filtre les données renvoyées par doGet pour un compte "restreint"
 * (Consultation avec la case cochée, ou Collecteur, toujours restreint) :
 * uniquement ses adhérents affectés (+ leurs cotisations). Décès / dépenses
 * / documents / archives ne sont pas rattachés à un adhérent en
 * particulier : ils sont masqués pour ces comptes-là plutôt que de risquer
 * d'exposer des informations concernant d'autres adhérents.
 */
function filterForUser_(user, adherents, cotisations, deces, depenses, documents, archives) {
  var restreint = (user.Role === ROLE_CONSULTATION && String(user.RestreintAAdherents || '') === '1') || user.Role === ROLE_COLLECTEUR;
  if (!restreint) {
    return { adherents: adherents, cotisations: cotisations, deces: deces, depenses: depenses, documents: documents, archives: archives };
  }
  var mineIds = {};
  var mine = adherents.filter(function (a) {
    var isMine = String(a.UtilisateurAffecteID || '') === String(user.ID);
    if (isMine) mineIds[a.ID] = true;
    return isMine;
  });
  var mineCots = cotisations.filter(function (c) { return !!mineIds[c.AdherentID]; });
  return { adherents: mine, cotisations: mineCots, deces: [], depenses: [], documents: [], archives: { headers: [], rows: [] } };
}

/* ---------------------------------------------------------------------- */
/* Entrées HTTP                                                           */
/* ---------------------------------------------------------------------- */

function doGet(e) {
  try {
    var token = e && e.parameter ? e.parameter.token : '';
    ensureDefaultAdmin_();
    var user = getSessionUser_(token);
    if (!user) {
      return jsonResponse_({ success: false, error: 'Authentification requise.', authRequired: true });
    }

    var adherentsSheet = getOrCreateSheet_(SHEET_ADHERENTS, ADHERENTS_HEADERS);
    var cotisationsSheet = getOrCreateSheet_(SHEET_COTISATIONS, COTISATIONS_HEADERS);
    var decesSheet = getOrCreateSheet_(SHEET_DECES, DECES_HEADERS);
    var depensesSheet = getOrCreateSheet_(SHEET_DEPENSES, DEPENSES_HEADERS);
    var documentsSheet = getOrCreateSheet_(SHEET_DOCUMENTS, DOCUMENTS_HEADERS);
    var archivesSheet = getOrCreateArchivesSheet_();

    var adherents = sheetToObjects_(adherentsSheet, ADHERENTS_HEADERS);
    var cotisations = sheetToObjects_(cotisationsSheet, COTISATIONS_HEADERS);
    var deces = sheetToObjects_(decesSheet, DECES_HEADERS);
    var depenses = sheetToObjects_(depensesSheet, DEPENSES_HEADERS);
    var documents = sheetToObjects_(documentsSheet, DOCUMENTS_HEADERS);
    var archivesHeaders = getArchivesHeaders_(archivesSheet);
    var archives = { headers: archivesHeaders, rows: archivesHeaders.length ? sheetToObjects_(archivesSheet, archivesHeaders) : [] };

    var notifications = computeNotifications_(user, adherents, cotisations, deces, depenses);
    var filtered = filterForUser_(user, adherents, cotisations, deces, depenses, documents, archives);

    var response = {
      success: true,
      moi: userToPublic_(user),
      adherents: filtered.adherents,
      cotisations: filtered.cotisations,
      deces: filtered.deces,
      depenses: filtered.depenses,
      documents: filtered.documents,
      archives: filtered.archives,
      notifications: notifications,
      config: { dureeNotificationsJours: parseInt(getConfigValue_('DureeNotificationsJours', DEFAULT_NOTIF_DUREE_JOURS), 10) || DEFAULT_NOTIF_DUREE_JOURS }
    };
    if (user.Role === ROLE_ADMIN) {
      response.utilisateurs = getAllUsers_().map(userToPublic_);
      response.config.dossierDriveUrl = getConfigValue_('DossierDriveUrl', '');
    }
    return jsonResponse_(response);
  } catch (err) {
    return jsonResponse_({ success: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = {};
    if (e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    var action = body.action;
    var payload = body.payload || {};
    var result;

    switch (action) {
      case 'login':
        result = login_(payload);
        break;
      case 'logout':
        deleteSession_(payload.token);
        result = { ok: true };
        break;
      case 'changePassword':
        result = changePassword_(payload);
        break;
      case 'markNotificationsVues':
        result = markNotificationsVues_(payload);
        break;
      case 'createUtilisateur':
        result = createUtilisateur_(payload);
        break;
      case 'updateUtilisateur':
        result = updateUtilisateur_(payload);
        break;
      case 'resetPasswordUtilisateur':
        result = resetPasswordUtilisateur_(payload);
        break;
      case 'deleteUtilisateur':
        result = deleteUtilisateur_(payload);
        break;
      case 'updateConfig':
        result = updateConfig_(payload);
        break;
      case 'createAdherent':
        result = createAdherent_(payload);
        break;
      case 'updateAdherent':
        result = updateAdherent_(payload);
        break;
      case 'deleteAdherent':
        result = deleteAdherent_(payload);
        break;
      case 'archiveAdherent':
        result = archiveAdherent_(payload);
        break;
      case 'unarchiveAdherent':
        result = unarchiveAdherent_(payload);
        break;
      case 'createCotisation':
        result = createCotisation_(payload);
        break;
      case 'updateCotisation':
        result = updateCotisation_(payload);
        break;
      case 'deleteCotisation':
        result = deleteCotisation_(payload);
        break;
      case 'validateCotisation':
        result = validateCotisation_(payload);
        break;
      case 'createDeces':
        result = createDeces_(payload);
        break;
      case 'updateDeces':
        result = updateDeces_(payload);
        break;
      case 'deleteDeces':
        result = deleteDeces_(payload);
        break;
      case 'createDepense':
        result = createDepense_(payload);
        break;
      case 'updateDepense':
        result = updateDepense_(payload);
        break;
      case 'deleteDepense':
        result = deleteDepense_(payload);
        break;
      case 'createDocument':
        result = createDocument_(payload);
        break;
      case 'updateDocument':
        result = updateDocument_(payload);
        break;
      case 'deleteDocument':
        result = deleteDocument_(payload);
        break;
      default:
        return jsonResponse_({ success: false, error: 'Action inconnue: ' + action });
    }

    return jsonResponse_({ success: true, data: result });
  } catch (err) {
    return jsonResponse_({ success: false, error: String(err), authRequired: !!(err && err.authRequired) });
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------------------------------------------------------------- */
/* Adhérents                                                              */
/* ---------------------------------------------------------------------- */

function createAdherent_(payload) {
  requireAdmin_(payload);
  var sheet = getOrCreateSheet_(SHEET_ADHERENTS, ADHERENTS_HEADERS);
  var id = Utilities.getUuid();
  var pj = savePieceJointe_(payload.pieceJointe, 'Adherents');
  sheet.appendRow([
    id,
    payload.nom || '',
    payload.prenom || '',
    payload.telephone || '',
    payload.email || '',
    payload.dateAdhesion || '',
    payload.civilite || '',
    '',
    new Date(),
    payload.utilisateurAffecteId || '',
    pj ? pj.url : (payload.pieceJointeUrl || ''),
    pj ? pj.name : (payload.pieceJointeNom || '')
  ]);
  return { id: id };
}

function updateAdherent_(payload) {
  requireAdmin_(payload);
  var sheet = getOrCreateSheet_(SHEET_ADHERENTS, ADHERENTS_HEADERS);
  var row = findRowById_(sheet, ADHERENTS_HEADERS, payload.id);
  if (row === -1) throw new Error('Adhérent introuvable: ' + payload.id);
  // Le formulaire d'édition ne connaît pas Archive/DateCreation : on les relit
  // et on les reporte tels quels pour ne jamais les écraser par erreur.
  var archiveCol = ADHERENTS_HEADERS.indexOf('Archive') + 1;
  var creationCol = ADHERENTS_HEADERS.indexOf('DateCreation') + 1;
  var currentArchive = sheet.getRange(row, archiveCol).getValue();
  var currentCreation = sheet.getRange(row, creationCol).getValue();
  var pj = savePieceJointe_(payload.pieceJointe, 'Adherents');
  sheet.getRange(row, 1, 1, ADHERENTS_HEADERS.length).setValues([[
    payload.id,
    payload.nom || '',
    payload.prenom || '',
    payload.telephone || '',
    payload.email || '',
    payload.dateAdhesion || '',
    payload.civilite || '',
    currentArchive,
    currentCreation,
    payload.utilisateurAffecteId || '',
    pj ? pj.url : (payload.pieceJointeUrl || ''),
    pj ? pj.name : (payload.pieceJointeNom || '')
  ]]);
  return { id: payload.id };
}

/**
 * Archiver/désarchiver un adhérent : il disparaît (ou réapparaît) de la liste
 * active côté appli, mais ses cotisations ne sont ni touchées ni supprimées —
 * contrairement à deleteAdherent_, qui supprime la fiche ET ses cotisations.
 */
function setAdherentArchive_(payload, archived) {
  requireAdmin_(payload);
  var sheet = getOrCreateSheet_(SHEET_ADHERENTS, ADHERENTS_HEADERS);
  var row = findRowById_(sheet, ADHERENTS_HEADERS, payload.id);
  if (row === -1) throw new Error('Adhérent introuvable: ' + payload.id);
  var archiveCol = ADHERENTS_HEADERS.indexOf('Archive') + 1;
  sheet.getRange(row, archiveCol).setValue(archived ? '1' : '');
  return { id: payload.id };
}

function archiveAdherent_(payload) {
  return setAdherentArchive_(payload, true);
}

function unarchiveAdherent_(payload) {
  return setAdherentArchive_(payload, false);
}

function deleteAdherent_(payload) {
  requireAdmin_(payload);
  var sheet = getOrCreateSheet_(SHEET_ADHERENTS, ADHERENTS_HEADERS);
  var row = findRowById_(sheet, ADHERENTS_HEADERS, payload.id);
  if (row !== -1) sheet.deleteRow(row);

  // Supprimer aussi les cotisations liées à cet adhérent
  var cotSheet = getOrCreateSheet_(SHEET_COTISATIONS, COTISATIONS_HEADERS);
  var lastRow = cotSheet.getLastRow();
  if (lastRow >= 2) {
    var values = cotSheet.getRange(2, 1, lastRow - 1, COTISATIONS_HEADERS.length).getValues();
    for (var i = values.length - 1; i >= 0; i--) {
      if (String(values[i][1]) === String(payload.id)) {
        cotSheet.deleteRow(i + 2);
      }
    }
  }
  return { id: payload.id };
}

/* ---------------------------------------------------------------------- */
/* Cotisations                                                            */
/* ---------------------------------------------------------------------- */

/**
 * Un compte Administrateur peut saisir une cotisation pour n'importe quel
 * adhérent : elle est directement 'Valide'. Un compte Collecteur ne peut
 * saisir que pour un adhérent qui lui est affecté (vérifié ici, côté
 * serveur — jamais en se fiant à l'interface) ; sa cotisation est créée
 * 'EnAttente' et n'apparaît dans aucun total tant qu'un Administrateur ne
 * l'a pas validée (voir validateCotisation_).
 */
function createCotisation_(payload) {
  var user = requireCotisationWriter_(payload);
  var statutValidation = STATUT_VALIDATION_VALIDE;
  if (user.Role === ROLE_COLLECTEUR) {
    var aSheet = getOrCreateSheet_(SHEET_ADHERENTS, ADHERENTS_HEADERS);
    var aRow = findRowById_(aSheet, ADHERENTS_HEADERS, payload.adherentId);
    if (aRow === -1) throw new Error('Adhérent introuvable.');
    var affecteId = aSheet.getRange(aRow, ADHERENTS_HEADERS.indexOf('UtilisateurAffecteID') + 1).getValue();
    if (String(affecteId || '') !== String(user.ID)) {
      throw new Error('Vous ne pouvez saisir une cotisation que pour vos adhérents affectés.');
    }
    statutValidation = STATUT_VALIDATION_EN_ATTENTE;
  }
  var sheet = getOrCreateSheet_(SHEET_COTISATIONS, COTISATIONS_HEADERS);
  var id = Utilities.getUuid();
  sheet.appendRow([
    id,
    payload.adherentId || '',
    payload.montant || 0,
    payload.date || '',
    payload.statut || '',
    statutValidation,
    user.ID,
    new Date()
  ]);
  return { id: id, statutValidation: statutValidation };
}

function updateCotisation_(payload) {
  requireAdmin_(payload);
  var sheet = getOrCreateSheet_(SHEET_COTISATIONS, COTISATIONS_HEADERS);
  var row = findRowById_(sheet, COTISATIONS_HEADERS, payload.id);
  if (row === -1) throw new Error('Cotisation introuvable: ' + payload.id);
  // Modifier une cotisation (montant/date/statut) ne doit jamais réinitialiser
  // sa validation ni sa traçabilité : on relit ces colonnes avant de réécrire
  // la ligne, même si seul un Administrateur peut arriver jusqu'ici.
  var current = sheet.getRange(row, 1, 1, COTISATIONS_HEADERS.length).getValues()[0];
  sheet.getRange(row, 1, 1, COTISATIONS_HEADERS.length).setValues([[
    payload.id,
    payload.adherentId || '',
    payload.montant || 0,
    payload.date || '',
    payload.statut || '',
    current[COTISATIONS_HEADERS.indexOf('StatutValidation')],
    current[COTISATIONS_HEADERS.indexOf('CreeParUtilisateurID')],
    current[COTISATIONS_HEADERS.indexOf('DateCreation')]
  ]]);
  return { id: payload.id };
}

function deleteCotisation_(payload) {
  requireAdmin_(payload);
  var sheet = getOrCreateSheet_(SHEET_COTISATIONS, COTISATIONS_HEADERS);
  var row = findRowById_(sheet, COTISATIONS_HEADERS, payload.id);
  if (row !== -1) sheet.deleteRow(row);
  return { id: payload.id };
}

/**
 * Valide une cotisation 'EnAttente' saisie par un Collecteur : elle compte
 * alors dans tous les totaux/rapports. Réservé aux Administrateurs. Pour
 * refuser une saisie erronée, un Administrateur la supprime simplement
 * (deleteCotisation_) plutôt que de la "rejeter".
 */
function validateCotisation_(payload) {
  requireAdmin_(payload);
  var sheet = getOrCreateSheet_(SHEET_COTISATIONS, COTISATIONS_HEADERS);
  var row = findRowById_(sheet, COTISATIONS_HEADERS, payload.id);
  if (row === -1) throw new Error('Cotisation introuvable: ' + payload.id);
  sheet.getRange(row, COTISATIONS_HEADERS.indexOf('StatutValidation') + 1).setValue(STATUT_VALIDATION_VALIDE);
  return { id: payload.id };
}

/* ---------------------------------------------------------------------- */
/* Pièces jointes (Google Drive)                                          */
/* ---------------------------------------------------------------------- */

function extractDriveFolderId_(urlOrId) {
  if (!urlOrId) return '';
  var s = String(urlOrId).trim();
  var m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(s)) return s; // déjà un identifiant Drive brut
  return '';
}

/**
 * Dossier racine des pièces jointes : celui configuré par un administrateur
 * (lien Drive dans Configuration) si valide et accessible, sinon le dossier
 * "Caisse - Pieces jointes" auto-créé à côté de la feuille de calcul.
 */
function getPiecesJointesRootFolder_() {
  var id = extractDriveFolderId_(getConfigValue_('DossierDriveUrl', ''));
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (e) {
      // Lien invalide ou dossier inaccessible avec ce compte : on se rabat
      // silencieusement sur le dossier auto-créé plutôt que de bloquer l'enregistrement.
    }
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ssFile = DriveApp.getFileById(ss.getId());
  var parents = ssFile.getParents();
  var parentFolder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  var existing = parentFolder.getFoldersByName(PIECES_JOINTES_FOLDER);
  if (existing.hasNext()) return existing.next();
  return parentFolder.createFolder(PIECES_JOINTES_FOLDER);
}

function getOrCreateSubfolder_(parent, name) {
  var existing = parent.getFoldersByName(name);
  if (existing.hasNext()) return existing.next();
  return parent.createFolder(name);
}

/**
 * Enregistre une pièce jointe envoyée en base64 dans le sous-dossier Drive de
 * la catégorie concernée (Adherents / Deces / Depenses / Documents), sous le
 * dossier racine configuré (ou auto-créé par défaut). Retourne { url, name }.
 * pieceJointe attendu : { name, mimeType, base64 }
 */
function savePieceJointe_(pieceJointe, categorie) {
  if (!pieceJointe || !pieceJointe.base64) return null;

  var root = getPiecesJointesRootFolder_();
  var folder = categorie ? getOrCreateSubfolder_(root, categorie) : root;
  var blob = Utilities.newBlob(
    Utilities.base64Decode(pieceJointe.base64),
    pieceJointe.mimeType || 'application/octet-stream',
    pieceJointe.name || 'piece-jointe'
  );
  var file = folder.createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    // Le partage peut être restreint par la politique du compte Google ;
    // le fichier reste accessible aux personnes ayant déjà accès à la feuille.
  }
  return { url: file.getUrl(), name: pieceJointe.name || file.getName() };
}

/* ---------------------------------------------------------------------- */
/* Décès                                                                  */
/* ---------------------------------------------------------------------- */

function createDeces_(payload) {
  requireAdmin_(payload);
  var sheet = getOrCreateSheet_(SHEET_DECES, DECES_HEADERS);
  var id = Utilities.getUuid();
  var pj = savePieceJointe_(payload.pieceJointe, 'Deces');
  sheet.appendRow([
    id,
    payload.nom || '',
    payload.prenom || '',
    payload.coutFuneraire || 0,
    payload.date || '',
    pj ? pj.url : (payload.pieceJointeUrl || ''),
    pj ? pj.name : (payload.pieceJointeNom || ''),
    new Date()
  ]);
  return { id: id };
}

function updateDeces_(payload) {
  requireAdmin_(payload);
  var sheet = getOrCreateSheet_(SHEET_DECES, DECES_HEADERS);
  var row = findRowById_(sheet, DECES_HEADERS, payload.id);
  if (row === -1) throw new Error('Décès introuvable: ' + payload.id);
  var currentCreation = sheet.getRange(row, DECES_HEADERS.indexOf('DateCreation') + 1).getValue();
  var pj = savePieceJointe_(payload.pieceJointe, 'Deces');
  sheet.getRange(row, 1, 1, DECES_HEADERS.length).setValues([[
    payload.id,
    payload.nom || '',
    payload.prenom || '',
    payload.coutFuneraire || 0,
    payload.date || '',
    pj ? pj.url : (payload.pieceJointeUrl || ''),
    pj ? pj.name : (payload.pieceJointeNom || ''),
    currentCreation
  ]]);
  return { id: payload.id };
}

function deleteDeces_(payload) {
  requireAdmin_(payload);
  var sheet = getOrCreateSheet_(SHEET_DECES, DECES_HEADERS);
  var row = findRowById_(sheet, DECES_HEADERS, payload.id);
  if (row !== -1) sheet.deleteRow(row);
  return { id: payload.id };
}

/* ---------------------------------------------------------------------- */
/* Dépenses                                                               */
/* ---------------------------------------------------------------------- */

function createDepense_(payload) {
  requireAdmin_(payload);
  var sheet = getOrCreateSheet_(SHEET_DEPENSES, DEPENSES_HEADERS);
  var id = Utilities.getUuid();
  var pj = savePieceJointe_(payload.pieceJointe, 'Depenses');
  sheet.appendRow([
    id,
    payload.date || '',
    payload.nature || '',
    payload.montant || 0,
    pj ? pj.url : (payload.pieceJointeUrl || ''),
    pj ? pj.name : (payload.pieceJointeNom || ''),
    new Date()
  ]);
  return { id: id };
}

function updateDepense_(payload) {
  requireAdmin_(payload);
  var sheet = getOrCreateSheet_(SHEET_DEPENSES, DEPENSES_HEADERS);
  var row = findRowById_(sheet, DEPENSES_HEADERS, payload.id);
  if (row === -1) throw new Error('Dépense introuvable: ' + payload.id);
  var currentCreation = sheet.getRange(row, DEPENSES_HEADERS.indexOf('DateCreation') + 1).getValue();
  var pj = savePieceJointe_(payload.pieceJointe, 'Depenses');
  sheet.getRange(row, 1, 1, DEPENSES_HEADERS.length).setValues([[
    payload.id,
    payload.date || '',
    payload.nature || '',
    payload.montant || 0,
    pj ? pj.url : (payload.pieceJointeUrl || ''),
    pj ? pj.name : (payload.pieceJointeNom || ''),
    currentCreation
  ]]);
  return { id: payload.id };
}

function deleteDepense_(payload) {
  requireAdmin_(payload);
  var sheet = getOrCreateSheet_(SHEET_DEPENSES, DEPENSES_HEADERS);
  var row = findRowById_(sheet, DEPENSES_HEADERS, payload.id);
  if (row !== -1) sheet.deleteRow(row);
  return { id: payload.id };
}

/* ---------------------------------------------------------------------- */
/* Documents                                                              */
/* ---------------------------------------------------------------------- */

function createDocument_(payload) {
  requireAdmin_(payload);
  var sheet = getOrCreateSheet_(SHEET_DOCUMENTS, DOCUMENTS_HEADERS);
  var id = Utilities.getUuid();
  var pj = savePieceJointe_(payload.pieceJointe, 'Documents');
  sheet.appendRow([
    id,
    payload.nom || '',
    payload.description || '',
    payload.date || '',
    pj ? pj.url : (payload.pieceJointeUrl || ''),
    pj ? pj.name : (payload.pieceJointeNom || '')
  ]);
  return { id: id };
}

function updateDocument_(payload) {
  requireAdmin_(payload);
  var sheet = getOrCreateSheet_(SHEET_DOCUMENTS, DOCUMENTS_HEADERS);
  var row = findRowById_(sheet, DOCUMENTS_HEADERS, payload.id);
  if (row === -1) throw new Error('Document introuvable: ' + payload.id);
  var pj = savePieceJointe_(payload.pieceJointe, 'Documents');
  sheet.getRange(row, 1, 1, DOCUMENTS_HEADERS.length).setValues([[
    payload.id,
    payload.nom || '',
    payload.description || '',
    payload.date || '',
    pj ? pj.url : (payload.pieceJointeUrl || ''),
    pj ? pj.name : (payload.pieceJointeNom || '')
  ]]);
  return { id: payload.id };
}

function deleteDocument_(payload) {
  requireAdmin_(payload);
  var sheet = getOrCreateSheet_(SHEET_DOCUMENTS, DOCUMENTS_HEADERS);
  var row = findRowById_(sheet, DOCUMENTS_HEADERS, payload.id);
  if (row !== -1) sheet.deleteRow(row);
  return { id: payload.id };
}
