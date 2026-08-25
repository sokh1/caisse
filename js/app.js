/**
 * Logique de l'application "Caisse".
 */

const state = {
  adherents: [],
  cotisations: [],
  deces: [],
  depenses: [],
  selectedId: null,
  editingCotisationId: null,
  editingDecesId: null,
  editingDepenseId: null
};

const STATUT_LABELS = {
  'Travail': 'Travail',
  'Sans travail': 'Sans travail',
  'Malade': 'Malade',
  'Retraite': 'Retraite',
  'Conges': 'Congés'
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

/* ---------------------------------------------------------------------- */
/* Chargement des données                                                  */
/* ---------------------------------------------------------------------- */

async function loadAll(preserveSelection) {
  try {
    const { adherents, cotisations, deces, depenses } = await Api.getAll();
    state.adherents = adherents;
    state.cotisations = cotisations;
    state.deces = deces || [];
    state.depenses = depenses || [];
    if (!preserveSelection || !adherents.find(a => a.ID === state.selectedId)) {
      state.selectedId = preserveSelection ? state.selectedId : null;
    }
    renderDemoBadge();
    renderAdherentsTable();
    renderDashboard();
    renderDetails();
    renderDeces();
    renderDepenses();
  } catch (err) {
    showToast('Erreur de chargement : ' + err.message, true);
  }
}

function renderDemoBadge() {
  $('demo-badge').classList.toggle('hidden', !Api.isDemoMode());
}

/* ---------------------------------------------------------------------- */
/* Liste des adhérents                                                     */
/* ---------------------------------------------------------------------- */

function filteredAdherents() {
  const q = $('search-input').value.trim().toLowerCase();
  let list = state.adherents.slice().sort((a, b) => adherentName(a).localeCompare(adherentName(b), 'fr'));
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
    tr.innerHTML = `<td>${escapeHtml(a.Nom || '')}</td><td>${escapeHtml(a.Prenom || '')}</td>`;
    tr.addEventListener('click', () => selectAdherent(a.ID));
    tbody.appendChild(tr);
  }

  const hasSelection = !!state.selectedId;
  $('btn-edit').disabled = !hasSelection;
  $('btn-delete').disabled = !hasSelection;
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
  const total = state.cotisations.reduce((sum, c) => sum + Number(c.Montant || 0), 0);
  $('stat-total').textContent = formatMontant(total);
  $('stat-count').textContent = state.adherents.length;

  const byYear = {};
  for (const c of state.cotisations) {
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

  $('d-nom').textContent = a.Nom || '';
  $('d-prenom').textContent = a.Prenom || '';
  $('d-telephone').textContent = a.Telephone || '—';
  $('d-email').textContent = a.Email || '—';
  $('d-date-adhesion').textContent = formatDate(a.DateAdhesion) || '—';

  const cots = state.cotisations
    .filter(c => c.AdherentID === a.ID)
    .sort((x, y) => (y.Date || '').localeCompare(x.Date || ''));

  const totalCotise = cots.reduce((s, c) => s + Number(c.Montant || 0), 0);
  $('d-total-cotise').textContent = formatMontant(totalCotise);

  const tbody = $('cotisations-tbody');
  tbody.innerHTML = '';
  for (const c of cots) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(formatDate(c.Date))}</td>
      <td>${formatMontant(c.Montant)}</td>
      <td>${escapeHtml(STATUT_LABELS[c.Statut] || c.Statut || '')}</td>
      <td class="row-actions"></td>
    `;
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
/* Modale adhérent (Nouveau / Modifier)                                    */
/* ---------------------------------------------------------------------- */

function openAdherentModal(adherent) {
  $('adherent-form').reset();
  if (adherent) {
    $('adherent-modal-title').textContent = 'Modifier l\'adhérent';
    $('a-id').value = adherent.ID;
    $('a-nom').value = adherent.Nom || '';
    $('a-prenom').value = adherent.Prenom || '';
    $('a-telephone').value = adherent.Telephone || '';
    $('a-email').value = adherent.Email || '';
    $('a-date-adhesion').value = adherent.DateAdhesion || '';
  } else {
    $('adherent-modal-title').textContent = 'Nouvel adhérent';
    $('a-id').value = '';
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
  const data = {
    nom: $('a-nom').value.trim(),
    prenom: $('a-prenom').value.trim(),
    telephone: $('a-telephone').value.trim(),
    email: $('a-email').value.trim(),
    dateAdhesion: $('a-date-adhesion').value
  };
  try {
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
  $('settings-modal').classList.remove('hidden');
}

function closeSettingsModal() {
  $('settings-modal').classList.add('hidden');
}

async function handleSettingsSave() {
  Api.setApiUrl($('settings-url').value.trim());
  closeSettingsModal();
  state.selectedId = null;
  showToast('Configuration enregistrée.');
  await loadAll(false);
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
      showToast('Cotisation ajoutée.');
    }
    cancelCotisationEdit();
    await loadAll(true);
  } catch (err) {
    showToast('Erreur : ' + err.message, true);
  }
}

/* ---------------------------------------------------------------------- */
/* Initialisation / écouteurs d'événements                                 */
/* ---------------------------------------------------------------------- */

function init() {
  $('search-input').addEventListener('input', renderAdherentsTable);

  $('btn-new').addEventListener('click', () => openAdherentModal(null));
  $('btn-edit').addEventListener('click', () => {
    const a = currentAdherent();
    if (a) openAdherentModal(a);
  });
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

  $('confirm-yes').addEventListener('click', async () => {
    const cb = confirmCallback;
    closeConfirmModal();
    if (cb) await cb();
  });
  $('confirm-no').addEventListener('click', closeConfirmModal);

  $('btn-settings').addEventListener('click', openSettingsModal);
  $('settings-save').addEventListener('click', handleSettingsSave);
  $('settings-cancel').addEventListener('click', closeSettingsModal);

  $('cotisation-form').addEventListener('submit', handleCotisationSubmit);
  $('cot-cancel-btn').addEventListener('click', cancelCotisationEdit);

  $('btn-new-deces').addEventListener('click', () => openDecesModal(null));
  $('deces-form').addEventListener('submit', handleDecesSubmit);
  $('deces-modal-cancel').addEventListener('click', closeDecesModal);

  $('btn-new-depense').addEventListener('click', () => openDepenseModal(null));
  $('depense-form').addEventListener('submit', handleDepenseSubmit);
  $('depense-modal-cancel').addEventListener('click', closeDepenseModal);

  loadAll(false);
}

document.addEventListener('DOMContentLoaded', init);
