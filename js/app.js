/**
 * Logique de l'application "Caisse".
 */

const state = {
  adherents: [],
  cotisations: [],
  deces: [],
  depenses: [],
  documents: [],
  archives: { headers: [], rows: [] },
  archivesFilters: {},
  selectedId: null,
  editingCotisationId: null,
  currentView: 'adherents',
  moi: null,
  utilisateurs: [],
  notifications: { count: 0, items: [] },
  editingUtilisateurId: null
};

// isReadOnly() = vrai pour tout compte qui ne peut faire aucune écriture
// "administrateur" (adhérents, décès, dépenses, documents, utilisateurs,
// configuration, modification/suppression de cotisations) — donc Consultation
// ET Collecteur. Un compte Collecteur a une unique capacité d'écriture, plus
// étroite : ajouter une cotisation (voir canAddCotisation()) — d'où un
// helper séparé plutôt que d'élargir isReadOnly().
function isReadOnly() {
  return !state.moi || state.moi.role !== 'Administrateur';
}

function isAdmin() {
  return !!(state.moi && state.moi.role === 'Administrateur');
}

function isCollecteur() {
  return !!(state.moi && state.moi.role === 'Collecteur');
}

function canAddCotisation() {
  return isAdmin() || isCollecteur();
}

function cotisationEstValidee(c) {
  return !c.StatutValidation || c.StatutValidation === 'Valide';
}

const STATUT_LABELS = {
  'Travail': 'Travail',
  'Sans travail': 'Sans travail',
  'Malade': 'Malade',
  'Retraite': 'Retraite',
  'Conges': 'Congés',
  'Etudiant': 'Étudiant'
};

/* ---------------------------------------------------------------------- */
/* Helpers                                                                 */
/* ---------------------------------------------------------------------- */

const $ = (id) => document.getElementById(id);

function formatMontant(n) {
  return Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function formatDate(d) {
  if (!d) return '';
  const parts = String(d).split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

function yearOf(dateStr) {
  if (!dateStr) return null;
  const y = String(dateStr).split('-')[0];
  return /^\d{4}$/.test(y) ? y : null;
}

function showToast(message, isError) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.toggle('error', !!isError);
  toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add('hidden'), 3200);
}

function adherentName(a) {
  return `${a.Nom || ''} ${a.Prenom || ''}`.trim();
}

function isArchived(a) {
  const v = a && a.Archive;
  if (v === undefined || v === null || v === '') return false;
  const s = String(v).trim().toLowerCase();
  return s !== '' && s !== '0' && s !== 'false' && s !== 'non';
}

/* ---------------------------------------------------------------------- */
/* Thème clair / sombre                                                    */
/* ---------------------------------------------------------------------- */
/* Le thème initial est déjà posé sur <html data-theme="..."> par le script
   inline dans <head> (avant le chargement du CSS, pour éviter un flash).
   Ici on se contente de refléter cet état sur le bouton et de gérer le clic. */

const THEME_KEY = 'caisse.theme';

function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* stockage indisponible : on ignore */ }
  const btn = $('btn-theme-toggle');
  if (btn) btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  const meta = $('meta-theme-color');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#141a15' : '#2f6f4f');
}

function toggleTheme() {
  applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

function initTheme() {
  applyTheme(getTheme());
  const btn = $('btn-theme-toggle');
  if (btn) btn.addEventListener('click', toggleTheme);
}

/* ---------------------------------------------------------------------- */
/* Chargement des données                                                  */
/* ---------------------------------------------------------------------- */

async function loadAll(preserveSelection) {
  const loadingEl = $('app-loading');
  if (loadingEl) loadingEl.classList.remove('hidden');
  try {
    const data = await Api.getAll();
    state.moi = data.moi || null;
    state.adherents = data.adherents || [];
    state.cotisations = data.cotisations || [];
    state.deces = data.deces || [];
    state.depenses = data.depenses || [];
    state.documents = data.documents || [];
    state.archives = data.archives || { headers: [], rows: [] };
    state.utilisateurs = data.utilisateurs || [];
    state.notifications = data.notifications || { count: 0, items: [] };
    state.config = data.config || {};
    if (!preserveSelection || !state.adherents.find(a => a.ID === state.selectedId)) {
      state.selectedId = preserveSelection ? state.selectedId : null;
    }
    hideLoginScreen();
    renderDemoBadge();
    applyRoleUI();
    renderAdherentsTable();
    renderDashboard();
    renderDetails();
    renderDeces();
    renderDepenses();
    renderRapports();
    renderDocuments();
    renderArchives();
    renderArchivedAdherents();
    renderNotifications();
    renderUtilisateurs();
    renderValidation();
    if (state.moi && state.moi.doitChangerMotDePasse) {
      openForcePasswordModal();
    }
  } catch (err) {
    if (err.authRequired) {
      showLoginScreen();
    } else {
      showToast('Erreur de chargement : ' + err.message, true);
    }
  } finally {
    if (loadingEl) loadingEl.classList.add('hidden');
  }
}

function renderDemoBadge() {
  $('demo-badge').classList.toggle('hidden', !Api.isDemoMode());
}

/* ---------------------------------------------------------------------- */
/* Connexion / rôles                                                       */
/* ---------------------------------------------------------------------- */

function showLoginScreen() {
  $('app-shell').classList.add('hidden');
  $('login-screen').classList.remove('hidden');
  $('login-demo-hint').classList.toggle('hidden', !Api.isDemoMode());
  setTimeout(() => { const el = $('login-username'); if (el) el.focus(); }, 0);
}

function hideLoginScreen() {
  $('login-screen').classList.add('hidden');
  $('app-shell').classList.remove('hidden');
}

async function handleLoginSubmit(evt) {
  evt.preventDefault();
  const username = $('login-username').value.trim();
  const password = $('login-password').value;
  $('login-error').classList.add('hidden');
  try {
    await Api.login(username, password);
    $('login-form').reset();
    await loadAll(false);
  } catch (err) {
    $('login-error').textContent = err.message;
    $('login-error').classList.remove('hidden');
  }
}

async function handleLogout() {
  closeMainMenu();
  try {
    await Api.logout();
  } catch (err) { /* best-effort */ }
  state.moi = null;
  state.adherents = [];
  state.cotisations = [];
  state.selectedId = null;
  showLoginScreen();
}

function openForcePasswordModal() {
  $('force-password-form').reset();
  $('force-password-modal').classList.remove('hidden');
}

function closeForcePasswordModal() {
  $('force-password-modal').classList.add('hidden');
}

async function handleForcePasswordSubmit(evt) {
  evt.preventDefault();
  try {
    await Api.changePassword($('fp-ancien').value, $('fp-nouveau').value);
    closeForcePasswordModal();
    showToast('Mot de passe mis à jour.');
    await loadAll(true);
  } catch (err) {
    showToast('Erreur : ' + err.message, true);
  }
}

/**
 * Affiche/masque les éléments d'écriture selon le rôle du compte connecté, et
 * les sections réservées à un compte restreint à ses adhérents affectés.
 * Cette vérification côté interface est un confort d'usage : le serveur
 * refuse de toute façon toute écriture qui ne viendrait pas d'un compte
 * Administrateur, même si ces boutons étaient forcés visibles.
 */
function applyRoleUI() {
  const readOnly = isReadOnly();
  document.body.classList.toggle('role-readonly', readOnly);

  ['btn-new', 'btn-delete', 'btn-archive',
    'btn-new-deces', 'btn-new-depense', 'btn-new-document', 'btn-new-utilisateur'
  ].forEach(id => { const el = $(id); if (el) el.classList.toggle('hidden', readOnly); });

  // « Modifier » et le formulaire de cotisations restent visibles pour un
  // Collecteur (seule sa capacité d'ajouter une cotisation), pas pour un
  // compte Consultation (lecture seule).
  const canCotiser = canAddCotisation();
  const btnEdit = $('btn-edit');
  if (btnEdit) btnEdit.classList.toggle('hidden', !canCotiser);
  const cotisationForm = $('cotisation-form');
  if (cotisationForm) cotisationForm.classList.toggle('hidden', !canCotiser);

  const settingsAdmin = $('settings-admin-section');
  if (settingsAdmin) settingsAdmin.classList.toggle('hidden', readOnly);

  const affWrap = $('a-utilisateur-affecte-wrap');
  if (affWrap) affWrap.classList.toggle('hidden', readOnly);

  const admin = isAdmin();
  const menuUtilisateurs = $('menu-utilisateurs');
  if (menuUtilisateurs) menuUtilisateurs.classList.toggle('hidden', !admin);
  // « Cotisations à valider » : réservé aux Administrateurs, à la fois dans
  // le menu complet et dans l'onglet raccourci de la barre mobile.
  ['menu-validation', 'tab-validation'].forEach(id => {
    const el = $(id);
    if (el) el.classList.toggle('hidden', !admin);
  });

  const restreint = !!(state.moi && (state.moi.restreintAAdherents || state.moi.role === 'Collecteur'));
  // Idem pour Archives/Documents : masqués à la fois dans le menu complet
  // et dans les onglets raccourcis de la barre mobile pour un compte
  // restreint (Consultation restreint ou Collecteur).
  ['menu-declarations', 'menu-rapports', 'menu-documents', 'menu-archives', 'tab-documents', 'tab-archives'].forEach(id => {
    const el = $(id);
    if (el) el.classList.toggle('hidden', restreint);
  });
  // Si la vue actuellement affichée vient d'être masquée (ex: compte restreint
  // qui n'a plus accès à Rapports), on revient sur Adhérents pour éviter une
  // page vide inaccessible depuis le menu.
  if (restreint && ['declarations', 'rapports', 'documents', 'archives'].includes(state.currentView)) {
    showView('adherents');
  }
  if (!admin && state.currentView === 'validation') {
    showView('adherents');
  }
}

/* ---------------------------------------------------------------------- */
/* Notifications                                                           */
/* ---------------------------------------------------------------------- */

const NOTIF_TYPE_LABELS = { adherent: 'Nouvel adhérent', deces: 'Décès déclaré', depense: 'Dépense déclarée', cotisation: 'Cotisation à valider' };
const NOTIF_TYPE_ICONS = { adherent: '🧑', deces: '⚰️', depense: '💶', cotisation: '🧾' };

function renderNotifications() {
  const { count, items } = state.notifications;
  const badge = $('notif-badge');
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }

  const list = $('notif-list');
  list.innerHTML = '';
  for (const item of items) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'notif-item' + (item.unread ? ' notif-item-unread' : '');
    row.innerHTML = `
      <span class="notif-item-icon" aria-hidden="true">${NOTIF_TYPE_ICONS[item.type] || '🔔'}</span>
      <span class="notif-item-body">
        <span class="notif-item-label">${escapeHtml(NOTIF_TYPE_LABELS[item.type] || 'Notification')} — ${escapeHtml(item.label || '')}</span>
        <span class="notif-item-date">${escapeHtml(formatDate(item.date))}</span>
      </span>
    `;
    row.addEventListener('click', () => {
      closeNotifDropdown();
      if (item.type === 'adherent') {
        showView('adherents');
        selectAdherent(item.id);
      } else if (item.type === 'cotisation') {
        showView('validation');
      } else {
        showView('declarations');
      }
    });
    list.appendChild(row);
  }
  $('notif-empty').classList.toggle('hidden', items.length !== 0);
}

