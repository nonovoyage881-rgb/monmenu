/* ════════════════════════════════════════════════════════════════
   config.js — Données de référence et constantes de l'application
   Aucune dépendance ; importé par les autres modules.
   ════════════════════════════════════════════════════════════════ */

/* Repas gérés par le planning */
export const MEALS = [
  { key: 'breakfast', label: 'Petit-déjeuner', icon: '🥐' },
  { key: 'lunch',     label: 'Déjeuner',       icon: '🍽️' },
  { key: 'dinner',    label: 'Dîner',          icon: '🌙' },
  { key: 'snack',     label: 'Collation',      icon: '🍎' },
];

/* Catégories du frigo + emoji par défaut */
export const FRIDGE_CATEGORIES = {
  legumes:    { label: 'Légumes',    emoji: '🥬' },
  fruits:     { label: 'Fruits',     emoji: '🍎' },
  proteines:  { label: 'Protéines',  emoji: '🥩' },
  laitiers:   { label: 'Laitiers',   emoji: '🧀' },
  feculents:  { label: 'Féculents',  emoji: '🍞' },
  condiments: { label: 'Condiments', emoji: '🫙' },
  autres:     { label: 'Autres',     emoji: '📦' },
};

/* Rayons de supermarché pour le classement de la liste de courses */
export const AISLES = {
  produce:   { label: 'Fruits & Légumes', icon: '🥦' },
  meat:      { label: 'Boucherie & Poisson', icon: '🥩' },
  dairy:     { label: 'Crèmerie', icon: '🧀' },
  bakery:    { label: 'Boulangerie & Féculents', icon: '🍞' },
  grocery:   { label: 'Épicerie', icon: '🥫' },
  frozen:    { label: 'Surgelés', icon: '🧊' },
  drinks:    { label: 'Boissons', icon: '🧃' },
  other:     { label: 'Divers', icon: '🛒' },
};

