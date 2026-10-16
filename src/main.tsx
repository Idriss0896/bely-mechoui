import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { Bell, BellRing, CalendarDays, Check, ChefHat, ChevronRight, Clock3, Flame, Heart, Home, ImagePlus, Info, Leaf, LayoutDashboard, LogOut, MapPin, Plus, Save, Search, Share2, SlidersHorizontal, Sparkles, Trash2, Utensils, UtensilsCrossed, X } from "lucide-react";
import { days, featuredDish, formatPrice, menu, type DayKey, type Dish } from "./data/menu";
import "./styles.css";

const defaultCategories = ["Grillades", "Boissons", "Plats", "Fast-food", "Accompagnement"];
const MENU_STORAGE_KEY = "bely-mechoui-menu";
const CATEGORIES_STORAGE_KEY = "bely-mechoui-categories";
const HOURS_STORAGE_KEY = "bely-mechoui-hours";
const defaultHours = { opening: "10h à 20h", days: "Mardi au Dimanche" };

type MenuState = Record<DayKey, Dish[]>;

function loadMenu(): MenuState {
  try {
    const saved = window.localStorage.getItem(MENU_STORAGE_KEY);
    return saved ? JSON.parse(saved) as MenuState : menu;
  } catch { return menu; }
}

function loadCategories(): string[] {
  try {
    const saved = window.localStorage.getItem(CATEGORIES_STORAGE_KEY);
    return saved ? JSON.parse(saved) as string[] : defaultCategories;
  } catch { return defaultCategories; }
}
function loadHours() {
  try {
    return JSON.parse(window.localStorage.getItem(HOURS_STORAGE_KEY) ?? "null") ?? defaultHours;
  } catch {
    return defaultHours;
  }
}

function saveAdminData(nextMenu: MenuState, nextCategories: string[], hours: { opening: string; days: string }) {
  window.localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(nextMenu));
  window.localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(nextCategories));
  window.localStorage.setItem(HOURS_STORAGE_KEY, JSON.stringify(hours));
}

const categoryIcons = {
  Grillades: Flame,
  Boissons: Sparkles,
  Plats: Utensils,
  "Fast-food": ChefHat,
  Accompagnement: Leaf,
};

const adminDays = days;

const initialNotifications = [
  { title: "Le méchoui est servi", text: "La spécialité maison est disponible aujourd'hui.", time: "À l'instant" },
  { title: "Carte du jour mise à jour", text: "Découvre les plats préparés avec soin par la maison.", time: "Ce matin" },
];

function Brand() {
  return <a className="brand" href="#accueil" aria-label="Bely Mechoui, accueil"><span className="brand__logo"><img src="/logo-bely-mechoui.jpg" alt="Bely Mechoui" /><span className="brand__logo-mark"><ChefHat size={12} /></span></span></a>;
}

function getTodayMenuDay(): DayKey {
  const dayByNumber: Record<number, DayKey | undefined> = { 0: "dimanche", 2: "mardi", 3: "mercredi", 4: "jeudi", 5: "vendredi", 6: "samedi" };
  return dayByNumber[new Date().getDay()] ?? "mardi";
}

function DishCard({ dish, onOpen, onToggleFavorite, isFavorite, compact = false }: { dish: Dish; onOpen: (dish: Dish) => void; onToggleFavorite: (dish: Dish) => void; isFavorite: boolean; compact?: boolean }) {
  return (
    <button className={`dish-card ${compact ? "dish-card--compact" : ""} ${dish.unavailable ? "is-unavailable" : ""}`} onClick={() => onOpen(dish)}>
      <span className="dish-card__image"><img src={dish.image} alt="" loading="lazy" /><span className="dish-card__tag">{dish.category}</span><span className={`dish-card__heart ${isFavorite ? "is-favorite" : ""}`} role="button" tabIndex={0} aria-label={isFavorite ? `Retirer ${dish.name} des favoris` : `Ajouter ${dish.name} aux favoris`} aria-pressed={isFavorite} onClick={(event) => { event.stopPropagation(); onToggleFavorite(dish); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onToggleFavorite(dish); } }}><Heart size={15} fill={isFavorite ? "currentColor" : "none"} /></span></span>
      <span className="dish-card__info"><span className="dish-card__name">{dish.name}</span><span className="dish-card__desc">{dish.description}</span><span className="dish-card__bottom"><strong>{formatPrice(dish.price)}</strong><span className="dish-card__rating">★ 4.9</span></span></span>
      {dish.unavailable && <span className="dish-card__unavailable">Indisponible aujourd'hui</span>}
    </button>
  );
}

