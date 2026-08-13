import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const { jsPDF } = window.jspdf;

let session = null;
let profil = null;
let caisses = [];
let membres = [];
let mouvements = [];
let profilsMap = {};
let clotures = [];
let params = { nom: 'EGLISE', ville: '', quartier: '', logo_url: '' };
let monGraphique = null;

// ---------- Utilitaires ----------

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function caissesActives() { return caisses.filter(c => c.actif); }
function nomDe(m) {
  if (m.membre_id) {
    const mem = membres.find(x => x.id === m.membre_id);
    return mem ? mem.nom_complet : 'Membre';
  }
  return m.nom_libre || '-';
}
function afficherErreur(el, message) {
  el.textContent = message;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150);
}
function caisseNomDe(m) {
  if (!m.caisse_id) return 'Caisse Générale';
  const c = caisses.find(x => x.id === m.caisse_id);
  return c ? c.nom : '-';
}
function caisseNomParId(id) {
  if (!id) return 'Caisse Générale';
  const c = caisses.find(x => x.id === id);
  return c ? c.nom : '-';
}
function estVerrouille(m) {
  const annee = new Date(m.date).getFullYear();
  return clotures.some(c => c.annee >= annee && c.caisse_id === m.caisse_id);
}
function libelleRole(r) {
  return { tresorier_principal: 'Trésorier Principal', tresorier_adjoint: 'Trésorier Adjoint', lecture_seule: 'Lecture seule' }[r] || r;
}

// ---------- Authentification ----------

function basculerOnglet(nom) {
  document.getElementById('ongletConnexion').classList.toggle('actif', nom === 'connexion');
  document.getElementById('ongletInscription').classList.toggle('actif', nom === 'inscription');
  document.getElementById('formConnexion').classList.toggle('hidden', nom !== 'connexion');
  document.getElementById('formInscription').classList.toggle('hidden', nom !== 'inscription');
}

async function connexion() {
  const email = document.getElementById('authEmail').value.trim();
  const pass = document.getElementById('authPass').value;
  const err = document.getElementById('erreurConnexion');
  err.textContent = '';
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) { afficherErreur(err, error.message); return; }
    await demarrerApresConnexion(data.session);
  } catch (e) {
    console.error(e);
    afficherErreur(err, "Erreur inattendue: " + e.message);
  }
}

async function inscription() {
  const nom = document.getElementById('authNom').value.trim();
  const email = document.getElementById('authEmailInscr').value.trim();
  const pass = document.getElementById('authPassInscr').value;
  const err = document.getElementById('erreurInscription');
  err.textContent = '';
  if (!nom || !email || pass.length < 6) { afficherErreur(err, "Remplis tous les champs (mot de passe 6 caractères min.)"); return; }
  try {
    const { data, error } = await supabase.auth.signUp({ email, password: pass, options: { data: { nom_complet: nom } } });
    if (error) { afficherErreur(err, error.message); return; }
    if (data.session) {
      await demarrerApresConnexion(data.session);
    } else {
      alert("Compte créé. Vérifie tes emails pour confirmer ton adresse, puis connecte-toi.");
      basculerOnglet('connexion');
    }
  } catch (e) {
    console.error(e);
    afficherErreur(err, "Erreur inattendue: " + e.message);
  }
}

async function motDePasseOublie() {
  const email = document.getElementById('authEmail').value.trim() || prompt("Entre ton email pour recevoir le lien de réinitialisation :");
  if (!email) return;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  if (error) { alert("Erreur: " + error.message); return; }
  alert("Email envoyé si ce compte existe. Ouvre le lien reçu, tu reviendras ici pour définir ton nouveau mot de passe.");
}

function ouvrirNouveauMotDePasse() {
  document.getElementById('erreurNouveauMdp').textContent = '';
  document.getElementById('nouveauMdp').value = '';
  document.getElementById('modalNouveauMdp').style.display = 'flex';
}

async function validerNouveauMotDePasse() {
  const pass = document.getElementById('nouveauMdp').value;
  const err = document.getElementById('erreurNouveauMdp');
  err.textContent = '';
  if (pass.length < 6) { err.textContent = "6 caractères minimum"; return; }
  const { error } = await supabase.auth.updateUser({ password: pass });
  if (error) { err.textContent = error.message; return; }
  document.getElementById('modalNouveauMdp').style.display = 'none';
  const { data: { session: s } } = await supabase.auth.getSession();
  if (s) await demarrerApresConnexion(s);
}

function lancerModeDemo() {
  profil = { nom_complet: 'Mode Démonstration', role: 'tresorier_principal' };
  caisses = [
    { id: 'demo-1', nom: 'Offrandes Ordinaires', incluse_caisse_generale: true, actif: true, ordre: 1 },
    { id: 'demo-2', nom: 'Offrandes Spéciales et Dons', incluse_caisse_generale: true, actif: true, ordre: 2 },
    { id: 'demo-3', nom: 'Dimes', incluse_caisse_generale: true, actif: true, ordre: 3 },
    { id: 'demo-4', nom: 'Offrandes du Soir', incluse_caisse_generale: true, actif: true, ordre: 4 },
    { id: 'demo-5', nom: 'ECODIM', incluse_caisse_generale: false, actif: true, ordre: 5 },
  ];
  membres = [
    { id: 'demo-m1', nom_complet: 'Jean Kouassi', telephone: '0700000001', actif: true },
    { id: 'demo-m2', nom_complet: 'Marie Yao', telephone: '0700000002', actif: true },
    { id: 'demo-m3', nom_complet: 'Paul N\'Guessan', telephone: '0700000003', actif: true },
  ];
  const auj = new Date().toISOString().split('T')[0];
  mouvements = [
    { id: 'demo-mv1', type: 'entree', caisse_id: 'demo-1', membre_id: 'demo-m1', nom_libre: null, date: auj, montant: 25000, motif: 'Offrande du dimanche', numero_recu: 'REC-DEMO-0001', user_id: 'demo-user' },
    { id: 'demo-mv2', type: 'entree', caisse_id: 'demo-3', membre_id: 'demo-m2', nom_libre: null, date: auj, montant: 15000, motif: 'Dîme mensuelle', numero_recu: null, user_id: 'demo-user' },
    { id: 'demo-mv3', type: 'entree', caisse_id: 'demo-5', membre_id: null, nom_libre: 'Collecte ECODIM', date: auj, montant: 8000, motif: 'Collecte du dimanche', numero_recu: null, user_id: 'demo-user' },
    { id: 'demo-mv4', type: 'entree', caisse_id: 'demo-2', membre_id: 'demo-m3', nom_libre: null, date: auj, montant: 50000, motif: 'Don spécial construction', numero_recu: 'REC-DEMO-0002', user_id: 'demo-user' },
    { id: 'demo-mv5', type: 'depense', caisse_id: null, membre_id: null, nom_libre: 'CIE', date: auj, montant: 12000, motif: 'Facture électricité', numero_recu: null, user_id: 'demo-user' },
  ];
  profilsMap = { 'demo-user': 'Trésorier Démo' };
  clotures = [];
  params = { nom: 'Église Démonstration', ville: 'Abidjan', quartier: 'Cocody', logo_url: '' };

  document.getElementById('ecranAuth').classList.add('hidden');
  document.getElementById('appli').classList.remove('hidden');
  document.getElementById('utilisateurNom').textContent = profil.nom_complet;
  document.getElementById('utilisateurRole').textContent = 'Démo (aucune donnée réelle)';
  chargerHeader();
  attacherEcouteurs();
  showPage('accueil');
}