/*
  Base de connaissances simplifiée d'ingrédients :
  - aisle    : rayon de courses
  - cat      : catégorie de frigo
  - emoji    : icône d'affichage
  - price    : prix indicatif (€) par unité de référence (100 g, 100 ml ou pièce)
  - kcal     : calories pour 100 g (ou pièce)
  - macros   : protéines / glucides / lipides pour 100 g
  Utilisée pour estimer coût et nutrition quand l'info n'est pas fournie par l'API.
  Les clés sont normalisées (minuscules, sans accent — voir utils.normalize).
*/
export const FOOD_DB = {
  'tomate':        { aisle:'produce', cat:'legumes',   emoji:'🍅', price:0.30, kcal:18,  p:0.9, c:3.9, f:0.2 },
  'courgette':     { aisle:'produce', cat:'legumes',   emoji:'🥒', price:0.25, kcal:17,  p:1.2, c:3.1, f:0.3 },
  'concombre':     { aisle:'produce', cat:'legumes',   emoji:'🥒', price:0.20, kcal:15,  p:0.7, c:3.6, f:0.1 },
  'oignon':        { aisle:'produce', cat:'legumes',   emoji:'🧅', price:0.15, kcal:40,  p:1.1, c:9.3, f:0.1 },
  'ail':           { aisle:'produce', cat:'condiments',emoji:'🧄', price:0.40, kcal:149, p:6.4, c:33,  f:0.5 },
  'carotte':       { aisle:'produce', cat:'legumes',   emoji:'🥕', price:0.15, kcal:41,  p:0.9, c:9.6, f:0.2 },
  'pomme de terre':{ aisle:'produce', cat:'feculents', emoji:'🥔', price:0.12, kcal:77,  p:2,   c:17,  f:0.1 },
  'salade':        { aisle:'produce', cat:'legumes',   emoji:'🥗', price:0.80, kcal:15,  p:1.4, c:2.9, f:0.2 },
  'roquette':      { aisle:'produce', cat:'legumes',   emoji:'🥬', price:1.50, kcal:25,  p:2.6, c:3.7, f:0.7 },
  'epinard':       { aisle:'produce', cat:'legumes',   emoji:'🥬', price:0.70, kcal:23,  p:2.9, c:3.6, f:0.4 },
  'poivron':       { aisle:'produce', cat:'legumes',   emoji:'🫑', price:0.45, kcal:31,  p:1,   c:6,   f:0.3 },
  'champignon':    { aisle:'produce', cat:'legumes',   emoji:'🍄', price:0.60, kcal:22,  p:3.1, c:3.3, f:0.3 },
  'citron':        { aisle:'produce', cat:'fruits',    emoji:'🍋', price:0.30, kcal:29,  p:1.1, c:9,   f:0.3 },
  'pomme':         { aisle:'produce', cat:'fruits',    emoji:'🍎', price:0.30, kcal:52,  p:0.3, c:14,  f:0.2 },
  'banane':        { aisle:'produce', cat:'fruits',    emoji:'🍌', price:0.25, kcal:89,  p:1.1, c:23,  f:0.3 },
  'fraise':        { aisle:'produce', cat:'fruits',    emoji:'🍓', price:0.90, kcal:32,  p:0.7, c:7.7, f:0.3 },
  'avocat':        { aisle:'produce', cat:'fruits',    emoji:'🥑', price:1.00, kcal:160, p:2,   c:9,   f:15  },
  'poulet':        { aisle:'meat',    cat:'proteines', emoji:'🍗', price:1.00, kcal:165, p:31,  c:0,   f:3.6 },
  'boeuf':         { aisle:'meat',    cat:'proteines', emoji:'🥩', price:1.60, kcal:250, p:26,  c:0,   f:17  },
  'porc':          { aisle:'meat',    cat:'proteines', emoji:'🥓', price:1.10, kcal:242, p:27,  c:0,   f:14  },
  'jambon':        { aisle:'meat',    cat:'proteines', emoji:'🍖', price:1.50, kcal:145, p:21,  c:1.5, f:6   },
  'saumon':        { aisle:'meat',    cat:'proteines', emoji:'🐟', price:2.20, kcal:208, p:20,  c:0,   f:13  },
  'thon':          { aisle:'grocery', cat:'proteines', emoji:'🐟', price:1.20, kcal:130, p:29,  c:0,   f:1   },
  'crevette':      { aisle:'meat',    cat:'proteines', emoji:'🦐', price:2.50, kcal:99,  p:24,  c:0.2, f:0.3 },
  'oeuf':          { aisle:'dairy',   cat:'proteines', emoji:'🥚', price:0.50, kcal:143, p:12.6,c:0.7, f:9.5 },
  'lait':          { aisle:'dairy',   cat:'laitiers',  emoji:'🥛', price:0.10, kcal:64,  p:3.4, c:4.8, f:3.6 },  /* 100 ml */
  'yaourt':        { aisle:'dairy',   cat:'laitiers',  emoji:'🥛', price:0.30, kcal:61,  p:3.5, c:4.7, f:3.3 },
  'yaourt grec':   { aisle:'dairy',   cat:'laitiers',  emoji:'🥛', price:0.45, kcal:97,  p:9,   c:3.6, f:5   },
  'fromage':       { aisle:'dairy',   cat:'laitiers',  emoji:'🧀', price:1.20, kcal:402, p:25,  c:1.3, f:33  },
  'parmesan':      { aisle:'dairy',   cat:'laitiers',  emoji:'🧀', price:2.00, kcal:431, p:38,  c:4.1, f:29  },
  'mozzarella':    { aisle:'dairy',   cat:'laitiers',  emoji:'🧀', price:1.00, kcal:280, p:22,  c:2.2, f:21  },
  'burrata':       { aisle:'dairy',   cat:'laitiers',  emoji:'🧀', price:2.50, kcal:330, p:18,  c:2,   f:28  },
  'beurre':        { aisle:'dairy',   cat:'laitiers',  emoji:'🧈', price:0.90, kcal:717, p:0.9, c:0.1, f:81  },
  'creme':         { aisle:'dairy',   cat:'laitiers',  emoji:'🥛', price:0.50, kcal:340, p:2.1, c:2.9, f:36  },
  'pates':         { aisle:'bakery',  cat:'feculents', emoji:'🍝', price:0.20, kcal:131, p:5,   c:25,  f:1.1 },
  'riz':           { aisle:'bakery',  cat:'feculents', emoji:'🍚', price:0.18, kcal:130, p:2.7, c:28,  f:0.3 },
  'lentilles':     { aisle:'grocery', cat:'feculents', emoji:'🫘', price:0.30, kcal:116, p:9,   c:20,  f:0.4 },
  'lentilles corail':{ aisle:'grocery', cat:'feculents', emoji:'🫘', price:0.35, kcal:116, p:9,   c:20,  f:0.4 },
  'pain':          { aisle:'bakery',  cat:'feculents', emoji:'🍞', price:0.30, kcal:265, p:9,   c:49,  f:3.2 },
  'farine':        { aisle:'bakery',  cat:'feculents', emoji:'🌾', price:0.08, kcal:364, p:10,  c:76,  f:1   },
  'pate brisee':   { aisle:'bakery',  cat:'feculents', emoji:'🥧', price:1.20, kcal:380, p:6,   c:42,  f:20  },
  'huile olive':   { aisle:'grocery', cat:'condiments',emoji:'🫒', price:0.40, kcal:884, p:0,   c:0,   f:100 },
  'sel':           { aisle:'grocery', cat:'condiments',emoji:'🧂', price:0.02, kcal:0,   p:0,   c:0,   f:0   },
  'poivre':        { aisle:'grocery', cat:'condiments',emoji:'🌶️', price:0.10, kcal:251, p:10,  c:64,  f:3.3 },
  'sucre':         { aisle:'grocery', cat:'condiments',emoji:'🍬', price:0.10, kcal:387, p:0,   c:100, f:0   },
  'lait de coco':  { aisle:'grocery', cat:'condiments',emoji:'🥥', price:0.30, kcal:230, p:2.3, c:6,   f:24  },
  'tomates pelees':{ aisle:'grocery', cat:'legumes',   emoji:'🥫', price:0.25, kcal:32,  p:1.6, c:7,   f:0.3 },
  'menthe':        { aisle:'produce', cat:'condiments',emoji:'🌿', price:1.00, kcal:44,  p:3.3, c:8.4, f:0.7 },
  'basilic':       { aisle:'produce', cat:'condiments',emoji:'🌿', price:1.50, kcal:23,  p:3.2, c:2.7, f:0.6 },
};

