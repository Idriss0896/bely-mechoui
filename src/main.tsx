import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { Beef, Bell, CalendarDays, Check, ChefHat, ChevronRight, Clock3, CookingPot, CupSoda, DoorClosed, DoorOpen, Flame, Heart, Home, ImagePlus, Info, LayoutDashboard, LogOut, MapPin, MessageCircle, Navigation, Phone, Plus, Salad, Sandwich, Save, Search, Share2, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Utensils, UtensilsCrossed, X } from "lucide-react";
import { days, featuredDish, formatPrice, menu, type DayKey, type Dish } from "./data/menu";

import ChatWidget from "./chat/ChatWidget";
import ShareRow from "./share/ShareRow";
import NotificationCenter from "./notifications/NotificationCenter";
import AdminNotifications from "./admin/AdminNotifications";
import MenuBook from "./menu/MenuBook";
import "./styles.css";

const defaultCategories = ["Grillades", "Boissons", "Plats", "Fast-food", "Accompagnement"];
const defaultHours = { opening: "10h à 20h", days: "Mardi au Dimanche" };

/**
 * Coordonnées du restaurant.
 * `phone`   : numéro affiché et composé (format international, ex. "+223 76 00 00 00")
 * `whatsapp`: numéro au format wa.me, sans "+" ni espaces (ex. "22376000000")
 * Laisser vide masque le bouton correspondant.
 */
const CONTACT = {
  phone: "+223 72 84 16 16",
  whatsapp: "22372841616",
  maps: "https://www.google.com/maps/search/?api=1&query=Bely+Mechoui+Sebenikoro+Bamako",
  facebook: "https://www.facebook.com/salamata.soumare.3",
};

const whatsappLink = (message = "Bonjour Bely Mechoui, je souhaite commander.") =>
  `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(message)}`;

const plural = (count: number, singular: string, pluriel = `${singular}s`) => `${count} ${count > 1 ? pluriel : singular}`;

/** Horaires d'ouverture, exprimés à l'heure de Bamako (UTC+0). */
type Opening = { open: number; close: number };
type OpeningStatus = { open: boolean; label: string; detail: string };

const CLOSED_DAYS = [1]; // lundi
const WEEKDAY_NAMES = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const WEEK_ROWS = [
  { index: 1, label: "Lundi" },
  { index: 2, label: "Mardi" },
  { index: 3, label: "Mercredi" },
  { index: 4, label: "Jeudi" },
  { index: 5, label: "Vendredi" },
  { index: 6, label: "Samedi" },
  { index: 0, label: "Dimanche" },
];

function parseOpening(raw: string): Opening {
  const match = raw.match(/(\d{1,2})\s*h.*?(\d{1,2})\s*h/i);
  if (!match) return { open: 10, close: 20 };
  return { open: Number(match[1]), close: Number(match[2]) };
}

function bamakoClock() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Bamako",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(read("weekday"));
  const hour = Number(read("hour"));
  const minute = Number(read("minute"));
  return { day: index < 0 ? 1 : index, hour, minutes: hour * 60 + minute };
}

function openStatus(opening: Opening): OpeningStatus {
  const { day, minutes } = bamakoClock();
  const isServiceDay = !CLOSED_DAYS.includes(day);

  if (isServiceDay && minutes >= opening.open * 60 && minutes < opening.close * 60) {
    return { open: true, label: "Ouvert maintenant", detail: `jusqu'à ${opening.close}h` };
  }
  if (isServiceDay && minutes < opening.open * 60) {
    return { open: false, label: "Fermé", detail: `ouvre à ${opening.open}h` };
  }

  let ahead = 1;
  while (CLOSED_DAYS.includes((day + ahead) % 7)) ahead += 1;
  return { open: false, label: "Fermé", detail: `ouvre ${WEEKDAY_NAMES[(day + ahead) % 7]} à ${opening.open}h` };
}

type MenuState = Record<DayKey, Dish[]>;

type Hours = { opening: string; days: string };
type MenuPayload = { menu: MenuState; categories: string[]; hours: Hours };
type MenuSource = "chargement" | "base" | "statique";

const defaultPayload: MenuPayload = { menu, categories: defaultCategories, hours: defaultHours };

/** Une carte partielle (jour manquant) ne doit jamais casser l'affichage. */
function normalizeMenu(raw: unknown): MenuState {
  const source = (raw ?? {}) as Partial<MenuState>;
  return days.reduce((complete, day) => {
    const dishes = source[day.key];
    complete[day.key] = Array.isArray(dishes) ? dishes : [];
    return complete;
  }, {} as MenuState);
}

/** Canal de synchronisation instantanée entre onglets du même navigateur. */
const MENU_CHANNEL = "bely-menu-v1";
/** Vérification des changements faits depuis un autre appareil. */
const MENU_POLL_MS = 8_000;
/** Repère de version renvoyé par l'API quand aucune carte n'est encore enregistrée. */
const EMPTY_STAMP = "empty";

type MenuSnapshot = { payload: MenuPayload; stamp: string };

/**
 * Un seul canal, gardé ouvert : le fermer juste après un envoi peut perdre le message.
 * Il reçoit aussi les cartes enregistrées depuis un autre onglet.
 */
let menuChannel: BroadcastChannel | null = null;
const menuListeners = new Set<(snapshot: MenuSnapshot) => void>();