function DishDetails({ dish, onClose }: { dish: Dish; onClose: () => void }) {
  return (
    <div className="detail-backdrop" role="presentation" onClick={onClose}>
      <section className="detail-sheet" role="dialog" aria-modal="true" aria-labelledby="dish-detail-title" onClick={(event) => event.stopPropagation()}>
        <div className="detail-sheet__image"><img src={dish.image} alt={dish.name} /><button className="icon-button icon-button--light" aria-label="Fermer" onClick={onClose}><X size={19} /></button><button className="icon-button icon-button--light detail-sheet__share" aria-label="Partager"><Share2 size={17} /></button></div>
        <div className="detail-sheet__body"><span className="eyebrow">{dish.category}</span><h2 id="dish-detail-title">{dish.name}</h2><p>{dish.description}</p><div className="detail-sheet__facts"><span><Clock3 size={16} /> Préparé avec soin</span><span><Sparkles size={16} /> Signature maison</span></div><div className="detail-sheet__footer"><strong>{formatPrice(dish.price)}</strong><span>Au menu aujourd'hui</span></div></div>
      </section>
    </div>
  );
}

type AdminDraft = Dish & { originDay: DayKey; originalName: string };

function AdminApp() {
  const [authenticated, setAuthenticated] = useState(() => sessionStorage.getItem("bely-admin-auth") === "true");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [menuState, setMenuState] = useState<MenuState>(loadMenu);
  const [categoriesState, setCategoriesState] = useState<string[]>(loadCategories);
  const [selectedDay, setSelectedDay] = useState<DayKey>(getTodayMenuDay);
  const [draft, setDraft] = useState<AdminDraft | null>(null);
  const [notice, setNotice] = useState("");
  const [categoryText, setCategoryText] = useState(() => loadCategories().join(", "));
  const [hours, setHours] = useState(loadHours);

  const showNotice = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 2400); };
  const commit = (nextMenu: MenuState, nextCategories = categoriesState, nextHours = hours) => { setMenuState(nextMenu); setCategoriesState(nextCategories); saveAdminData(nextMenu, nextCategories, nextHours); };
  const openNewDish = () => setDraft({ name: "Nouveau plat", description: "Description du plat maison.", price: 0, image: "", category: categoriesState[0] ?? "Grillades", originDay: selectedDay, originalName: "" });
  const openEditDish = (dish: Dish) => setDraft({ ...dish, originDay: selectedDay, originalName: dish.name });
  const saveDish = () => {
    if (!draft) return;
    if (!draft.name.trim()) return;
    const nextMenu = { ...menuState };
    nextMenu[draft.originDay] = nextMenu[draft.originDay].filter((dish) => !draft.originalName || dish.name !== draft.originalName);
    nextMenu[selectedDay] = [...nextMenu[selectedDay], { name: draft.name.trim(), description: draft.description, price: Number(draft.price) || 0, image: draft.image, category: draft.category, unavailable: draft.unavailable }];
    commit(nextMenu); setDraft(null); showNotice("Plat enregistré");
  };
  const deleteDish = (dish: Dish) => { const nextMenu = { ...menuState, [selectedDay]: menuState[selectedDay].filter((item) => item !== dish) }; commit(nextMenu); showNotice("Plat supprimé"); };
  const updateCategories = () => { const nextCategories = categoryText.split(",").map((category) => category.trim()).filter(Boolean); if (!nextCategories.length) return; commit(menuState, nextCategories); showNotice("Catégories mises à jour"); };
  const updateHours = () => { commit(menuState, categoriesState, hours); showNotice("Horaires enregistrés"); };
  const handleLogin = (event: FormEvent) => { event.preventDefault(); if (username === "bely" && password === "123456") { sessionStorage.setItem("bely-admin-auth", "true"); setAuthenticated(true); } else showNotice("Identifiants incorrects"); };

  if (!authenticated) return <main className="admin-login"><div className="admin-login__glow" /><div className="admin-login__card"><div className="admin-login__brand"><span><ChefHat size={25} /></span><small>ESPACE PRIVÉ</small><h1>BELY <i>MECHOUI</i></h1></div><p>Connecte-toi pour gérer la carte du restaurant.</p><form onSubmit={handleLogin}><label>Nom<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label><label>Mot de passe<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" /></label><button className="admin-primary" type="submit"><LayoutDashboard size={17} /> Ouvrir le tableau de bord</button></form>{notice && <div className="admin-notice admin-notice--error">{notice}</div>}<a className="admin-back" href="/#accueil">Retour au site public</a></div></main>;

  const totalDishes = Object.values(menuState).flat().length;
  return <main className="admin-shell"><header className="admin-header"><a className="admin-brand" href="/#accueil"><span><ChefHat size={19} /></span><strong>BELY <i>MECHOUI</i></strong></a><div className="admin-header__actions"><span className="admin-status"><span /> Connecté en tant que bely</span><button className="admin-logout" onClick={() => { sessionStorage.removeItem("bely-admin-auth"); setAuthenticated(false); }}><LogOut size={16} /> Déconnexion</button></div></header><div className="admin-layout"><aside className="admin-sidebar"><span className="admin-eyebrow">Administration</span><h1>Tableau de bord</h1><p>Gère le menu, les horaires et l’image de Bely Mechoui depuis un seul endroit.</p><div className="admin-side-links"><a className="is-active" href="#dashboard"><LayoutDashboard size={17} /> Vue générale</a><a href="#menu-admin"><UtensilsCrossed size={17} /> Menus</a><a href="#settings-admin"><Clock3 size={17} /> Horaires & catégories</a></div></aside><section className="admin-content" id="dashboard">{notice && <div className="admin-notice">{notice}</div>}<div className="admin-page-heading"><div><span className="admin-eyebrow">Vue générale</span><h2>Bonjour, Bely.</h2></div><span className="admin-date"><CalendarDays size={16} /> {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date())}</span></div><div className="admin-stats"><div><span className="admin-stat-icon"><Utensils size={18} /></span><small>Plats publiés</small><strong>{totalDishes}</strong></div><div><span className="admin-stat-icon admin-stat-icon--gold"><CalendarDays size={18} /></span><small>Jours ouverts</small><strong>6</strong></div><div><span className="admin-stat-icon admin-stat-icon--green"><Check size={18} /></span><small>État du service</small><strong>Ouvert</strong></div></div><section className="admin-panel" id="menu-admin"><div className="admin-panel__head"><div><span className="admin-eyebrow">Gestion de la carte</span><h2>Menu du restaurant</h2></div><button className="admin-primary admin-primary--small" onClick={openNewDish}><Plus size={16} /> Nouveau plat</button></div><div className="admin-day-tabs">{adminDays.map((day) => <button className={selectedDay === day.key ? "is-active" : ""} key={day.key} onClick={() => { setSelectedDay(day.key); setDraft(null); }}><strong>{day.shortLabel}</strong><small>{day.label}</small><em>{menuState[day.key].length}</em></button>)}</div><div className="admin-dish-list">{menuState[selectedDay].map((dish) => <article className="admin-dish-row" key={`${selectedDay}-${dish.name}`}><img src={dish.image || "/logo-bely-mechoui.jpg"} alt="" /><div><strong>{dish.name}</strong><small>{dish.category} · {formatPrice(dish.price)}</small><p>{dish.description}</p></div><div className="admin-row-actions"><button aria-label={`Modifier ${dish.name}`} onClick={() => openEditDish(dish)}><Save size={16} /></button><button aria-label={`Supprimer ${dish.name}`} onClick={() => deleteDish(dish)}><Trash2 size={16} /></button></div></article>)}</div>{draft && <div className="admin-editor"><div className="admin-editor__head"><div><span className="admin-eyebrow">Édition rapide</span><h3>{draft.name === "Nouveau plat" ? "Ajouter un plat" : "Modifier le plat"}</h3></div><button className="admin-close" onClick={() => setDraft(null)}><X size={18} /></button></div><div className="admin-form-grid"><label>Nom du plat<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>Catégorie<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>{categoriesState.map((category) => <option key={category}>{category}</option>)}</select></label><label>Jour<select value={selectedDay} onChange={(event) => { const nextDay = event.target.value as DayKey; setSelectedDay(nextDay); setDraft({ ...draft }); }}>{adminDays.map((day) => <option key={day.key} value={day.key}>{day.label}</option>)}</select></label><label>Prix (FCFA)<input type="number" min="0" value={draft.price} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })} /></label><label className="admin-form-wide">Description<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><label className="admin-form-wide">URL de la photo<input value={draft.image} onChange={(event) => setDraft({ ...draft, image: event.target.value })} placeholder="https://..." /></label><label className="admin-upload"><ImagePlus size={16} /> Photo locale<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setDraft({ ...draft, image: String(reader.result) }); reader.readAsDataURL(file); }} /></label></div><button className="admin-primary" onClick={saveDish}><Save size={17} /> Enregistrer le plat</button></div>}</section><section className="admin-settings" id="settings-admin"><div className="admin-panel"><div className="admin-panel__head"><div><span className="admin-eyebrow">Configuration</span><h2>Horaires du restaurant</h2></div><Clock3 size={20} /></div><div className="admin-settings-grid"><label>Horaires d’ouverture<input value={hours.opening} onChange={(event) => setHours({ ...hours, opening: event.target.value })} /></label><label>Jours ouverts<input value={hours.days} onChange={(event) => setHours({ ...hours, days: event.target.value })} /></label></div><button className="admin-primary admin-primary--small" onClick={updateHours}><Save size={16} /> Enregistrer les horaires</button></div><div className="admin-panel"><div className="admin-panel__head"><div><span className="admin-eyebrow">Organisation</span><h2>Catégories</h2></div><Sparkles size={20} /></div><p className="admin-helper">Sépare les catégories par des virgules pour les réorganiser.</p><input className="admin-categories-input" value={categoryText} onChange={(event) => setCategoryText(event.target.value)} /><button className="admin-primary admin-primary--small" onClick={updateCategories}><Save size={16} /> Enregistrer les catégories</button></div></section></section></div></main>;
}

