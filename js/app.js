/* ════════════════════════════════════════════════════════════════
   app.js — Point d'entrée : démarrage, navigation, câblage des
   contrôles statiques, écoute du store et enregistrement du SW.
   Chargé en <script type="module"> → exécution différée, DOM prêt.
   ════════════════════════════════════════════════════════════════ */

import { initStore, bus, state, autoGenerateWeek, generateShopping, clearChecked,
         exportData, importData, resetAll, setAISettings } from './store.js';
import { askAI } from './api.js';
import { openRecipeForm, openFridgeForm } from './ui.js';
import {
  renderView, vstate, runDiscoverQuery,
  renderAIResult, renderAILoading, renderAIError, shoppingPlainText,
} from './views.js';
import { todayISO, fmtDay, debounce, toast, closeAllModals, downloadFile } from './utils.js';

let current = 'decouverte';

/* Affiche une vue, met à jour les barres de navigation et le FAB */
function navigateTo(view) {
  current = view;
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
  document.querySelectorAll('[data-view]').forEach(b => {
    const on = b.dataset.view === view;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  // FAB visible seulement là où « ajouter » a du sens
  document.getElementById('fab').classList.toggle('visible', ['carnet', 'frigo'].includes(view));
  // Réinitialise le sous-écran détail du carnet
  document.getElementById('carnet-detail-view')?.classList.add('hidden');
  document.getElementById('carnet-list-view')?.classList.remove('hidden');
  document.querySelector('.content')?.scrollTo({ top: 0 });
  renderView(view);
}

/* ───────── Câblage unique des contrôles ───────── */
function wireNav() {
  document.querySelectorAll('[data-view]').forEach(b =>
    b.addEventListener('click', () => navigateTo(b.dataset.view)));

  document.getElementById('fab').addEventListener('click', () => {
    if (current === 'carnet') openRecipeForm();
    else if (current === 'frigo') openFridgeForm();
  });

  // Fermeture des modales par clic sur le fond
  document.querySelectorAll('.overlay').forEach(ov =>
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.classList.remove('open'); }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllModals(); });
}

function wireDiscover() {
  const input = document.getElementById('discover-search');
  const run = debounce(() => { vstate.discover.search = input.value; runDiscoverQuery(); }, 450);
  input.addEventListener('input', run);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { vstate.discover.search = input.value; runDiscoverQuery(); } });

  document.querySelectorAll('#discover-mode .chip').forEach(c => c.addEventListener('click', () => {
    document.querySelectorAll('#discover-mode .chip').forEach(x => x.classList.remove('active'));
    c.classList.add('active');
    vstate.discover.mode = c.dataset.mode;
    vstate.discover.facet = null;
    vstate.discover.results = [];
    vstate.discover.error = '';
    if (c.dataset.mode === 'local') runDiscoverQuery(); else renderView('decouverte');
  }));
}

function wireAssistant() {
  const prompt = document.getElementById('ai-prompt');
  document.querySelectorAll('#ai-suggestions .sg-pill').forEach(p =>
    p.addEventListener('click', () => { prompt.value = p.dataset.p; prompt.focus(); }));

  document.getElementById('ai-send').addEventListener('click', async () => {
    const text = prompt.value.trim();
    if (!text) { toast('Décrivez votre demande'); return; }
    renderAILoading();
    try { renderAIResult(await askAI(text)); }
    catch (e) { renderAIError(e); }
  });
}

function wireCarnet() {
  const search = document.getElementById('carnet-search');
  search.addEventListener('input', debounce(() => { vstate.carnet.search = search.value; renderView('carnet'); }, 200));
  document.querySelectorAll('#carnet-filters .chip').forEach(c => c.addEventListener('click', () => {
    document.querySelectorAll('#carnet-filters .chip').forEach(x => x.classList.remove('active'));
    c.classList.add('active'); vstate.carnet.filter = c.dataset.filter; renderView('carnet');
  }));
  document.getElementById('carnet-back')?.addEventListener('click', () => {
    document.getElementById('carnet-detail-view').classList.add('hidden');
    document.getElementById('carnet-list-view').classList.remove('hidden');
  });
}

function wirePlanning() {
  document.querySelectorAll('#plan-mode button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#plan-mode button').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); vstate.planning.mode = b.dataset.mode; renderView('planning');
  }));
  document.getElementById('plan-auto').addEventListener('click', async () => {
    await autoGenerateWeek(vstate.planning.selected);
    toast('Semaine générée 🎲');
  });
  document.getElementById('plan-print').addEventListener('click', () => window.print());
}

