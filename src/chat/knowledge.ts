import type { Dish } from "../data/menu";

export type CartLine = { name: string; price: number; qty: number };

export type ChatAction =
  | { label: string; kind: "dish"; dish: Dish }
  | { label: string; kind: "recap" }
  | { label: string; kind: "confirm" }
  | { label: string; kind: "reset" }
  | { label: string; kind: "menu" }
  | { label: string; kind: "send" };

export type ChatAnswer = { text: string; actions?: ChatAction[]; recap?: CartLine[]; cart?: CartLine[] };

export type ChatContext = {
  dishes: Dish[];
  allDishes: Dish[];
  status: { open: boolean; label: string; detail: string };
  hours: { opening: string; days: string };
  cart: CartLine[];
  formatPrice: (value: number) => string;
};

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const has = (text: string, words: RegExp) => words.test(text);

const QUANTITY_WORDS: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8 };

function parseQuantity(text: string): number {
  const digits = text.match(/\b(\d{1,2})\b/);
  if (digits) return Math.min(Math.max(Number(digits[1]), 1), 20);
  const padded = ` ${text} `;
  for (const [word, value] of Object.entries(QUANTITY_WORDS)) {
    if (padded.includes(` ${word} `)) return value;
  }
  return 1;
}

function findDish(text: string, dishes: Dish[]): Dish | undefined {
  return dishes.find((dish) => {
    const name = normalize(dish.name);
    if (!name) return false;
    if (text.includes(name)) return true;
    return name
      .split(" ")
      .filter((token) => token.length > 4)
      .some((token) => text.includes(token));
  });
}

const total = (cart: CartLine[]) => cart.reduce((sum, line) => sum + line.price * line.qty, 0);

function dishActions(dishes: Dish[], exclude?: string): ChatAction[] {
  return dishes
    .filter((dish) => dish.name !== exclude)
    .slice(0, 3)
    .map((dish) => ({ label: dish.name, kind: "dish" as const, dish }));
}

function orderLines(cart: CartLine[], formatPrice: (n: number) => string) {
  return [
    ...cart.map((line) => `${line.qty} × ${line.name} (${formatPrice(line.price * line.qty)})`),
    "",
    `Total : ${formatPrice(total(cart))}`,
  ];
}

/** Message envoyé au restaurant pour passer commande. */
export function buildOrderMessage(cart: CartLine[], formatPrice: (n: number) => string) {
  return ["Bely, voici ma commande :", "", ...orderLines(cart, formatPrice), "", "(Commande préparée depuis le site.)"].join("\n");
}

/** Message publié quand le client partage sa commande sur les réseaux. */
export function buildShareMessage(cart: CartLine[], formatPrice: (n: number) => string) {
  return ["Aujourd'hui, ma commande chez Bely Mechoui c'est :", "", ...orderLines(cart, formatPrice)].join("\n");
}