async function connexionGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  if (error) alert("Erreur Google: " + error.message);
}

async function deconnexion() {
  await supabase.auth.signOut();
  location.reload();
}

let demarre = false;
async function demarrerApresConnexion(sess) {
  if (demarre) return;
  demarre = true;
  try {
    session = sess;
    const { data: prof, error } = await supabase.from('profils').select('*').eq('id', session.user.id).single();
    if (error || !prof) {
      alert("Impossible de charger le profil utilisateur (" + (error ? error.message : 'profil introuvable') + "). Réessaie ou contacte le trésorier principal.");
      await supabase.auth.signOut();
      demarre = false;
      return;
    }
    profil = prof;
    document.getElementById('ecranAuth').classList.add('hidden');
    document.getElementById('appli').classList.remove('hidden');
    document.getElementById('utilisateurNom').textContent = profil.nom_complet;
    document.getElementById('utilisateurRole').textContent = libelleRole(profil.role);
    await chargerToutesLesDonnees();
    attacherEcouteurs();
    showPage('accueil');
    activerRealtime();
  } catch (e) {
    console.error(e);
    alert("Erreur au démarrage de l'application: " + e.message);
    demarre = false;
  }
}

function activerRealtime() {
  supabase.channel('mouvements-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mouvements' }, async () => {
      await chargerMouvements();
      afficher();
      if (!document.getElementById('page-dashboard').classList.contains('hidden')) afficherDashboard();
    })
    .subscribe();
}

// ---------- Chargement des données ----------

async function chargerParams() {
  const { data } = await supabase.from('params').select('*').eq('id', 1).single();
  if (data) params = data;
  chargerHeader();
}
async function chargerCaisses() {
  const { data } = await supabase.from('caisses').select('*').order('ordre');
  caisses = data || [];
}
async function chargerMembres() {
  const { data } = await supabase.from('membres').select('*').order('nom_complet');
  membres = data || [];
}
async function chargerMouvements() {
  const { data } = await supabase.from('mouvements').select('*').order('date', { ascending: false });
  mouvements = data || [];
}
async function chargerProfils() {
  const { data } = await supabase.from('profils').select('id, nom_complet');
  profilsMap = {};
  (data || []).forEach(p => { profilsMap[p.id] = p.nom_complet; });
}
async function chargerClotures() {
  const { data } = await supabase.from('clotures').select('*').order('annee', { ascending: false });
  clotures = data || [];
}
async function chargerToutesLesDonnees() {
  await Promise.all([chargerParams(), chargerCaisses(), chargerMembres(), chargerMouvements(), chargerProfils(), chargerClotures()]);
}

function chargerHeader() {
  document.getElementById('nomEglise').textContent = params.nom;
  document.getElementById('adresseEglise').textContent = params.ville + " - " + params.quartier;
  if (params.logo_url) {
    document.getElementById('logoHeader').src = params.logo_url;
    document.getElementById('logoHeader').style.display = 'block';
  }
}

// ---------- Navigation ----------

function showPage(p) {
  document.querySelectorAll('.container > div').forEach(d => d.classList.add('hidden'));
  document.getElementById('page-' + p).classList.remove('hidden');
  if (p === 'accueil') afficher();
  if (p === 'dashboard') setTimeout(afficherDashboard, 100);
  if (p === 'membres') afficherMembres();
  if (p === 'cloture') afficherClotures();
}

function toggleDates() {
  const p = document.getElementById('filtrePeriode').value;
  document.getElementById('inpAnnee').style.display = p === 'annee_spec' ? 'block' : 'none';
  document.getElementById('dateDebut').style.display = p === 'perso' ? 'block' : 'none';
  document.getElementById('dateFin').style.display = p === 'perso' ? 'block' : 'none';
}

function filtrerParPeriode(liste) {
  const p = document.getElementById('filtrePeriode').value;
  if (p === 'tout') return liste;
  const now = new Date();
  return liste.filter(i => {
    const d = new Date(i.date);
    if (p === 'jour') return d.toDateString() === now.toDateString();
    if (p === 'semaine') return (now - d) / (1000 * 60 * 60 * 24) <= 7;
    if (p === 'mois') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (p === 'annee') return d.getFullYear() === now.getFullYear();
    if (p === 'annee_spec') {
      const annee = parseInt(document.getElementById('inpAnnee').value);
      return d.getFullYear() === annee;
    }
    if (p === 'perso') {
      const debut = new Date(document.getElementById('dateDebut').value);
      const fin = new Date(document.getElementById('dateFin').value);
      return d >= debut && d <= fin;
    }
    return true;
  });
}

