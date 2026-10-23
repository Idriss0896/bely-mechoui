import type { Dish } from "../data/menu";

export type CartLine = { name: string; price: number; qty: number };

export type ChatAction =
  | { label: string; kind: "dish"; dish: Dish }
  | { label: string; kind: "recap" }
  | { label: string; kind: "confirm" }
  | { label: string; kind: "reset" }
  | { label: string; kind: "menu" };

export type ChatAnswer = { text: string; actions?: ChatAction[]; recap?: CartLine[] };

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

function dishActions(dishes: Dish[]): ChatAction[] {
  return dishes.slice(0, 4).map((dish) => ({ label: dish.name, kind: "dish" as const, dish }));
}

function total(cart: CartLine[]) {
  return cart.reduce((sum, line) => sum + line.price * line.qty, 0);
}

export function buildOrderMessage(cart: CartLine[], formatPrice: (n: number) => string) {
  const lines = cart.map((line) => `${line.qty} × ${line.name} (${formatPrice(line.price * line.qty)})`);
  return [
    "Bonjour Bely Mechoui, je souhaite commander :",
    ...lines,
    "",
    `Total : ${formatPrice(total(cart))}`,
    "",
    "(Commande préparée depuis le site.)",
  ].join("\n");
}

export function answer(input: string, context: ChatContext): ChatAnswer {
  const text = normalize(input);
  const { dishes, allDishes, status, hours, cart, formatPrice } = context;
  const available = dishes.filter((dish) => !dish.unavailable);
  const servable = available.length ? available : dishes;

  if (!text) {
    return { text: "Je t'écoute : horaires, carte, adresse ou commande." };
  }

  // 1. Un plat précis est cité -> on l'ajoute à la commande.
  const matchedDish = allDishes.find((dish) => {
    const name = normalize(dish.name);
    return name.length > 3 && text.includes(name);
  });
  if (matchedDish) {
    return {
      text: `J'ai ajouté ${matchedDish.name} (${formatPrice(matchedDish.price)}) à ta commande. autre chose, ou je te montre le récapitulatif ?`,
      actions: [{ label: "Voir ma commande", kind: "recap" }, ...dishActions(servable.filter((dish) => dish.name !== matchedDish.name).slice(0, 2))],
    };
  }

  // 2. Horaires.
  if (has(text, /horaire|ouvert|ferme|heure|ouverture|fermeture|midi|soir|quand/)) {
    const state = status.open ? `C'est ouvert en ce moment, ${status.detail}.` : `C'est fermé en ce moment : ${status.detail}.`;
    return {
      text: `${state} Nous servons ${hours.days.toLowerCase()}, de ${hours.opening}.`,
      actions: [{ label: "Voir la carte", kind: "menu" }],
    };
  }

  // 3. Adresse et accès.
  if (has(text, /adresse|ou etes|ou est|situe|localis|trouver|itineraire|chemin|map|bamako|sebenikoro/)) {
    return {
      text: "Nous sommes à Sebenikoro, Bamako (Mali), juste à côté de la voie principale. Le bouton Itinéraire du site ouvre Google Maps.",
      actions: [{ label: "Voir la carte", kind: "menu" }],
    };
  }

  // 4. Contact.
  if (has(text, /telephone|numero|whatsapp|appeler|contact|joindre/)) {
    return {
      text: "Tu peux nous joindre au +223 72 84 16 16, ou passer par WhatsApp depuis le bouton Commander.",
      actions: [{ label: "Voir ma commande", kind: "recap" }],
    };
  }

  // 5. Commande / récapitulatif.
  if (has(text, /commande|commander|recap|recapitulatif|total|valider|termine|fini|c est tout|combien/)) {
    if (!cart.length) {
      return {
        text: "Avec plaisir. Voici ce que nous servons aujourd'hui : dis-moi ce qui te fait envie.",
        actions: dishActions(servable),
      };
    }
    return {
      text: `Voilà ta commande. Vérifie, puis valide pour continuer sur WhatsApp.`,
      recap: cart,
      actions: [{ label: "Valider sur WhatsApp", kind: "confirm" }, { label: "Ajouter un plat", kind: "menu" }],
    };
  }

  if (has(text, /annuler|effacer|recommencer|vider/)) {
    return { text: "J'ai vidé ta commande. On repart de zéro.", actions: [{ label: "Voir la carte", kind: "menu" }] };
  }

  // 6. Carte et prix.
  if (has(text, /menu|carte|plat|manger|specialite|prix|combien|boisson|grillade|accompagnement/)) {
    const list = servable.slice(0, 5).map((dish) => `${dish.name} — ${formatPrice(dish.price)}`).join("\n");
    return {
      text: servable.length
        ? `Aujourd'hui, nous servons :\n${list}\n\nDis-moi le plat qui te tente, je l'ajoute à ta commande.`
        : "La carte du jour est en cours de mise à jour. Appelle-nous au +223 72 84 16 16.",
      actions: dishActions(servable),
    };
  }

  // 7. Salutations / remerciements.
  if (has(text, /bonjour|salut|bonsoir|hello|coucou/)) {
    return {
      text: "Bonjour et bienvenue chez Bely Mechoui ! Je peux te donner les horaires, la carte, l'adresse, ou prendre ta commande.",
      actions: [{ label: "La carte", kind: "menu" }, { label: "Horaires", kind: "menu" }],
    };
  }
  if (has(text, /merci|super|parfait|nickel/)) {
    return { text: "Avec plaisir ! À très vite chez Bely.", actions: [{ label: "Voir la carte", kind: "menu" }] };
  }

  // 8. Repli.
  return {
    text: "Je peux t'aider sur les horaires, la carte du jour, l'adresse ou ta commande. Dis-moi ce qu'il te faut.",
    actions: [{ label: "La carte", kind: "menu" }, { label: "Voir ma commande", kind: "recap" }],
  };
}
