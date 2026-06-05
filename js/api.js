/* ════════════════════════════════════════════════════════════════
   api.js — Accès réseau : TheMealDB (recettes) + IA culinaire
   ════════════════════════════════════════════════════════════════ */

import { uid } from './utils.js';
import { state } from './store.js';

/* ───────────────────────── TheMealDB ─────────────────────────
   API publique gratuite, clé de test « 1 », compatible CORS.
   Docs : https://www.themealdb.com/api.php
*/
const MEALDB = 'https://www.themealdb.com/api/json/v1/1';

/* Transforme un objet « meal » TheMealDB vers notre format de recette */
export function mapMeal(meal) {
  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const name = (meal[`strIngredient${i}`] || '').trim();
    const measure = (meal[`strMeasure${i}`] || '').trim();
    if (!name) continue;
    const { qty, unit } = parseMeasure(measure);
    ingredients.push({ name, qty, unit, raw: measure });
  }
  const steps = (meal.strInstructions || '')
    .split(/\r?\n|\.\s+(?=[A-ZÀ-Ý])/)
    .map(s => s.trim())
    .filter(s => s.length > 4);

  return {
    id: 'mdb_' + meal.idMeal,
    externalId: meal.idMeal,
    name: meal.strMeal,
    emoji: '🍽️',
    image: meal.strMealThumb || null,
    category: meal.strCategory || 'Plat',
    origin: meal.strArea || '',
    tags: (meal.strTags || '').split(',').map(t => t.trim()).filter(Boolean),
    portions: 4,            // TheMealDB ne fournit pas le nombre de portions
    prepTime: 0, cookTime: 0,
    ingredients, steps,
    nutrition: null,        // estimée localement via la base FOOD_DB
    source: 'mealdb',
    sourceUrl: meal.strSource || `https://www.themealdb.com/meal/${meal.idMeal}`,
    youtube: meal.strYoutube || '',
  };
}

/* Extrait une quantité + unité d'une mesure libre (« 200g », « 2 tbsp », « 1 cup ») */
function parseMeasure(m = '') {
  const match = m.match(/([\d.,/]+)\s*([a-zA-Zàéè²]*)/);
  if (!match) return { qty: 0, unit: m };
  let qty = match[1];
  if (qty.includes('/')) { const [a, b] = qty.split('/').map(Number); qty = b ? a / b : a; }
  else qty = parseFloat(qty.replace(',', '.')) || 0;
  const unit = (match[2] || '').toLowerCase()
    .replace(/^g.*/, 'g').replace(/^kg.*/, 'kg')
    .replace(/^ml.*/, 'ml').replace(/^l$/, 'l')
    .replace(/tbsp|tablespoon/, 'c. à s.').replace(/tsp|teaspoon/, 'c. à c.')
    .replace(/cup.*/, 'tasse');
  return { qty, unit: unit || '' };
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Réseau : ' + res.status);
  return res.json();
}

/* Recherche par nom (recettes complètes) */
export async function searchByName(q) {
  const data = await getJSON(`${MEALDB}/search.php?s=${encodeURIComponent(q)}`);
  return (data.meals || []).map(mapMeal);
}

/* Filtre (ingrédient / catégorie / pays) → résultats partiels, complétés via lookup */
export async function filterBy(type, value) {
  const param = { ingredient: 'i', category: 'c', area: 'a' }[type];
  const data = await getJSON(`${MEALDB}/filter.php?${param}=${encodeURIComponent(value)}`);
  const meals = (data.meals || []).slice(0, 24); // limite raisonnable
  // Détails complets (en parallèle, par lots)
  const full = await Promise.all(meals.map(m => lookup(m.idMeal).catch(() => null)));
  return full.filter(Boolean);
}

/* Détail complet d'une recette par identifiant */
export async function lookup(id) {
  const data = await getJSON(`${MEALDB}/lookup.php?i=${encodeURIComponent(id)}`);
  return data.meals?.[0] ? mapMeal(data.meals[0]) : null;
}

/* ───────────────────────── Assistant IA ─────────────────────────
   Utilise la clé d'API de l'utilisateur (stockée localement).
   Compatible OpenAI, Anthropic, ou tout endpoint compatible OpenAI.
   Retourne un objet JSON structuré : { type, recipe?, menu?, message? }.
*/