function openNotifDropdown() {
  closeMainMenu();
  $('notif-dropdown').classList.remove('hidden');
  $('btn-notifications').setAttribute('aria-expanded', 'true');
  if (state.notifications.count > 0) {
    Api.markNotificationsVues().then(() => {
      state.notifications.items.forEach(i => { i.unread = false; });
      state.notifications.count = 0;
      renderNotifications();
    }).catch(() => {});
  }
}

function closeNotifDropdown() {
  $('notif-dropdown').classList.add('hidden');
  $('btn-notifications').setAttribute('aria-expanded', 'false');
}

function toggleNotifDropdown() {
  if ($('notif-dropdown').classList.contains('hidden')) openNotifDropdown();
  else closeNotifDropdown();
}

/* ---------------------------------------------------------------------- */
/* Menu de navigation / vues                                               */
/* ---------------------------------------------------------------------- */

function showView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const target = $('view-' + viewName);
  if (target) target.classList.remove('hidden');
  document.querySelectorAll('.menu-item[data-view], .mobile-tab-item[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });
  state.currentView = viewName;
  closeMainMenu();
}

function openMainMenu() {
  closeNotifDropdown();
  $('main-menu').classList.remove('hidden');
  $('btn-menu').setAttribute('aria-expanded', 'true');
}

function closeMainMenu() {
  $('main-menu').classList.add('hidden');
  $('btn-menu').setAttribute('aria-expanded', 'false');
}

function toggleMainMenu() {
  if ($('main-menu').classList.contains('hidden')) openMainMenu();
  else closeMainMenu();
}

/* ---------------------------------------------------------------------- */
/* Liste des adhérents                                                     */
/* ---------------------------------------------------------------------- */

function filteredAdherents() {
  const q = $('search-input').value.trim().toLowerCase();
  let list = state.adherents.filter(a => !isArchived(a)).sort((a, b) => adherentName(a).localeCompare(adherentName(b), 'fr'));
  if (!q) return list;
  return list.filter(a =>
    (a.Nom || '').toLowerCase().includes(q) ||
    (a.Prenom || '').toLowerCase().includes(q)
  );
}

function renderAdherentsTable() {
  const tbody = $('adherents-tbody');
  const list = filteredAdherents();
  tbody.innerHTML = '';
  $('empty-list').classList.toggle('hidden', list.length !== 0);

  for (const a of list) {
    const tr = document.createElement('tr');
    tr.dataset.id = a.ID;
    if (a.ID === state.selectedId) tr.classList.add('selected');
    tr.innerHTML = `<td>${escapeHtml(a.Civilite || '—')}</td><td>${escapeHtml(a.Nom || '')}</td><td>${escapeHtml(a.Prenom || '')}</td>`;
    tr.addEventListener('click', () => selectAdherent(a.ID));
    tbody.appendChild(tr);
  }

  const hasSelection = !!state.selectedId;
  $('btn-edit').disabled = !hasSelection;
  $('btn-delete').disabled = !hasSelection;
  $('btn-archive').disabled = !hasSelection;
}

function selectAdherent(id) {
  state.selectedId = id;
  cancelCotisationEdit();
  renderAdherentsTable();
  renderDetails();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ---------------------------------------------------------------------- */
/* Tableau de bord                                                         */
/* ---------------------------------------------------------------------- */

function renderDashboard() {
  const validees = state.cotisations.filter(cotisationEstValidee);
  const total = validees.reduce((sum, c) => sum + Number(c.Montant || 0), 0);
  $('stat-total').textContent = formatMontant(total);
  $('stat-count').textContent = state.adherents.filter(a => !isArchived(a)).length;

  const byYear = {};
  for (const c of validees) {
    const y = yearOf(c.Date) || '—';
    if (!byYear[y]) byYear[y] = { count: 0, total: 0 };
    byYear[y].count += 1;
    byYear[y].total += Number(c.Montant || 0);
  }
  const years = Object.keys(byYear).sort((a, b) => b.localeCompare(a));

  const tbody = $('year-tbody');
  tbody.innerHTML = '';
  for (const y of years) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(y)}</td><td>${byYear[y].count}</td><td>${formatMontant(byYear[y].total)}</td>`;
    tbody.appendChild(tr);
  }
  $('empty-years').classList.toggle('hidden', years.length !== 0);
}

/* ---------------------------------------------------------------------- */
/* Détails adhérent + cotisations                                          */
/* ---------------------------------------------------------------------- */

function currentAdherent() {
  return state.adherents.find(a => a.ID === state.selectedId) || null;
}

function renderDetails() {
  const a = currentAdherent();
  $('details-empty').classList.toggle('hidden', !!a);
  $('details-content').classList.toggle('hidden', !a);
  if (!a) return;

  $('d-civilite').textContent = a.Civilite || '—';
  $('d-nom').textContent = a.Nom || '';
  $('d-prenom').textContent = a.Prenom || '';
  $('d-telephone').textContent = a.Telephone || '—';
  $('d-email').textContent = a.Email || '—';
  $('d-date-adhesion').textContent = formatDate(a.DateAdhesion) || '—';
  $('d-piece-jointe').innerHTML = pjCellHtml(a.PieceJointeUrl, a.PieceJointeNom);

  const affWrap = $('d-utilisateur-affecte-wrap');
  if (!isReadOnly()) {
    affWrap.classList.remove('hidden');
    const affecte = state.utilisateurs.find(u => u.id === a.UtilisateurAffecteID);
    $('d-utilisateur-affecte').textContent = affecte ? (affecte.nomComplet || affecte.nomUtilisateur) : '—';
  } else {
    affWrap.classList.add('hidden');
  }

  const cots = state.cotisations
    .filter(c => c.AdherentID === a.ID)
    .sort((x, y) => (y.Date || '').localeCompare(x.Date || ''));

  const totalCotise = cots.filter(cotisationEstValidee).reduce((s, c) => s + Number(c.Montant || 0), 0);
  $('d-total-cotise').textContent = formatMontant(totalCotise);

  const tbody = $('cotisations-tbody');
  tbody.innerHTML = '';
  for (const c of cots) {
    const enAttente = !cotisationEstValidee(c);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(formatDate(c.Date))}</td>
      <td>${formatMontant(c.Montant)}</td>
      <td>${escapeHtml(STATUT_LABELS[c.Statut] || c.Statut || '')}</td>
      <td>${enAttente ? '<span class="status-badge status-badge-attente">En attente</span>' : ''}</td>
      <td class="row-actions"></td>
    `;
    if (!isReadOnly()) {
      const actionsTd = tr.querySelector('.row-actions');
      const editBtn = document.createElement('button');
      editBtn.textContent = 'Modifier';
      editBtn.className = 'btn btn-secondary btn-sm';
      editBtn.addEventListener('click', () => startEditCotisation(c));

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Supprimer';
      delBtn.className = 'btn btn-danger btn-sm';
      delBtn.addEventListener('click', () => confirmDeleteCotisation(c));

      actionsTd.appendChild(editBtn);
      actionsTd.appendChild(delBtn);
    }
    tbody.appendChild(tr);
  }
  $('empty-cotisations').classList.toggle('hidden', cots.length !== 0);
}

