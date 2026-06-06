/* ════════════════════════════════════════════════════════════════
   sync.js — Synchronisation familiale en temps réel (Supabase)
   Chaque « collection » (recipes, fridge, planning, shopping, goals)
   est stockée comme une ligne partagée, identifiée par un code
   famille. À chaque modification locale, on pousse la collection ;
   on s'abonne aux changements distants pour les appliquer en direct.
   Le client Supabase est chargé à la volée (aucune dépendance de build).
   ════════════════════════════════════════════════════════════════ */

const COLLECTIONS = ['recipes', 'fridge', 'planning', 'shopping', 'goals'];

let supa = null;       // client Supabase
let cfg = null;        // { url, anonKey, family }
let applyCb = null;    // callback(coll, value) pour appliquer un changement distant
let suppress = false;  // évite de re-pousser un changement reçu du serveur
let ready = false;

export function syncEnabled(s) {
  return !!(s && s.url && s.anonKey && s.family);
}
export function isSyncReady() { return ready; }

/* Connexion + chargement initial + abonnement temps réel */
export async function initSync(config, applyRemote) {
  cfg = config; applyCb = applyRemote; ready = false;
  if (!syncEnabled(cfg)) return { ok: false, reason: 'INCOMPLETE' };

  let createClient;
  try {
    ({ createClient } = await import('https://esm.sh/@supabase/supabase-js@2'));
  } catch (e) {
    return { ok: false, reason: 'LOAD_FAILED' };
  }

  try {
    supa = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });

    // 1) Chargement initial des données partagées
    const { data, error } = await supa
      .from('monmenu').select('coll,data').eq('family', cfg.family);
    if (error) return { ok: false, reason: 'QUERY_FAILED', message: error.message };

    if (data && data.length) {
      suppress = true;
      for (const row of data) if (COLLECTIONS.includes(row.coll)) applyCb(row.coll, row.data);
      suppress = false;
    }

    // 2) Abonnement temps réel
    supa.channel('monmenu-' + cfg.family)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'monmenu', filter: `family=eq.${cfg.family}` },
        (payload) => {
          const row = payload.new;
          if (!row || !COLLECTIONS.includes(row.coll)) return;
          suppress = true; applyCb(row.coll, row.data); suppress = false;
        })
      .subscribe();

    ready = true;
    return { ok: true, count: (data ? data.length : 0) };
  } catch (e) {
    return { ok: false, reason: 'INIT_FAILED', message: e.message };
  }
}

/* Pousse une collection vers la base partagée */
export async function pushCollection(key, value) {
  if (!supa || !cfg || suppress || !COLLECTIONS.includes(key)) return;
  try {
    await supa.from('monmenu').upsert(
      { family: cfg.family, coll: key, data: value, updated_at: new Date().toISOString() },
      { onConflict: 'family,coll' }
    );
  } catch (e) { /* hors ligne : on réessaiera à la prochaine modification */ }
}
