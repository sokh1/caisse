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
 *   ID | Nom | Prenom | Telephone | Email | DateAdhesion
 *
 * Cotisations
 *   ID | AdherentID | Montant | Date | Statut
 *
 * Deces
 *   ID | Nom | Prenom | CoutFuneraire | Date | PieceJointeUrl | PieceJointeNom
 *
 * Depenses
 *   ID | Date | Nature | Montant | PieceJointeUrl | PieceJointeNom
 *
 * Statuts possibles (Cotisations) : "Sans travail", "Travail", "Malade", "Retraite", "Conges"
 *
 * Les pièces jointes (Deces / Depenses) sont envoyées par le frontend en base64
 * et enregistrées dans un dossier Google Drive "Caisse - Pieces jointes" situé
 * à côté de la feuille de calcul ; seule l'URL du fichier est stockée dans la feuille.
 */

var SHEET_ADHERENTS = 'Adherents';
var SHEET_COTISATIONS = 'Cotisations';
var SHEET_DECES = 'Deces';
var SHEET_DEPENSES = 'Depenses';

var ADHERENTS_HEADERS = ['ID', 'Nom', 'Prenom', 'Telephone', 'Email', 'DateAdhesion'];
var COTISATIONS_HEADERS = ['ID', 'AdherentID', 'Montant', 'Date', 'Statut'];
var DECES_HEADERS = ['ID', 'Nom', 'Prenom', 'CoutFuneraire', 'Date', 'PieceJointeUrl', 'PieceJointeNom'];
var DEPENSES_HEADERS = ['ID', 'Date', 'Nature', 'Montant', 'PieceJointeUrl', 'PieceJointeNom'];

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

/* ---------------------------------------------------------------------- */
/* Entrées HTTP                                                           */
/* ---------------------------------------------------------------------- */

function doGet(e) {
  try {
    var adherentsSheet = getOrCreateSheet_(SHEET_ADHERENTS, ADHERENTS_HEADERS);
    var cotisationsSheet = getOrCreateSheet_(SHEET_COTISATIONS, COTISATIONS_HEADERS);
    var decesSheet = getOrCreateSheet_(SHEET_DECES, DECES_HEADERS);
    var depensesSheet = getOrCreateSheet_(SHEET_DEPENSES, DEPENSES_HEADERS);

    var adherents = sheetToObjects_(adherentsSheet, ADHERENTS_HEADERS);
    var cotisations = sheetToObjects_(cotisationsSheet, COTISATIONS_HEADERS);
    var deces = sheetToObjects_(decesSheet, DECES_HEADERS);
    var depenses = sheetToObjects_(depensesSheet, DEPENSES_HEADERS);

    return jsonResponse_({
      success: true,
      adherents: adherents,
      cotisations: cotisations,
      deces: deces,
      depenses: depenses
    });
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
      case 'createAdherent':
        result = createAdherent_(payload);
        break;
      case 'updateAdherent':
        result = updateAdherent_(payload);
        break;
      case 'deleteAdherent':
        result = deleteAdherent_(payload);
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
      default:
        return jsonResponse_({ success: false, error: 'Action inconnue: ' + action });
    }

    return jsonResponse_({ success: true, data: result });
  } catch (err) {
    return jsonResponse_({ success: false, error: String(err) });
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
  var sheet = getOrCreateSheet_(SHEET_ADHERENTS, ADHERENTS_HEADERS);
  var id = Utilities.getUuid();
  sheet.appendRow([
    id,
    payload.nom || '',
    payload.prenom || '',
    payload.telephone || '',
    payload.email || '',
    payload.dateAdhesion || ''
  ]);
  return { id: id };
}

function updateAdherent_(payload) {
  var sheet = getOrCreateSheet_(SHEET_ADHERENTS, ADHERENTS_HEADERS);
  var row = findRowById_(sheet, ADHERENTS_HEADERS, payload.id);
  if (row === -1) throw new Error('Adhérent introuvable: ' + payload.id);
  sheet.getRange(row, 1, 1, ADHERENTS_HEADERS.length).setValues([[
    payload.id,
    payload.nom || '',
    payload.prenom || '',
    payload.telephone || '',
    payload.email || '',
    payload.dateAdhesion || ''
  ]]);
  return { id: payload.id };
}