function App() {
  const [isBooting, setIsBooting] = useState(true);
  const [menuState] = useState<MenuState>(loadMenu);
  const [categories] = useState<string[]>(loadCategories);
  const [restaurantHours] = useState(loadHours);
  const [activeDay, setActiveDay] = useState<DayKey>(getTodayMenuDay);
  const [activeCategory, setActiveCategory] = useState("Grillades");
  const [query, setQuery] = useState("");
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(initialNotifications.length);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [favoriteNames, setFavoriteNames] = useState<string[]>([]);
  const [navVisible, setNavVisible] = useState(true);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [brandColor, setBrandColor] = useState<"green" | "yellow" | "red">("green");
  const [activeNav, setActiveNav] = useState<"accueil" | "menu" | "infos">("accueil");
  const dayDishes = useMemo(() => menuState[activeDay], [activeDay, menuState]);
  const allDishes = useMemo(() => Array.from(new Map(Object.values(menuState).flat().map((dish) => [dish.name, dish])).values()), [menuState]);
  const favoriteDishes = useMemo(() => favoriteNames.map((name) => allDishes.find((dish) => dish.name === name)).filter((dish): dish is Dish => Boolean(dish)), [allDishes, favoriteNames]);
  const filteredDishes = useMemo(() => dayDishes.filter((dish) => (activeCategory === "Tout" || dish.category === activeCategory) && `${dish.name} ${dish.description}`.toLowerCase().includes(query.toLowerCase())), [activeCategory, dayDishes, query]);

  const toggleFavorite = (dish: Dish) => setFavoriteNames((current) => current.includes(dish.name) ? current.filter((name) => name !== dish.name) : [...current, dish.name]);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsBooting(false), 1650);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.body.style.overflow = selectedDish ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [selectedDish]);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    let lastColorChangeY = window.scrollY;
    let colorIndex = 0;
    const maliColors: Array<"green" | "yellow" | "red"> = ["green", "yellow", "red"];
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setNavVisible(currentScrollY < 32 || currentScrollY < lastScrollY);
      setHasScrolled(currentScrollY > 120);
      if (Math.abs(currentScrollY - lastColorChangeY) > 70) {
        colorIndex = (colorIndex + 1) % maliColors.length;
        setBrandColor(maliColors[colorIndex]);
        lastColorChangeY = currentScrollY;
      }
      lastScrollY = currentScrollY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const syncNavWithHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "menu" || hash === "infos" || hash === "accueil") setActiveNav(hash);
    };
    syncNavWithHash();
    window.addEventListener("hashchange", syncNavWithHash);
    return () => window.removeEventListener("hashchange", syncNavWithHash);
  }, []);

  return (
    <div className="app-shell" id="accueil">
      {isBooting && <div className="splash-screen" role="status" aria-label="Ouverture de Bely Mechoui"><div className="splash-screen__rings" /><div className="splash-screen__logo"><img src="/logo-bely-mechoui.jpg" alt="" /><span><ChefHat size={16} /></span></div><strong>BELY <i>MECHOUI</i></strong><small>LE GOÛT DU FAIT MAISON</small><div className="splash-screen__loader"><i /><i /><i /></div></div>}
      <div className={`scroll-brand ${hasScrolled ? "is-visible" : ""} brand-color-${brandColor}`} aria-hidden={!hasScrolled}><span className="scroll-brand__dot"><ChefHat size={14} /></span><strong>BELY <i>MECHOUI</i></strong></div>
      <header className="app-header">
        <div className={`header-brand-lockup brand-color-${brandColor}`} aria-label="Bely Mechoui, le goût du fait maison">
          <span className="header-brand-icon"><ChefHat size={20} strokeWidth={1.9} /></span>
          <strong>BELY <i>MECHOUI</i></strong>
          <small>LE GOÛT DU FAIT MAISON</small>
        </div>
        <div className="header-orbit header-orbit--one" /><div className="header-orbit header-orbit--two" /><span className="header-spark header-spark--one" /><span className="header-spark header-spark--two" /><span className="header-spark header-spark--three" />
        <div className="app-header__top"><Brand /><div className="header-actions"><div className="header-icon-group"><div className="favorite-wrap"><button className={`icon-button icon-button--header ${favoritesOpen ? "is-open" : ""}`} aria-label="Mes plats favoris" aria-expanded={favoritesOpen} onClick={() => { setFavoritesOpen((open) => !open); setNotificationsOpen(false); }}><Heart size={18} fill={favoriteDishes.length ? "currentColor" : "none"} />{favoriteDishes.length > 0 && <span className="notification-badge favorite-badge">{favoriteDishes.length}</span>}</button>{favoritesOpen && <div className="favorites-panel" role="dialog" aria-label="Mes plats favoris"><div className="notification-panel__head"><div><span className="eyebrow eyebrow--light">Mes envies</span><strong>Plats favoris</strong></div><Heart size={18} /></div>{favoriteDishes.length ? favoriteDishes.map((dish) => <button className="favorite-item" key={dish.name} onClick={() => { setSelectedDish(dish); setFavoritesOpen(false); }}><img src={dish.image} alt="" /><span><strong>{dish.name}</strong><small>{formatPrice(dish.price)}</small></span><Heart size={15} fill="currentColor" /></button>) : <p className="panel-empty">Appuie sur le cœur d’un plat pour le retrouver ici.</p>}</div>}</div></div><div className="notification-wrap"><button className={`icon-button icon-button--header ${notificationsOpen ? "is-open" : ""}`} aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => { const willOpen = !notificationsOpen; setNotificationsOpen(willOpen); setUnreadNotifications(willOpen ? 0 : unreadNotifications); setFavoritesOpen(false); }}><Bell size={18} />{unreadNotifications > 0 && <span className="notification-badge">{unreadNotifications}</span>}</button>{notificationsOpen && <div className="notification-panel" role="dialog" aria-label="Notifications"><div className="notification-panel__head"><div><span className="eyebrow eyebrow--light">À la maison</span><strong>Les nouvelles de Bely</strong></div><BellRing size={18} /></div>{initialNotifications.map((notification) => <div className="notification-item" key={notification.title}><span className="notification-item__icon"><Check size={14} /></span><span><strong>{notification.title}</strong><small>{notification.text}</small><em>{notification.time}</em></span></div>)}<button className="notification-panel__close" onClick={() => setNotificationsOpen(false)}>Tout est lu</button></div>}</div></div></div>
        <div className="header-opening"><span className="header-opening__icon"><Clock3 size={15} /></span><span><strong>Ouvert de {restaurantHours.opening}</strong><small>{restaurantHours.days}</small></span></div>
        <div className="app-header__copy"><span className="eyebrow eyebrow--light"><ChefHat size={13} /> LE GOÛT DU FAIT MAISON</span><h1>La cuisine<br /><i>qui rassemble.</i></h1><p>Des plats généreux, préparés avec le feu et le cœur.</p><a className="hero-cta" href="#menu"><span>Découvrir la carte</span><ChevronRight size={16} /></a></div>
        <div className="hero-dish"><img src={featuredDish.image} alt="Méchoui de mouton" /><span className="hero-dish__glow" /></div>
        <div className="header-motion-note" aria-hidden="true"><span className="header-motion-note__icon"><Flame size={14} /></span><span><strong>Chaque jour</strong><small>fait maison</small></span><i /><i /><i /></div>
      </header>

      <main className="app-content">
        <div className="content-topline"><span>Menu digital</span><span>{restaurantHours.days} · {restaurantHours.opening.replace("h à ", ":00 — ").replace("h", ":00")}</span></div>
        <div className="search-row"><label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un plat" aria-label="Rechercher un plat" /></label><button className="icon-button filter-button" aria-label="Filtrer les plats"><SlidersHorizontal size={18} /></button></div>

        <section className="categories-section" aria-labelledby="categories-title"><div className="section-title"><div><span className="eyebrow">Découvrir</span><h2 id="categories-title">Nos catégories</h2></div><span className="section-count">{filteredDishes.length} plats</span></div><div className="category-list" role="tablist" aria-label="Catégories de plats">{categories.map((category) => { const Icon = categoryIcons[category as keyof typeof categoryIcons] ?? ChefHat; const count = dayDishes.filter((dish) => dish.category === category).length; return <button key={category} className={activeCategory === category ? "is-active" : ""} role="tab" aria-selected={activeCategory === category} onClick={() => setActiveCategory(category)}><span className="category-icon"><Icon size={15} /></span><span>{category}</span><small>{count}</small></button>; })}</div></section>

        <section className="day-section" aria-labelledby="day-title"><div className="section-title"><div><span className="eyebrow">La carte du jour</span><h2 id="day-title">Choisir un jour</h2></div><span className="section-count">{days.find((day) => day.key === activeDay)?.label}</span></div><div className="day-list" role="tablist" aria-label="Choisir un jour">{days.map((day, index) => <button key={day.key} className={activeDay === day.key ? "is-active" : ""} role="tab" aria-selected={activeDay === day.key} onClick={() => setActiveDay(day.key)}><span className="day-index">0{index + 2}</span><strong>{day.shortLabel}</strong><span>{day.label.slice(0, 3)}</span></button>)}</div></section>

        <section className="popular-section" id="menu" aria-labelledby="popular-title"><div className="section-title"><div><span className="eyebrow">Les favoris</span><h2 id="popular-title">Populaire à Bely</h2></div><span className="section-count">{filteredDishes.length} résultats</span></div><div className="dish-grid">{filteredDishes.length ? filteredDishes.map((dish, index) => <DishCard key={`${activeDay}-${dish.name}`} dish={dish} onOpen={setSelectedDish} onToggleFavorite={toggleFavorite} isFavorite={favoriteNames.includes(dish.name)} compact={index > 0} />) : <p className="empty-state">Aucun plat ne correspond à cette recherche.</p>}</div></section>

        <section className="signature-card" aria-labelledby="signature-title"><div className="signature-card__image"><img src={featuredDish.image} alt="Spécialité de la maison : méchoui de mouton" /><span>Signature</span></div><div className="signature-card__body"><span className="eyebrow">La spécialité de la maison</span><h2 id="signature-title">Méchoui<br /><i>de mouton</i></h2><p>Rôti lentement, tendre à cœur, accompagné des garnitures du jour.</p><button className="text-button" onClick={() => setSelectedDish(featuredDish)}>Voir le plat <ChevronRight size={16} /></button></div></section>

        <section className="visit-card" id="infos"><div><span className="eyebrow">Nous trouver</span><h2>À bientôt<br /><i>à Sebenikoro.</i></h2></div><div className="visit-card__details"><span><MapPin size={17} /> Sebenikoro, Bamako, Mali</span><span><Clock3 size={17} /> {restaurantHours.days} · {restaurantHours.opening}</span><a href="https://www.facebook.com/salamata.soumare.3" target="_blank" rel="noreferrer">Suivez-nous sur Facebook <ChevronRight size={15} /></a></div></section>
      </main>

      <footer className="app-footer"><div className="footer-motion" aria-hidden="true"><span className="footer-motion__orbit footer-motion__orbit--one" /><span className="footer-motion__orbit footer-motion__orbit--two" /><span className="footer-motion__spark footer-motion__spark--one"><Sparkles size={13} /></span><span className="footer-motion__spark footer-motion__spark--two"><UtensilsCrossed size={12} /></span></div><div className="footer-main"><Brand /><span>© 2026 Bely Mechoui</span></div><div className="footer-credits"><span>Réalisé par <strong>AMA-TECH</strong></span><span>Designé par <strong>ICHE</strong></span></div></footer>
      <nav className={`bottom-nav ${navVisible ? "is-visible" : "is-hidden"}`} aria-label="Navigation principale"><a href="#accueil" className={activeNav === "accueil" ? "is-active" : ""} aria-current={activeNav === "accueil" ? "page" : undefined} onFocus={() => setActiveNav("accueil")} onClick={() => setActiveNav("accueil")}><Home size={19} /><span>ACCUEIL</span></a><a href="#menu" className={activeNav === "menu" ? "is-active" : ""} aria-current={activeNav === "menu" ? "page" : undefined} onFocus={() => setActiveNav("menu")} onClick={(event) => { event.preventDefault(); setActiveNav("menu"); window.location.hash = "menu"; document.getElementById("popular-title")?.scrollIntoView({ behavior: "smooth" }); }}><UtensilsCrossed size={19} /><span>MENU</span></a><a href="#infos" className={activeNav === "infos" ? "is-active" : ""} aria-current={activeNav === "infos" ? "page" : undefined} onFocus={() => setActiveNav("infos")} onClick={() => setActiveNav("infos")}><Info size={19} /><span>INFOS</span></a></nav>
      {selectedDish && <DishDetails dish={selectedDish} onClose={() => setSelectedDish(null)} />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(window.location.pathname === "/admin" ? <AdminApp /> : <App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