export function answer(input: string, context: ChatContext): ChatAnswer {
  const text = normalize(input);
  const { dishes, allDishes, status, hours, cart, formatPrice } = context;
  const available = dishes.filter((dish) => !dish.unavailable);
  const servable = available.length ? available : dishes;
  const catalog = allDishes.filter((dish) => !dish.unavailable);

  if (!text) {
    return { text: "Je t'écoute : horaires, carte, adresse ou commande." };
  }

  // Abandon de la commande.
  if (has(text, /laisse tomber|annule|annuler|oublie|finalement|plus rien|recommence|recommencer|efface|vide/)) {
    if (!cart.length) return { text: "Il n'y a rien à annuler, ta commande est déjà vide. Je te montre la carte ?", actions: [{ label: "Voir la carte", kind: "menu" }] };
    return {
      text: `C'est annulé, j'ai vidé la commande (${formatPrice(total(cart))}). On repart de zéro quand tu veux.`,
      cart: [],
      actions: [{ label: "Voir la carte", kind: "menu" }],
    };
  }

  // Retirer un plat précis.
  if (has(text, /enleve|enlever|retire|retirer|supprime|supprimer/)) {
    const dish = findDish(text, catalog);
    if (dish) {
      const line = cart.find((item) => item.name === dish.name);
      if (!line) return { text: `Je ne trouve pas ${dish.name} dans ta commande.`, actions: [{ label: "Voir ma commande", kind: "recap" }] };
      const next = line.qty > 1
        ? cart.map((item) => (item.name === dish.name ? { ...item, qty: item.qty - 1 } : item))
        : cart.filter((item) => item.name !== dish.name);
      return {
        text: `J'ai retiré ${dish.name}. Il reste ${formatPrice(total(next))}.`,
        cart: next,
        actions: next.length ? [{ label: "Voir ma commande", kind: "recap" }] : [{ label: "Voir la carte", kind: "menu" }],
      };
    }
    return { text: "Quel plat veux-tu retirer ?", actions: [{ label: "Voir ma commande", kind: "recap" }] };
  }

  // Ajout d'un plat (éventuellement avec une quantité).
  const matched = findDish(text, catalog);
  if (matched) {
    const quantity = parseQuantity(text);
    const existing = cart.find((line) => line.name === matched.name);
    const next = existing
      ? cart.map((line) => (line.name === matched.name ? { ...line, qty: line.qty + quantity } : line))
      : [...cart, { name: matched.name, price: matched.price, qty: quantity }];
    return {
      text: `J'ai ajouté ${quantity > 1 ? `${quantity} × ` : ""}${matched.name} (${formatPrice(matched.price * quantity)}). Total : ${formatPrice(total(next))}. Autre chose ?`,
      cart: next,
      actions: [{ label: "Voir ma commande", kind: "recap" }, ...dishActions(servable, matched.name).slice(0, 2)],
    };
  }

  // Horaires.
  if (has(text, /horaire|ouvert|ferme|heure|ouverture|fermeture|midi|soir|quand|open/)) {
    const state = status.open ? `C'est ouvert en ce moment, ${status.detail}.` : `C'est fermé en ce moment : ${status.detail}.`;
    return { text: `${state} Nous servons ${hours.days.toLowerCase()}, de ${hours.opening}.`, actions: [{ label: "Voir la carte", kind: "menu" }] };
  }

  // Adresse.
  if (has(text, /adresse|ou etes|ou est|situe|localis|trouver|itineraire|chemin|map|bamako|sebenikoro/)) {
    return {
      text: "Nous sommes à Sebenikoro, Bamako (Mali). Le bouton Itinéraire du site ouvre Google Maps, et je peux te donner le numéro si tu préfères appeler.",
      actions: [{ label: "Voir la carte", kind: "menu" }],
    };
  }

  // Contact.
  if (has(text, /telephone|numero|whatsapp|appeler|contact|joindre/)) {
    return { text: "Tu peux nous joindre au +223 72 84 16 16. Sur WhatsApp, réponds depuis le bouton Commander : ta commande part déjà rédigée.", actions: [{ label: "Voir ma commande", kind: "recap" }] };
  }

  // Récapitulatif, total, validation.
  if (has(text, /commande|commander|recap|recapitulatif|total|valider|valide|termine|fini|c est tout|combien|prix/)) {
    if (!cart.length) {
      return { text: "Ta commande est vide pour l'instant. Voici ce que nous servons aujourd'hui :", actions: dishActions(servable) };
    }
    return {
      text: `Voilà ta commande : ${formatPrice(total(cart))}. Vérifie, puis valide pour continuer sur WhatsApp.`,
      recap: cart,
      actions: [{ label: "Valider sur WhatsApp", kind: "confirm" }, { label: "Ajouter un plat", kind: "menu" }],
    };
  }

  // Réponses courtes.
  if (has(text, /^(oui|ok|d accord|parfait|vas y|go)$/)) {
    if (cart.length) return { text: `Parfait. Total : ${formatPrice(total(cart))}. Je te prépare le message WhatsApp ?`, recap: cart, actions: [{ label: "Valider sur WhatsApp", kind: "confirm" }, { label: "Modifier", kind: "menu" }] };
    return { text: "Dis-moi ce qui te ferait plaisir, je l'ajoute à ta commande.", actions: dishActions(servable) };
  }
  if (has(text, /^(non|pas maintenant|plus tard)$/)) {
    return { text: "Pas de souci. Je reste là si tu as besoin des horaires, de la carte ou de l'adresse." };
  }

  // Carte et prix.
  if (has(text, /menu|carte|plat|manger|specialite|boisson|grillade|accompagnement|boeuf|poulet|riz|salade|burger|bissap/)) {
    const list = servable.slice(0, 5).map((dish) => `${dish.name} — ${formatPrice(dish.price)}`).join("\n");
    return {
      text: servable.length
        ? `Aujourd'hui, nous servons :\n${list}\n\nDis-moi le plat qui te tente, je l'ajoute à ta commande.`
        : "La carte du jour est en cours de mise à jour. Appelle-nous au +223 72 84 16 16.",
      actions: dishActions(servable),
    };
  }

  // Salutations.
  if (has(text, /bonjour|salut|bonsoir|hello|coucou/)) {
    return { text: "Bonjour et bienvenue chez Bely Mechoui ! Je peux te donner les horaires, la carte, l'adresse, ou prendre ta commande.", actions: [{ label: "La carte", kind: "menu" }, { label: "Voir ma commande", kind: "recap" }] };
  }
  if (has(text, /merci|super|nickel|top/)) {
    return { text: "Avec plaisir ! À très vite chez Bely.", actions: [{ label: "Voir la carte", kind: "menu" }] };
  }

  // Repli.
  return {
    text: "Je peux t'aider sur les horaires, la carte du jour, l'adresse ou ta commande. Dis-moi ce qu'il te faut.",
    actions: [{ label: "La carte", kind: "menu" }, { label: "Voir ma commande", kind: "recap" }],
  };
}
