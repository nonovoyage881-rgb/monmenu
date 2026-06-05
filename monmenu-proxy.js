/* ════════════════════════════════════════════════════════════════
   monmenu-proxy.js — Proxy GRATUIT & SÉCURISÉ pour l'assistant IA
   À déployer sur Cloudflare Workers (offre gratuite, sans carte).

   Par défaut, il relaie vers Google Gemini (palier gratuit : 1500
   requêtes/jour, sans carte bancaire). La clé Gemini reste ici,
   côté serveur ; la famille accède via un simple MOT DE PASSE.

   Variables à définir dans Cloudflare
   (Worker → Settings → Variables and Secrets) :
     • GEMINI_KEY       (Secret) → votre clé gratuite Google AI Studio
     • FAMILY_PASSWORD  (Secret) → mot de passe partagé à la famille
     • ALLOWED_ORIGIN   (Text)   → https://VOTRE-PSEUDO.github.io
   ════════════════════════════════════════════════════════════════ */

// Fournisseur en amont. Gemini par défaut (gratuit).
// Pour utiliser un autre fournisseur compatible OpenAI (Groq, etc.),
// changez simplement cette adresse.
const UPSTREAM = 'https://generativelanguage.googleapis.com';

export default {
  async fetch(request, env) {
    const allowed = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'access-control-allow-origin': allowed,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-max-age': '86400',
    };

    // 1) Pré-vérification CORS du navigateur
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    // 2) On n'accepte que les POST
    if (request.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405, cors);

    // 3) Contrôle du mot de passe familial
    //    (l'app l'envoie dans « Authorization: Bearer <mot de passe> »)
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!env.FAMILY_PASSWORD || token !== env.FAMILY_PASSWORD) {
      return json({ error: 'Accès refusé : mot de passe familial invalide.' }, 401, cors);
    }

    // 4) Relai vers Gemini avec la VRAIE clé (ajoutée ici, jamais exposée)
    const url = new URL(request.url);
    const upstreamUrl = UPSTREAM + url.pathname; // ex : /v1beta/openai/chat/completions
    const res = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.GEMINI_KEY}` },
      body: await request.text(),
    });

    return new Response(res.body, {
      status: res.status,
      headers: { 'content-type': 'application/json', ...cors },
    });
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...cors } });
}