// ---------- Soldes ----------

function getSolde(nom) {
  const mv = filtrerParPeriode(mouvements);
  if (nom === "Caisse Générale") {
    const idsGenerales = new Set(caisses.filter(c => c.incluse_caisse_generale).map(c => c.id));
    const entrees = mv.filter(m => m.type === 'entree' && idsGenerales.has(m.caisse_id)).reduce((a, b) => a + Number(b.montant), 0);
    const depenses = mv.filter(m => m.type === 'depense' && m.caisse_id === null).reduce((a, b) => a + Number(b.montant), 0);
    return entrees - depenses;
  }
  const caisse = caisses.find(c => c.nom === nom);
  if (!caisse) return 0;
  const entrees = mv.filter(m => m.type === 'entree' && m.caisse_id === caisse.id).reduce((a, b) => a + Number(b.montant), 0);
  const depenses = mv.filter(m => m.type === 'depense' && m.caisse_id === caisse.id).reduce((a, b) => a + Number(b.montant), 0);
  return entrees - depenses;
}

// ---------- Page Accueil ----------

function afficher() {
  let html = "";
  caissesActives().forEach(c => {
    const separee = !c.incluse_caisse_generale;
    html += `<div class="card-pro ${separee ? 'card-ecodim' : ''}" data-caisse="${c.id}">
      <h3 ${separee ? 'style="color:white"' : ''}>${escapeHtml(c.nom)}</h3>
      <div class="montant" ${separee ? 'style="color:white"' : ''}>${getSolde(c.nom).toLocaleString()} FCFA</div>
      <small ${separee ? '' : 'style="color:var(--bleu-clair)"'}>Clique pour imprimer</small>
    </div>`;
  });
  html += `<div class="card-pro card-general" data-caisse="general"><h3>CAISSE GENERALE</h3><div class="montant">${getSolde("Caisse Générale").toLocaleString()} FCFA</div><small>Clique pour imprimer Etat</small></div>`;
  document.getElementById('grilleCaisses').innerHTML = html;

  const peutEcrire = profil && profil.role !== 'lecture_seule';
  const peutSupprimer = profil && profil.role === 'tresorier_principal';
  const recherche = (document.getElementById('rechercheMouvement').value || '').toLowerCase();

  let mv = filtrerParPeriode(mouvements);
  if (recherche) {
    mv = mv.filter(m =>
      nomDe(m).toLowerCase().includes(recherche) ||
      (m.motif || '').toLowerCase().includes(recherche) ||
      (profilsMap[m.user_id] || '').toLowerCase().includes(recherche)
    );
  }
  mv = mv.slice(0, 150);

  let tbody = "";
  if (mv.length === 0) { tbody = '<tr><td colspan="9" style="text-align:center">Aucun mouvement</td></tr>'; }
  mv.forEach(m => {
    const verrouille = estVerrouille(m);
    tbody += `<tr>
      <td>${escapeHtml(m.date)}</td>
      <td>${escapeHtml(caisseNomDe(m))}</td>
      <td><span class="badge ${m.type === 'entree' ? 'badge-entree' : 'badge-depense'}">${m.type === 'entree' ? 'Entrée' : 'Dépense'}</span></td>
      <td>${escapeHtml(nomDe(m))}</td>
      <td>${Number(m.montant).toLocaleString()}</td>
      <td>${escapeHtml(m.motif || '')}</td>
      <td>${escapeHtml(profilsMap[m.user_id] || '-')}</td>
      <td>${m.numero_recu ? escapeHtml(m.numero_recu) : '-'}</td>
      <td>
        ${verrouille ? '<span class="badge" style="background:#e2e8f0;color:#64748b" title="Exercice clôturé">🔒</span>' : ''}
        ${peutEcrire && !verrouille ? `<button class="btn-action btn-orange" data-action="modifier" data-id="${m.id}">MODIF</button>` : ''}
        ${peutSupprimer && !verrouille ? `<button class="btn-action btn-rouge" data-action="supprimer" data-id="${m.id}">SUPPR</button>` : ''}
        ${m.type === 'entree' ? `<button class="btn-action btn-violet" data-action="recu" data-id="${m.id}">RECU</button>` : ''}
      </td>
    </tr>`;
  });
  document.getElementById('tbodyMouvements').innerHTML = tbody;
}

// ---------- Dashboard ----------

function afficherDashboard() {
  if (monGraphique) monGraphique.destroy();
  const idsGenerales = new Set(caisses.filter(c => c.incluse_caisse_generale).map(c => c.id));
  const annee = new Date().getFullYear();
  const typeGraph = document.querySelector('input[name="typeGraph"]:checked').value;
  const labels = [], e = [], d = [];
  for (let i = 0; i < 12; i++) {
    labels.push(new Date(annee, i, 1).toLocaleString('fr-FR', { month: 'short' }));
    const ent = mouvements.filter(m => m.type === 'entree' && idsGenerales.has(m.caisse_id) && new Date(m.date).getFullYear() === annee && new Date(m.date).getMonth() === i).reduce((a, b) => a + Number(b.montant), 0);
    const dep = mouvements.filter(m => m.type === 'depense' && m.caisse_id === null && new Date(m.date).getFullYear() === annee && new Date(m.date).getMonth() === i).reduce((a, b) => a + Number(b.montant), 0);
    e.push(ent); d.push(dep);
  }
  monGraphique = new Chart(document.getElementById('graphiqueMois'), {
    type: typeGraph,
    data: { labels, datasets: [{ label: 'ENTREES', data: e, backgroundColor: '#16a34a', borderColor: '#16a34a', fill: false, tension: 0.3 }, { label: 'DEPENSES', data: d, backgroundColor: '#dc2626', borderColor: '#dc2626', fill: false, tension: 0.3 }] },
    options: { responsive: true, plugins: { legend: { position: 'top' } }, scales: { x: { ticks: { maxRotation: 0 } } } }
  });

  const tR = mouvements.filter(m => m.type === 'entree' && idsGenerales.has(m.caisse_id)).reduce((a, b) => a + Number(b.montant), 0);
  const tD = mouvements.filter(m => m.type === 'depense' && m.caisse_id === null).reduce((a, b) => a + Number(b.montant), 0);

  let html = `
    <div class="card-pro" style="background:var(--vert);color:white"><h3 style="color:white">TOTAL ENTREES</h3><div class="montant" style="color:white">${tR.toLocaleString()}</div><small>CAISSE GENERALE</small></div>
    <div class="card-pro" style="background:var(--rouge);color:white"><h3 style="color:white">TOTAL DEPENSES</h3><div class="montant" style="color:white">${tD.toLocaleString()}</div><small>CAISSE GENERALE</small></div>
    <div class="card-pro"><h3>SOLDE GLOBAL</h3><div class="montant">${(tR - tD).toLocaleString()}</div><small>CAISSE GENERALE</small></div>
  `;
  caisses.filter(c => !c.incluse_caisse_generale).forEach(c => {
    html += `<div class="card-pro card-ecodim"><h3>SOLDE ${escapeHtml(c.nom.toUpperCase())}</h3><div class="montant" style="color:white">${getSolde(c.nom).toLocaleString()}</div><small>CAISSE SEPAREE</small></div>`;
  });
  document.getElementById('resumeCards').innerHTML = html;
}