function startEditCotisation(c) {
  state.editingCotisationId = c.ID;
  $('cot-id').value = c.ID;
  $('cot-montant').value = c.Montant;
  $('cot-date').value = c.Date;
  $('cot-statut').value = c.Statut;
  $('cot-submit-btn').textContent = 'Enregistrer';
  $('cot-cancel-btn').classList.remove('hidden');
}

function cancelCotisationEdit() {
  state.editingCotisationId = null;
  $('cotisation-form').reset();
  $('cot-id').value = '';
  $('cot-submit-btn').textContent = 'Ajouter';
  $('cot-cancel-btn').classList.add('hidden');
}

async function confirmDeleteCotisation(c) {
  openConfirmModal(
    `Supprimer la cotisation de ${formatMontant(c.Montant)} du ${formatDate(c.Date)} ?`,
    async () => {
      try {
        await Api.deleteCotisation(c.ID);
        showToast('Cotisation supprimée.');
        await loadAll(true);
      } catch (err) {
        showToast('Erreur : ' + err.message, true);
      }
    }
  );
}

/* ---------------------------------------------------------------------- */
/* État PDF d'un adhérent                                                   */
/* ---------------------------------------------------------------------- */

const ACCENT_MARKS_RE = new RegExp('[̀-ͯ]', 'g');

function pdfFileNameFor(a) {
  const raw = `etat-${a.Nom || 'adherent'}-${a.Prenom || ''}`.trim();
  return raw
    .toLowerCase()
    .normalize('NFD').replace(ACCENT_MARKS_RE, '') // enlève les accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') + '.pdf';
}

function generateAdherentPdf(a) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    showToast('Le générateur de PDF n\'a pas pu se charger (vérifiez votre connexion internet).', true);
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const marginLeft = 14;
  const pageBottom = 280;
  let y = 20;

  // Seules les cotisations validées figurent dans cet état officiel (une
  // cotisation en attente de validation d'un compte Collecteur n'y apparaît
  // pas encore, ni dans le total).
  const cots = state.cotisations
    .filter(c => c.AdherentID === a.ID && cotisationEstValidee(c))
    .sort((x, y2) => (y2.Date || '').localeCompare(x.Date || ''));
  const total = cots.reduce((s, c) => s + Number(c.Montant || 0), 0);

  doc.setFontSize(16);
  doc.text('Caisse — État de l\'adhérent', marginLeft, y);
  y += 8;
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(`Édité le ${formatDate(new Date().toISOString().slice(0, 10))}`, marginLeft, y);
  doc.setTextColor(0, 0, 0);
  y += 12;

  doc.setFontSize(13);
  doc.text(`${a.Civilite ? a.Civilite + ' ' : ''}${adherentName(a)}`.trim(), marginLeft, y);
  y += 8;

  doc.setFontSize(10);
  const infoLines = [
    `Téléphone : ${a.Telephone || '—'}`,
    `Email : ${a.Email || '—'}`,
    `Date d'adhésion : ${formatDate(a.DateAdhesion) || '—'}`,
    `Total cotisé : ${formatMontant(total)}`
  ];
  for (const line of infoLines) {
    doc.text(line, marginLeft, y);
    y += 6;
  }
  y += 6;

  doc.setFontSize(12);
  doc.text('Historique des cotisations', marginLeft, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text('Date', marginLeft, y);
  doc.text('Montant', marginLeft + 55, y);
  doc.text('Statut', marginLeft + 105, y);
  doc.setFont(undefined, 'normal');
  y += 2;
  doc.line(marginLeft, y, 196, y);
  y += 6;

  if (cots.length === 0) {
    doc.text('Aucune cotisation enregistrée.', marginLeft, y);
    y += 6;
  } else {
    for (const c of cots) {
      if (y > pageBottom) {
        doc.addPage();
        y = 20;
      }
      doc.text(formatDate(c.Date) || '—', marginLeft, y);
      doc.text(formatMontant(c.Montant), marginLeft + 55, y);
      doc.text(STATUT_LABELS[c.Statut] || c.Statut || '', marginLeft + 105, y);
      y += 6;
    }
  }

  const fileName = pdfFileNameFor(a);

  // Ouvre le PDF dans un nouvel onglet pour la visualisation (l'utilisateur
  // peut ensuite le télécharger/imprimer depuis la visionneuse du navigateur).
  // Si la fenêtre est bloquée par le navigateur, on télécharge directement à la place.
  try {
    const blobUrl = doc.output('bloburl');
    const win = window.open(blobUrl, '_blank');
    if (!win) {
      doc.save(fileName);
    }
  } catch (err) {
    doc.save(fileName);
  }
}

/* ---------------------------------------------------------------------- */
/* Adhérents archivés                                                      */
/* ---------------------------------------------------------------------- */

function renderArchivedAdherents() {
  const list = state.adherents.filter(isArchived).sort((a, b) => adherentName(a).localeCompare(adherentName(b), 'fr'));
  $('stat-archived-count').textContent = list.length;

  const tbody = $('archived-adherents-tbody');
  tbody.innerHTML = '';
  for (const a of list) {
    const total = state.cotisations
      .filter(c => c.AdherentID === a.ID && cotisationEstValidee(c))
      .reduce((s, c) => s + Number(c.Montant || 0), 0);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(a.Civilite || '—')}</td>
      <td>${escapeHtml(a.Nom || '')}</td>
      <td>${escapeHtml(a.Prenom || '')}</td>
      <td>${formatMontant(total)}</td>
      <td class="row-actions"></td>
    `;
    if (!isReadOnly()) {
      const actionsTd = tr.querySelector('.row-actions');
      const reactivateBtn = document.createElement('button');
      reactivateBtn.textContent = 'Réactiver';
      reactivateBtn.className = 'btn btn-secondary btn-sm';
      reactivateBtn.addEventListener('click', () => {
        openConfirmModal(`Réactiver ${adherentName(a)} ? Il/elle réapparaîtra dans la liste des adhérents.`, async () => {
          try {
            await Api.unarchiveAdherent(a.ID);
            showToast('Adhérent réactivé.');
            await loadAll(false);
          } catch (err) {
            showToast('Erreur : ' + err.message, true);
          }
        });
      });
      actionsTd.appendChild(reactivateBtn);
    }
    tbody.appendChild(tr);
  }
  $('empty-archived-adherents').classList.toggle('hidden', list.length !== 0);
}

/* ---------------------------------------------------------------------- */
/* Pièce jointe : lecture d'un <input type="file"> en base64                */
/* ---------------------------------------------------------------------- */

function fileInputToPieceJointe(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result; // "data:<mime>;base64,<data>"
      const base64 = String(dataUrl).split(',')[1] || '';
      resolve({ name: file.name, mimeType: file.type || 'application/octet-stream', base64 });
    };
    reader.onerror = () => reject(new Error('Impossible de lire le fichier sélectionné.'));
    reader.readAsDataURL(file);
  });
}

function pjCellHtml(url, nom) {
  if (!url) return '<span class="pj-none">—</span>';
  return `<a class="pj-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(nom || 'Voir')}</a>`;
}

/* ---------------------------------------------------------------------- */
/* Décès                                                                   */
/* ---------------------------------------------------------------------- */