function deleteAdherent_(payload) {
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

function createCotisation_(payload) {
  var sheet = getOrCreateSheet_(SHEET_COTISATIONS, COTISATIONS_HEADERS);
  var id = Utilities.getUuid();
  sheet.appendRow([
    id,
    payload.adherentId || '',
    payload.montant || 0,
    payload.date || '',
    payload.statut || ''
  ]);
  return { id: id };
}

function updateCotisation_(payload) {
  var sheet = getOrCreateSheet_(SHEET_COTISATIONS, COTISATIONS_HEADERS);
  var row = findRowById_(sheet, COTISATIONS_HEADERS, payload.id);
  if (row === -1) throw new Error('Cotisation introuvable: ' + payload.id);
  sheet.getRange(row, 1, 1, COTISATIONS_HEADERS.length).setValues([[
    payload.id,
    payload.adherentId || '',
    payload.montant || 0,
    payload.date || '',
    payload.statut || ''
  ]]);
  return { id: payload.id };
}

function deleteCotisation_(payload) {
  var sheet = getOrCreateSheet_(SHEET_COTISATIONS, COTISATIONS_HEADERS);
  var row = findRowById_(sheet, COTISATIONS_HEADERS, payload.id);
  if (row !== -1) sheet.deleteRow(row);
  return { id: payload.id };
}

/* ---------------------------------------------------------------------- */
/* Pièces jointes (Google Drive)                                          */
/* ---------------------------------------------------------------------- */

/**
 * Enregistre une pièce jointe envoyée en base64 dans un dossier Drive dédié,
 * situé à côté de la feuille de calcul. Retourne { url, name }.
 * pieceJointe attendu : { name, mimeType, base64 }
 */
function savePieceJointe_(pieceJointe) {
  if (!pieceJointe || !pieceJointe.base64) return null;

  var folder = getOrCreatePiecesJointesFolder_();
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

function getOrCreatePiecesJointesFolder_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ssFile = DriveApp.getFileById(ss.getId());
  var parents = ssFile.getParents();
  var parentFolder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();

  var existing = parentFolder.getFoldersByName(PIECES_JOINTES_FOLDER);
  if (existing.hasNext()) return existing.next();
  return parentFolder.createFolder(PIECES_JOINTES_FOLDER);
}

/* ---------------------------------------------------------------------- */
/* Décès                                                                  */
/* ---------------------------------------------------------------------- */

function createDeces_(payload) {
  var sheet = getOrCreateSheet_(SHEET_DECES, DECES_HEADERS);
  var id = Utilities.getUuid();
  var pj = savePieceJointe_(payload.pieceJointe);
  sheet.appendRow([
    id,
    payload.nom || '',
    payload.prenom || '',
    payload.coutFuneraire || 0,
    payload.date || '',
    pj ? pj.url : (payload.pieceJointeUrl || ''),
    pj ? pj.name : (payload.pieceJointeNom || '')
  ]);
  return { id: id };
}

function updateDeces_(payload) {
  var sheet = getOrCreateSheet_(SHEET_DECES, DECES_HEADERS);
  var row = findRowById_(sheet, DECES_HEADERS, payload.id);
  if (row === -1) throw new Error('Décès introuvable: ' + payload.id);
  var pj = savePieceJointe_(payload.pieceJointe);
  sheet.getRange(row, 1, 1, DECES_HEADERS.length).setValues([[
    payload.id,
    payload.nom || '',
    payload.prenom || '',
    payload.coutFuneraire || 0,
    payload.date || '',
    pj ? pj.url : (payload.pieceJointeUrl || ''),
    pj ? pj.name : (payload.pieceJointeNom || '')
  ]]);
  return { id: payload.id };
}

function deleteDeces_(payload) {
  var sheet = getOrCreateSheet_(SHEET_DECES, DECES_HEADERS);
  var row = findRowById_(sheet, DECES_HEADERS, payload.id);
  if (row !== -1) sheet.deleteRow(row);
  return { id: payload.id };
}

/* ---------------------------------------------------------------------- */
/* Dépenses                                                               */
/* ---------------------------------------------------------------------- */

function createDepense_(payload) {
  var sheet = getOrCreateSheet_(SHEET_DEPENSES, DEPENSES_HEADERS);
  var id = Utilities.getUuid();
  var pj = savePieceJointe_(payload.pieceJointe);
  sheet.appendRow([
    id,
    payload.date || '',
    payload.nature || '',
    payload.montant || 0,
    pj ? pj.url : (payload.pieceJointeUrl || ''),
    pj ? pj.name : (payload.pieceJointeNom || '')
  ]);
  return { id: id };
}

function updateDepense_(payload) {
  var sheet = getOrCreateSheet_(SHEET_DEPENSES, DEPENSES_HEADERS);
  var row = findRowById_(sheet, DEPENSES_HEADERS, payload.id);
  if (row === -1) throw new Error('Dépense introuvable: ' + payload.id);
  var pj = savePieceJointe_(payload.pieceJointe);
  sheet.getRange(row, 1, 1, DEPENSES_HEADERS.length).setValues([[
    payload.id,
    payload.date || '',
    payload.nature || '',
    payload.montant || 0,
    pj ? pj.url : (payload.pieceJointeUrl || ''),
    pj ? pj.name : (payload.pieceJointeNom || '')
  ]]);
  return { id: payload.id };
}

function deleteDepense_(payload) {
  var sheet = getOrCreateSheet_(SHEET_DEPENSES, DEPENSES_HEADERS);
  var row = findRowById_(sheet, DEPENSES_HEADERS, payload.id);
  if (row !== -1) sheet.deleteRow(row);
  return { id: payload.id };
}