/* Valeurs par défaut quand un ingrédient est inconnu (estimation prudente / 100 g) */
export const DEFAULT_FOOD = { aisle:'other', cat:'autres', emoji:'🛒', price:0.50, kcal:120, p:5, c:15, f:4 };

/* Poids approximatif (g) d'une « pièce » pour convertir en grammes lors des calculs */
export const PIECE_GRAMS = {
  'oeuf':80, 'citron':100, 'pomme':180, 'banane':120, 'avocat':200, 'oignon':110,
  'carotte':80, 'concombre':300, 'poivron':150, 'burrata':125, 'mozzarella':125,
  'tomate':120, 'courgette':200, 'pomme de terre':150, 'fraise':12, 'ail':5,
  'pate brisee':230, '_default':100,
};

/* Objectifs nutritionnels par défaut (par jour, par personne) */
export const DEFAULT_GOALS = { calories: 2000, protein: 75, carbs: 250, fat: 65 };

/* Recettes de saison embarquées (mode hors-ligne / sans recherche) */
export const SEASONAL_RECIPES = [
  {
    id: 'seed-gaspacho', name: 'Gaspacho de courgettes à la menthe', emoji: '🥒',
    category: 'Entrée', origin: 'Espagne', tags: ['saison','végétarien','rapide'],
    portions: 4, prepTime: 15, cookTime: 0,
    ingredients: [
      { name: 'Courgette', qty: 600, unit: 'g' }, { name: 'Concombre', qty: 1, unit: 'pièce' },
      { name: 'Yaourt grec', qty: 150, unit: 'g' }, { name: 'Menthe', qty: 10, unit: 'g' },
      { name: 'Huile olive', qty: 20, unit: 'ml' },
    ],
    steps: ['Laver et couper les légumes en morceaux.', 'Mixer finement tous les ingrédients.', 'Réfrigérer au moins 1 h avant de servir bien frais.'],
  },
  {
    id: 'seed-burrata', name: 'Salade fraises, roquette & burrata', emoji: '🍓',
    category: 'Entrée', origin: 'Italie', tags: ['saison','végétarien','rapide'],
    portions: 2, prepTime: 10, cookTime: 0,
    ingredients: [
      { name: 'Fraise', qty: 250, unit: 'g' }, { name: 'Roquette', qty: 80, unit: 'g' },
      { name: 'Burrata', qty: 1, unit: 'pièce' }, { name: 'Huile olive', qty: 15, unit: 'ml' },
    ],
    steps: ['Rincer et couper les fraises en quartiers.', 'Disposer roquette, fraises et burrata.', 'Arroser d\'huile d\'olive, saler, poivrer.'],
  },
  {
    id: 'seed-dahl', name: 'Dahl de lentilles corail au coco', emoji: '🍛',
    category: 'Plat', origin: 'Inde', tags: ['budget','végétarien'],
    portions: 4, prepTime: 10, cookTime: 25,
    ingredients: [
      { name: 'Lentilles corail', qty: 250, unit: 'g' }, { name: 'Lait de coco', qty: 400, unit: 'ml' },
      { name: 'Tomates pelées', qty: 400, unit: 'g' }, { name: 'Oignon', qty: 1, unit: 'pièce' },
      { name: 'Ail', qty: 2, unit: 'g' },
    ],
    steps: ['Faire revenir l\'oignon et l\'ail émincés.', 'Ajouter lentilles, tomates et lait de coco.', 'Laisser mijoter 25 min à feu doux en remuant.'],
  },
  {
    id: 'seed-poulet', name: 'Poulet rôti, riz & légumes', emoji: '🍗',
    category: 'Plat', origin: 'France', tags: ['protéines'],
    portions: 4, prepTime: 15, cookTime: 35,
    ingredients: [
      { name: 'Poulet', qty: 600, unit: 'g' }, { name: 'Riz', qty: 250, unit: 'g' },
      { name: 'Carotte', qty: 3, unit: 'pièce' }, { name: 'Oignon', qty: 1, unit: 'pièce' },
      { name: 'Huile olive', qty: 20, unit: 'ml' },
    ],
    steps: ['Saisir le poulet, ajouter les légumes.', 'Cuire le riz en parallèle.', 'Servir le poulet et les légumes sur le riz.'],
  },
  {
    id: 'seed-omelette', name: 'Omelette aux champignons', emoji: '🍳',
    category: 'Plat', origin: 'France', tags: ['rapide','protéines','végétarien'],
    portions: 2, prepTime: 5, cookTime: 8,
    ingredients: [
      { name: 'Oeuf', qty: 5, unit: 'pièce' }, { name: 'Champignon', qty: 150, unit: 'g' },
      { name: 'Fromage', qty: 50, unit: 'g' }, { name: 'Beurre', qty: 10, unit: 'g' },
    ],
    steps: ['Faire revenir les champignons au beurre.', 'Battre les œufs, verser dans la poêle.', 'Ajouter le fromage, plier et servir.'],
  },
];