function wireFrigo() {
  const search = document.getElementById('frigo-search');
  search.addEventListener('input', debounce(() => { vstate.frigo.search = search.value; renderView('frigo'); }, 200));
  document.querySelectorAll('#frigo-filters .chip').forEach(c => c.addEventListener('click', () => {
    document.querySelectorAll('#frigo-filters .chip').forEach(x => x.classList.remove('active'));
    c.classList.add('active'); vstate.frigo.cat = c.dataset.cat; renderView('frigo');
  }));
  document.getElementById('frigo-cook').addEventListener('click', () => {
    vstate.frigo.showCook = !vstate.frigo.showCook; renderView('frigo');
  });
}

function wireCourses() {
  document.getElementById('courses-generate').addEventListener('click', async () => {
    await generateShopping('all');
    toast('Liste générée 🛒');
  });
  document.getElementById('courses-clear').addEventListener('click', async () => { await clearChecked(); toast('Articles cochés retirés'); });
  document.getElementById('courses-print').addEventListener('click', () => window.print());
  document.getElementById('courses-pdf').addEventListener('click', exportShoppingPDF);
}

function wireReglages() {
  const prov = document.getElementById('ai-provider');
  prov.addEventListener('change', () => {
    const custom = prov.value === 'custom';
    document.getElementById('ai-baseurl').style.display = custom ? '' : 'none';
    document.getElementById('ai-url-label').style.display = custom ? '' : 'none';
  });
  document.getElementById('ai-save').addEventListener('click', async () => {
    await setAISettings({
      provider: prov.value,
      model: document.getElementById('ai-model').value.trim(),
      baseUrl: document.getElementById('ai-baseurl').value.trim(),
      key: document.getElementById('ai-key').value.trim(),
    });
    toast('Configuration IA enregistrée 🔑');
  });

  document.getElementById('rg-export').addEventListener('click', () =>
    downloadFile(`monmenu-sauvegarde-${todayISO()}.json`, exportData()));
  document.getElementById('rg-import').addEventListener('click', () => document.getElementById('rg-file').click());
  document.getElementById('rg-file').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { await importData(await file.text()); toast('Données importées ✓'); }
    catch { toast('Fichier invalide'); }
    e.target.value = '';
  });
  document.getElementById('rg-reset').addEventListener('click', async () => {
    if (confirm('Réinitialiser toutes les données ? Cette action est irréversible.')) {
      await resetAll(); toast('Application réinitialisée');
    }
  });
}

/* Export PDF de la liste de courses (jsPDF en CDN, repli sur impression) */
async function exportShoppingPDF() {
  if (!state.shopping.length) { toast('Liste vide'); return; }
  try {
    if (!window.jspdf) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s.onload = res; s.onerror = rej; document.head.appendChild(s);
      });
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const lines = shoppingPlainText().split('\n');
    let y = 18;
    doc.setFontSize(16); doc.text('MonMenu — Liste de courses', 14, y); y += 10;
    doc.setFontSize(11);
    for (const ln of lines.slice(2)) {
      if (y > 280) { doc.addPage(); y = 18; }
      doc.text(ln || ' ', 14, y); y += 7;
    }
    doc.save(`courses-${todayISO()}.pdf`);
  } catch {
    toast('Export PDF indisponible hors ligne — impression lancée');
    window.print();
  }
}

/* ───────── Démarrage ───────── */
async function boot() {
  await initStore();

  const dateEl = document.getElementById('header-date');
  if (dateEl) dateEl.textContent = fmtDay(todayISO(), { weekday: 'short', day: 'numeric', month: 'short' });

  wireNav();
  wireDiscover();
  wireAssistant();
  wireCarnet();
  wirePlanning();
  wireFrigo();
  wireCourses();
  wireReglages();

  // Re-rendu de la vue active à chaque changement d'état
  bus.addEventListener('change', () => renderView(current));

  navigateTo('decouverte');
  renderView('reglages'); // pré-remplit les champs IA / stats en arrière-plan

  // Enregistrement du service worker (PWA)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {/* hors ligne / non supporté */});
    });
  }
}

// Invite d'installation PWA
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });

document.addEventListener('DOMContentLoaded', boot);