function genererGraphiqueImage() {
  return new Promise(resolve => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000; canvas.height = 450;
    const ctx = canvas.getContext('2d');
    const idsGenerales = new Set(caisses.filter(c => c.incluse_caisse_generale).map(c => c.id));
    const annee = new Date().getFullYear();
    const mv = filtrerParPeriode(mouvements);
    const labels = [], e = [], d = [];
    for (let i = 0; i < 12; i++) {
      labels.push(new Date(annee, i, 1).toLocaleString('fr-FR', { month: 'short' }));
      const ent = mv.filter(m => m.type === 'entree' && idsGenerales.has(m.caisse_id) && new Date(m.date).getFullYear() === annee && new Date(m.date).getMonth() === i).reduce((a, b) => a + Number(b.montant), 0);
      const dep = mv.filter(m => m.type === 'depense' && m.caisse_id === null && new Date(m.date).getFullYear() === annee && new Date(m.date).getMonth() === i).reduce((a, b) => a + Number(b.montant), 0);
      e.push(ent); d.push(dep);
    }
    new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'ENTREES', data: e, backgroundColor: '#16a34a' }, { label: 'DEPENSES', data: d, backgroundColor: '#dc2626' }] },
      options: { animation: false, responsive: false, plugins: { legend: { display: true } }, scales: { x: { ticks: { maxRotation: 0 } } } }
    });
    setTimeout(() => resolve(canvas.toDataURL()), 700);
  });
}

// ---------- Clôture d'exercice ----------

function soldeADate(nom, dateLimite) {
  const mv = mouvements.filter(m => new Date(m.date) <= dateLimite);
  if (nom === "Caisse Générale") {
    const idsGenerales = new Set(caisses.filter(c => c.incluse_caisse_generale).map(c => c.id));
    const entrees = mv.filter(m => m.type === 'entree' && idsGenerales.has(m.caisse_id)).reduce((a, b) => a + Number(b.montant), 0);
    const depenses = mv.filter(m => m.type === 'depense' && m.caisse_id === null).reduce((a, b) => a + Number(b.montant), 0);
    return entrees - depenses;
  }
  const caisse = caisses.find(c => c.nom === nom);
  if (!caisse) return 0;
  const entrees = mv.filter(m => m.type === 'entree' && m.caisse_id === caisse.id).reduce((a, b) => a + Number(b.montant), 0);
  const depenses = mv.filter(m => m.type === 'depense' && m.caisse_id === caisse.id).reduce((a, b) => a + Number(b.montant), 0);
  return entrees - depenses;
}

function anneesDisponiblesPourCloture() {
  const anneeCourante = new Date().getFullYear();
  const anneesMouvements = new Set(mouvements.map(m => new Date(m.date).getFullYear()));
  anneesMouvements.add(anneeCourante);
  const toutesCaisses = [...caisses.map(c => c.id), null];
  return [...anneesMouvements].sort((a, b) => a - b).filter(a => {
    const clotureesPourCetteAnnee = clotures.filter(c => c.annee === a).map(c => c.caisse_id);
    return !toutesCaisses.every(id => clotureesPourCetteAnnee.includes(id));
  });
}

function afficherClotures() {
  const bloc = document.getElementById('blocClotureAction');
  if (profil && profil.role === 'tresorier_principal') {
    const annees = anneesDisponiblesPourCloture();
    bloc.innerHTML = annees.length === 0
      ? `<h3>Clôturer un exercice</h3><p style="color:#64748b">Toutes les années avec des écritures sont déjà clôturées.</p>`
      : `<h3>Clôturer un exercice</h3>
        <label>Année</label>
        <select id="selAnneeCloture">${annees.map(a => `<option value="${a}">${a}</option>`).join('')}</select>
        <button class="btn-save" style="background:var(--violet)" onclick="cloturerExercice()">CLÔTURER CET EXERCICE</button>
        <small style="display:block; margin-top:8px; color:#64748b">Une fois clôturée, les écritures de cette année (et des années antérieures) ne pourront plus être modifiées ni supprimées pour les caisses concernées. Action irréversible.</small>`;
  } else {
    bloc.innerHTML = `<h3>Clôturer un exercice</h3><p style="color:#64748b">Seul le trésorier principal peut clôturer un exercice.</p>`;
  }

  let html = "";
  clotures.forEach(c => {
    html += `<tr><td>${c.annee}</td><td>${escapeHtml(caisseNomParId(c.caisse_id))}</td><td>${Number(c.solde_cloture).toLocaleString()} FCFA</td><td>${new Date(c.date_cloture).toLocaleDateString('fr-FR')}</td><td>${escapeHtml(profilsMap[c.cloture_par] || '-')}</td></tr>`;
  });
  if (!html) html = '<tr><td colspan="5" style="text-align:center">Aucune clôture effectuée</td></tr>';
  document.getElementById('tbodyClotures').innerHTML = html;
}

