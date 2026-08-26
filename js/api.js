/**
 * Couche d'accès aux données.
 * - Si une URL Google Apps Script est configurée (localStorage), toutes les
 *   opérations passent par l'API Apps Script (Google Sheets = base de données).
 * - Sinon, l'application tourne en "mode démo" avec des données en mémoire,
 *   ce qui permet de tester l'interface sans rien configurer.
 */

const STORAGE_KEY = 'caisse.apiUrl';

const Api = (() => {

  function getApiUrl() {
    return localStorage.getItem(STORAGE_KEY) || '';
  }

  function setApiUrl(url) {
    if (url) {
      localStorage.setItem(STORAGE_KEY, url.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function isDemoMode() {
    return !getApiUrl();
  }

  /* ---------------------------------------------------------------- */
  /* Données de démo (en mémoire, réinitialisées au rechargement)      */
  /* ---------------------------------------------------------------- */

  function uid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  const demoAdherents = [
    { ID: uid(), Nom: 'Diop', Prenom: 'Awa', Telephone: '06 12 34 56 78', Email: 'awa.diop@example.com', DateAdhesion: '2023-01-15' },
    { ID: uid(), Nom: 'Fall', Prenom: 'Moussa', Telephone: '06 98 76 54 32', Email: 'moussa.fall@example.com', DateAdhesion: '2022-06-02' }
  ];
  const demoCotisations = [
    { ID: uid(), AdherentID: demoAdherents[0].ID, Montant: 20, Date: '2024-02-10', Statut: 'Travail' },
    { ID: uid(), AdherentID: demoAdherents[0].ID, Montant: 20, Date: '2025-02-12', Statut: 'Travail' },
    { ID: uid(), AdherentID: demoAdherents[1].ID, Montant: 15, Date: '2024-05-01', Statut: 'Retraite' }
  ];
  const demoDeces = [];
  const demoDepenses = [];
  const demoDocuments = [];

  // Archives : lecture seule, en principe alimentée directement dans Google Sheets.
  // Ces exemples permettent de tester la page en mode démo.
  const demoArchivesHeaders = ['Référence', 'Nom', 'Prénom', 'Catégorie', 'Année'];
  const demoArchivesRows = [
    { 'Référence': 'ARC-001', 'Nom': 'Diop', 'Prénom': 'Awa', 'Catégorie': 'Adhésion', 'Année': '2022' },
    { 'Référence': 'ARC-002', 'Nom': 'Fall', 'Prénom': 'Moussa', 'Catégorie': 'Cotisation', 'Année': '2023' },
    { 'Référence': 'ARC-003', 'Nom': 'Sow', 'Prénom': 'Fatou', 'Catégorie': 'Décès', 'Année': '2024' }
  ];

  // En mode démo, une pièce jointe est simplement gardée sous forme de data URL
  // (rien n'est envoyé nulle part) : cela permet quand même de l'ouvrir/visualiser.
  function pieceJointeToDemoRecord(pieceJointe, existingUrl, existingNom) {
    if (pieceJointe && pieceJointe.base64) {
      return {
        url: `data:${pieceJointe.mimeType || 'application/octet-stream'};base64,${pieceJointe.base64}`,
        nom: pieceJointe.name || 'piece-jointe'
      };
    }
    return { url: existingUrl || '', nom: existingNom || '' };
  }

  /* ---------------------------------------------------------------- */
  /* API Apps Script (fetch)                                          */
  /* ---------------------------------------------------------------- */

  async function remoteGetAll() {
    const res = await fetch(getApiUrl(), { method: 'GET' });
    if (!res.ok) throw new Error('Erreur réseau (' + res.status + ')');
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Erreur inconnue');
    return {
      adherents: json.adherents,
      cotisations: json.cotisations,
      deces: json.deces || [],
      depenses: json.depenses || [],
      documents: json.documents || [],
      archives: json.archives || { headers: [], rows: [] }
    };
  }

  async function remotePost(action, payload) {
    // Content-Type text/plain volontairement : évite le pré-vol CORS (preflight)
    // que Google Apps Script ne gère pas. Le corps est quand même du JSON,
    // parsé côté script avec JSON.parse(e.postData.contents).
    const res = await fetch(getApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload })
    });
    if (!res.ok) throw new Error('Erreur réseau (' + res.status + ')');
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Erreur inconnue');
    return json.data;
  }

  /* ---------------------------------------------------------------- */
  /* API publique                                                      */
  /* ---------------------------------------------------------------- */

  async function getAll() {
    if (isDemoMode()) {
      return {
        adherents: demoAdherents.slice(),
        cotisations: demoCotisations.slice(),
        deces: demoDeces.slice(),
        depenses: demoDepenses.slice(),
        documents: demoDocuments.slice(),
        archives: { headers: demoArchivesHeaders.slice(), rows: demoArchivesRows.slice() }
      };
    }
    return remoteGetAll();
  }

  async function createAdherent(data) {
    if (isDemoMode()) {
      const rec = {
        ID: uid(), Nom: data.nom, Prenom: data.prenom,
        Telephone: data.telephone || '', Email: data.email || '',
        DateAdhesion: data.dateAdhesion || ''
      };
      demoAdherents.push(rec);
      return rec;
    }
    return remotePost('createAdherent', data);
  }

  async function updateAdherent(data) {
    if (isDemoMode()) {
      const rec = demoAdherents.find(a => a.ID === data.id);
      if (rec) {
        rec.Nom = data.nom; rec.Prenom = data.prenom;
        rec.Telephone = data.telephone || ''; rec.Email = data.email || '';
        rec.DateAdhesion = data.dateAdhesion || '';
      }
      return rec;
    }
    return remotePost('updateAdherent', data);
  }

  async function deleteAdherent(id) {
    if (isDemoMode()) {
      const idx = demoAdherents.findIndex(a => a.ID === id);
      if (idx !== -1) demoAdherents.splice(idx, 1);
      for (let i = demoCotisations.length - 1; i >= 0; i--) {
        if (demoCotisations[i].AdherentID === id) demoCotisations.splice(i, 1);
      }
      return { id };
    }
    return remotePost('deleteAdherent', { id });
  }

  async function createCotisation(data) {
    if (isDemoMode()) {
      const rec = {
        ID: uid(), AdherentID: data.adherentId, Montant: Number(data.montant),
        Date: data.date, Statut: data.statut
      };
      demoCotisations.push(rec);
      return rec;
    }
    return remotePost('createCotisation', data);
  }

  async function updateCotisation(data) {
    if (isDemoMode()) {
      const rec = demoCotisations.find(c => c.ID === data.id);
      if (rec) {
        rec.Montant = Number(data.montant); rec.Date = data.date; rec.Statut = data.statut;
      }
      return rec;
    }
    return remotePost('updateCotisation', data);
  }

  async function deleteCotisation(id) {
    if (isDemoMode()) {
      const idx = demoCotisations.findIndex(c => c.ID === id);
      if (idx !== -1) demoCotisations.splice(idx, 1);
      return { id };
    }
    return remotePost('deleteCotisation', { id });
  }

  async function createDeces(data) {
    if (isDemoMode()) {
      const pj = pieceJointeToDemoRecord(data.pieceJointe);
      const rec = {
        ID: uid(), Nom: data.nom, Prenom: data.prenom,
        CoutFuneraire: Number(data.coutFuneraire), Date: data.date,
        PieceJointeUrl: pj.url, PieceJointeNom: pj.nom
      };
      demoDeces.push(rec);
      return rec;
    }
    return remotePost('createDeces', data);
  }

  async function updateDeces(data) {
    if (isDemoMode()) {
      const rec = demoDeces.find(d => d.ID === data.id);
      if (rec) {
        const pj = pieceJointeToDemoRecord(data.pieceJointe, rec.PieceJointeUrl, rec.PieceJointeNom);
        rec.Nom = data.nom; rec.Prenom = data.prenom;
        rec.CoutFuneraire = Number(data.coutFuneraire); rec.Date = data.date;
        rec.PieceJointeUrl = pj.url; rec.PieceJointeNom = pj.nom;
      }
      return rec;
    }
    return remotePost('updateDeces', data);
  }

  async function deleteDeces(id) {
    if (isDemoMode()) {
      const idx = demoDeces.findIndex(d => d.ID === id);
      if (idx !== -1) demoDeces.splice(idx, 1);
      return { id };
    }
    return remotePost('deleteDeces', { id });
  }

  async function createDepense(data) {
    if (isDemoMode()) {
      const pj = pieceJointeToDemoRecord(data.pieceJointe);
      const rec = {
        ID: uid(), Date: data.date, Nature: data.nature, Montant: Number(data.montant),
        PieceJointeUrl: pj.url, PieceJointeNom: pj.nom
      };
      demoDepenses.push(rec);
      return rec;
    }
    return remotePost('createDepense', data);
  }

  async function updateDepense(data) {
    if (isDemoMode()) {
      const rec = demoDepenses.find(d => d.ID === data.id);
      if (rec) {
        const pj = pieceJointeToDemoRecord(data.pieceJointe, rec.PieceJointeUrl, rec.PieceJointeNom);
        rec.Date = data.date; rec.Nature = data.nature; rec.Montant = Number(data.montant);
        rec.PieceJointeUrl = pj.url; rec.PieceJointeNom = pj.nom;
      }
      return rec;
    }
    return remotePost('updateDepense', data);
  }

  async function deleteDepense(id) {
    if (isDemoMode()) {
      const idx = demoDepenses.findIndex(d => d.ID === id);
      if (idx !== -1) demoDepenses.splice(idx, 1);
      return { id };
    }
    return remotePost('deleteDepense', { id });
  }

  async function createDocument(data) {
    if (isDemoMode()) {
      const pj = pieceJointeToDemoRecord(data.pieceJointe);
      const rec = {
        ID: uid(), Nom: data.nom, Description: data.description || '',
        Date: data.date || '', PieceJointeUrl: pj.url, PieceJointeNom: pj.nom
      };
      demoDocuments.push(rec);
      return rec;
    }
    return remotePost('createDocument', data);
  }

  async function updateDocument(data) {
    if (isDemoMode()) {
      const rec = demoDocuments.find(d => d.ID === data.id);
      if (rec) {
        const pj = pieceJointeToDemoRecord(data.pieceJointe, rec.PieceJointeUrl, rec.PieceJointeNom);
        rec.Nom = data.nom; rec.Description = data.description || ''; rec.Date = data.date || '';
        rec.PieceJointeUrl = pj.url; rec.PieceJointeNom = pj.nom;
      }
      return rec;
    }
    return remotePost('updateDocument', data);
  }

  async function deleteDocument(id) {
    if (isDemoMode()) {
      const idx = demoDocuments.findIndex(d => d.ID === id);
      if (idx !== -1) demoDocuments.splice(idx, 1);
      return { id };
    }
    return remotePost('deleteDocument', { id });
  }

  return {
    getApiUrl, setApiUrl, isDemoMode, getAll,
    createAdherent, updateAdherent, deleteAdherent,
    createCotisation, updateCotisation, deleteCotisation,
    createDeces, updateDeces, deleteDeces,
    createDepense, updateDepense, deleteDepense,
    createDocument, updateDocument, deleteDocument
  };
})();