function renderDeces() {
  const list = state.deces.slice().sort((a, b) => (b.Date || '').localeCompare(a.Date || ''));
  const total = list.reduce((s, d) => s + Number(d.CoutFuneraire || 0), 0);
  $('stat-deces-total').textContent = formatMontant(total);

  const tbody = $('deces-tbody');
  tbody.innerHTML = '';
  for (const d of list) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(d.Nom || '')}</td>
      <td>${escapeHtml(d.Prenom || '')}</td>
      <td>${formatMontant(d.CoutFuneraire)}</td>
      <td>${escapeHtml(formatDate(d.Date))}</td>
      <td>${pjCellHtml(d.PieceJointeUrl, d.PieceJointeNom)}</td>
      <td class="row-actions"></td>
    `;
    if (!isReadOnly()) {
      const actionsTd = tr.querySelector('.row-actions');
      const editBtn = document.createElement('button');
      editBtn.textContent = 'Modifier';
      editBtn.className = 'btn btn-secondary btn-sm';
      editBtn.addEventListener('click', () => openDecesModal(d));

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Supprimer';
      delBtn.className = 'btn btn-danger btn-sm';
      delBtn.addEventListener('click', () => {
        openConfirmModal(`Supprimer la déclaration de décès de ${d.Nom} ${d.Prenom} ?`, async () => {
          try {
            await Api.deleteDeces(d.ID);
            showToast('Déclaration de décès supprimée.');
            await loadAll(true);
          } catch (err) {
            showToast('Erreur : ' + err.message, true);
          }
        });
      });

      actionsTd.appendChild(editBtn);
      actionsTd.appendChild(delBtn);
    }
    tbody.appendChild(tr);
  }
  $('empty-deces').classList.toggle('hidden', list.length !== 0);
}

function openDecesModal(record) {
  $('deces-form').reset();
  $('dc-fichier-actuel').classList.add('hidden');
  if (record) {
    $('deces-modal-title').textContent = 'Modifier la déclaration de décès';
    $('dc-id').value = record.ID;
    $('dc-nom').value = record.Nom || '';
    $('dc-prenom').value = record.Prenom || '';
    $('dc-cout').value = record.CoutFuneraire;
    $('dc-date').value = record.Date || '';
    if (record.PieceJointeUrl) {
      $('dc-fichier-actuel').textContent = 'Pièce jointe actuelle : ' + (record.PieceJointeNom || 'fichier') + ' (laisser vide pour la conserver)';
      $('dc-fichier-actuel').classList.remove('hidden');
    }
  } else {
    $('deces-modal-title').textContent = 'Déclarer un décès';
    $('dc-id').value = '';
  }
  $('deces-modal').classList.remove('hidden');
  $('dc-nom').focus();
}

function closeDecesModal() {
  $('deces-modal').classList.add('hidden');
}

async function handleDecesSubmit(evt) {
  evt.preventDefault();
  const id = $('dc-id').value;
  try {
    const pieceJointe = await fileInputToPieceJointe($('dc-fichier'));
    const existing = id ? state.deces.find(d => d.ID === id) : null;
    const data = {
      nom: $('dc-nom').value.trim(),
      prenom: $('dc-prenom').value.trim(),
      coutFuneraire: $('dc-cout').value,
      date: $('dc-date').value,
      pieceJointe: pieceJointe,
      pieceJointeUrl: existing ? existing.PieceJointeUrl : '',
      pieceJointeNom: existing ? existing.PieceJointeNom : ''
    };
    if (id) {
      data.id = id;
      await Api.updateDeces(data);
      showToast('Déclaration de décès modifiée.');
    } else {
      await Api.createDeces(data);
      showToast('Décès déclaré.');
    }
    closeDecesModal();
    await loadAll(true);
  } catch (err) {
    showToast('Erreur : ' + err.message, true);
  }
}

/* ---------------------------------------------------------------------- */
/* Dépenses                                                                */
/* ---------------------------------------------------------------------- */

function renderDepenses() {
  const list = state.depenses.slice().sort((a, b) => (b.Date || '').localeCompare(a.Date || ''));
  const total = list.reduce((s, d) => s + Number(d.Montant || 0), 0);
  $('stat-depenses-total').textContent = formatMontant(total);
  $('stat-depenses-count').textContent = list.length;

  const tbody = $('depenses-tbody');
  tbody.innerHTML = '';
  for (const d of list) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(formatDate(d.Date))}</td>
      <td>${escapeHtml(d.Nature || '')}</td>
      <td>${formatMontant(d.Montant)}</td>
      <td>${pjCellHtml(d.PieceJointeUrl, d.PieceJointeNom)}</td>
      <td class="row-actions"></td>
    `;
    if (!isReadOnly()) {
      const actionsTd = tr.querySelector('.row-actions');
      const editBtn = document.createElement('button');
      editBtn.textContent = 'Modifier';
      editBtn.className = 'btn btn-secondary btn-sm';
      editBtn.addEventListener('click', () => openDepenseModal(d));

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Supprimer';
      delBtn.className = 'btn btn-danger btn-sm';
      delBtn.addEventListener('click', () => {
        openConfirmModal(`Supprimer la dépense « ${d.Nature} » du ${formatDate(d.Date)} ?`, async () => {
          try {
            await Api.deleteDepense(d.ID);
            showToast('Dépense supprimée.');
            await loadAll(true);
          } catch (err) {
            showToast('Erreur : ' + err.message, true);
          }
        });
      });

      actionsTd.appendChild(editBtn);
      actionsTd.appendChild(delBtn);
    }
    tbody.appendChild(tr);
  }
  $('empty-depenses').classList.toggle('hidden', list.length !== 0);
}

function openDepenseModal(record) {
  $('depense-form').reset();
  $('dp-fichier-actuel').classList.add('hidden');
  if (record) {
    $('depense-modal-title').textContent = 'Modifier la dépense';
    $('dp-id').value = record.ID;
    $('dp-date').value = record.Date || '';
    $('dp-nature').value = record.Nature || '';
    $('dp-montant').value = record.Montant;
    if (record.PieceJointeUrl) {
      $('dp-fichier-actuel').textContent = 'Pièce jointe actuelle : ' + (record.PieceJointeNom || 'fichier') + ' (laisser vide pour la conserver)';
      $('dp-fichier-actuel').classList.remove('hidden');
    }
  } else {
    $('depense-modal-title').textContent = 'Déclarer une dépense';
    $('dp-id').value = '';
  }
  $('depense-modal').classList.remove('hidden');
  $('dp-date').focus();
}

function closeDepenseModal() {
  $('depense-modal').classList.add('hidden');
}

async function handleDepenseSubmit(evt) {
  evt.preventDefault();
  const id = $('dp-id').value;
  try {
    const pieceJointe = await fileInputToPieceJointe($('dp-fichier'));
    const existing = id ? state.depenses.find(d => d.ID === id) : null;
    const data = {
      date: $('dp-date').value,
      nature: $('dp-nature').value.trim(),
      montant: $('dp-montant').value,
      pieceJointe: pieceJointe,
      pieceJointeUrl: existing ? existing.PieceJointeUrl : '',
      pieceJointeNom: existing ? existing.PieceJointeNom : ''
    };
    if (id) {
      data.id = id;
      await Api.updateDepense(data);
      showToast('Dépense modifiée.');
    } else {
      await Api.createDepense(data);
      showToast('Dépense déclarée.');
    }
    closeDepenseModal();
    await loadAll(true);
  } catch (err) {
    showToast('Erreur : ' + err.message, true);
  }
}

/* ---------------------------------------------------------------------- */
/* Export CSV                                                              */
/* ---------------------------------------------------------------------- */