async function cloturerExercice() {
  const annee = parseInt(document.getElementById('selAnneeCloture').value);
  if (!confirm(`Clôturer l'exercice ${annee} ? Les écritures de ${annee} et des années antérieures ne pourront plus être modifiées ni supprimées pour les caisses concernées. Cette action est irréversible.`)) return;

  const dateLimite = new Date(annee, 11, 31, 23, 59, 59);
  const lignes = caisses.map(c => ({
    annee, caisse_id: c.id, solde_cloture: soldeADate(c.nom, dateLimite), cloture_par: session.user.id
  }));
  lignes.push({ annee, caisse_id: null, solde_cloture: soldeADate("Caisse Générale", dateLimite), cloture_par: session.user.id });

  const { error } = await supabase.from('clotures').upsert(lignes, { onConflict: 'annee,caisse_id' });
  if (error) { alert("Erreur: " + error.message); return; }
  await chargerClotures();
  afficherClotures();
  afficher();
  imprimerCertificatCloture(annee);
}

function imprimerCertificatCloture(annee) {
  const lignesCloture = clotures.filter(c => c.annee === annee);
  const lignes = lignesCloture.map(c => `<tr><td>${escapeHtml(caisseNomParId(c.caisse_id))}</td><td>${Number(c.solde_cloture).toLocaleString()} FCFA</td></tr>`).join('');
  const tableHtml = `<table><thead><tr><th>Caisse</th><th>Solde au 31/12/${annee}</th></tr></thead><tbody>${lignes}</tbody></table>`;
  const contenu = pageImpression("CERTIFICAT DE CLÔTURE D'EXERCICE " + annee, "Exercice " + annee, '', tableHtml);
  const w = window.open('');
  w.document.write(contenu);
  w.document.close();
  setTimeout(() => w.print(), 800);
}

// ---------- Impression / PDF ----------

function pageImpression(titre, periode, resumeHtml, tableHtml) {
  const logo = params.logo_url ? `<img src="${params.logo_url}" style="height:80px">` : '';
  return `<html><head><style>body{font-family:Poppins; padding:20px}.entete{display:flex; align-items:center; gap:15px; border-bottom:2px solid #1e3a8a} h1{margin:0} table{width:100%; border-collapse:collapse; margin-top:20px} th,td{border:1px solid #ccc; padding:8px; font-size:12px} th{background:#eee}.total{font-size:28px; font-weight:700; text-align:center; margin:20px 0; color:#1e3a8a; padding:20px; border:3px solid #1e3a8a; border-radius:10px; background:#eff6ff}.resume{display:flex; justify-content:space-around; margin:15px 0; font-size:16px}</style></head><body><div class="entete">${logo}<div><h1>${escapeHtml(params.nom)}</h1><p>${escapeHtml(params.ville)} - ${escapeHtml(params.quartier)}</p></div></div><h2 style="text-align:center">${escapeHtml(titre)}</h2><p><b>Période:</b> ${escapeHtml(periode)}</p>${resumeHtml}${tableHtml}</body></html>`;
}

async function imprimerEtat(idOrGeneral) {
  const isGeneral = idOrGeneral === 'general';
  const caisse = isGeneral ? null : caisses.find(c => c.id === idOrGeneral);
  if (!isGeneral && !caisse) return;
  const titre = isGeneral ? "ETAT GENERAL DES CAISSES" : "RELEVE DE LA CAISSE : " + caisse.nom;
  const periode = document.getElementById('filtrePeriode').selectedOptions[0].text;
  const mv = filtrerParPeriode(mouvements);
  const idsGenerales = new Set(caisses.filter(c => c.incluse_caisse_generale).map(c => c.id));

  let totalEntrees, totalDepenses, mvFiltres;
  if (isGeneral) {
    totalEntrees = mv.filter(m => m.type === 'entree' && idsGenerales.has(m.caisse_id)).reduce((a, b) => a + Number(b.montant), 0);
    totalDepenses = mv.filter(m => m.type === 'depense' && m.caisse_id === null).reduce((a, b) => a + Number(b.montant), 0);
    mvFiltres = mv.filter(m => idsGenerales.has(m.caisse_id) || (m.type === 'depense' && m.caisse_id === null));
  } else {
    totalEntrees = mv.filter(m => m.type === 'entree' && m.caisse_id === caisse.id).reduce((a, b) => a + Number(b.montant), 0);
    totalDepenses = mv.filter(m => m.type === 'depense' && m.caisse_id === caisse.id).reduce((a, b) => a + Number(b.montant), 0);
    mvFiltres = mv.filter(m => m.caisse_id === caisse.id);
  }
  const solde = totalEntrees - totalDepenses;
  const lignes = mvFiltres.map(m => `<tr><td>${escapeHtml(m.date)}</td><td>${escapeHtml(caisseNomDe(m))}</td><td>${m.type === 'entree' ? 'Entrée' : 'Dépense'}</td><td>${escapeHtml(nomDe(m))}</td><td>${Number(m.montant).toLocaleString()}</td><td>${escapeHtml(m.motif || '')}</td></tr>`).join('');

  const resumeHtml = `<div class="resume"><div><b>TOTAL ENTREES:</b> ${totalEntrees.toLocaleString()} FCFA</div><div><b>TOTAL DEPENSES:</b> ${totalDepenses.toLocaleString()} FCFA</div></div><p class="total">SOLDE GLOBAL: ${solde.toLocaleString()} FCFA</p>`;
  const tableHtml = `<table><thead><tr><th>Date</th><th>Caisse</th><th>Type</th><th>Nom</th><th>Montant</th><th>Motif</th></tr></thead><tbody>${lignes}</tbody></table>`;

  const contenu = pageImpression(titre, periode, resumeHtml, tableHtml);
  const w = window.open('');
  w.document.write(contenu);
  w.document.close();
  setTimeout(() => w.print(), 800);
}