function channel() {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!menuChannel) {
    menuChannel = new BroadcastChannel(MENU_CHANNEL);
    menuChannel.onmessage = (event: MessageEvent<MenuSnapshot>) => {
      const snapshot = event.data;
      if (!snapshot?.payload || typeof snapshot.stamp !== "string") return;
      menuListeners.forEach((listener) => listener(snapshot));
    };
  }
  return menuChannel;
}

function broadcastMenu(snapshot: MenuSnapshot) {
  channel()?.postMessage(snapshot);
}

function subscribeMenu(onChange: (snapshot: MenuSnapshot) => void) {
  if (!channel()) return () => {};
  menuListeners.add(onChange);
  return () => { menuListeners.delete(onChange); };
}

const asStamp = (updatedAt: unknown) => (typeof updatedAt === "string" && updatedAt ? updatedAt : EMPTY_STAMP);

/**
 * Charge la carte depuis la base (API /api/menu) et la garde à jour :
 * - instantanément depuis l'onglet admin du même navigateur (BroadcastChannel) ;
 * - en quelques secondes depuis un autre appareil (sondage léger de `updated_at`).
 * Si la base n'est pas configurée ou injoignable, le menu embarqué sert de secours :
 * le site reste consultable, mais l'administration ne peut pas enregistrer.
 */
function useMenuData() {
  const [payload, setPayload] = useState<MenuPayload>(defaultPayload);
  const [source, setSource] = useState<MenuSource>("chargement");
  const stamp = useRef(asStamp(null));

  /** Applique une carte enregistrée depuis cet onglet, et prévient les autres. */
  const apply = useCallback((next: MenuPayload, nextStamp: string) => {
    stamp.current = nextStamp;
    setPayload(next);
    setSource("base");
    broadcastMenu({ payload: next, stamp: nextStamp });
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/menu", { cache: "no-store", headers: { Accept: "application/json" } });
      if (!response.ok) return setSource("statique");
      const data = await response.json();
      if (!data?.configured) return setSource("statique");
      stamp.current = asStamp(data.updatedAt);
      if (data.menu) {
        setPayload({
          menu: normalizeMenu(data.menu),
          categories: (data.categories as string[]) ?? defaultCategories,
          hours: (data.hours as Hours) ?? defaultHours,
        });
      }
      setSource("base");
    } catch {
      setSource("statique");
    }
  }, []);

  /** Sondage léger : ne recharge la carte que si `updated_at` a changé. */
  const poll = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    try {
      const response = await fetch("/api/menu?meta=1", { cache: "no-store", headers: { Accept: "application/json" } });
      if (!response.ok) return;
      const data = await response.json();
      if (data?.configured && asStamp(data.updatedAt) !== stamp.current) await load();
    } catch {
      // Réseau momentanément indisponible : le prochain passage réessaiera.
    }
  }, [load]);

  useEffect(() => {
    let alive = true;
    load();

    const tick = () => { if (alive) poll(); };
    const onWake = () => { if (document.visibilityState === "visible") tick(); };
    const timer = window.setInterval(tick, MENU_POLL_MS);
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);

    const unsubscribe = subscribeMenu((snapshot) => {
      stamp.current = snapshot.stamp;
      setPayload(snapshot.payload);
      setSource("base");
    });

    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
      unsubscribe();
    };
  }, [load, poll]);

  return { payload, source, apply };
}

const categoryIcons = {
  Grillades: Beef,
  Boissons: CupSoda,
  Plats: CookingPot,
  "Fast-food": Sandwich,
  Accompagnement: Salad,
};

const adminDays = days;

function Brand() {
  return <a className="brand" href="#accueil" aria-label="Bely Mechoui, accueil"><span className="brand__logo"><strong className="brand__wordmark">BELY <i>MECHOUI</i></strong><span className="brand__logo-mark"><ChefHat size={12} /></span></span></a>;
}

function getTodayMenuDay(): DayKey {
  const dayByNumber: Record<number, DayKey | undefined> = { 0: "dimanche", 2: "mardi", 3: "mercredi", 4: "jeudi", 5: "vendredi", 6: "samedi" };
  return dayByNumber[new Date().getDay()] ?? "mardi";
}

function DishCard({ dish, onOpen, onToggleFavorite, isFavorite, compact = false }: { dish: Dish; onOpen: (dish: Dish) => void; onToggleFavorite: (dish: Dish) => void; isFavorite: boolean; compact?: boolean }) {
  return (
    <button className={`dish-card ${compact ? "dish-card--compact" : ""} ${dish.unavailable ? "is-unavailable" : ""}`} onClick={() => onOpen(dish)} aria-haspopup="dialog">
      <span className="dish-card__image"><img src={dish.image} alt="" loading="lazy" /><span className="dish-card__tag">{dish.category}</span><span className={`dish-card__heart ${isFavorite ? "is-favorite" : ""}`} role="button" tabIndex={0} aria-label={isFavorite ? `Retirer ${dish.name} des favoris` : `Ajouter ${dish.name} aux favoris`} aria-pressed={isFavorite} onClick={(event) => { event.stopPropagation(); onToggleFavorite(dish); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onToggleFavorite(dish); } }}><Heart size={15} fill={isFavorite ? "currentColor" : "none"} /></span></span>
      <span className="dish-card__info"><span className="dish-card__name">{dish.name}</span><span className="dish-card__desc">{dish.description}</span><span className="dish-card__bottom"><strong>{formatPrice(dish.price)}</strong><span className="dish-card__cta">Voir<ChevronRight size={13} aria-hidden="true" /></span></span></span>
      {dish.unavailable && <span className="dish-card__unavailable">Indisponible aujourd'hui</span>}
    </button>
  );
}

