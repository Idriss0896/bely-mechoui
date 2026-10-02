export type DayKey = "mardi" | "mercredi" | "jeudi" | "vendredi" | "samedi" | "dimanche";

export type Dish = {
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
  unavailable?: boolean;
};

export const days: Array<{ key: DayKey; label: string; shortLabel: string }> = [
  { key: "mardi", label: "Mardi", shortLabel: "Mar" },
  { key: "mercredi", label: "Mercredi", shortLabel: "Mer" },
  { key: "jeudi", label: "Jeudi", shortLabel: "Jeu" },
  { key: "vendredi", label: "Vendredi", shortLabel: "Ven" },
  { key: "samedi", label: "Samedi", shortLabel: "Sam" },
  { key: "dimanche", label: "Dimanche", shortLabel: "Dim" },
];

const images = {
  mechoui: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=85",
  grillade: "https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=900&q=85",
  accompagne: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85",
  legumes: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=85",
  boisson: "https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=900&q=85",
  fastFood: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=85",
};

export const menu: Record<DayKey, Dish[]> = {
  mardi: [
    { name: "Méchoui de mouton", description: "Mouton rôti lentement, jus de cuisson et garnitures du jour.", price: 7500, image: images.mechoui, category: "Grillades" },
    { name: "Poulet braisé", description: "Poulet mariné aux épices douces, braisé à la flamme.", price: 5500, image: images.grillade, category: "Grillades" },
    { name: "Assiette de saison", description: "Légumes frais et céréales parfumées, préparés maison.", price: 3500, image: images.legumes, category: "Accompagnement" },
    { name: "Burger maison", description: "Pain toasté, steak grillé, fromage fondant et sauce maison.", price: 4500, image: images.fastFood, category: "Fast-food" },
    { name: "Bissap frais", description: "Infusion d’hibiscus maison, fraîche et délicatement parfumée.", price: 1500, image: images.boisson, category: "Boissons" },
  ],
  mercredi: [
    { name: "Méchoui de mouton", description: "Mouton rôti lentement, jus de cuisson et garnitures du jour.", price: 7500, image: images.mechoui, category: "Grillades" },
    { name: "Riz parfumé & sauce", description: "Riz délicatement épicé, sauce maison et légumes croquants.", price: 4000, image: images.accompagne, category: "Plats" },
  ],
  jeudi: [
    { name: "Méchoui de mouton", description: "Mouton rôti lentement, jus de cuisson et garnitures du jour.", price: 7500, image: images.mechoui, category: "Grillades" },
    { name: "Brochettes de bœuf", description: "Bœuf tendre grillé minute, oignons fondants et épices.", price: 6000, image: images.grillade, category: "Grillades" },
  ],
  vendredi: [
    { name: "Méchoui de mouton", description: "Mouton rôti lentement, jus de cuisson et garnitures du jour.", price: 7500, image: images.mechoui, category: "Grillades" },
    { name: "Riz parfumé & sauce", description: "Riz délicatement épicé, sauce maison et légumes croquants.", price: 4000, image: images.accompagne, category: "Plats" },
    { name: "Salade fraîcheur", description: "Un mélange frais et croquant pour accompagner la braise.", price: 2500, image: images.legumes, category: "Accompagnement", unavailable: true },
  ],
  samedi: [
    { name: "Méchoui de mouton", description: "Mouton rôti lentement, jus de cuisson et garnitures du jour.", price: 7500, image: images.mechoui, category: "Grillades" },
    { name: "Poulet braisé", description: "Poulet mariné aux épices douces, braisé à la flamme.", price: 5500, image: images.grillade, category: "Grillades" },
    { name: "Assiette de saison", description: "Légumes frais et céréales parfumées, préparés maison.", price: 3500, image: images.legumes, category: "Accompagnement" },
  ],
  dimanche: [
    { name: "Méchoui de mouton", description: "Mouton rôti lentement, jus de cuisson et garnitures du jour.", price: 7500, image: images.mechoui, category: "Grillades" },
    { name: "Brochettes de bœuf", description: "Bœuf tendre grillé minute, oignons fondants et épices.", price: 6000, image: images.grillade, category: "Grillades" },
  ],
};

export const featuredDish = menu.mardi[0];

export const formatPrice = (price: number) => `${new Intl.NumberFormat("fr-FR").format(price)} FCFA`;