async function imprimerEtatMembre(id) {
  const m = membres.find(x => x.id === id);
  if (!m) return;
  const mv = filtrerParPeriode(mouvements).filter(x => x.membre_id === id);
  const totalEntrees = mv.filter(x => x.type === 'entree').reduce((a, b) => a + Number(b.montant), 0);
  const lignes = mv.map(x => `<tr><td>${escapeHtml(x.date)}</td><td>${escapeHtml(caisseNomDe(x))}</td><td>${x.type === 'entree' ? 'Entrée' : 'Dépense'}</td><td>${Number(x.montant).toLocaleString()}</td><td>${escapeHtml(x.motif || '')}</td></tr>`).join('');
  const periode = document.getElementById('filtrePeriode').selectedOptions[0].text;
  const resumeHtml = `<div class="resume"><div><b>TOTAL VERSE:</b> ${totalEntrees.toLocaleString()} FCFA</div></div>`;
  const tableHtml = `<table><thead><tr><th>Date</th><th>Caisse</th><th>Type</th><th>Montant</th><th>Motif</th></tr></thead><tbody>${lignes}</tbody></table>`;
  const contenu = pageImpression("RELEVE INDIVIDUEL : " + m.nom_complet, periode, resumeHtml, tableHtml);
  const w = window.open('');
  w.document.write(contenu);
  w.document.close();
  setTimeout(() => w.print(), 800);
}

async function imprimerGraphique() {
  const logo = params.logo_url ? `<img src="${params.logo_url}" style="height:80px">` : '';
  const periode = document.getElementById('filtrePeriode').selectedOptions[0].text;
  const solde = getSolde("Caisse Générale");
  const imgGraph = await genererGraphiqueImage();
  const contenu = `<html><head><style>body{font-family:Poppins; padding:20px; text-align:center}.entete{display:flex; align-items:center; gap:15px; border-bottom:2px solid #1e3a8a; text-align:left} h1{margin:0}.total{font-size:28px; font-weight:700; margin:20px 0; color:#1e3a8a; padding:20px; border:3px solid #1e3a8a; border-radius:10px; background:#eff6ff; display:inline-block}</style></head><body><div class="entete">${logo}<div><h1>${escapeHtml(params.nom)}</h1><p>${escapeHtml(params.ville)} - ${escapeHtml(params.quartier)}</p></div></div><h2>GRAPHIQUE ANNUEL - CAISSE GENERALE</h2><p><b>Période:</b> ${escapeHtml(periode)}</p><p class="total">SOLDE ACTUEL: ${solde.toLocaleString()} FCFA</p><div><img src="${imgGraph}" style="width:100%; max-width:1000px"></div></body></html>`;
  const w = window.open(''); w.document.write(contenu); w.document.close(); setTimeout(() => w.print(), 800);
}

async function exportPDFGeneral() {
  showPage('accueil');
  await new Promise(r => setTimeout(r, 50));
  alert("Génération du PDF en cours...");
  const element = document.getElementById('page-accueil');
  const canvas = await html2canvas(element, { scale: 2 });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('l', 'mm', 'a4');
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
  pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
  pdf.save("Etat_General_" + new Date().toISOString().split('T')[0] + ".pdf");
}

function genererPDF(id) {
  const r = mouvements.find(x => x.id === id && x.type === 'entree');
  if (!r) return;
  const nomAffiche = nomDe(r);
  const caisseNom = caisseNomDe(r);
  const userNom = profilsMap[r.user_id] || 'Trésorier';
  const numero = r.numero_recu || r.id.slice(0, 8);
  const doc = new jsPDF();
  if (params.logo_url) { try { doc.addImage(params.logo_url, 'PNG', 85, 10, 40, 20); } catch (e) {} }
  doc.setFontSize(18); doc.text(params.nom, 105, 35, { align: "center" });
  doc.setFontSize(11); doc.text(params.ville + " - " + params.quartier, 105, 42, { align: "center" });
  doc.line(20, 50, 190, 50);
  doc.setFontSize(16); doc.text("RECU DE DON / OFFRANDE", 105, 60, { align: "center" });
  doc.setFontSize(12);
  doc.text("N°: " + numero, 20, 75);
  doc.text("Date: " + r.date, 150, 75);
  doc.text("Reçu de: " + nomAffiche, 20, 90);
  doc.text("Montant: " + Number(r.montant).toLocaleString() + " FCFA", 20, 105);
  doc.text("Motif: " + (r.motif || ''), 20, 120);
  doc.text("Caisse: " + caisseNom, 20, 135);
  doc.text("Reçu par: " + userNom, 20, 150);
  doc.text("Signature et Cachet", 150, 170);
  doc.save("Recu_" + nomAffiche + "_" + numero + ".pdf");
}

