/**
 * Couche d'accès aux données.
 * - Si une URL Google Apps Script est configurée (localStorage), toutes les
 *   opérations passent par l'API Apps Script (Google Sheets = base de données).
 * - Sinon, l'application tourne en "mode démo" avec des données en mémoire,
 *   ce qui permet de tester l'interface sans rien configurer.
 *
 * Authentification : chaque appel envoie un jeton de session (obtenu par
 * Api.login) — au serveur en mode connecté (vérifié côté Apps Script), ou
 * comparé aux comptes de démonstration en mode démo. Si le jeton est absent,
 * invalide ou expiré, les fonctions rejettent avec une erreur portant
 * `err.authRequired = true` : c'est ce que l'interface utilise pour afficher
 * l'écran de connexion.
 */

const STORAGE_KEY = 'caisse.apiUrl';
const TOKEN_KEY = 'caisse.sessionToken';

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

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  function authRequiredError() {
    const err = new Error('Authentification requise.');
    err.authRequired = true;
    return err;
  }

  // En mode démo, il n'y a pas de vrai serveur : c'est cette couche qui doit
  // reproduire la même règle que Code.gs (requireAdmin_) pour que le mode
  // Consultation reste réellement lecture seule même si l'interface était
  // contournée (ex: appel direct à Api.createXxx depuis la console).
  function requireDemoAdmin() {
    const user = currentDemoUser();
    if (!user) throw authRequiredError();
    if (user.Role !== 'Administrateur') throw new Error('Action réservée aux administrateurs.');
    return user;
  }

  // Un compte Administrateur ou Collecteur peut créer une cotisation (voir
  // createCotisation) ; miroir de requireCotisationWriter_ côté Code.gs.
  function requireDemoCotisationWriter() {
    const user = currentDemoUser();
    if (!user) throw authRequiredError();
    if (user.Role !== 'Administrateur' && user.Role !== 'Collecteur') {
      throw new Error('Action réservée aux administrateurs et aux collecteurs.');
    }
    return user;
  }

  // Miroir de slugifyForUsername_/generateUsernameFromAdherent_ côté Code.gs :
  // identifiant auto-généré pour un compte "lié à un adhérent" (1ère lettre
  // du prénom + nom, sans accents/espaces, avec suffixe numérique si doublon).
  const DEMO_ACCENT_MARKS_RE = new RegExp('[̀-ͯ]', 'g');
  function slugifyForDemoUsername(s) {
    return String(s || '')
      .normalize('NFD').replace(DEMO_ACCENT_MARKS_RE, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }
  function generateDemoUsernameFromAdherent(prenom, nom) {
    const base = (slugifyForDemoUsername(prenom).charAt(0) + slugifyForDemoUsername(nom)) || 'membre';
    const existing = demoUtilisateurs.map(u => u.NomUtilisateur.toLowerCase());
    if (!existing.includes(base)) return base;
    let i = 2;
    while (existing.includes(base + i)) i++;
    return base + i;
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

  function isoDate(d) {
    return d.toISOString().slice(0, 10);
  }

  function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return isoDate(d);
  }

  // Comptes de démonstration : un pour chaque profil, pour pouvoir tester le
  // système de connexion/droits sans configurer de Google Apps Script.
  const demoUtilisateurs = [
    { ID: uid(), NomUtilisateur: 'admin', NomComplet: 'Administrateur', MotDePasse: 'admin123', Role: 'Administrateur', RestreintAAdherents: false, DoitChangerMotDePasse: false, DerniereNotifVue: '', DateCreation: daysAgo(60), AdherentLieID: '' },
    { ID: uid(), NomUtilisateur: 'consultation', NomComplet: 'Compte consultation', MotDePasse: 'consultation123', Role: 'Consultation', RestreintAAdherents: false, DoitChangerMotDePasse: false, DerniereNotifVue: '', DateCreation: daysAgo(40), AdherentLieID: '' },
    { ID: uid(), NomUtilisateur: 'restreint', NomComplet: 'Compte restreint', MotDePasse: 'restreint123', Role: 'Consultation', RestreintAAdherents: true, DoitChangerMotDePasse: false, DerniereNotifVue: '', DateCreation: daysAgo(20), AdherentLieID: '' },
    { ID: uid(), NomUtilisateur: 'mfall', NomComplet: 'Moussa Fall', MotDePasse: 'collecteur123', Role: 'Collecteur', RestreintAAdherents: false, DoitChangerMotDePasse: false, DerniereNotifVue: '', DateCreation: daysAgo(5), AdherentLieID: '' }
  ];

  // La session démo (qui est connecté) doit survivre à un rechargement de
  // page, exactement comme en mode connecté (où le jeton est valable côté
  // serveur) — sinon la démo obligerait à se reconnecter à chaque F5, ce qui
  // ne reflèterait pas le comportement réel. Les DONNÉES de démo, elles,
  // restent réinitialisées à chaque rechargement (comme avant) : seul le nom
  // d'utilisateur connecté est mémorisé (jamais l'ID, qui change à chaque
  // rechargement puisque les comptes démo sont régénérés).
  const DEMO_SESSION_USERNAME_KEY = 'caisse.demoSessionUsername';
  let demoSessionUserId = null;
  try {
    const savedDemoUsername = localStorage.getItem(DEMO_SESSION_USERNAME_KEY);
    if (savedDemoUsername) {
      const restored = demoUtilisateurs.find(u => u.NomUtilisateur === savedDemoUsername);
      if (restored) demoSessionUserId = restored.ID;
    }
  } catch (e) { /* stockage indisponible : on ignore, l'écran de connexion s'affichera */ }

  const demoAdherents = [
    { ID: uid(), Civilite: 'Mme', Nom: 'Diop', Prenom: 'Awa', Telephone: '06 12 34 56 78', Email: 'awa.diop@example.com', DateAdhesion: '2023-01-15', DateCreation: daysAgo(0), UtilisateurAffecteID: demoUtilisateurs[2].ID, PieceJointeUrl: '', PieceJointeNom: '' },
    { ID: uid(), Civilite: 'M.', Nom: 'Fall', Prenom: 'Moussa', Telephone: '06 98 76 54 32', Email: 'moussa.fall@example.com', DateAdhesion: '2022-06-02', DateCreation: daysAgo(10), UtilisateurAffecteID: demoUtilisateurs[3].ID, PieceJointeUrl: '', PieceJointeNom: '' },
    { ID: uid(), Civilite: 'Mme', Nom: 'Sow', Prenom: 'Fatou', Telephone: '', Email: '', DateAdhesion: '2021-03-10', Archive: '1', DateCreation: daysAgo(30), UtilisateurAffecteID: '', PieceJointeUrl: '', PieceJointeNom: '' }
  ];
  // Le compte Collecteur de démo est "lié" à l'adhérent Moussa Fall (identité)
  // et affecté à lui-même (adhérent dont il peut saisir les cotisations) —
  // illustre les deux facettes de la fonctionnalité avec un seul compte.
  demoUtilisateurs[3].AdherentLieID = demoAdherents[1].ID;

  const demoCotisations = [
    { ID: uid(), AdherentID: demoAdherents[0].ID, Montant: 20, Date: '2024-02-10', Statut: 'Travail', StatutValidation: 'Valide', CreeParUtilisateurID: demoUtilisateurs[0].ID, DateCreation: daysAgo(400) },
    { ID: uid(), AdherentID: demoAdherents[0].ID, Montant: 20, Date: '2025-02-12', Statut: 'Travail', StatutValidation: 'Valide', CreeParUtilisateurID: demoUtilisateurs[0].ID, DateCreation: daysAgo(200) },
    { ID: uid(), AdherentID: demoAdherents[1].ID, Montant: 15, Date: '2024-05-01', Statut: 'Retraite', StatutValidation: 'Valide', CreeParUtilisateurID: demoUtilisateurs[0].ID, DateCreation: daysAgo(300) },
    { ID: uid(), AdherentID: demoAdherents[2].ID, Montant: 20, Date: '2022-04-03', Statut: 'Travail', StatutValidation: 'Valide', CreeParUtilisateurID: demoUtilisateurs[0].ID, DateCreation: daysAgo(600) },
    { ID: uid(), AdherentID: demoAdherents[1].ID, Montant: 10, Date: daysAgo(1), Statut: 'Retraite', StatutValidation: 'EnAttente', CreeParUtilisateurID: demoUtilisateurs[3].ID, DateCreation: daysAgo(1) }
  ];
  const demoDeces = [
    { ID: uid(), Nom: 'Traoré', Prenom: 'Ibrahima', CoutFuneraire: 450, Date: daysAgo(1), PieceJointeUrl: '', PieceJointeNom: '', DateCreation: daysAgo(1) }
  ];
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

  const demoConfig = { DossierDriveUrl: '', DureeNotificationsJours: 3 };

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

  function demoUserPublic(u) {
    return {
      id: u.ID,
      nomUtilisateur: u.NomUtilisateur,
      nomComplet: u.NomComplet,
      role: u.Role,
      restreintAAdherents: !!u.RestreintAAdherents,
      doitChangerMotDePasse: !!u.DoitChangerMotDePasse,
      dateCreation: u.DateCreation || '',
      adherentLieId: u.AdherentLieID || ''
    };
  }

  function currentDemoUser() {
    return demoUtilisateurs.find(u => u.ID === demoSessionUserId) || null;
  }

  function formatMontantForDemoNotif(montant) {
    return Number(montant || 0).toFixed(2).replace('.', ',') + ' €';
  }

  function computeDemoNotifications(user) {
    const duree = demoConfig.DureeNotificationsJours || 3;
    const cutoff = daysAgo(duree);
    const lastSeen = user.DerniereNotifVue || '';
    const restreint = (user.Role === 'Consultation' && user.RestreintAAdherents) || user.Role === 'Collecteur';
    const items = [];
    function consider(type, id, label, dateCreation) {
      if (!dateCreation || dateCreation < cutoff) return;
      items.push({ type, id, label, date: dateCreation, unread: !lastSeen || dateCreation > lastSeen });
    }
    demoAdherents.forEach(a => {
      if (restreint && a.UtilisateurAffecteID !== user.ID) return;
      consider('adherent', a.ID, `${a.Nom || ''} ${a.Prenom || ''}`.trim(), a.DateCreation);
    });
    if (!restreint) {
      demoDeces.forEach(d => consider('deces', d.ID, `${d.Nom || ''} ${d.Prenom || ''}`.trim(), d.DateCreation));
      demoDepenses.forEach(d => consider('depense', d.ID, d.Nature || '', d.DateCreation));
    }
    if (user.Role === 'Administrateur') {
      demoCotisations.forEach(c => {
        if (c.StatutValidation !== 'EnAttente') return;
        const a = demoAdherents.find(a2 => a2.ID === c.AdherentID);
        const label = (a ? `${a.Nom || ''} ${a.Prenom || ''}`.trim() : 'Adhérent') + ' — ' + formatMontantForDemoNotif(c.Montant);
        consider('cotisation', c.ID, label, c.DateCreation);
      });
    }
    items.sort((a, b) => (b.date < a.date ? -1 : (b.date > a.date ? 1 : 0)));
    const count = items.filter(i => i.unread).length;
    return { count, items: items.slice(0, 30) };
  }

  function filterDemoForUser(user) {
    const restreint = (user.Role === 'Consultation' && user.RestreintAAdherents) || user.Role === 'Collecteur';
    if (!restreint) {
      return {
        adherents: demoAdherents.slice(),
        cotisations: demoCotisations.slice(),
        deces: demoDeces.slice(),
        depenses: demoDepenses.slice(),
        documents: demoDocuments.slice(),
        archives: { headers: demoArchivesHeaders.slice(), rows: demoArchivesRows.slice() }
      };
    }
    const mine = demoAdherents.filter(a => a.UtilisateurAffecteID === user.ID);
    const mineIds = new Set(mine.map(a => a.ID));
    return {
      adherents: mine,
      cotisations: demoCotisations.filter(c => mineIds.has(c.AdherentID)),
      deces: [], depenses: [], documents: [], archives: { headers: [], rows: [] }
    };
  }

  /* ---------------------------------------------------------------- */
  /* API Apps Script (fetch)                                          */
  /* ---------------------------------------------------------------- */

  // Rempli par remotePost() quand la réponse d'une action d'écriture contient
  // déjà l'état complet à jour (voir Code.gs, doPost) : evite à getAll() de
  // refaire un second aller-retour réseau (doGet) juste après une connexion
  // ou une modification, alors que le serveur vient de le renvoyer dans la
  // même réponse. Consommé une seule fois (voir getAll() plus bas), ce qui
  // correspond exactement au schéma d'utilisation de ce fichier : chaque
  // appel d'écriture est systématiquement suivi d'un seul rafraîchissement
  // (loadAll() dans app.js), jamais de plusieurs à la suite.
  let lastFreshState = null;

  async function remoteGetAll() {
    const sep = getApiUrl().includes('?') ? '&' : '?';
    const res = await fetch(getApiUrl() + sep + 'token=' + encodeURIComponent(getToken()), { method: 'GET' });
    if (!res.ok) throw new Error('Erreur réseau (' + res.status + ')');
    const json = await res.json();
    if (!json.success) {
      const err = new Error(json.error || 'Erreur inconnue');
      err.authRequired = !!json.authRequired;
      throw err;
    }
    return json;
  }

  async function remotePost(action, payload) {
    // Content-Type text/plain volontairement : évite le pré-vol CORS (preflight)
    // que Google Apps Script ne gère pas. Le corps est quand même du JSON,
    // parsé côté script avec JSON.parse(e.postData.contents). Le jeton de
    // session est ajouté automatiquement à chaque appel.
    const fullPayload = Object.assign({}, payload, { token: getToken() });
    const res = await fetch(getApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload: fullPayload })
    });
    if (!res.ok) throw new Error('Erreur réseau (' + res.status + ')');
    const json = await res.json();
    if (!json.success) {
      const err = new Error(json.error || 'Erreur inconnue');
      err.authRequired = !!json.authRequired;
      throw err;
    }
    if (json.state) lastFreshState = json.state;
    return json.data;
  }

  /* ---------------------------------------------------------------- */
  /* Authentification                                                  */
  /* ---------------------------------------------------------------- */

  async function login(nomUtilisateur, motDePasse) {
    if (isDemoMode()) {
      const username = String(nomUtilisateur || '').trim().toLowerCase();
      const user = demoUtilisateurs.find(u => u.NomUtilisateur.toLowerCase() === username);
      if (!user || user.MotDePasse !== motDePasse) {
        throw new Error('Nom d\'utilisateur ou mot de passe incorrect.');
      }
      demoSessionUserId = user.ID;
      setToken('demo-session');
      try { localStorage.setItem(DEMO_SESSION_USERNAME_KEY, user.NomUtilisateur); } catch (e) { /* ignore */ }
      return { token: 'demo-session', user: demoUserPublic(user) };
    }
    const data = await remotePost('login', { nomUtilisateur, motDePasse });
    setToken(data.token);
    return data;
  }

  async function logout() {
    if (isDemoMode()) {
      demoSessionUserId = null;
      setToken('');
      try { localStorage.removeItem(DEMO_SESSION_USERNAME_KEY); } catch (e) { /* ignore */ }
      return;
    }
    try { await remotePost('logout', {}); } catch (e) { /* best-effort */ }
    setToken('');
  }

  async function changePassword(ancienMotDePasse, nouveauMotDePasse) {
    if (isDemoMode()) {
      const user = currentDemoUser();
      if (!user) throw authRequiredError();
      if (user.MotDePasse !== ancienMotDePasse) throw new Error('Ancien mot de passe incorrect.');
      if (!nouveauMotDePasse || nouveauMotDePasse.length < 6) throw new Error('Le nouveau mot de passe doit contenir au moins 6 caractères.');
      user.MotDePasse = nouveauMotDePasse;
      user.DoitChangerMotDePasse = false;
      return { ok: true };
    }
    return remotePost('changePassword', { ancienMotDePasse, nouveauMotDePasse });
  }

  async function markNotificationsVues() {
    if (isDemoMode()) {
      const user = currentDemoUser();
      if (user) user.DerniereNotifVue = isoDate(new Date());
      return { ok: true };
    }
    return remotePost('markNotificationsVues', {});
  }

  // L'onglet Archives n'est plus renvoyé automatiquement à chaque connexion
  // ou modification (voir Code.gs, buildAppState_) — il est demandé à part,
  // seulement à l'ouverture de la page Archives (voir js/app.js, showView()).
  // En mode démo, filterDemoForUser calcule déjà tout instantanément (pas de
  // vrai coût réseau à économiser) : on réutilise donc simplement son résultat.
  async function getArchives() {
    if (isDemoMode()) {
      const user = currentDemoUser();
      if (!user) throw authRequiredError();
      return filterDemoForUser(user).archives;
    }
    return remotePost('getArchives', {});
  }

  /* ---------------------------------------------------------------- */
  /* Gestion des utilisateurs (Administrateur)                        */
  /* ---------------------------------------------------------------- */

  function demoRoleFromPayload(role) {
    if (role === 'Administrateur') return 'Administrateur';
    if (role === 'Collecteur') return 'Collecteur';
    return 'Consultation';
  }

  async function createUtilisateur(data) {
    if (isDemoMode()) {
      requireDemoAdmin();
      if (!data.motDePasse || data.motDePasse.length < 6) {
        throw new Error('Le mot de passe doit contenir au moins 6 caractères.');
      }
      let username, nomComplet = data.nomComplet || '', adherentLieId = '';
      if (data.typeCompte === 'adherent') {
        const a = demoAdherents.find(a2 => a2.ID === data.adherentLieId);
        if (!a) throw new Error('Choisissez l\'adhérent auquel lier ce compte.');
        adherentLieId = a.ID;
        username = generateDemoUsernameFromAdherent(a.Prenom, a.Nom);
        if (!nomComplet) nomComplet = `${a.Prenom || ''} ${a.Nom || ''}`.trim();
      } else {
        username = String(data.nomUtilisateur || '').trim();
        if (!username) throw new Error('Nom d\'utilisateur requis.');
        if (demoUtilisateurs.find(u => u.NomUtilisateur.toLowerCase() === username.toLowerCase())) {
          throw new Error('Ce nom d\'utilisateur existe déjà.');
        }
      }
      const rec = {
        ID: uid(), NomUtilisateur: username, NomComplet: nomComplet, MotDePasse: data.motDePasse,
        Role: demoRoleFromPayload(data.role),
        RestreintAAdherents: !!data.restreintAAdherents, DoitChangerMotDePasse: false,
        DerniereNotifVue: '', DateCreation: daysAgo(0), AdherentLieID: adherentLieId
      };
      demoUtilisateurs.push(rec);
      return { id: rec.ID, nomUtilisateur: username };
    }
    return remotePost('createUtilisateur', data);
  }

  async function updateUtilisateur(data) {
    if (isDemoMode()) {
      requireDemoAdmin();
      const rec = demoUtilisateurs.find(u => u.ID === data.id);
      if (rec) {
        rec.NomComplet = data.nomComplet || '';
        rec.Role = demoRoleFromPayload(data.role);
        rec.RestreintAAdherents = !!data.restreintAAdherents;
      }
      return { id: data.id };
    }
    return remotePost('updateUtilisateur', data);
  }

  async function resetPasswordUtilisateur(id) {
    if (isDemoMode()) {
      requireDemoAdmin();
      const rec = demoUtilisateurs.find(u => u.ID === id);
      if (!rec) throw new Error('Utilisateur introuvable.');
      const temp = 'Demo' + Math.floor(1000 + Math.random() * 9000);
      rec.MotDePasse = temp;
      rec.DoitChangerMotDePasse = true;
      return { temporaryPassword: temp };
    }
    return remotePost('resetPasswordUtilisateur', { id });
  }

  async function deleteUtilisateur(id) {
    if (isDemoMode()) {
      requireDemoAdmin();
      const rec = demoUtilisateurs.find(u => u.ID === id);
      if (rec && rec.Role === 'Administrateur') {
        const adminCount = demoUtilisateurs.filter(u => u.Role === 'Administrateur').length;
        if (adminCount <= 1) throw new Error('Impossible de supprimer le dernier compte Administrateur.');
      }
      const idx = demoUtilisateurs.findIndex(u => u.ID === id);
      if (idx !== -1) demoUtilisateurs.splice(idx, 1);
      demoAdherents.forEach(a => { if (a.UtilisateurAffecteID === id) a.UtilisateurAffecteID = ''; });
      return { id };
    }
    return remotePost('deleteUtilisateur', { id });
  }

  /* ---------------------------------------------------------------- */
  /* Configuration générale                                            */
  /* ---------------------------------------------------------------- */

  async function updateConfig(data) {
    if (isDemoMode()) {
      requireDemoAdmin();
      if (data.dossierDriveUrl !== undefined) demoConfig.DossierDriveUrl = data.dossierDriveUrl;
      if (data.dureeNotificationsJours !== undefined) {
        const j = parseInt(data.dureeNotificationsJours, 10);
        demoConfig.DureeNotificationsJours = j && j > 0 ? j : 3;
      }
      return { ok: true };
    }
    return remotePost('updateConfig', data);
  }

  /* ---------------------------------------------------------------- */
  /* API publique                                                      */
  /* ---------------------------------------------------------------- */

  async function getAll() {
    if (isDemoMode()) {
      const user = currentDemoUser();
      if (!user) throw authRequiredError();
      const filtered = filterDemoForUser(user);
      const result = {
        moi: demoUserPublic(user),
        adherents: filtered.adherents,
        cotisations: filtered.cotisations,
        deces: filtered.deces,
        depenses: filtered.depenses,
        documents: filtered.documents,
        archives: filtered.archives,
        notifications: computeDemoNotifications(user),
        config: { dureeNotificationsJours: demoConfig.DureeNotificationsJours }
      };
      if (user.Role === 'Administrateur') {
        result.utilisateurs = demoUtilisateurs.map(demoUserPublic);
        result.config.dossierDriveUrl = demoConfig.DossierDriveUrl;
      }
      return result;
    }
    // Une action d'écriture qui vient de se terminer (via remotePost) a déjà
    // reçu l'état complet et à jour dans sa propre réponse — inutile de
    // refaire un appel réseau séparé rien que pour le récupérer une seconde
    // fois. Ne s'applique qu'une fois : le prochain getAll() sans écriture
    // préalable repart normalement sur un vrai appel réseau.
    if (lastFreshState) {
      const state = lastFreshState;
      lastFreshState = null;
      return state;
    }
    return remoteGetAll();
  }

  async function createAdherent(data) {
    if (isDemoMode()) {
      requireDemoAdmin();
      const pj = pieceJointeToDemoRecord(data.pieceJointe);
      const rec = {
        ID: uid(), Civilite: data.civilite || '', Nom: data.nom, Prenom: data.prenom,
        Telephone: data.telephone || '', Email: data.email || '', DateAdhesion: data.dateAdhesion || '',
        Archive: '', DateCreation: daysAgo(0), UtilisateurAffecteID: data.utilisateurAffecteId || '',
        PieceJointeUrl: pj.url, PieceJointeNom: pj.nom
      };
      demoAdherents.push(rec);
      return rec;
    }
    return remotePost('createAdherent', data);
  }

  async function updateAdherent(data) {
    if (isDemoMode()) {
      requireDemoAdmin();
      const rec = demoAdherents.find(a => a.ID === data.id);
      if (rec) {
        const pj = pieceJointeToDemoRecord(data.pieceJointe, rec.PieceJointeUrl, rec.PieceJointeNom);
        rec.Civilite = data.civilite || ''; rec.Nom = data.nom; rec.Prenom = data.prenom;
        rec.Telephone = data.telephone || ''; rec.Email = data.email || '';
        rec.DateAdhesion = data.dateAdhesion || '';
        rec.UtilisateurAffecteID = data.utilisateurAffecteId || '';
        rec.PieceJointeUrl = pj.url; rec.PieceJointeNom = pj.nom;
      }
      return rec;
    }
    return remotePost('updateAdherent', data);
  }

  async function deleteAdherent(id) {
    if (isDemoMode()) {
      requireDemoAdmin();
      const idx = demoAdherents.findIndex(a => a.ID === id);
      if (idx !== -1) demoAdherents.splice(idx, 1);
      for (let i = demoCotisations.length - 1; i >= 0; i--) {
        if (demoCotisations[i].AdherentID === id) demoCotisations.splice(i, 1);
      }
      return { id };
    }
    return remotePost('deleteAdherent', { id });
  }

  // Archiver un adhérent le retire de la liste active sans toucher à ses cotisations
  // (contrairement à deleteAdherent, qui supprime aussi les cotisations liées).
  async function archiveAdherent(id) {
    if (isDemoMode()) {
      requireDemoAdmin();
      const rec = demoAdherents.find(a => a.ID === id);
      if (rec) rec.Archive = '1';
      return { id };
    }
    return remotePost('archiveAdherent', { id });
  }

  async function unarchiveAdherent(id) {
    if (isDemoMode()) {
      requireDemoAdmin();
      const rec = demoAdherents.find(a => a.ID === id);
      if (rec) rec.Archive = '';
      return { id };
    }
    return remotePost('unarchiveAdherent', { id });
  }

  async function createCotisation(data) {
    if (isDemoMode()) {
      const user = requireDemoCotisationWriter();
      let statutValidation = 'Valide';
      if (user.Role === 'Collecteur') {
        const a = demoAdherents.find(a2 => a2.ID === data.adherentId);
        if (!a) throw new Error('Adhérent introuvable.');
        if (a.UtilisateurAffecteID !== user.ID) {
          throw new Error('Vous ne pouvez saisir une cotisation que pour vos adhérents affectés.');
        }
        statutValidation = 'EnAttente';
      }
      const rec = {
        ID: uid(), AdherentID: data.adherentId, Montant: Number(data.montant),
        Date: data.date, Statut: data.statut,
        StatutValidation: statutValidation, CreeParUtilisateurID: user.ID, DateCreation: daysAgo(0)
      };
      demoCotisations.push(rec);
      return rec;
    }
    return remotePost('createCotisation', data);
  }

  async function updateCotisation(data) {
    if (isDemoMode()) {
      requireDemoAdmin();
      const rec = demoCotisations.find(c => c.ID === data.id);
      if (rec) {
        rec.Montant = Number(data.montant); rec.Date = data.date; rec.Statut = data.statut;
        // StatutValidation/CreeParUtilisateurID/DateCreation restent inchangés.
      }
      return rec;
    }
    return remotePost('updateCotisation', data);
  }

  async function deleteCotisation(id) {
    if (isDemoMode()) {
      requireDemoAdmin();
      const idx = demoCotisations.findIndex(c => c.ID === id);
      if (idx !== -1) demoCotisations.splice(idx, 1);
      return { id };
    }
    return remotePost('deleteCotisation', { id });
  }

  async function validateCotisation(id) {
    if (isDemoMode()) {
      requireDemoAdmin();
      const rec = demoCotisations.find(c => c.ID === id);
      if (!rec) throw new Error('Cotisation introuvable.');
      rec.StatutValidation = 'Valide';
      return { id };
    }
    return remotePost('validateCotisation', { id });
  }

  async function createDeces(data) {
    if (isDemoMode()) {
      requireDemoAdmin();
      const pj = pieceJointeToDemoRecord(data.pieceJointe);
      const rec = {
        ID: uid(), Nom: data.nom, Prenom: data.prenom,
        CoutFuneraire: Number(data.coutFuneraire), Date: data.date,
        PieceJointeUrl: pj.url, PieceJointeNom: pj.nom, DateCreation: daysAgo(0)
      };
      demoDeces.push(rec);
      return rec;
    }
    return remotePost('createDeces', data);
  }

  async function updateDeces(data) {
    if (isDemoMode()) {
      requireDemoAdmin();
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
      requireDemoAdmin();
      const idx = demoDeces.findIndex(d => d.ID === id);
      if (idx !== -1) demoDeces.splice(idx, 1);
      return { id };
    }
    return remotePost('deleteDeces', { id });
  }

  async function createDepense(data) {
    if (isDemoMode()) {
      requireDemoAdmin();
      const pj = pieceJointeToDemoRecord(data.pieceJointe);
      const rec = {
        ID: uid(), Date: data.date, Nature: data.nature, Montant: Number(data.montant),
        PieceJointeUrl: pj.url, PieceJointeNom: pj.nom, DateCreation: daysAgo(0)
      };
      demoDepenses.push(rec);
      return rec;
    }
    return remotePost('createDepense', data);
  }

  async function updateDepense(data) {
    if (isDemoMode()) {
      requireDemoAdmin();
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
      requireDemoAdmin();
      const idx = demoDepenses.findIndex(d => d.ID === id);
      if (idx !== -1) demoDepenses.splice(idx, 1);
      return { id };
    }
    return remotePost('deleteDepense', { id });
  }

  async function createDocument(data) {
    if (isDemoMode()) {
      requireDemoAdmin();
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
      requireDemoAdmin();
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
      requireDemoAdmin();
      const idx = demoDocuments.findIndex(d => d.ID === id);
      if (idx !== -1) demoDocuments.splice(idx, 1);
      return { id };
    }
    return remotePost('deleteDocument', { id });
  }

  return {
    getApiUrl, setApiUrl, isDemoMode, getAll,
    login, logout, changePassword, markNotificationsVues, getArchives,
    createUtilisateur, updateUtilisateur, resetPasswordUtilisateur, deleteUtilisateur,
    updateConfig,
    createAdherent, updateAdherent, deleteAdherent, archiveAdherent, unarchiveAdherent,
    createCotisation, updateCotisation, deleteCotisation, validateCotisation,
    createDeces, updateDeces, deleteDeces,
    createDepense, updateDepense, deleteDepense,
    createDocument, updateDocument, deleteDocument
  };
})();
