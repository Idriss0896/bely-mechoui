import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChefHat, ChevronLeft, ChevronRight, Clock3, CookingPot, CupSoda, Flame, Minus, Plus, Salad, Sandwich, ShoppingBag, Sparkles, X } from "lucide-react";
import type { Dish, DayKey } from "../data/menu";
import { buildOrderMessage, type CartLine } from "../chat/knowledge";
import { imageSet, imageUrl } from "../data/images";

type MenuState = Record<DayKey, Dish[]>;

type Props = {
  menu: MenuState;
  days: Array<{ key: DayKey; label: string; shortLabel: string }>;
  initialDay: DayKey;
  /** Catégorie choisie avant l'ouverture (clic sur une carte catégorie). */
  initialCategory?: string | null;
  hours: { opening: string; days: string };
  status: { open: boolean; label: string; detail: string };
  formatPrice: (value: number) => string;
  whatsappHref: (message: string) => string;
  onClose: () => void;
};

const CART_KEY = "bely-livre-commande";

const readCart = (): CartLine[] => {
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartLine[]) : [];
  } catch {
    return [];
  }
};

const total = (cart: CartLine[]) => cart.reduce((sum, line) => sum + line.price * line.qty, 0);

/** Suit la largeur : l'expérience mobile n'est pas la même que la double page. */
function useIsPhone() {
  const [phone, setPhone] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia("(max-width: 860px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 860px)");
    const onChange = () => setPhone(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return phone;
}

export default function MenuBook({ menu, days, initialDay, initialCategory = null, hours, status, formatPrice, whatsappHref, onClose }: Props) {
  const phone = useIsPhone();
  const [opened, setOpened] = useState(false);
  const [settled, setSettled] = useState(false);
  const [day, setDay] = useState<DayKey>(initialDay);
  const [category, setCategory] = useState<string | null>(initialCategory);
  const [selected, setSelected] = useState<Dish | null>(null);
  const [sheetDish, setSheetDish] = useState<Dish | null>(null);
  const [sheetQty, setSheetQty] = useState(1);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<CartLine[]>(readCart);
  const [turning, setTurning] = useState(false);
  const [sent, setSent] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const dayIndex = days.findIndex((item) => item.key === day);
  const dishes = menu[day] ?? [];
  const visibleDishes = useMemo(() => (category ? dishes.filter((dish) => dish.category === category) : dishes), [dishes, category]);
  const dayLabel = days[dayIndex]?.label ?? "";
  const cartCount = cart.reduce((sum, line) => sum + line.qty, 0);

  // Le livre s'ouvre tout seul : la couverture se soulève, puis se pose derrière les pages.
  useEffect(() => {
    document.body.classList.add("book-open");
    const openTimer = window.setTimeout(() => setOpened(true), 430);
    const settleTimer = window.setTimeout(() => setSettled(true), 2250);
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 1700);
    return () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(settleTimer);
      window.clearTimeout(focusTimer);
      document.body.classList.remove("book-open");
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      /* stockage indisponible */
    }
  }, [cart]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (sheetDish) return setSheetDish(null);
        if (cartOpen) return setCartOpen(false);
        return onClose();
      }
      if (sheetDish || cartOpen) return;
      if (event.key === "ArrowRight") turn(1);
      if (event.key === "ArrowLeft") turn(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function turn(step: number) {
    const next = days[(dayIndex + step + days.length) % days.length];
    if (!next || next.key === day) return;
    setTurning(true);
    window.setTimeout(() => {
      setDay(next.key);
      setSelected(null);
      window.setTimeout(() => setTurning(false), 60);
    }, 190);
  }

  function jumpTo(key: DayKey) {
    if (key === day) return;
    setTurning(true);
    window.setTimeout(() => {
      setDay(key);
      setSelected(null);
      window.setTimeout(() => setTurning(false), 60);
    }, 190);
  }

  function openDish(dish: Dish) {
    if (dish.unavailable) return;
    if (phone) {
      setSheetDish(dish);
      setSheetQty(1);
      return;
    }
    setSelected(dish);
  }

  function add(dish: Dish, quantity = 1) {
    setCart((current) => {
      const existing = current.find((line) => line.name === dish.name);
      if (existing) {
        return current.map((line) => (line.name === dish.name ? { ...line, qty: line.qty + quantity } : line));
      }
      return [...current, { name: dish.name, price: dish.price, qty: quantity }];
    });
    setSent(false);
  }

  function changeQuantity(name: string, delta: number) {
    setCart((current) =>
      current
        .map((line) => (line.name === name ? { ...line, qty: line.qty + delta } : line))
        .filter((line) => line.qty > 0),
    );
  }

  const orderHref = useMemo(
    () => (cart.length ? whatsappHref(buildOrderMessage(cart, formatPrice)) : ""),
    [cart, formatPrice, whatsappHref],
  );

  const others = selected ? dishes.filter((dish) => dish.name !== selected.name) : [];

  /** Regroupement par catégorie, dans l'ordre d'un vrai menu. */
  const GROUPS: Array<{ category: string; label: string; icon: ReactNode }> = [
    { category: "Grillades", label: "Grillades", icon: <Flame size={12} /> },
    { category: "Plats", label: "Plats", icon: <CookingPot size={12} /> },
    { category: "Fast-food", label: "Fast-food", icon: <Sandwich size={12} /> },
    { category: "Accompagnement", label: "Accompagnements", icon: <Salad size={12} /> },
    { category: "Boissons", label: "Boissons", icon: <CupSoda size={12} /> },
  ];

  const groups = useMemo(() => {
    const map = new Map<string, Dish[]>();
    for (const dish of visibleDishes) {
      const list = map.get(dish.category) ?? [];
      list.push(dish);
      map.set(dish.category, list);
    }
    return [...map.entries()]
      .map(([category, items]) => ({ category, items }))
      .sort((a, b) => {
        const rank = (name: string) => {
          const index = GROUPS.findIndex((group) => group.category === name);
          return index < 0 ? 99 : index;
        };
        return rank(a.category) - rank(b.category) || a.category.localeCompare(b.category);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleDishes]);

  /** Les boissons et accompagnements servis tous les jours, même s'ils ne sont pas listés ce jour-là. */
  const staples = useMemo(() => {
    const seen = new Map<string, Dish>();
    Object.values(menu).flat().forEach((dish) => {
      if (!seen.has(dish.name)) seen.set(dish.name, dish);
    });
    return [...seen.values()].filter(
      (dish) =>
        (dish.category === "Boissons" || dish.category === "Accompagnement") &&
        !dish.unavailable &&
        (!category || dish.category === category) &&
        !dishes.some((item) => item.name === dish.name),
    );
  }, [menu, dishes, category]);

  type Row = { kind: "head"; key: string; label: string; count: number; icon: ReactNode; staples?: boolean } | { kind: "dish"; dish: Dish; single: boolean };

  const rows = useMemo<Row[]>(() => {
    const list: Row[] = [];
    for (const group of groups) {
      const meta = GROUPS.find((item) => item.category === group.category);
      list.push({
        kind: "head",
        key: group.category,
        label: meta?.label ?? group.category,
        count: group.items.length,
        icon: meta?.icon ?? <ChefHat size={12} />,
      });
      for (const dish of group.items) list.push({ kind: "dish", dish, single: group.items.length === 1 });
    }
    if (staples.length) {
      list.push({ kind: "head", key: "staples", label: "Toujours au menu", count: staples.length, icon: <Sparkles size={12} />, staples: true });
      for (const dish of staples) list.push({ kind: "dish", dish, single: false });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, staples]);

  return (
    <div
      className="book-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="La carte du jour"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="book-overlay__glow" aria-hidden="true" />

      <button ref={closeRef} type="button" className="book-close" onClick={onClose} aria-label="Fermer la carte">
        <X size={20} />
      </button>

      <div className={`book ${opened ? "is-open" : ""} ${settled ? "is-settled" : ""}`}>
        <div className="book__shell">
          {/* Page de gauche : la carte du jour */}
          <section className="book__page book__page--left" aria-label={`Plats du ${dayLabel}`}>
            <header className="book__page-head">
              <span className="book__eyebrow">{hours.days}</span>
              <h2>Carte du jour</h2>
              <span className={`book__status ${status.open ? "is-open" : ""}`}>
                <i aria-hidden="true" />
                {status.open ? `Ouvert · ${status.detail}` : "Fermé pour le moment"}
              </span>
            </header>

            <nav className="book__days" aria-label="Choisir un jour">
              {days.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={item.key === day ? "is-active" : ""}
                  aria-pressed={item.key === day}
                  onClick={() => jumpTo(item.key)}
                >
                  <span>{item.shortLabel}</span>
                </button>
              ))}
            </nav>

            {category && (
              <div className="book__filter">
                <span>Filtre · {category}</span>
                <button type="button" onClick={() => setCategory(null)}>Toute la carte <X size={12} /></button>
              </div>
            )}

            <ul className={`book__dishes ${turning ? "is-turning" : ""}`} key={day}>
              {rows.map((row, index) => {
                if (row.kind === "head") {
                  return (
                    <li key={`head-${row.key}`} className={`book__group-head ${row.staples ? "is-staples" : ""}`}>
                      <span className="book__group-icon">{row.icon}</span>
                      <span>{row.label}</span>
                      <em>{row.count}</em>
                      <i aria-hidden="true" />
                    </li>
                  );
                }
                const dish = row.dish;
                const inCart = cart.find((line) => line.name === dish.name);
                return (
                  <li key={dish.name} className={`book-card-item ${row.single ? "is-single" : ""}`} style={{ animationDelay: `${Math.min(index, 14) * 35}ms` }}>
                    <button
                      type="button"
                      className={`book-card ${selected?.name === dish.name ? "is-selected" : ""} ${dish.unavailable ? "is-unavailable" : ""}`}
                      onClick={() => openDish(dish)}
                    >
                      <span className="book-card__media">
                        <img src={imageUrl(dish.image, 520)} srcSet={imageSet(dish.image, [360, 520, 720]) || undefined} sizes="(max-width: 860px) 45vw, 240px" alt={dish.name} loading="lazy" decoding="async" />
                        {inCart && <span className="book-card__badge" aria-label={`${inCart.qty} dans la commande`}>{inCart.qty}</span>}
                        {dish.unavailable && <span className="book-card__off">Indisponible</span>}
                      </span>
                      <span className="book-card__body">
                        <strong>{dish.name}</strong>
                        <span className="book-card__desc">{dish.description}</span>
                        <span className="book-card__foot">
                          <em>{formatPrice(dish.price)}</em>
                          <span className="book-card__add" aria-hidden="true"><Plus size={13} /></span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {visibleDishes.length === 0 && staples.length === 0 && <li className="book__empty">{category ? `Aucun plat « ${category} » aujourd'hui.` : "La carte de ce jour arrive bientôt."}</li>}
            </ul>

            <div className="book__signature" aria-hidden="true">
              <span>Bely Mechoui</span>
              <em>Sebenikoro · Bamako</em>
            </div>

            <footer className="book__page-foot">
              <button type="button" className="book__turn" onClick={() => turn(-1)} aria-label="Jour précédent">
                <ChevronLeft size={16} />
              </button>
              <span>
                <Clock3 size={13} /> {hours.opening}
              </span>
              <button type="button" className="book__turn" onClick={() => turn(1)} aria-label="Jour suivant">
                <ChevronRight size={16} />
              </button>
            </footer>
          </section>

          {/* Page de droite : le plat choisi et la commande (ordinateur) */}
          <section className="book__page book__page--right" aria-label="Ta commande">
            {selected ? (
              <div className="book-plate" key={selected.name}>
                <div className="book-plate__media">
                  <img src={imageUrl(selected.image, 900)} alt={selected.name} loading="lazy" decoding="async" />
                  <span className="book-plate__tag">{selected.category}</span>
                </div>
                <h3>{selected.name}</h3>
                <p>{selected.description}</p>
                <div className="book-plate__row">
                  <strong>{formatPrice(selected.price)}</strong>
                  <button type="button" className="book-plate__add" onClick={() => add(selected)}>
                    <Plus size={16} /> Ajouter
                  </button>
                </div>
                {others.length > 0 && (
                  <div className="book-plate__more">
                    <span>À découvrir aussi</span>
                    <div>
                      {others.slice(0, 3).map((dish) => (
                        <button key={dish.name} type="button" onClick={() => setSelected(dish)}>
                          {dish.name}
                          <em>{formatPrice(dish.price)}</em>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="book-intro">
                <span className="book__eyebrow">Bienvenue</span>
                <h3>Choisis<br /><i>ton plat.</i></h3>
                <p>Touche un plat à gauche : sa photo et son prix s'affichent ici, puis ajoute-le à ta commande.</p>
                <div className="book-intro__marks" aria-hidden="true">
                  <i /><i /><i />
                </div>
              </div>
            )}

            <div className="book-cart">
              <div className="book-cart__head">
                <span><ShoppingBag size={15} /> Ma commande</span>
                <small>{cartCount ? `${cartCount} article${cartCount > 1 ? "s" : ""}` : "vide"}</small>
              </div>

              {cart.length > 0 ? (
                <ul className="book-cart__list">
                  {cart.map((line) => (
                    <li key={line.name}>
                      <span className="book-cart__name">{line.name}</span>
                      <span className="book-cart__qty">
                        <button type="button" onClick={() => changeQuantity(line.name, -1)} aria-label={`Retirer un ${line.name}`}>
                          <Minus size={13} />
                        </button>
                        <em>{line.qty}</em>
                        <button type="button" onClick={() => changeQuantity(line.name, 1)} aria-label={`Ajouter un ${line.name}`}>
                          <Plus size={13} />
                        </button>
                      </span>
                      <span className="book-cart__price">{formatPrice(line.price * line.qty)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="book-cart__empty">Ta commande se remplit au fil de la lecture.</p>
              )}

              <div className="book-cart__total">
                <span>Total</span>
                <strong>{formatPrice(total(cart))}</strong>
              </div>

              <a
                className={`book-cart__order ${cart.length ? "" : "is-disabled"}`}
                href={cart.length ? orderHref : undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!cart.length}
                onClick={(event) => {
                  if (!cart.length) event.preventDefault();
                  else setSent(true);
                }}
              >
                <Check size={16} /> Commander sur WhatsApp
              </a>
            </div>
          </section>

          {/* Couverture : elle se soulève à l'ouverture */}
          <div className="book__cover" aria-hidden={opened} onClick={() => setOpened(true)}>
            <div className="book__cover-face">
              <span className="book__cover-frame" aria-hidden="true" />
              <span className="book__cover-kicker">Bely Mechoui</span>
              <strong className="book__cover-title">La carte<br /><i>du jour</i></strong>
              <span className="book__cover-day">{dayLabel}</span>
              <span className="book__cover-hint">Touche pour ouvrir</span>
            </div>
            <div className="book__cover-back" aria-hidden="true" />
          </div>
        </div>

        <div className="book__edge" aria-hidden="true" />
      </div>

      {/* Mobile : la commande flottante */}
      {phone && (
        <button type="button" className={`book-cart-fab ${cartCount ? "has-items" : ""} ${opened ? "is-ready" : ""}`} onClick={() => setCartOpen(true)}>
          <ShoppingBag size={17} />
          <span>Ma commande</span>
          {cartCount > 0 && <em>{formatPrice(total(cart))}</em>}
          {cartCount > 0 && <i className="book-cart-fab__count">{cartCount}</i>}
        </button>
      )}

      {/* Mobile : la fiche du plat, comme un serveur qui présente l'assiette */}
      {phone && sheetDish && (
        <div className="dish-sheet-backdrop" onClick={() => setSheetDish(null)}>
          <article
            className="dish-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={sheetDish.name}
            onClick={(event) => event.stopPropagation()}
          >
            <span className="dish-sheet__grip" aria-hidden="true" />
            <button type="button" className="dish-sheet__close" onClick={() => setSheetDish(null)} aria-label="Fermer">
              <X size={18} />
            </button>
            <div className="dish-sheet__media">
              <img src={imageUrl(sheetDish.image, 900)} alt={sheetDish.name} decoding="async" />
              <span className="book-plate__tag">{sheetDish.category}</span>
            </div>
            <div className="dish-sheet__body">
              <h3>{sheetDish.name}</h3>
              <p>{sheetDish.description}</p>
              <div className="dish-sheet__actions">
                <span className="dish-sheet__qty">
                  <button type="button" onClick={() => setSheetQty((value) => Math.max(1, value - 1))} aria-label="Moins">
                    <Minus size={15} />
                  </button>
                  <em>{sheetQty}</em>
                  <button type="button" onClick={() => setSheetQty((value) => Math.min(20, value + 1))} aria-label="Plus">
                    <Plus size={15} />
                  </button>
                </span>
                <button
                  type="button"
                  className="dish-sheet__add"
                  onClick={() => {
                    add(sheetDish, sheetQty);
                    setSheetDish(null);
                  }}
                >
                  Ajouter · {formatPrice(sheetDish.price * sheetQty)}
                </button>
              </div>
            </div>
          </article>
        </div>
      )}

      {/* Mobile : le panier */}
      {phone && cartOpen && (
        <div className="cart-sheet-backdrop" onClick={() => setCartOpen(false)}>
          <section
            className="cart-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Ma commande"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="dish-sheet__grip" aria-hidden="true" />
            <header className="cart-sheet__head">
              <div>
                <span className="book__eyebrow">Bely Mechoui</span>
                <h3>Ma commande</h3>
              </div>
              <button type="button" onClick={() => setCartOpen(false)} aria-label="Fermer la commande">
                <X size={18} />
              </button>
            </header>

            {sent ? (
              <div className="cart-sheet__sent">
                <span className="cart-sheet__check"><Check size={26} /></span>
                <strong>Commande transmise</strong>
                <p>WhatsApp est ouvert avec ton récapitulatif : il ne reste qu'à appuyer sur « Envoyer ».</p>
                <button type="button" onClick={() => setCartOpen(false)}>Continuer la lecture</button>
              </div>
            ) : (
              <>
                <ul className="cart-sheet__list">
                  {cart.map((line) => (
                    <li key={line.name}>
                      <span className="cart-sheet__name">{line.name}</span>
                      <span className="cart-sheet__qty">
                        <button type="button" onClick={() => changeQuantity(line.name, -1)} aria-label={`Retirer un ${line.name}`}>
                          <Minus size={14} />
                        </button>
                        <em>{line.qty}</em>
                        <button type="button" onClick={() => changeQuantity(line.name, 1)} aria-label={`Ajouter un ${line.name}`}>
                          <Plus size={14} />
                        </button>
                      </span>
                      <span className="cart-sheet__price">{formatPrice(line.price * line.qty)}</span>
                    </li>
                  ))}
                  {cart.length === 0 && <li className="cart-sheet__empty">Ta commande est vide pour l'instant.</li>}
                </ul>

                <div className="cart-sheet__total">
                  <span>Total</span>
                  <strong>{formatPrice(total(cart))}</strong>
                </div>

                <a
                  className={`cart-sheet__order ${cart.length ? "" : "is-disabled"}`}
                  href={cart.length ? orderHref : undefined}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={!cart.length}
                  onClick={(event) => {
                    if (!cart.length) event.preventDefault();
                    else setSent(true);
                  }}
                >
                  <Check size={17} /> Envoyer la commande
                </a>
                <p className="cart-sheet__note">Le restaurant reçoit le récapitulatif sur WhatsApp et confirme ton plat.</p>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