/* Catégories et pays proposés pour la recherche TheMealDB (libellés français) */
export const MEALDB_CATEGORIES = ['Beef','Chicken','Dessert','Lamb','Pasta','Pork','Seafood','Side','Starter','Vegan','Vegetarian','Breakfast'];
export const MEALDB_AREAS = ['French','Italian','Mexican','Chinese','Indian','Japanese','Spanish','Thai','Greek','American','Moroccan','Turkish'];

/* Traduction d'affichage pour quelques catégories/pays */
export const FR_LABELS = {
  // Catégories
  Beef:'Bœuf', Chicken:'Poulet', Dessert:'Dessert', Lamb:'Agneau', Pasta:'Pâtes', Pork:'Porc',
  Seafood:'Fruits de mer', Side:'Accompagnement', Starter:'Entrée', Vegan:'Végétalien',
  Vegetarian:'Végétarien', Breakfast:'Petit-déjeuner', Goat:'Chèvre', Miscellaneous:'Divers',
  // Pays / origines
  American:'États-Unis', Algerian:'Algérie', British:'Royaume-Uni', Canadian:'Canada',
  Chinese:'Chine', Croatian:'Croatie', Dutch:'Pays-Bas', Netherlands:'Pays-Bas', Egyptian:'Égypte',
  Filipino:'Philippines', French:'France', Greek:'Grèce', Indian:'Inde', Irish:'Irlande',
  Italian:'Italie', Jamaican:'Jamaïque', Japanese:'Japon', Kenyan:'Kenya', Malaysian:'Malaisie',
  Mexican:'Mexique', Moroccan:'Maroc', Polish:'Pologne', Portuguese:'Portugal', Russian:'Russie',
  Spanish:'Espagne', Thai:'Thaïlande', Tunisian:'Tunisie', Turkish:'Turquie', Ukrainian:'Ukraine',
  Uruguayan:'Uruguay', Vietnamese:'Vietnam', Syrian:'Syrie', Slovakian:'Slovaquie',
  Unknown:'Autre',
};

/* Renvoie le libellé français s'il existe, sinon la valeur d'origine. */
export const fr = (s) => (s && FR_LABELS[s]) || s || '';