function csvEscape(val) {
  const s = String(val === null || val === undefined ? '' : val);
  if (/[",;\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function downloadCsv(filename, rows) {
  const csv = rows.map(r => r.map(csvEscape).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------------------------------------------------------------------- */
/* Rapports                                                                 */
/* ---------------------------------------------------------------------- */

function computeBilanByYear() {
  const map = {};
  function ensure(y) {
    if (!map[y]) map[y] = { recettes: 0, depenses: 0 };
    return map[y];
  }
  for (const c of state.cotisations.filter(cotisationEstValidee)) {
    ensure(yearOf(c.Date) || '—').recettes += Number(c.Montant || 0);
  }
  for (const d of state.depenses) {
    ensure(yearOf(d.Date) || '—').depenses += Number(d.Montant || 0);
  }
  for (const d of state.deces) {
    ensure(yearOf(d.Date) || '—').depenses += Number(d.CoutFuneraire || 0);
  }
  return map;
}

function getCotisationsRapportRows() {
  return state.cotisations
    .filter(cotisationEstValidee)
    .map(c => {
      const a = state.adherents.find(a => a.ID === c.AdherentID);
      return {
        civilite: a ? a.Civilite : '',
        nom: a ? a.Nom : '',
        prenom: a ? a.Prenom : '',
        date: c.Date,
        montant: c.Montant,
        statut: c.Statut
      };
    })
    .sort((x, y) => {
      const n = `${x.nom} ${x.prenom}`.localeCompare(`${y.nom} ${y.prenom}`, 'fr');
      if (n !== 0) return n;
      return (y.date || '').localeCompare(x.date || '');
    });
}

function renderRapports() {
  const map = computeBilanByYear();
  const years = Object.keys(map).sort((a, b) => b.localeCompare(a));

  const tbody = $('bilan-tbody');
  tbody.innerHTML = '';
  let totalRecettes = 0, totalDepenses = 0;
  for (const y of years) {
    const { recettes, depenses } = map[y];
    const solde = recettes - depenses;
    totalRecettes += recettes;
    totalDepenses += depenses;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(y)}</td>
      <td>${formatMontant(recettes)}</td>
      <td>${formatMontant(depenses)}</td>
      <td class="${solde < 0 ? 'solde-negatif' : 'solde-positif'}">${formatMontant(solde)}</td>
    `;
    tbody.appendChild(tr);
  }
  $('bilan-total-recettes').textContent = formatMontant(totalRecettes);
  $('bilan-total-depenses').textContent = formatMontant(totalDepenses);
  $('bilan-total-solde').textContent = formatMontant(totalRecettes - totalDepenses);
  $('empty-bilan').classList.toggle('hidden', years.length !== 0);

  const rows = getCotisationsRapportRows();
  const rtbody = $('rapport-cotisations-tbody');
  rtbody.innerHTML = '';
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(r.civilite || '—')}</td>
      <td>${escapeHtml(r.nom)}</td>
      <td>${escapeHtml(r.prenom)}</td>
      <td>${escapeHtml(formatDate(r.date))}</td>
      <td>${formatMontant(r.montant)}</td>
      <td>${escapeHtml(STATUT_LABELS[r.statut] || r.statut || '')}</td>
    `;
    rtbody.appendChild(tr);
  }
  $('empty-rapport-cotisations').classList.toggle('hidden', rows.length !== 0);
}

function exportBilanCsv() {
  const map = computeBilanByYear();
  const years = Object.keys(map).sort((a, b) => a.localeCompare(b));
  const rows = [['Année', 'Recettes', 'Dépenses', 'Solde']];
  for (const y of years) {
    const { recettes, depenses } = map[y];
    rows.push([y, recettes.toFixed(2), depenses.toFixed(2), (recettes - depenses).toFixed(2)]);
  }
  downloadCsv('bilan-financier.csv', rows);
}

function exportCotisationsCsv() {
  const rows = [['Civilité', 'Nom', 'Prénom', 'Date', 'Montant', 'Statut']];
  for (const r of getCotisationsRapportRows()) {
    rows.push([r.civilite || '', r.nom, r.prenom, r.date || '', Number(r.montant || 0).toFixed(2), STATUT_LABELS[r.statut] || r.statut || '']);
  }
  downloadCsv('cotisations-par-adherent.csv', rows);
}

/* ---------------------------------------------------------------------- */
/* Documents                                                                */
/* ---------------------------------------------------------------------- */

function renderDocuments() {
  const list = state.documents.slice().sort((a, b) => (b.Date || '').localeCompare(a.Date || ''));
  const tbody = $('documents-tbody');
  tbody.innerHTML = '';
  for (const d of list) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(d.Nom || '')}</td>
      <td>${escapeHtml(d.Description || '')}</td>
      <td>${escapeHtml(formatDate(d.Date))}</td>
      <td>${pjCellHtml(d.PieceJointeUrl, d.PieceJointeNom)}</td>
      <td class="row-actions"></td>
    `;
    if (!isReadOnly()) {
      const actionsTd = tr.querySelector('.row-actions');
      const editBtn = document.createElement('button');
      editBtn.textContent = 'Modifier';
      editBtn.className = 'btn btn-secondary btn-sm';
      editBtn.addEventListener('click', () => openDocumentModal(d));

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Supprimer';
      delBtn.className = 'btn btn-danger btn-sm';
      delBtn.addEventListener('click', () => {
        openConfirmModal(`Supprimer le document « ${d.Nom} » ?`, async () => {
          try {
            await Api.deleteDocument(d.ID);
            showToast('Document supprimé.');
            await loadAll(true);
          } catch (err) {
            showToast('Erreur : ' + err.message, true);
          }
        });
      });

      actionsTd.appendChild(editBtn);
      actionsTd.appendChild(delBtn);
    }
    tbody.appendChild(tr);
  }
  $('empty-documents').classList.toggle('hidden', list.length !== 0);

  renderPjAggregate();
}

function renderPjAggregate() {
  const rows = [];
  for (const d of state.deces) {
    if (d.PieceJointeUrl) {
      rows.push({ origine: 'Décès', libelle: `${d.Nom || ''} ${d.Prenom || ''}`.trim(), date: d.Date, url: d.PieceJointeUrl, nom: d.PieceJointeNom });
    }
  }
  for (const d of state.depenses) {
    if (d.PieceJointeUrl) {
      rows.push({ origine: 'Dépense', libelle: d.Nature || '', date: d.Date, url: d.PieceJointeUrl, nom: d.PieceJointeNom });
    }
  }
  rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const tbody = $('pj-aggregate-tbody');
  tbody.innerHTML = '';
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(r.origine)}</td>
      <td>${escapeHtml(r.libelle)}</td>
      <td>${escapeHtml(formatDate(r.date))}</td>
      <td>${pjCellHtml(r.url, r.nom)}</td>
    `;
    tbody.appendChild(tr);
  }
  $('empty-pj-aggregate').classList.toggle('hidden', rows.length !== 0);
}

function openDocumentModal(record) {
  $('document-form').reset();
  $('doc-fichier-actuel').classList.add('hidden');
  if (record) {
    $('document-modal-title').textContent = 'Modifier le document';
    $('doc-id').value = record.ID;
    $('doc-nom').value = record.Nom || '';
    $('doc-description').value = record.Description || '';
    $('doc-date').value = record.Date || '';
    if (record.PieceJointeUrl) {
      $('doc-fichier-actuel').textContent = 'Fichier actuel : ' + (record.PieceJointeNom || 'fichier') + ' (laisser vide pour le conserver)';
      $('doc-fichier-actuel').classList.remove('hidden');
    }
  } else {
    $('document-modal-title').textContent = 'Ajouter un document';
    $('doc-id').value = '';
  }
  $('document-modal').classList.remove('hidden');
  $('doc-nom').focus();
}

function closeDocumentModal() {
  $('document-modal').classList.add('hidden');
}

async function handleDocumentSubmit(evt) {
  evt.preventDefault();
  const id = $('doc-id').value;
  try {
    const pieceJointe = await fileInputToPieceJointe($('doc-fichier'));
    const existing = id ? state.documents.find(d => d.ID === id) : null;
    const data = {
      nom: $('doc-nom').value.trim(),
      description: $('doc-description').value.trim(),
      date: $('doc-date').value,
      pieceJointe: pieceJointe,
      pieceJointeUrl: existing ? existing.PieceJointeUrl : '',
      pieceJointeNom: existing ? existing.PieceJointeNom : ''
    };
    if (id) {
      data.id = id;
      await Api.updateDocument(data);
      showToast('Document modifié.');
    } else {
      await Api.createDocument(data);
      showToast('Document ajouté.');
    }
    closeDocumentModal();
    await loadAll(true);
  } catch (err) {
    showToast('Erreur : ' + err.message, true);
  }
}

/* ---------------------------------------------------------------------- */
/* Archives (lecture seule, onglet Google Sheet dédié)                     */
/* ---------------------------------------------------------------------- */

const ARCHIVES_MAX_DISTINCT_VALUES = 40;

function archivesFilterableColumns() {
  const headers = state.archives.headers || [];
  const rows = state.archives.rows || [];
  return headers.filter(h => {
    const distinct = new Set(rows.map(r => String(r[h] === undefined || r[h] === null ? '' : r[h]).trim()).filter(v => v !== ''));
    return distinct.size > 0 && distinct.size <= ARCHIVES_MAX_DISTINCT_VALUES;
  });
}

function renderArchivesTableHead() {
  const headers = state.archives.headers || [];
  const tr = $('archives-thead-row');
  tr.innerHTML = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
}

function renderArchivesFilters() {
  const container = $('archives-filters');
  container.innerHTML = '';
  const rows = state.archives.rows || [];
  const cols = archivesFilterableColumns();

  // Nettoyer les filtres actifs sur des colonnes qui n'existent plus / ne sont plus filtrables
  Object.keys(state.archivesFilters).forEach(k => {
    if (!cols.includes(k)) delete state.archivesFilters[k];
  });

  for (const col of cols) {
    const values = Array.from(new Set(rows.map(r => String(r[col] === undefined || r[col] === null ? '' : r[col]).trim()).filter(v => v !== '')))
      .sort((a, b) => a.localeCompare(b, 'fr'));

    const wrap = document.createElement('label');
    wrap.className = 'archives-filter';
    wrap.textContent = col;

    const select = document.createElement('select');
    select.dataset.column = col;
    const optAll = document.createElement('option');
    optAll.value = '';
    optAll.textContent = 'Tous';
    select.appendChild(optAll);
    for (const v of values) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    }
    select.value = state.archivesFilters[col] || '';
    select.addEventListener('change', () => {
      if (select.value) state.archivesFilters[col] = select.value;
      else delete state.archivesFilters[col];
      renderArchivesRows();
    });

    wrap.appendChild(select);
    container.appendChild(wrap);
  }
}

