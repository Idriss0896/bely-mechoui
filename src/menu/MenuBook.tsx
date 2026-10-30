import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Clock3, Minus, Plus, ShoppingBag, X } from "lucide-react";
import type { Dish, DayKey } from "../data/menu";
import { buildOrderMessage, type CartLine } from "../chat/knowledge";

type MenuState = Record<DayKey, Dish[]>;

type Props = {
  menu: MenuState;
  days: Array<{ key: DayKey; label: string; shortLabel: string }>;
  initialDay: DayKey;
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

export default function MenuBook({ menu, days, initialDay, hours, status, formatPrice, whatsappHref, onClose }: Props) {
  const [opened, setOpened] = useState(false);
  const [day, setDay] = useState<DayKey>(initialDay);
  const [selected, setSelected] = useState<Dish | null>(null);
  const [cart, setCart] = useState<CartLine[]>(readCart);
  const [turning, setTurning] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const dayIndex = days.findIndex((item) => item.key === day);
  const dishes = menu[day] ?? [];
  const dayLabel = days[dayIndex]?.label ?? "";
  const cartCount = cart.reduce((sum, line) => sum + line.qty, 0);

  // Le livre s'ouvre tout seul, comme une couverture qu'on soulève.
  useEffect(() => {
    const timer = window.setTimeout(() => setOpened(true), 220);
    document.body.classList.add("book-open");
    return () => {
      window.clearTimeout(timer);
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
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") goTo(1);
      if (event.key === "ArrowLeft") goTo(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const timer = window.setTimeout(() => closeRef.current?.focus(), 400);
    return () => window.clearTimeout(timer);
  }, []);

  function goTo(step: number) {
    const next = days[(dayIndex + step + days.length) % days.length];
    if (!next || next.key === day) return;
    setTurning(true);
    window.setTimeout(() => {
      setDay(next.key);
      setSelected(null);
      window.setTimeout(() => setTurning(false), 40);
    }, 160);
  }

  function add(dish: Dish, quantity = 1) {
    setCart((current) => {
      const existing = current.find((line) => line.name === dish.name);
      if (existing) {
        return current.map((line) => (line.name === dish.name ? { ...line, qty: line.qty + quantity } : line));
      }
      return [...current, { name: dish.name, price: dish.price, qty: quantity }];
    });
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

      <div className={`book ${opened ? "is-open" : ""} ${selected ? "is-detail" : ""}`}>
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
                  onClick={() => {
                    if (item.key === day) return;
                    setTurning(true);
                    window.setTimeout(() => {
                      setDay(item.key);
                      setSelected(null);
                      window.setTimeout(() => setTurning(false), 40);
                    }, 160);
                  }}
                >
                  <span>{item.shortLabel}</span>
                </button>
              ))}
            </nav>

            <ul className={`book__dishes ${turning ? "is-turning" : ""}`}>
              {dishes.map((dish, index) => {
                const inCart = cart.find((line) => line.name === dish.name);
                return (
                  <li key={dish.name} style={{ animationDelay: `${index * 55}ms` }}>
                    <button
                      type="button"
                      className={`book-dish ${selected?.name === dish.name ? "is-selected" : ""} ${dish.unavailable ? "is-unavailable" : ""}`}
                      onClick={() => setSelected(dish)}
                      aria-pressed={selected?.name === dish.name}
                    >
                      <span className="book-dish__index">{String(index + 1).padStart(2, "0")}</span>
                      <span className="book-dish__copy">
                        <strong>{dish.name}</strong>
                        <small>{dish.category}</small>
                      </span>
                      <span className="book-dish__price">{formatPrice(dish.price)}</span>
                      {inCart && <span className="book-dish__badge" aria-label={`${inCart.qty} dans la commande`}>{inCart.qty}</span>}
                    </button>
                  </li>
                );
              })}
              {dishes.length === 0 && <li className="book__empty">La carte de ce jour arrive bientôt.</li>}
            </ul>

            <footer className="book__page-foot">
              <button type="button" className="book__turn" onClick={() => goTo(-1)} aria-label="Jour précédent">
                <ChevronLeft size={16} />
              </button>
              <span>
                <Clock3 size={13} /> {hours.opening}
              </span>
              <button type="button" className="book__turn" onClick={() => goTo(1)} aria-label="Jour suivant">
                <ChevronRight size={16} />
              </button>
            </footer>
          </section>

          {/* Page de droite : le plat choisi et la commande */}
          <section className="book__page book__page--right" aria-label="Ta commande">
            <button type="button" className="book__back" onClick={() => setSelected(null)} aria-label="Revenir à la carte">
              <ChevronLeft size={16} /> La carte
            </button>
            {selected ? (
              <div className="book-plate" key={selected.name}>
                <div className="book-plate__media">
                  <img src={selected.image} alt={selected.name} loading="lazy" />
                  <span className="book-plate__tag">{selected.category}</span>
                </div>
                <h3>{selected.name}</h3>
                <p>{selected.description}</p>
                <div className="book-plate__row">
                  <strong>{formatPrice(selected.price)}</strong>
                  <button type="button" className="book-plate__add" onClick={() => add(selected)} disabled={selected.unavailable}>
                    <Plus size={16} /> Ajouter
                  </button>
                </div>
                {selected.unavailable && <small className="book-plate__note">Indisponible aujourd'hui.</small>}
                {dishes.filter((dish) => dish.name !== selected.name).length > 0 && (
                  <div className="book-plate__more">
                    <span>À découvrir aussi</span>
                    <div>
                      {dishes
                        .filter((dish) => dish.name !== selected.name)
                        .slice(0, 3)
                        .map((dish) => (
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
    </div>
  );
}