function DishDetails({ dish, onClose }: { dish: Dish; onClose: () => void }) {
  const [shared, setShared] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const share = async () => {
    const url = `${window.location.origin}/#menu`;
    const text = `${dish.name} — ${formatPrice(dish.price)} · Bely Mechoui`;
    try {
      if (navigator.share) { await navigator.share({ title: dish.name, text, url }); return; }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch { /* partage annulé par l'utilisateur */ }
  };

  return (
    <div className="detail-backdrop" role="presentation" onClick={onClose}>
      <section className="detail-sheet" role="dialog" aria-modal="true" aria-labelledby="dish-detail-title" onClick={(event) => event.stopPropagation()}>
        <span className="detail-sheet__handle" aria-hidden="true" />
        <div className="detail-sheet__image"><img src={dish.image} alt={dish.name} /><span className="detail-sheet__badge">{dish.category}</span><button ref={closeRef} className="icon-button icon-button--light detail-sheet__close" aria-label="Fermer" onClick={onClose}><X size={19} /></button><button className="icon-button icon-button--light detail-sheet__share" aria-label={`Partager ${dish.name}`} onClick={share}>{shared ? <Check size={17} /> : <Share2 size={17} />}</button></div>
        <div className="detail-sheet__body"><span className="eyebrow"><Sparkles size={12} /> Fait maison</span><h2 id="dish-detail-title">{dish.name}</h2><p>{dish.description}</p><div className="detail-sheet__facts"><span><Clock3 size={16} /> Préparé avec soin</span></div><div className="detail-sheet__footer"><strong>{formatPrice(dish.price)}</strong><span>Au menu aujourd'hui</span></div>
          <div className="detail-sheet__actions">
            {CONTACT.whatsapp ? <a className="detail-cta detail-cta--primary" href={whatsappLink(`Bonjour Bely Mechoui, je souhaite commander : ${dish.name}.`)} target="_blank" rel="noreferrer"><Utensils size={16} /> Commander ce plat</a> : null}
            {CONTACT.phone ? <a className="detail-cta" href={`tel:${CONTACT.phone.replace(/\s+/g, "")}`}><Phone size={16} /> Appeler</a> : null}
            <a className="detail-cta" href={CONTACT.maps} target="_blank" rel="noreferrer"><Navigation size={16} /> Itinéraire</a>
          </div>
          {shared && <p className="detail-sheet__toast" role="status">Lien copié</p>}
        </div>
      </section>
    </div>
  );
}

type AdminDraft = Dish & { originDay: DayKey; originalName: string };

const ADMIN_TOKEN_KEY = "bely-admin-token";

function AdminApp() {
  const { payload, source, apply } = useMenuData();
  const [token, setToken] = useState(() => sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? "");
  const [password, setPassword] = useState("");
  const [menuState, setMenuState] = useState<MenuState>(payload.menu);
  const [categoriesState, setCategoriesState] = useState<string[]>(payload.categories);
  const [selectedDay, setSelectedDay] = useState<DayKey>(getTodayMenuDay);
  const [draft, setDraft] = useState<AdminDraft | null>(null);
  const [notice, setNotice] = useState("");
  const [categoryText, setCategoryText] = useState(() => payload.categories.join(", "));
  const [hours, setHours] = useState<Hours>(payload.hours);
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const authenticated = Boolean(token);
  const logout = () => { sessionStorage.removeItem(ADMIN_TOKEN_KEY); setToken(""); };

  // Suit la base, sans écraser une modification en cours dans l'éditeur.
  useEffect(() => {
    if (draft || saving) return;
    setMenuState(payload.menu);
    setCategoriesState(payload.categories);
    setHours(payload.hours);
    setCategoryText(payload.categories.join(", "));
  }, [payload, draft, saving]);

  const showNotice = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 2600); };

  const commit = async (nextMenu: MenuState, nextCategories = categoriesState, nextHours = hours) => {
    if (source !== "base") { showNotice("Base non configurée : rien n'est enregistré"); return; }
    const previous = { menu: menuState, categories: categoriesState, hours };
    setMenuState(nextMenu);
    setCategoriesState(nextCategories);
    setHours(nextHours);
    setSaving(true);
    try {
      const response = await fetch("/api/menu", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ menu: nextMenu, categories: nextCategories, hours: nextHours }),
      });
      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        apply({ menu: nextMenu, categories: nextCategories, hours: nextHours }, asStamp(data.updatedAt));
        showNotice("Enregistré · le site est à jour");
        return;
      }
      setMenuState(previous.menu);
      setCategoriesState(previous.categories);
      setHours(previous.hours);
      setCategoryText(previous.categories.join(", "));
      if (response.status === 401) { logout(); showNotice("Session expirée : reconnecte-toi"); }
      else if (response.status === 503) showNotice("Base non configurée : rien n'est enregistré");
      else showNotice("Échec de l'enregistrement");
    } catch {
      setMenuState(previous.menu);
      setCategoriesState(previous.categories);
      setHours(previous.hours);
      setCategoryText(previous.categories.join(", "));
      showNotice("Réseau indisponible");
    } finally {
      setSaving(false);
    }
  };
  const openNewDish = () => setDraft({ name: "Nouveau plat", description: "Description du plat maison.", price: 0, image: "", category: categoriesState[0] ?? "Grillades", originDay: selectedDay, originalName: "" });
  const openEditDish = (dish: Dish) => setDraft({ ...dish, originDay: selectedDay, originalName: dish.name });
  const saveDish = () => {
    if (!draft) return;
    if (!draft.name.trim()) return;
    const nextMenu = { ...menuState };
    nextMenu[draft.originDay] = nextMenu[draft.originDay].filter((dish) => !draft.originalName || dish.name !== draft.originalName);
    nextMenu[selectedDay] = [...nextMenu[selectedDay], { name: draft.name.trim(), description: draft.description, price: Number(draft.price) || 0, image: draft.image, category: draft.category, unavailable: draft.unavailable }];
    setDraft(null);
    commit(nextMenu);
  };
  const deleteDish = (dish: Dish) => commit({ ...menuState, [selectedDay]: menuState[selectedDay].filter((item) => item !== dish) });
  const updateCategories = () => {
    const nextCategories = categoryText.split(",").map((category) => category.trim()).filter(Boolean);
    if (!nextCategories.length) return;
    commit(menuState, nextCategories);
  };
  const updateHours = () => commit(menuState, categoriesState, hours);

  const changePassword = async () => {
    if (newPassword.length < 6) return showNotice("6 caractères minimum");
    if (newPassword !== confirmPassword) return showNotice("Les deux mots de passe ne correspondent pas");
    setSaving(true);
    try {
      const response = await fetch("/api/menu?action=password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.token) {
        sessionStorage.setItem(ADMIN_TOKEN_KEY, data.token);
        setToken(data.token);
        setNewPassword("");
        setConfirmPassword("");
        showNotice("Mot de passe mis à jour");
      } else if (response.status === 401) {
        logout();
        showNotice("Session expirée : reconnecte-toi");
      } else {
        showNotice(data.error ?? "Échec du changement de mot de passe");
      }
    } catch {
      showNotice("Réseau indisponible");
    } finally {
      setSaving(false);
    }
  };
  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const response = await fetch("/api/menu", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      if (response.ok) {
        const data = await response.json();
        sessionStorage.setItem(ADMIN_TOKEN_KEY, data.token);
        setToken(data.token);
        setPassword("");
      } else if (response.status === 503) showNotice("Base de données non configurée");
      else showNotice("Mot de passe incorrect");
    } catch {
      showNotice("Connexion impossible");
    }
  };

  if (!authenticated) return <main className="admin-login"><div className="admin-login__glow" /><div className="admin-login__card"><div className="admin-login__brand"><span><ChefHat size={25} /></span><small>ESPACE PRIVÉ</small><h1>BELY <i>MECHOUI</i></h1></div><p>Connecte-toi pour gérer la carte du restaurant.</p><form onSubmit={handleLogin}><label>Mot de passe<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" autoFocus /></label><button className="admin-primary" type="submit"><LayoutDashboard size={17} /> Ouvrir le tableau de bord</button></form>{notice && <div className="admin-notice admin-notice--error">{notice}</div>}<a className="admin-back" href="/#accueil">Retour au site public</a></div></main>;

  const totalDishes = Object.values(menuState).flat().length;
  return <main className="admin-shell"><header className="admin-header"><a className="admin-brand" href="/#accueil"><span><ChefHat size={19} /></span><strong>BELY <i>MECHOUI</i></strong></a><div className="admin-header__actions"><span className="admin-status"><span /> {source === "base" ? "Base connectée" : source === "chargement" ? "Connexion à la base…" : "Mode démo · non enregistré"}</span><button className="admin-logout" onClick={logout}><LogOut size={16} /> Déconnexion</button></div></header><div className="admin-layout"><aside className="admin-sidebar"><span className="admin-eyebrow">Administration</span><h1>Tableau de bord</h1><p>Gère le menu, les horaires et l’image de Bely Mechoui depuis un seul endroit.</p><div className="admin-side-links"><a className="is-active" href="#dashboard"><LayoutDashboard size={17} /> Vue générale</a><a href="#menu-admin"><UtensilsCrossed size={17} /> Menus</a><a href="#settings-admin"><Clock3 size={17} /> Horaires & catégories</a><a href="#notifications-admin"><Bell size={17} /> Notifications</a></div></aside><section className="admin-content" id="dashboard">{notice && <div className="admin-notice">{notice}</div>}<div className="admin-page-heading"><div><span className="admin-eyebrow">Vue générale</span><h2>Bonjour, Bely.</h2></div><span className="admin-date"><CalendarDays size={16} /> {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date())}</span></div><div className="admin-stats"><div><span className="admin-stat-icon"><Utensils size={18} /></span><small>Plats publiés</small><strong>{totalDishes}</strong></div><div><span className="admin-stat-icon admin-stat-icon--gold"><CalendarDays size={18} /></span><small>Jours ouverts</small><strong>6</strong></div><div><span className="admin-stat-icon admin-stat-icon--green"><Check size={18} /></span><small>État du service</small><strong>Ouvert</strong></div></div><section className="admin-panel" id="menu-admin"><div className="admin-panel__head"><div><span className="admin-eyebrow">Gestion de la carte</span><h2>Menu du restaurant</h2></div><button className="admin-primary admin-primary--small" onClick={openNewDish}><Plus size={16} /> Nouveau plat</button></div><div className="admin-day-tabs">{adminDays.map((day) => <button className={selectedDay === day.key ? "is-active" : ""} key={day.key} onClick={() => { setSelectedDay(day.key); setDraft(null); }}><strong>{day.shortLabel}</strong><small>{day.label}</small><em>{menuState[day.key].length}</em></button>)}</div><div className="admin-dish-list">{menuState[selectedDay].map((dish) => <article className="admin-dish-row" key={`${selectedDay}-${dish.name}`}><img src={dish.image || "/logo-bely-mechoui.jpg"} alt="" /><div><strong>{dish.name}</strong><small>{dish.category} · {formatPrice(dish.price)}</small><p>{dish.description}</p></div><div className="admin-row-actions"><button aria-label={`Modifier ${dish.name}`} onClick={() => openEditDish(dish)}><Save size={16} /></button><button aria-label={`Supprimer ${dish.name}`} onClick={() => deleteDish(dish)}><Trash2 size={16} /></button></div></article>)}</div>{draft && <div className="admin-editor"><div className="admin-editor__head"><div><span className="admin-eyebrow">Édition rapide</span><h3>{draft.name === "Nouveau plat" ? "Ajouter un plat" : "Modifier le plat"}</h3></div><button className="admin-close" onClick={() => setDraft(null)}><X size={18} /></button></div><div className="admin-form-grid"><label>Nom du plat<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>Catégorie<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>{categoriesState.map((category) => <option key={category}>{category}</option>)}</select></label><label>Jour<select value={selectedDay} onChange={(event) => { const nextDay = event.target.value as DayKey; setSelectedDay(nextDay); setDraft({ ...draft }); }}>{adminDays.map((day) => <option key={day.key} value={day.key}>{day.label}</option>)}</select></label><label>Prix (FCFA)<input type="number" min="0" value={draft.price} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })} /></label><label className="admin-form-wide">Description<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><label className="admin-form-wide">URL de la photo<input value={draft.image} onChange={(event) => setDraft({ ...draft, image: event.target.value })} placeholder="https://..." /></label><label className="admin-upload"><ImagePlus size={16} /> Photo locale<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setDraft({ ...draft, image: String(reader.result) }); reader.readAsDataURL(file); }} /></label></div><button className="admin-primary" onClick={saveDish} disabled={saving}><Save size={17} /> Enregistrer le plat</button></div>}</section><section className="admin-settings" id="settings-admin"><div className="admin-panel"><div className="admin-panel__head"><div><span className="admin-eyebrow">Configuration</span><h2>Horaires du restaurant</h2></div><Clock3 size={20} /></div><div className="admin-settings-grid"><label>Horaires d’ouverture<input value={hours.opening} onChange={(event) => setHours({ ...hours, opening: event.target.value })} /></label><label>Jours ouverts<input value={hours.days} onChange={(event) => setHours({ ...hours, days: event.target.value })} /></label></div><button className="admin-primary admin-primary--small" onClick={updateHours}><Save size={16} /> Enregistrer les horaires</button></div><AdminNotifications token={token} /><div className="admin-panel"><div className="admin-panel__head"><div><span className="admin-eyebrow">Organisation</span><h2>Catégories</h2></div><Sparkles size={20} /></div><p className="admin-helper">Sépare les catégories par des virgules pour les réorganiser.</p><input className="admin-categories-input" value={categoryText} onChange={(event) => setCategoryText(event.target.value)} /><button className="admin-primary admin-primary--small" onClick={updateCategories}><Save size={16} /> Enregistrer les catégories</button></div><div className="admin-panel"><div className="admin-panel__head"><div><span className="admin-eyebrow">Sécurité</span><h2>Mot de passe</h2></div><ShieldCheck size={20} /></div><p className="admin-helper">6 caractères minimum. Le changement est immédiat et déconnecte les autres appareils.</p><div className="admin-settings-grid"><label>Nouveau mot de passe<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label><label>Confirmation<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label></div><button className="admin-primary admin-primary--small" onClick={changePassword} disabled={saving}><Save size={16} /> Changer le mot de passe</button></div></section></section></div></main>;
}