function filteredArchivesRows() {
  const headers = state.archives.headers || [];
  const rows = state.archives.rows || [];
  const q = ($('archives-search') ? $('archives-search').value.trim().toLowerCase() : '');

  return rows.filter(r => {
    for (const col of Object.keys(state.archivesFilters)) {
      const wanted = state.archivesFilters[col];
      const val = String(r[col] === undefined || r[col] === null ? '' : r[col]).trim();
      if (val !== wanted) return false;
    }
    if (!q) return true;
    return headers.some(h => String(r[h] === undefined || r[h] === null ? '' : r[h]).toLowerCase().includes(q));
  });
}

function renderArchivesRows() {
  const headers = state.archives.headers || [];
  const rows = filteredArchivesRows();
  const tbody = $('archives-tbody');
  tbody.innerHTML = '';
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = headers.map(h => `<td>${escapeHtml(r[h] === undefined || r[h] === null ? '' : String(r[h]))}</td>`).join('');
    tbody.appendChild(tr);
  }
  $('empty-archives').classList.toggle('hidden', rows.length !== 0);
}

function renderArchives() {
  const headers = state.archives.headers || [];
  const notConfigured = headers.length === 0;
  $('archives-not-configured').classList.toggle('hidden', !notConfigured);
  $('archives-content').classList.toggle('hidden', notConfigured);
  if (notConfigured) return;

  renderArchivesTableHead();
  renderArchivesFilters();
  renderArchivesRows();
}

/* ---------------------------------------------------------------------- */
/* Modale adhérent (Nouveau / Modifier)                                    */
/* ---------------------------------------------------------------------- */

function populateUtilisateurAffecteSelect(selectedId) {
  const select = $('a-utilisateur-affecte');
  select.innerHTML = '<option value="">Aucun</option>';
  for (const u of state.utilisateurs) {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = (u.nomComplet || u.nomUtilisateur) + (u.role !== 'Consultation' ? ` (${u.role})` : '');
    select.appendChild(opt);
  }
  select.value = selectedId || '';
}

function openAdherentModal(adherent) {
  $('adherent-form').reset();
  $('a-fichier-actuel').classList.add('hidden');
  if (adherent) {
    $('adherent-modal-title').textContent = 'Modifier l\'adhérent';
    $('a-id').value = adherent.ID;
    $('a-civilite').value = adherent.Civilite || 'M.';
    $('a-nom').value = adherent.Nom || '';
    $('a-prenom').value = adherent.Prenom || '';
    $('a-telephone').value = adherent.Telephone || '';
    $('a-email').value = adherent.Email || '';
    $('a-date-adhesion').value = adherent.DateAdhesion || '';
    populateUtilisateurAffecteSelect(adherent.UtilisateurAffecteID);
    if (adherent.PieceJointeUrl) {
      $('a-fichier-actuel').textContent = 'Pièce jointe actuelle : ' + (adherent.PieceJointeNom || 'fichier') + ' (laisser vide pour la conserver)';
      $('a-fichier-actuel').classList.remove('hidden');
    }
  } else {
    $('adherent-modal-title').textContent = 'Nouvel adhérent';
    $('a-id').value = '';
    $('a-civilite').value = 'M.';
    populateUtilisateurAffecteSelect('');
  }
  $('adherent-modal').classList.remove('hidden');
  $('a-nom').focus();
}

function closeAdherentModal() {
  $('adherent-modal').classList.add('hidden');
}

async function handleAdherentSubmit(evt) {
  evt.preventDefault();
  const id = $('a-id').value;
  try {
    const pieceJointe = await fileInputToPieceJointe($('a-fichier'));
    const existing = id ? state.adherents.find(a => a.ID === id) : null;
    const data = {
      civilite: $('a-civilite').value,
      nom: $('a-nom').value.trim(),
      prenom: $('a-prenom').value.trim(),
      telephone: $('a-telephone').value.trim(),
      email: $('a-email').value.trim(),
      dateAdhesion: $('a-date-adhesion').value,
      utilisateurAffecteId: $('a-utilisateur-affecte').value,
      pieceJointe: pieceJointe,
      pieceJointeUrl: existing ? existing.PieceJointeUrl : '',
      pieceJointeNom: existing ? existing.PieceJointeNom : ''
    };
    if (id) {
      data.id = id;
      await Api.updateAdherent(data);
      showToast('Adhérent modifié.');
    } else {
      const rec = await Api.createAdherent(data);
      showToast('Adhérent créé.');
      state.selectedId = rec.id || rec.ID;
    }
    closeAdherentModal();
    await loadAll(true);
  } catch (err) {
    showToast('Erreur : ' + err.message, true);
  }
}

/* ---------------------------------------------------------------------- */
/* Modale de choix : que veut-on modifier ? (infos ou cotisations)         */
/* ---------------------------------------------------------------------- */

function openEditChoiceModal(a) {
  $('edit-choice-name').textContent = adherentName(a);
  $('edit-choice-modal').classList.remove('hidden');
}

function closeEditChoiceModal() {
  $('edit-choice-modal').classList.add('hidden');
}

