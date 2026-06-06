/* ════════════════════════════════════════════════════════════════
   utils.js — Fonctions utilitaires partagées
   ════════════════════════════════════════════════════════════════ */

/* Identifiant unique court */
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* Normalisation d'un libellé d'ingrédient : minuscules, sans accents, sans pluriel simple */
export function normalize(str = '') {
  return str
    .toString()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // retire les accents
    .replace(/\(.*?\)/g, '')                          // retire les parenthèses
    .replace(/\b(de|du|des|la|le|les|d|l)\b/g, ' ')   // articles
    .replace(/s\b/g, '')                              // pluriels simples
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Échappement HTML pour éviter toute injection lors de l'affichage de texte utilisateur/API */
export function esc(str = '') {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ───────── Dates (clé ISO YYYY-MM-DD en heure locale, sans décalage UTC) ───────── */
export function isoDate(d = new Date()) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().split('T')[0];
}
export function todayISO() { return isoDate(new Date()); }
export function addDays(iso, n) { const d = new Date(iso + 'T00:00'); d.setDate(d.getDate() + n); return isoDate(d); }

/* Lundi de la semaine contenant la date */
export function weekStart(iso) {
  const d = new Date(iso + 'T00:00');
  const day = (d.getDay() + 6) % 7; // 0 = lundi
  d.setDate(d.getDate() - day);
  return isoDate(d);
}
/* Les 7 dates (lun→dim) de la semaine de `iso` */
export function weekDates(iso) {
  const start = weekStart(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
export function fmtDay(iso, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return new Date(iso + 'T00:00').toLocaleDateString('fr-FR', opts);
}
export function fmtShort(iso) { return new Date(iso + 'T00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); }

/* Différence en jours entre aujourd'hui et une date (négatif = passé) */
export function daysUntil(iso) {
  if (!iso) return null;
  const diff = new Date(iso + 'T00:00') - new Date(todayISO() + 'T00:00');
  return Math.round(diff / 86400000);
}

/* ───────── Formatage ───────── */
export function euro(n) { return (Number(n) || 0).toFixed(2).replace('.', ',') + ' €'; }
export function round(n, d = 0) { const f = 10 ** d; return Math.round((Number(n) || 0) * f) / f; }
/* Affiche une quantité proprement (entier si possible) */
export function qtyFmt(n) { const r = round(n, 1); return Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ','); }

/* ───────── Toast ───────── */
let toastTimer = null;
export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ───────── Modales ───────── */
export function openModal(id) { document.getElementById(id)?.classList.add('open'); }
export function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
export function closeAllModals() { document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open')); }

/* ───────── Indicateur de synchronisation ───────── */
let syncTimer = null;
export function setSync(state /* 'syncing' | 'synced' */) {
  ['sync-pill', 'sync-pill-m'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = `sync-pill visible ${state}`;
    const lbl = el.querySelector('#sync-label');
    if (lbl) lbl.textContent = state === 'syncing' ? 'Sync…' : 'Synchronisé';
  });
  clearTimeout(syncTimer);
  if (state === 'synced') {
    syncTimer = setTimeout(() => {
      ['sync-pill', 'sync-pill-m'].forEach(id => document.getElementById(id)?.classList.remove('visible'));
    }, 2200);
  }
}

/* Petit délai (utilisé pour debounce) */
export function debounce(fn, ms = 350) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* Téléchargement d'un fichier texte/blob */
export function downloadFile(filename, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