function App() {
  const appRoot = useRef<HTMLDivElement>(null);
  const [isBooting, setIsBooting] = useState(true);
  const { payload } = useMenuData();
  const menuState = payload.menu;
  const categories = payload.categories;
  const restaurantHours = payload.hours;
  const opening = useMemo(() => parseOpening(restaurantHours.opening), [restaurantHours.opening]);
  const today = bamakoClock().day;
  const [status, setStatus] = useState<OpeningStatus>(() => openStatus(opening));

  useEffect(() => {
    const refresh = () => setStatus(openStatus(opening));
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, [opening]);
  const [activeDay, setActiveDay] = useState<DayKey>(getTodayMenuDay);
  const [activeCategory, setActiveCategory] = useState("Grillades");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<"default" | "price-asc" | "price-desc">("default");
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null);
  const [bookOpen, setBookOpen] = useState(false);
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
  const filteredDishes = useMemo(() => {
    const needle = query.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const pool = needle ? allDishes : dayDishes;
    const matches = pool.filter((dish) => {
      if (!needle) return activeCategory === "Tout" || dish.category === activeCategory;
      return `${dish.name} ${dish.description}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(needle);
    });
    if (sortMode === "price-asc") return [...matches].sort((a, b) => a.price - b.price);
    if (sortMode === "price-desc") return [...matches].sort((a, b) => b.price - a.price);
    return matches;
  }, [activeCategory, allDishes, dayDishes, query, sortMode]);

  const toggleFavorite = (dish: Dish) => setFavoriteNames((current) => current.includes(dish.name) ? current.filter((name) => name !== dish.name) : [...current, dish.name]);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsBooting(false), 1650);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!appRoot.current) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    import("./animations/landingMotion").then(({ mountLandingMotion }) => {
      if (!cancelled && appRoot.current) cleanup = mountLandingMotion(appRoot.current);
    });
    return () => { cancelled = true; cleanup?.(); };
  }, []);

  useEffect(() => {
    if (!appRoot.current) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    import("./animations/landingMotion").then(({ mountDishCardMotion }) => {
      if (!cancelled && appRoot.current) cleanup = mountDishCardMotion(appRoot.current);
    });
    return () => { cancelled = true; cleanup?.(); };
  }, [filteredDishes]);

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

  const quickActions = (<div className="header-actions"><div className="header-icon-group">{CONTACT.whatsapp && <a className="icon-button icon-button--header icon-button--wa" href={whatsappLink()} target="_blank" rel="noreferrer" aria-label="Commander sur WhatsApp"><MessageCircle size={18} /></a>}<div className="favorite-wrap"><button className={`icon-button icon-button--header ${favoritesOpen ? "is-open" : ""}`} aria-label="Mes plats favoris" aria-expanded={favoritesOpen} onClick={() => { setFavoritesOpen((open) => !open); setNotificationsOpen(false); }}><Heart size={18} fill={favoriteDishes.length ? "currentColor" : "none"} />{favoriteDishes.length > 0 && <span className="notification-badge favorite-badge">{favoriteDishes.length}</span>}</button>{favoritesOpen && <div className="favorites-panel" role="dialog" aria-label="Mes plats favoris"><div className="notification-panel__head"><div><span className="eyebrow eyebrow--light">Mes envies</span><strong>Plats favoris</strong></div><Heart size={18} /></div>{favoriteDishes.length ? favoriteDishes.map((dish) => <button className="favorite-item" key={dish.name} onClick={() => { setSelectedDish(dish); setFavoritesOpen(false); }}><img src={dish.image} alt="" /><span><strong>{dish.name}</strong><small>{formatPrice(dish.price)}</small></span><Heart size={15} fill="currentColor" /></button>) : <p className="panel-empty">Appuie sur le cœur d’un plat pour le retrouver ici.</p>}</div>}</div></div><NotificationCenter open={notificationsOpen} onOpenChange={setNotificationsOpen} onBeforeOpen={() => setFavoritesOpen(false)} /></div>);

  return (
    <div className="app-shell" id="accueil" ref={appRoot}>
      {isBooting && <div className="splash-screen" role="status" aria-label="Ouverture de Bely Mechoui"><div className="splash-screen__rings" /><div className="splash-screen__logo"><img src="/logo-bely-mechoui.jpg" alt="" /><span><ChefHat size={16} /></span></div><strong>BELY <i>MECHOUI</i></strong><small>LE GOÛT DU FAIT MAISON</small><div className="splash-screen__loader"><i /><i /><i /></div></div>}
      <header className={`topbar ${hasScrolled ? "is-visible" : ""}`} aria-hidden={!hasScrolled}>
        <a className="topbar__lockup" href="#accueil" aria-label="Bely Mechoui, accueil">
          <span className="topbar__mark"><ChefHat size={14} /></span>
          <span className="topbar__text">
            <strong>BELY <i>MECHOUI</i></strong>
            <small>LE GOÛT DU FAIT MAISON</small>
          </span>
        </a>
        {quickActions}
      </header>
      <header className="app-header">
        <div className={`header-brand-lockup brand-color-${brandColor}`} aria-label="Bely Mechoui, le goût du fait maison">
          <span className="header-brand-icon"><ChefHat size={20} strokeWidth={1.9} /></span>
          <strong>BELY <i>MECHOUI</i></strong>
          <small>LE GOÛT DU FAIT MAISON</small>
        </div>
        <div className="header-orbit header-orbit--one" /><div className="header-orbit header-orbit--two" />
        <div className="app-header__top"><Brand />{quickActions}</div>
        <div className="app-header__copy"><span className="eyebrow eyebrow--light"><ChefHat size={13} /> LE GOÛT DU FAIT MAISON</span><h1>La cuisine<br /><i>qui rassemble.</i></h1><p>Des plats généreux, préparés avec le feu et le cœur.</p><a className="hero-cta" href="#menu" onClick={(event) => { event.preventDefault(); setBookOpen(true); }}><span>Découvrir la carte</span><ChevronRight size={16} /></a><div className={`hero-hours ${status.open ? "is-open" : "is-closed"}`}><span className="hero-hours__door" aria-hidden="true" key={status.open ? "ouverte" : "fermee"}>{status.open ? <DoorOpen size={18} strokeWidth={1.9} /> : <DoorClosed size={18} strokeWidth={1.9} />}</span><span className="hero-hours__body"><strong>{status.label}</strong><span className="hero-hours__detail">{status.detail}</span></span></div></div>
        <div className="hero-dish"><img src={featuredDish.image} alt="Méchoui de mouton" /><span className="hero-dish__glow" /></div>
        <div className="header-motion-note" aria-hidden="true"><span className="header-motion-note__icon"><Flame size={14} /></span><span><strong>Chaque jour</strong><small>fait maison</small></span><i /><i /><i /></div>
      </header>

      <main className="app-content">
        <div className="content-topline"><span>Menu digital</span><span>Sebenikoro, Bamako</span></div>
        <div className="search-row"><div className="search-field"><div className="search-box"><Search size={19} className="search-box__icon" aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Un plat, une envie…" aria-label="Rechercher un plat" enterKeyHint="search" autoComplete="off" spellCheck={false} />{query && <button type="button" className="search-clear" onClick={() => setQuery("")} aria-label="Effacer la recherche"><X size={16} /></button>}</div>{query.trim() && <div className="search-results" role="listbox" aria-label="Résultats de recherche">{filteredDishes.slice(0, 5).map((dish) => <button key={dish.name} type="button" className="search-result" onClick={() => setSelectedDish(dish)}><span>{dish.name}</span><em>{formatPrice(dish.price)}</em></button>)}{filteredDishes.length === 0 && <p className="search-result__empty">Aucun plat ne correspond à « {query} ».</p>}</div>}</div><button className={`icon-button filter-button ${sortMode !== "default" ? "is-active" : ""}`} aria-label={sortMode === "default" ? "Trier par prix croissant" : sortMode === "price-asc" ? "Trier par prix décroissant" : "Revenir à l'ordre du menu"} title={sortMode === "price-asc" ? "Prix croissant" : sortMode === "price-desc" ? "Prix décroissant" : "Trier par prix"} onClick={() => setSortMode(sortMode === "default" ? "price-asc" : sortMode === "price-asc" ? "price-desc" : "default")}><SlidersHorizontal size={18} />{sortMode !== "default" && <span className="filter-button__state">{sortMode === "price-asc" ? "↑" : "↓"}</span>}</button></div>

        <section className="categories-section" aria-labelledby="categories-title"><div className="section-title"><div><span className="eyebrow">Découvrir</span><h2 id="categories-title">Nos catégories</h2></div><span className="section-count">{plural(filteredDishes.length, "plat")}</span></div><div className="category-list" role="tablist" aria-label="Catégories de plats">{categories.map((category) => { const Icon = categoryIcons[category as keyof typeof categoryIcons] ?? ChefHat; const count = dayDishes.filter((dish) => dish.category === category).length; return <button key={category} className={activeCategory === category ? "is-active" : ""} role="tab" aria-selected={activeCategory === category} onClick={() => setActiveCategory(category)}><span className="category-icon"><Icon size={17} /></span><span className="category-label">{category}</span><small>{count}</small></button>; })}</div></section>

        <section className="day-section" aria-labelledby="day-title"><div className="section-title"><div><span className="eyebrow">La carte du jour</span><h2 id="day-title">Choisir un jour</h2></div><span className="section-count">{days.find((day) => day.key === activeDay)?.label}</span></div><div className="day-list" role="tablist" aria-label="Choisir un jour">{days.map((day, index) => <button key={day.key} className={activeDay === day.key ? "is-active" : ""} role="tab" aria-selected={activeDay === day.key} onClick={() => setActiveDay(day.key)}><span className="day-marker"><CalendarDays size={13} /></span><strong>{day.shortLabel}</strong><span>{day.label.slice(0, 3)}</span><em>0{index + 2}</em></button>)}</div></section>

        <section className="popular-section" id="menu" aria-labelledby="popular-title"><div className="section-title"><div><span className="eyebrow">Les favoris</span><h2 id="popular-title">Populaire à Bely</h2></div><span className="section-count">{plural(filteredDishes.length, "résultat")}</span></div><div className="dish-grid">{filteredDishes.length ? filteredDishes.map((dish, index) => <DishCard key={`${activeDay}-${dish.name}`} dish={dish} onOpen={setSelectedDish} onToggleFavorite={toggleFavorite} isFavorite={favoriteNames.includes(dish.name)} compact={index > 0} />) : <p className="empty-state">Aucun plat ne correspond à cette recherche.</p>}</div></section>

        <section className="signature-card" aria-labelledby="signature-title"><div className="signature-card__image"><img src={featuredDish.image} alt="Spécialité de la maison : méchoui de mouton" /></div><div className="signature-card__body"><span className="eyebrow">La spécialité de la maison</span><h2 id="signature-title">Méchoui<br /><i>de mouton</i></h2><p>Rôti lentement, tendre à cœur, accompagné des garnitures du jour.</p><button className="text-button" onClick={() => setSelectedDish(featuredDish)}>Voir le plat <ChevronRight size={16} /></button></div></section>

        <section className="team-story" aria-labelledby="team-title"><div className="team-story__copy"><span className="eyebrow">Chez Bely</span><h2 id="team-title">Une équipe,<br /><i>un même goût.</i></h2><p>Des mains passionnées, une attention à chaque détail et la fierté de vous servir chaque jour.</p><span className="team-story__promise"><Sparkles size={15} /> Chaque jour, fait maison</span></div><div className="team-story__gallery"><figure className="team-photo team-photo--duo"><img src="/bely-team-duo.webp" alt="Deux membres de l'équipe Bely Mechoui" width={1200} height={1600} loading="lazy" decoding="async" /><figcaption>Le service avec le sourire</figcaption></figure><figure className="team-photo team-photo--collective"><img src="/bely-team-collective.webp" alt="L'équipe Bely Mechoui" width={1200} height={1600} loading="lazy" decoding="async" /><figcaption>L'équipe Bely Mechoui</figcaption></figure><figure className="team-photo team-photo--service"><img src="/bely-team-service.webp" alt="Les membres de l'équipe Bely Mechoui" width={1200} height={1600} loading="lazy" decoding="async" /></figure></div></section>

        <section className="visit-card" id="infos"><div><span className="eyebrow">Nous trouver</span><h2>À bientôt<br /><i>à Sebenikoro.</i></h2></div><div className="visit-card__details"><span><MapPin size={17} /> Sebenikoro, Bamako, Mali</span><div className={`hours-card ${status.open ? "is-open" : "is-closed"}`}><div className="hours-card__head"><span className="hours-card__title"><Clock3 size={14} /> Horaires</span><span className="hours-card__state">{status.open ? <DoorOpen size={13} strokeWidth={2} /> : <DoorClosed size={13} strokeWidth={2} />}{status.open ? "Ouvert" : "Fermé"}</span></div><ul className="hours-list">{WEEK_ROWS.map((row) => { const closed = CLOSED_DAYS.includes(row.index); const isToday = row.index === today; return <li key={row.label} className={`hours-row${isToday ? " is-today" : ""}${closed ? " is-closed" : ""}`}><span className="hours-row__day">{row.label}{isToday && <small className="hours-row__today">Aujourd'hui</small>}</span><em className="hours-row__time">{closed ? "Fermé" : `${opening.open}h – ${opening.close}h`}</em></li>; })}</ul></div><div className="visit-card__actions">{CONTACT.whatsapp && <a className="visit-action visit-action--wa" href={whatsappLink()} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Commander sur WhatsApp</a>}{CONTACT.phone && <a className="visit-action visit-action--call" href={`tel:${CONTACT.phone.replace(/\s+/g, "")}`}><Phone size={16} /> Appeler</a>}<a className="visit-action visit-action--map" href={CONTACT.maps} target="_blank" rel="noreferrer"><Navigation size={16} /> Itinéraire</a><a className="visit-action visit-action--fb" href={CONTACT.facebook} target="_blank" rel="noreferrer">Facebook</a></div></div></section>
      </main>

      <footer className="site-footer">
        <div className="site-footer__glow" aria-hidden="true" />
        <div className="site-footer__top">
          <div className="site-footer__cta">
            <span className="site-footer__brand">BELY <i>MECHOUI</i></span>
            <h2>Une envie de méchoui&nbsp;?<br /><i>On vous attend.</i></h2>
            <div className="site-footer__actions">
              <a className="footer-cta footer-cta--primary" href="#menu"><Utensils size={16} /> Voir la carte</a>
              <a className="footer-cta" href={`tel:${CONTACT.phone.replace(/\s+/g, "")}`}><Phone size={16} /> Nous appeler</a>
            </div>
            <ShareRow tone="dark" label="Partage la maison" text="Découvre Bely Mechoui, le goût du fait maison à Sebenikoro, Bamako." />
          </div>
          <div className="site-footer__columns">
            <div className="footer-col">
              <span className="footer-col__title">La maison</span>
              <a href="#accueil">Accueil</a>
              <a href="#menu">La carte</a>
              <a href="#infos">Nous trouver</a>
            </div>
            <div className="footer-col">
              <span className="footer-col__title">Contact</span>
              <a href={`tel:${CONTACT.phone.replace(/\s+/g, "")}`}>{CONTACT.phone}</a>
              <a href={whatsappLink()} target="_blank" rel="noreferrer">WhatsApp</a>
              <a href={CONTACT.facebook} target="_blank" rel="noreferrer">Facebook</a>
            </div>
            <div className="footer-col">
              <span className="footer-col__title">Horaires</span>
              <span>Mardi – Dimanche</span>
              <strong className="footer-col__strong">10h – 20h</strong>
              <span>Lundi fermé</span>
            </div>
            <div className="footer-col">
              <span className="footer-col__title">Adresse</span>
              <span>Sebenikoro</span>
              <span>Bamako, Mali</span>
              <a href={CONTACT.maps} target="_blank" rel="noreferrer">Voir l'itinéraire</a>
            </div>
          </div>
        </div>
        <div className="site-footer__bottom">
          <span>© 2026 Bely Mechoui</span>
          <span className="site-footer__credit">Réalisé par <strong>AMA-TECH</strong> · Designé par <strong>ICHE</strong></span>
          <a className="site-footer__top-link" href="#accueil">Haut de page <ChevronRight size={14} /></a>
        </div>
      </footer>
      <nav className={`bottom-nav ${navVisible ? "is-visible" : "is-hidden"}`} aria-label="Navigation principale"><a href="#accueil" className={activeNav === "accueil" ? "is-active" : ""} aria-current={activeNav === "accueil" ? "page" : undefined} onFocus={() => setActiveNav("accueil")} onClick={() => setActiveNav("accueil")}><Home size={19} /><span>ACCUEIL</span></a><a href="#menu" className={activeNav === "menu" ? "is-active" : ""} aria-current={activeNav === "menu" ? "page" : undefined} onFocus={() => setActiveNav("menu")} onClick={(event) => { event.preventDefault(); setActiveNav("menu"); setBookOpen(true); }}><UtensilsCrossed size={19} /><span>MENU</span></a><a href="#infos" className={activeNav === "infos" ? "is-active" : ""} aria-current={activeNav === "infos" ? "page" : undefined} onFocus={() => setActiveNav("infos")} onClick={() => setActiveNav("infos")}><Info size={19} /><span>INFOS</span></a></nav>
      <ChatWidget
        dishes={dayDishes}
        allDishes={allDishes}
        status={status}
        hours={restaurantHours}
        formatPrice={formatPrice}
        whatsappHref={whatsappLink}
      />
      {selectedDish && <DishDetails dish={selectedDish} onClose={() => setSelectedDish(null)} />}
      {bookOpen && (
        <MenuBook
          menu={menuState}
          days={days}
          initialDay={activeDay}
          hours={restaurantHours}
          status={status}
          formatPrice={formatPrice}
          whatsappHref={whatsappLink}
          onClose={() => setBookOpen(false)}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(window.location.pathname === "/admin" ? <AdminApp /> : <App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