// Amène l'utilisateur directement sur le formulaire de cotisations de la
// fiche adhérent (déjà capable d'ajouter une nouvelle cotisation ou d'en
// modifier une existante via les boutons de chaque ligne du tableau).
function focusCotisationForm() {
  const form = $('cotisation-form');
  if (form && form.scrollIntoView) {
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  setTimeout(() => {
    const montant = $('cot-montant');
    if (montant) montant.focus();
  }, 350);
}

/* ---------------------------------------------------------------------- */
/* Modale de confirmation générique                                        */
/* ---------------------------------------------------------------------- */

let confirmCallback = null;

function openConfirmModal(message, onConfirm) {
  $('confirm-message').textContent = message;
  confirmCallback = onConfirm;
  $('confirm-modal').classList.remove('hidden');
}

function closeConfirmModal() {
  $('confirm-modal').classList.add('hidden');
  confirmCallback = null;
}

/* ---------------------------------------------------------------------- */
/* Modale de configuration (source de données)                             */
/* ---------------------------------------------------------------------- */

function openSettingsModal() {
  $('settings-url').value = Api.getApiUrl();
  $('settings-drive-url').value = (state.config && state.config.dossierDriveUrl) || '';
  $('settings-notif-duree').value = (state.config && state.config.dureeNotificationsJours) || 3;
  $('change-password-form').reset();
  $('settings-modal').classList.remove('hidden');
}

function closeSettingsModal() {
  $('settings-modal').classList.add('hidden');
}

async function handleSettingsSave() {
  Api.setApiUrl($('settings-url').value.trim());
  if (!isReadOnly()) {
    try {
      await Api.updateConfig({
        dossierDriveUrl: $('settings-drive-url').value.trim(),
        dureeNotificationsJours: $('settings-notif-duree').value
      });
    } catch (err) {
      showToast('Erreur de configuration : ' + err.message, true);
      return;
    }
  }
  closeSettingsModal();
  state.selectedId = null;
  showToast('Configuration enregistrée.');
  await loadAll(false);
}

async function handleChangePasswordSubmit(evt) {
  evt.preventDefault();
  try {
    await Api.changePassword($('cp-ancien').value, $('cp-nouveau').value);
    $('change-password-form').reset();
    showToast('Mot de passe changé.');
  } catch (err) {
    showToast('Erreur : ' + err.message, true);
  }
}

/* ---------------------------------------------------------------------- */
/* Formulaire cotisation                                                   */
/* ---------------------------------------------------------------------- */

async function handleCotisationSubmit(evt) {
  evt.preventDefault();
  const a = currentAdherent();
  if (!a) return;

  const data = {
    adherentId: a.ID,
    montant: $('cot-montant').value,
    date: $('cot-date').value,
    statut: $('cot-statut').value
  };

  try {
    if (state.editingCotisationId) {
      data.id = state.editingCotisationId;
      await Api.updateCotisation(data);
      showToast('Cotisation modifiée.');
    } else {
      await Api.createCotisation(data);
      showToast(isCollecteur() ? 'Cotisation soumise, en attente de validation.' : 'Cotisation ajoutée.');
    }
    cancelCotisationEdit();
    await loadAll(true);
  } catch (err) {
    showToast('Erreur : ' + err.message, true);
  }
}

/* ---------------------------------------------------------------------- */
/* Gestion des utilisateurs (Administrateur)                               */
/* ---------------------------------------------------------------------- */

const ROLE_BADGE_CLASS = { 'Administrateur': 'admin', 'Consultation': 'consultation', 'Collecteur': 'collecteur' };

function porteeLabel(u) {
  if (u.role === 'Collecteur') return 'Adhérents affectés uniquement';
  if (u.role === 'Consultation') return u.restreintAAdherents ? 'Adhérents affectés uniquement' : 'Tout (lecture seule)';
  return 'Tout (lecture/écriture)';
}

function renderUtilisateurs() {
  const tbody = $('utilisateurs-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const list = state.utilisateurs.slice().sort((a, b) => a.nomUtilisateur.localeCompare(b.nomUtilisateur, 'fr'));
  for (const u of list) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(u.nomUtilisateur)}</td>
      <td>${escapeHtml(u.nomComplet || '—')}</td>
      <td><span class="role-badge role-badge-${ROLE_BADGE_CLASS[u.role] || 'consultation'}">${escapeHtml(u.role)}</span></td>
      <td>${escapeHtml(porteeLabel(u))}</td>
      <td class="row-actions"></td>
    `;
    const actionsTd = tr.querySelector('.row-actions');

    const editBtn = document.createElement('button');
    editBtn.textContent = 'Modifier';
    editBtn.className = 'btn btn-secondary btn-sm';
    editBtn.addEventListener('click', () => openUtilisateurModal(u));

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Réinitialiser mdp';
    resetBtn.className = 'btn btn-secondary btn-sm';
    resetBtn.addEventListener('click', () => {
      openConfirmModal(`Réinitialiser le mot de passe de ${u.nomUtilisateur} ?`, async () => {
        try {
          const res = await Api.resetPasswordUtilisateur(u.id);
          openResetPasswordResultModal(res.temporaryPassword);
        } catch (err) {
          showToast('Erreur : ' + err.message, true);
        }
      });
    });

    const delBtn = document.createElement('button');
    delBtn.textContent = 'Supprimer';
    delBtn.className = 'btn btn-danger btn-sm';
    delBtn.addEventListener('click', () => {
      openConfirmModal(`Supprimer le compte ${u.nomUtilisateur} ?`, async () => {
        try {
          await Api.deleteUtilisateur(u.id);
          showToast('Utilisateur supprimé.');
          await loadAll(true);
        } catch (err) {
          showToast('Erreur : ' + err.message, true);
        }
      });
    });

    actionsTd.appendChild(editBtn);
    actionsTd.appendChild(resetBtn);
    actionsTd.appendChild(delBtn);
    tbody.appendChild(tr);
  }
  $('empty-utilisateurs').classList.toggle('hidden', list.length !== 0);
}

// Adhérents pouvant être choisis pour un compte "lié à un adhérent" : les
// adhérents actifs (les archivés n'ont plus vocation à avoir de compte).
function populateAdherentLieSelect(selectedId) {
  const select = $('u-adherent-lie');
  select.innerHTML = '<option value="">— Choisir —</option>';
  for (const a of state.adherents.filter(a2 => !isArchived(a2)).sort((x, y) => adherentName(x).localeCompare(adherentName(y), 'fr'))) {
    const opt = document.createElement('option');
    opt.value = a.ID;
    opt.textContent = adherentName(a);
    select.appendChild(opt);
  }
  select.value = selectedId || '';
}

// Un compte Collecteur est toujours restreint à ses adhérents affectés (pas
// de réglage) : la case "restreint" n'a de sens que pour un compte
// Consultation.
function updateUtilisateurRoleUI() {
  const role = $('u-role').value;
  $('u-restreint-wrap').classList.toggle('hidden', role !== 'Consultation');
  $('u-collecteur-help').classList.toggle('hidden', role !== 'Collecteur');
}

// Bascule l'identifiant de connexion entre saisie libre (compte local) et
// génération automatique depuis le nom de l'adhérent choisi (aperçu — la
// valeur définitive, en cas de doublon, est calculée côté serveur/démo).
function updateUtilisateurTypeUI() {
  const type = $('u-type-adherent').checked ? 'adherent' : 'local';
  $('u-adherent-lie-wrap').classList.toggle('hidden', type !== 'adherent');
  $('u-nom-utilisateur-help').classList.toggle('hidden', type !== 'adherent');
  const usernameField = $('u-nom-utilisateur');
  if (type === 'adherent') {
    usernameField.readOnly = true;
    const a = state.adherents.find(a2 => a2.ID === $('u-adherent-lie').value);
    if (a) {
      usernameField.value = previewUsernameFromAdherent(a);
      if (!$('u-nom-complet').value.trim()) $('u-nom-complet').value = adherentName(a);
    } else {
      usernameField.value = '';
    }
  } else {
    usernameField.readOnly = false;
  }
}

function previewUsernameFromAdherent(a) {
  const slug = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const base = (slug(a.Prenom).charAt(0) + slug(a.Nom)) || 'membre';
  const existing = state.utilisateurs
    .filter(u => !state.editingUtilisateurId || u.id !== state.editingUtilisateurId)
    .map(u => u.nomUtilisateur.toLowerCase());
  if (!existing.includes(base)) return base;
  let i = 2;
  while (existing.includes(base + i)) i++;
  return base + i;
}

function openUtilisateurModal(u) {
  $('utilisateur-form').reset();
  if (u) {
    state.editingUtilisateurId = u.id;
    $('utilisateur-modal-title').textContent = 'Modifier l\'utilisateur';
    $('u-id').value = u.id;
    $('u-nom-utilisateur').value = u.nomUtilisateur;
    $('u-nom-utilisateur').disabled = true;
    $('u-nom-complet').value = u.nomComplet || '';
    $('u-role').value = u.role;
    $('u-restreint').checked = !!u.restreintAAdherents;
    $('u-mot-de-passe-wrap').classList.add('hidden');
    $('u-mot-de-passe').required = false;
    $('u-type-compte-wrap').classList.add('hidden'); // le type (local/adhérent) ne se change pas après coup
    $('u-adherent-lie-wrap').classList.add('hidden');
    $('u-nom-utilisateur-help').classList.add('hidden');
  } else {
    state.editingUtilisateurId = null;
    $('utilisateur-modal-title').textContent = 'Nouvel utilisateur';
    $('u-id').value = '';
    $('u-nom-utilisateur').value = '';
    $('u-nom-utilisateur').disabled = false;
    $('u-role').value = 'Consultation';
    $('u-type-local').checked = true;
    $('u-mot-de-passe-wrap').classList.remove('hidden');
    $('u-mot-de-passe').required = true;
    $('u-type-compte-wrap').classList.remove('hidden');
    populateAdherentLieSelect('');
    updateUtilisateurTypeUI();
  }
  updateUtilisateurRoleUI();
  $('utilisateur-modal').classList.remove('hidden');
  $('u-nom-utilisateur').focus();
}

function closeUtilisateurModal() {
  $('utilisateur-modal').classList.add('hidden');
}

async function handleUtilisateurSubmit(evt) {
  evt.preventDefault();
  const typeCompte = !state.editingUtilisateurId && $('u-type-adherent').checked ? 'adherent' : 'local';
  const data = {
    nomUtilisateur: $('u-nom-utilisateur').value.trim(),
    nomComplet: $('u-nom-complet').value.trim(),
    role: $('u-role').value,
    restreintAAdherents: $('u-restreint').checked,
    typeCompte,
    adherentLieId: typeCompte === 'adherent' ? $('u-adherent-lie').value : ''
  };
  try {
    let res;
    if (state.editingUtilisateurId) {
      data.id = state.editingUtilisateurId;
      res = await Api.updateUtilisateur(data);
      showToast('Utilisateur modifié.');
    } else {
      data.motDePasse = $('u-mot-de-passe').value;
      res = await Api.createUtilisateur(data);
      showToast(res && res.nomUtilisateur ? `Utilisateur créé (identifiant : ${res.nomUtilisateur}).` : 'Utilisateur créé.');
    }
    closeUtilisateurModal();
    await loadAll(true);
  } catch (err) {
    showToast('Erreur : ' + err.message, true);
  }
}

function openResetPasswordResultModal(temporaryPassword) {
  $('reset-password-value').textContent = temporaryPassword;
  $('reset-password-result-modal').classList.remove('hidden');
}

function closeResetPasswordResultModal() {
  $('reset-password-result-modal').classList.add('hidden');
}

/* ---------------------------------------------------------------------- */
/* Cotisations à valider (Administrateur)                                  */
/* ---------------------------------------------------------------------- */

function renderValidation() {
  const tbody = $('validation-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const pending = state.cotisations
    .filter(c => !cotisationEstValidee(c))
    .sort((x, y) => (y.DateCreation || '').localeCompare(x.DateCreation || ''));
  for (const c of pending) {
    const a = state.adherents.find(a2 => a2.ID === c.AdherentID);
    const soumisPar = state.utilisateurs.find(u => u.id === c.CreeParUtilisateurID);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(a ? adherentName(a) : '—')}</td>
      <td>${escapeHtml(formatDate(c.Date))}</td>
      <td>${formatMontant(c.Montant)}</td>
      <td>${escapeHtml(STATUT_LABELS[c.Statut] || c.Statut || '')}</td>
      <td>${escapeHtml(soumisPar ? (soumisPar.nomComplet || soumisPar.nomUtilisateur) : '—')}</td>
      <td>${escapeHtml(formatDate(c.DateCreation))}</td>
      <td class="row-actions"></td>
    `;
    const actionsTd = tr.querySelector('.row-actions');
    const validerBtn = document.createElement('button');
    validerBtn.textContent = 'Valider';
    validerBtn.className = 'btn btn-sm';
    validerBtn.addEventListener('click', async () => {
      try {
        await Api.validateCotisation(c.ID);
        showToast('Cotisation validée.');
        await loadAll(true);
      } catch (err) {
        showToast('Erreur : ' + err.message, true);
      }
    });
    actionsTd.appendChild(validerBtn);
    tbody.appendChild(tr);
  }
  $('empty-validation').classList.toggle('hidden', pending.length !== 0);
}