const SYSTEM_PROMPT = `Tu es un chef cuisinier assistant. Tu réponds UNIQUEMENT en JSON valide, sans texte autour, sans balises Markdown.
Schéma attendu :
{
  "type": "recipe" | "menu" | "text",
  "message": "courte phrase d'introduction en français",
  "recipe": {                        // si type=recipe
    "name": "string", "emoji": "un émoji", "category": "Entrée|Plat|Dessert|...",
    "origin": "pays", "portions": 4, "prepTime": minutes, "cookTime": minutes,
    "ingredients": [ { "name": "string", "qty": number, "unit": "g|ml|pièce|c. à s." } ],
    "steps": ["étape 1", "étape 2"],
    "nutrition": { "calories": number, "protein": number, "carbs": number, "fat": number },  // PAR PORTION
    "estimatedCostPerPerson": number   // en euros
  },
  "menu": [                          // si type=menu (une entrée par jour)
    { "day": "Lundi", "meals": { "lunch": <recipe>, "dinner": <recipe> } }
  ]
}
Règles : quantités réalistes, nutrition par portion, coûts en euros pour la France. Réponds toujours en français.`;

/* Construit le message utilisateur en y injectant le contexte (frigo, objectifs) si pertinent */
function buildUserMessage(prompt) {
  let ctx = '';
  if (/frigo|j'ai|que j'ai|mes ingr/i.test(prompt) && state.fridge.length) {
    ctx = `\n\nContenu actuel de mon frigo : ${state.fridge.map(f => `${f.name} (${f.qty} ${f.unit})`).join(', ')}.`;
  }
  return prompt + ctx;
}

/* Extrait le JSON même si le modèle ajoute du texte ou des ``` autour */
function parseAIJson(text) {
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const first = t.indexOf('{'); const last = t.lastIndexOf('}');
  if (first !== -1 && last !== -1) t = t.slice(first, last + 1);
  return JSON.parse(t);
}

/* Appel IA principal */
export async function askAI(prompt) {
  const ai = state.settings.ai;
  if (!ai.key) {
    const err = new Error('NO_KEY');
    err.code = 'NO_KEY';
    throw err;
  }
  const userMsg = buildUserMessage(prompt);
  let text;

  if (ai.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ai.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: ai.model || 'claude-3-5-haiku-latest',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });
    if (!res.ok) throw new Error('IA ' + res.status + ' : ' + (await res.text()).slice(0, 200));
    const data = await res.json();
    text = (data.content || []).map(b => b.text || '').join('\n');
  } else {
    // OpenAI ou compatible
    const base = ai.provider === 'custom' && ai.baseUrl ? ai.baseUrl.replace(/\/$/, '') : 'https://api.openai.com/v1';
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${ai.key}` },
      body: JSON.stringify({
        model: ai.model || 'gpt-4o-mini',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userMsg }],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) throw new Error('IA ' + res.status + ' : ' + (await res.text()).slice(0, 200));
    const data = await res.json();
    text = data.choices?.[0]?.message?.content || '';
  }

  const parsed = parseAIJson(text);
  return normalizeAIResult(parsed);
}

/* Normalise une recette issue de l'IA vers notre format de carnet */
export function aiRecipeToStore(r) {
  return {
    id: 'ai_' + uid(),
    name: r.name || 'Recette IA', emoji: r.emoji || '🤖', image: null,
    category: r.category || 'Plat', origin: r.origin || '',
    tags: ['IA'], portions: r.portions || 4,
    prepTime: r.prepTime || 0, cookTime: r.cookTime || 0,
    ingredients: (r.ingredients || []).map(i => ({ name: i.name, qty: Number(i.qty) || 0, unit: i.unit || '' })),
    steps: r.steps || [],
    nutrition: r.nutrition || null,
    source: 'ai',
  };
}

function normalizeAIResult(parsed) {
  if (parsed.type === 'recipe' && parsed.recipe) parsed.recipe = aiRecipeToStore(parsed.recipe);
  if (parsed.type === 'menu' && Array.isArray(parsed.menu)) {
    parsed.menu = parsed.menu.map(d => ({
      day: d.day || '',
      meals: Object.fromEntries(Object.entries(d.meals || {}).map(([k, v]) => [k, aiRecipeToStore(v)])),
    }));
  }
  return parsed;
}