function exportExcel() {
  const ws_data = [["Date", "Caisse", "Type", "Nom", "Montant", "Motif", "Utilisateur", "N° Reçu"]];
  mouvements.forEach(m => {
    ws_data.push([m.date, caisseNomDe(m), m.type === 'entree' ? 'Entrée' : 'Dépense', nomDe(m), Number(m.montant), m.motif || '', profilsMap[m.user_id] || '', m.numero_recu || '']);
  });
  const ws = XLSX.utils.aoa_to_sheet(ws_data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Mouvements");
  XLSX.writeFile(wb, "Tresorerie_" + new Date().toISOString().split('T')[0] + ".xlsx");
}

// ---------- Modal mouvement (ajout / dépense / modification) ----------

function toggleNomLibre() {
  const val = document.getElementById('selMembre').value;
  document.getElementById('nomLibreSaisie').classList.toggle('hidden', !!val);
  if (val) document.getElementById('nomLibreSaisie').value = '';
}

function ouvrir(type, id = null) {
  document.getElementById('idModif').value = id || "";
  document.getElementById('typeSaisie').value = type;
  document.getElementById('titreModal').innerText = id ? 'MODIFIER' : (type === 'ajout' ? 'AJOUTER RECETTE' : 'SAISIR DEPENSE');
  document.getElementById('erreurSaisie').textContent = '';

  const selCaisse = document.getElementById('selCaisse');
  selCaisse.innerHTML = "";
  caissesActives().forEach(c => selCaisse.innerHTML += `<option value="${c.id}">${escapeHtml(c.nom)}</option>`);
  if (type === 'depense') selCaisse.innerHTML += `<option value="">Caisse Générale</option>`;

  const selMembre = document.getElementById('selMembre');
  selMembre.innerHTML = `<option value="">-- Autre / non enregistré --</option>`;
  membres.filter(m => m.actif).forEach(m => selMembre.innerHTML += `<option value="${m.id}">${escapeHtml(m.nom_complet)}</option>`);

  if (id) {
    const item = mouvements.find(x => x.id === id);
    document.getElementById('dateSaisie').value = item.date;
    selCaisse.value = item.caisse_id || "";
    selMembre.value = item.membre_id || "";
    document.getElementById('nomLibreSaisie').value = item.nom_libre || "";
    document.getElementById('montantSaisie').value = item.montant;
    document.getElementById('motifSaisie').value = item.motif || "";
  } else {
    document.getElementById('dateSaisie').value = new Date().toISOString().split('T')[0];
    selMembre.value = "";
    document.getElementById('nomLibreSaisie').value = "";
    document.getElementById('montantSaisie').value = "";
    document.getElementById('motifSaisie').value = "";
  }
  document.getElementById('genereRecu').checked = false;
  toggleNomLibre();
  document.getElementById('modal').style.display = 'flex';
}

function modifier(id) {
  const item = mouvements.find(x => x.id === id);
  if (!item) return;
  ouvrir(item.type === 'entree' ? 'ajout' : 'depense', id);
}

function fermer() { document.getElementById('modal').style.display = 'none'; }

async function enregistrer() {
  const id = document.getElementById('idModif').value;
  const type = document.getElementById('typeSaisie').value === 'ajout' ? 'entree' : 'depense';
  const caisseVal = document.getElementById('selCaisse').value;
  const membreVal = document.getElementById('selMembre').value;
  const nomLibre = document.getElementById('nomLibreSaisie').value.trim();
  const montant = parseFloat(document.getElementById('montantSaisie').value) || 0;
  const dateVal = document.getElementById('dateSaisie').value;
  const err = document.getElementById('erreurSaisie');
  err.textContent = '';

  if (montant <= 0) { err.textContent = "Montant invalide"; return; }
  if (!membreVal && !nomLibre) { err.textContent = "Indique un membre ou un nom"; return; }
  if (!dateVal) { err.textContent = "Date requise"; return; }

  const obj = {
    type,
    caisse_id: caisseVal || null,
    membre_id: membreVal || null,
    nom_libre: membreVal ? null : nomLibre,
    date: dateVal,
    montant,
    motif: document.getElementById('motifSaisie').value.trim(),
  };

  try {
    let savedId = id;
    if (id) {
      const { error } = await supabase.from('mouvements').update(obj).eq('id', id);
      if (error) throw error;
    } else {
      obj.user_id = session.user.id;
      const { data: inserted, error } = await supabase.from('mouvements').insert(obj).select().single();
      if (error) throw error;
      savedId = inserted.id;
    }

    const genererRecu = document.getElementById('genereRecu').checked && type === 'entree';
    if (genererRecu) {
      const { data: numero } = await supabase.rpc('prochain_numero_recu');
      if (numero) await supabase.from('mouvements').update({ numero_recu: numero }).eq('id', savedId);
    }

    await chargerMouvements();
    fermer();
    afficher();
    if (genererRecu) genererPDF(savedId);
  } catch (e) {
    err.textContent = "Erreur: " + e.message;
  }
}

async function supprimer(id) {
  if (!confirm("Supprimer ce mouvement ?")) return;
  const { error } = await supabase.from('mouvements').delete().eq('id', id);
  if (error) { alert("Erreur: " + error.message); return; }
  await chargerMouvements();
  afficher();
}

// ---------- Page Membres ----------

function afficherMembres() {
  const recherche = (document.getElementById('rechercheMembre').value || '').toLowerCase();
  const peutEcrire = profil && profil.role !== 'lecture_seule';
  let html = "";
  membres
    .filter(m => m.nom_complet.toLowerCase().includes(recherche))
    .forEach(m => {
      const total = mouvements.filter(x => x.type === 'entree' && x.membre_id === m.id).reduce((a, b) => a + Number(b.montant), 0);
      html += `<tr>
        <td>${escapeHtml(m.nom_complet)}</td>
        <td>${escapeHtml(m.telephone || '-')}</td>
        <td>${total.toLocaleString()} FCFA</td>
        <td>${m.actif ? '<span class="badge badge-entree">Actif</span>' : '<span class="badge badge-depense">Inactif</span>'}</td>
        <td>
          <button class="btn-action btn-violet" data-action="etat" data-id="${m.id}">ETAT</button>
          ${peutEcrire ? `<button class="btn-action btn-orange" data-action="modifier-membre" data-id="${m.id}">MODIF</button>` : ''}
        </td>
      </tr>`;
    });
  if (!html) html = '<tr><td colspan="5" style="text-align:center">Aucun membre</td></tr>';
  document.getElementById('tbodyMembres').innerHTML = html;
}

function ouvrirMembre(id = null) {
  document.getElementById('idMembreModif').value = id || '';
  document.getElementById('titreModalMembre').textContent = id ? 'MODIFIER MEMBRE' : 'NOUVEAU MEMBRE';
  document.getElementById('erreurMembre').textContent = '';
  if (id) {
    const m = membres.find(x => x.id === id);
    document.getElementById('nomMembreSaisie').value = m.nom_complet;
    document.getElementById('telMembreSaisie').value = m.telephone || '';
    document.getElementById('actifMembreSaisie').checked = m.actif;
  } else {
    document.getElementById('nomMembreSaisie').value = '';
    document.getElementById('telMembreSaisie').value = '';
    document.getElementById('actifMembreSaisie').checked = true;
  }
  document.getElementById('modalMembre').style.display = 'flex';
}
function fermerMembre() { document.getElementById('modalMembre').style.display = 'none'; }

async function enregistrerMembre() {
  const id = document.getElementById('idMembreModif').value;
  const nom_complet = document.getElementById('nomMembreSaisie').value.trim();
  const telephone = document.getElementById('telMembreSaisie').value.trim();
  const actif = document.getElementById('actifMembreSaisie').checked;
  const err = document.getElementById('erreurMembre');
  err.textContent = '';
  if (!nom_complet) { err.textContent = "Le nom est requis"; return; }
  const obj = { nom_complet, telephone: telephone || null, actif };
  const res = id
    ? await supabase.from('membres').update(obj).eq('id', id)
    : await supabase.from('membres').insert(obj);
  if (res.error) { err.textContent = "Erreur: " + res.error.message; return; }
  await chargerMembres();
  fermerMembre();
  afficherMembres();
}

// ---------- Paramètres / Caisses ----------

function ouvrirParam() {
  document.getElementById('inpNom').value = params.nom;
  document.getElementById('inpVille').value = params.ville;
  document.getElementById('inpQuartier').value = params.quartier;
  if (params.logo_url) {
    document.getElementById('apercuLogo').src = params.logo_url;
    document.getElementById('apercuLogo').style.display = 'block';
  }
  const estPrincipal = profil && profil.role === 'tresorier_principal';
  ['inpNom', 'inpVille', 'inpQuartier', 'inpLogo'].forEach(id => { document.getElementById(id).disabled = !estPrincipal; });
  document.querySelector('#modalParam .btn-save').style.display = estPrincipal ? 'block' : 'none';
  renderListeCaisses();
  document.getElementById('modalParam').style.display = 'flex';
}
function fermerParam() { document.getElementById('modalParam').style.display = 'none'; }

function renderListeCaisses() {
  const bloc = document.getElementById('blocCaisses');
  if (!profil || profil.role !== 'tresorier_principal') { bloc.classList.add('hidden'); return; }
  bloc.classList.remove('hidden');
  let html = "";
  caisses.forEach(c => {
    html += `<div class="caisse-row">
      <span>${escapeHtml(c.nom)}</span>
      <label style="width:auto"><input type="checkbox" data-action="toggle-caisse" data-id="${c.id}" ${c.actif ? 'checked' : ''}> Active</label>
      <label style="width:auto"><input type="checkbox" data-action="toggle-generale" data-id="${c.id}" ${c.incluse_caisse_generale ? 'checked' : ''}> Dans caisse générale</label>
    </div>`;
  });
  document.getElementById('listeCaisses').innerHTML = html;
}

async function ajouterCaisse() {
  const nom = document.getElementById('nouvelleCaisse').value.trim();
  if (!nom) return;
  const ordre = caisses.length ? Math.max(...caisses.map(c => c.ordre || 0)) + 1 : 1;
  const { error } = await supabase.from('caisses').insert({ nom, ordre, incluse_caisse_generale: true, actif: true });
  if (error) { alert("Erreur: " + error.message); return; }
  document.getElementById('nouvelleCaisse').value = '';
  await chargerCaisses();
  renderListeCaisses();
  afficher();
}

async function sauverParam() {
  const nom = document.getElementById('inpNom').value.trim();
  const ville = document.getElementById('inpVille').value.trim();
  const quartier = document.getElementById('inpQuartier').value.trim();
  const file = document.getElementById('inpLogo').files[0];

  const appliquer = async (logoUrl) => {
    const maj = { nom, ville, quartier };
    if (logoUrl !== undefined) maj.logo_url = logoUrl;
    const { error } = await supabase.from('params').update(maj).eq('id', 1);
    if (error) { alert("Erreur: " + error.message); return; }
    await chargerParams();
    fermerParam();
    alert("Paramètres enregistrés avec succès!");
  };

  if (file) {
    const reader = new FileReader();
    reader.onload = e => appliquer(e.target.result);
    reader.readAsDataURL(file);
  } else {
    await appliquer(undefined);
  }
}

// ---------- Ecouteurs delegués (évite les onclick avec données dynamiques) ----------

let ecouteursAttaches = false;
function attacherEcouteurs() {
  if (ecouteursAttaches) return;
  ecouteursAttaches = true;
  document.getElementById('grilleCaisses').addEventListener('click', e => {
    const card = e.target.closest('[data-caisse]');
    if (card) imprimerEtat(card.dataset.caisse);
  });
  document.getElementById('tbodyMouvements').addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'modifier') modifier(id);
    else if (btn.dataset.action === 'supprimer') supprimer(id);
    else if (btn.dataset.action === 'recu') genererPDF(id);
  });
  document.getElementById('tbodyMembres').addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'etat') imprimerEtatMembre(id);
    else if (btn.dataset.action === 'modifier-membre') ouvrirMembre(id);
  });
  document.getElementById('listeCaisses').addEventListener('change', async e => {
    const el = e.target.closest('input[data-action]');
    if (!el) return;
    const id = el.dataset.id;
    if (el.dataset.action === 'toggle-caisse') await supabase.from('caisses').update({ actif: el.checked }).eq('id', id);
    else if (el.dataset.action === 'toggle-generale') await supabase.from('caisses').update({ incluse_caisse_generale: el.checked }).eq('id', id);
    await chargerCaisses();
    afficher();
  });
}

// ---------- Démarrage ----------

supabase.auth.onAuthStateChange((event, sess) => {
  if (event === 'PASSWORD_RECOVERY') { ouvrirNouveauMotDePasse(); return; }
  if (sess) demarrerApresConnexion(sess);
});

Object.assign(window, {
  showPage, ouvrir, imprimerEtat, imprimerGraphique, exportPDFGeneral, exportExcel, ouvrirParam,
  basculerOnglet, connexion, inscription, deconnexion, connexionGoogle, motDePasseOublie, validerNouveauMotDePasse, lancerModeDemo,
  toggleDates, afficher, enregistrer, fermer,
  toggleNomLibre, ouvrirMembre, enregistrerMembre, fermerMembre, afficherMembres, ajouterCaisse,
  sauverParam, fermerParam, afficherDashboard, modifier, supprimer, genererPDF, imprimerEtatMembre,
  cloturerExercice
});