/* ---------------------------------------------------------------------- */
/* Initialisation / écouteurs d'événements                                 */
/* ---------------------------------------------------------------------- */

function init() {
  initTheme();

  $('search-input').addEventListener('input', renderAdherentsTable);

  $('btn-new').addEventListener('click', () => openAdherentModal(null));
  $('btn-edit').addEventListener('click', () => {
    const a = currentAdherent();
    if (!a) return;
    // Un compte Collecteur n'a qu'une seule capacité (ajouter une cotisation
    // en attente de validation) : on l'amène directement au formulaire,
    // sans lui proposer un choix qui ne mènerait qu'à une seule option.
    if (isCollecteur()) {
      focusCotisationForm();
    } else {
      openEditChoiceModal(a);
    }
  });
  $('edit-choice-infos').addEventListener('click', () => {
    const a = currentAdherent();
    closeEditChoiceModal();
    if (a) openAdherentModal(a);
  });
  $('edit-choice-cotisation').addEventListener('click', () => {
    closeEditChoiceModal();
    focusCotisationForm();
  });
  $('edit-choice-cancel').addEventListener('click', closeEditChoiceModal);
  $('btn-delete').addEventListener('click', () => {
    const a = currentAdherent();
    if (!a) return;
    openConfirmModal(
      `Supprimer l'adhérent ${adherentName(a)} et toutes ses cotisations ?`,
      async () => {
        try {
          await Api.deleteAdherent(a.ID);
          state.selectedId = null;
          showToast('Adhérent supprimé.');
          await loadAll(false);
        } catch (err) {
          showToast('Erreur : ' + err.message, true);
        }
      }
    );
  });

  $('adherent-form').addEventListener('submit', handleAdherentSubmit);
  $('adherent-modal-cancel').addEventListener('click', closeAdherentModal);

  $('btn-archive').addEventListener('click', () => {
    const a = currentAdherent();
    if (!a) return;
    openConfirmModal(
      `Archiver ${adherentName(a)} ? Il/elle sera retiré(e) de la liste des adhérents, mais ses cotisations resteront comptabilisées dans le total cotisé.`,
      async () => {
        try {
          await Api.archiveAdherent(a.ID);
          state.selectedId = null;
          showToast('Adhérent archivé.');
          await loadAll(false);
        } catch (err) {
          showToast('Erreur : ' + err.message, true);
        }
      }
    );
  });

  $('confirm-yes').addEventListener('click', async () => {
    const cb = confirmCallback;
    closeConfirmModal();
    if (cb) await cb();
  });
  $('confirm-no').addEventListener('click', closeConfirmModal);

  $('settings-save').addEventListener('click', handleSettingsSave);
  $('settings-cancel').addEventListener('click', closeSettingsModal);

  $('cotisation-form').addEventListener('submit', handleCotisationSubmit);
  $('cot-cancel-btn').addEventListener('click', cancelCotisationEdit);

  $('btn-pdf-adherent').addEventListener('click', () => {
    const a = currentAdherent();
    if (a) generateAdherentPdf(a);
  });

  $('btn-new-deces').addEventListener('click', () => openDecesModal(null));
  $('deces-form').addEventListener('submit', handleDecesSubmit);
  $('deces-modal-cancel').addEventListener('click', closeDecesModal);

  $('btn-new-depense').addEventListener('click', () => openDepenseModal(null));
  $('depense-form').addEventListener('submit', handleDepenseSubmit);
  $('depense-modal-cancel').addEventListener('click', closeDepenseModal);

  $('btn-new-document').addEventListener('click', () => openDocumentModal(null));
  $('document-form').addEventListener('submit', handleDocumentSubmit);
  $('document-modal-cancel').addEventListener('click', closeDocumentModal);

  $('archives-search').addEventListener('input', renderArchivesRows);

  $('btn-export-bilan').addEventListener('click', exportBilanCsv);
  $('btn-export-cotisations').addEventListener('click', exportCotisationsCsv);
  $('btn-print-rapports').addEventListener('click', () => window.print());

  $('btn-menu').addEventListener('click', (evt) => {
    evt.stopPropagation();
    toggleMainMenu();
  });
  // Sur téléphone, ☰ est masqué (CSS) et remplacé par l'onglet « Menu » de
  // la barre du bas, qui ouvre le même #main-menu (repositionné en feuille
  // ancrée au-dessus de la barre, voir style.css).
  const btnMobileMenu = $('btn-mobile-menu');
  if (btnMobileMenu) {
    btnMobileMenu.addEventListener('click', (evt) => {
      evt.stopPropagation();
      toggleMainMenu();
    });
  }
  document.querySelectorAll('.menu-item[data-view], .mobile-tab-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });
  $('menu-configuration').addEventListener('click', () => {
    closeMainMenu();
    openSettingsModal();
  });
  $('menu-logout').addEventListener('click', handleLogout);
  document.addEventListener('click', (evt) => {
    if (!$('main-menu').classList.contains('hidden') && !evt.target.closest('.menu-wrap') && !evt.target.closest('#mobile-tabbar')) {
      closeMainMenu();
    }
    if (!$('notif-dropdown').classList.contains('hidden') && !evt.target.closest('.menu-wrap')) {
      closeNotifDropdown();
    }
  });

  $('btn-notifications').addEventListener('click', (evt) => {
    evt.stopPropagation();
    toggleNotifDropdown();
  });

  $('login-form').addEventListener('submit', handleLoginSubmit);
  $('force-password-form').addEventListener('submit', handleForcePasswordSubmit);
  $('change-password-form').addEventListener('submit', handleChangePasswordSubmit);

  $('btn-new-utilisateur').addEventListener('click', () => openUtilisateurModal(null));
  $('utilisateur-form').addEventListener('submit', handleUtilisateurSubmit);
  $('utilisateur-modal-cancel').addEventListener('click', closeUtilisateurModal);
  $('u-role').addEventListener('change', updateUtilisateurRoleUI);
  $('u-type-local').addEventListener('change', updateUtilisateurTypeUI);
  $('u-type-adherent').addEventListener('change', updateUtilisateurTypeUI);
  $('u-adherent-lie').addEventListener('change', updateUtilisateurTypeUI);
  $('reset-password-close').addEventListener('click', closeResetPasswordResultModal);

  loadAll(false);
}

document.addEventListener('DOMContentLoaded', init);
