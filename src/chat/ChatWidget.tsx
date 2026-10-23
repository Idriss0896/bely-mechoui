import { useEffect, useRef, useState } from "react";
import { Check, ChefHat, Mic, Send, Volume2, VolumeX, X } from "lucide-react";
import type { Dish } from "../data/menu";
import { answer, buildOrderMessage, type CartLine, type ChatAction, type ChatAnswer } from "./knowledge";

type Props = {
  dishes: Dish[];
  allDishes: Dish[];
  status: { open: boolean; label: string; detail: string };
  hours: { opening: string; days: string };
  formatPrice: (value: number) => string;
  whatsappHref: (message: string) => string;
};

type Message = {
  id: number;
  role: "bot" | "user";
  text: string;
  recap?: CartLine[];
  actions?: ChatAction[];
};

const PENDING_KEY = "bely-commande-en-attente";

const WELCOME: Message = {
  id: 1,
  role: "bot",
  text: "Bonjour et bienvenue chez Bely Mechoui ! Je peux te donner les horaires, la carte, l'adresse, ou prendre ta commande.",
  actions: [
    { label: "La carte", kind: "menu" },
    { label: "Horaires", kind: "menu" },
  ],
};

export default function ChatWidget({ dishes, allDishes, status, hours, formatPrice, whatsappHref }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const [voice, setVoice] = useState(false);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [pending, setPending] = useState(false);
  const [hint, setHint] = useState(false);

  const cartRef = useRef<CartLine[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  cartRef.current = cart;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PENDING_KEY);
      if (stored) {
        setPending(true);
        push({ role: "bot", text: "Tu as une commande enregistrée hors ligne. Veux-tu l'envoyer sur WhatsApp maintenant ?", actions: [{ label: "Envoyer ma commande", kind: "send" }] });
      }
    } catch {
      /* stockage indisponible */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const up = () => {
      setOnline(true);
      try {
        if (window.localStorage.getItem(PENDING_KEY)) {
          setPending(true);
          push({ role: "bot", text: "Le réseau est revenu. Ta commande t'attend : je l'envoie sur WhatsApp ?", actions: [{ label: "Envoyer ma commande", kind: "send" }] });
        }
      } catch {
        /* stockage indisponible */
      }
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let seen = false;
    try {
      seen = window.sessionStorage.getItem("bely-chat-hint") === "1";
    } catch {
      /* stockage indisponible */
    }
    if (seen) return;
    const show = window.setTimeout(() => setHint(true), 3200);
    const hide = window.setTimeout(() => setHint(false), 11500);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 220);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, typing, open]);

  useEffect(() => {
    if (!voice || !open) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "bot") return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(last.text.replace(/[*_#]/g, ""));
    utterance.lang = "fr-FR";
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }, [messages, voice, open]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  function push(message: Omit<Message, "id">) {
    setMessages((current) => [...current, { ...message, id: current.length + 1 }]);
  }

  function reply(result: ChatAnswer) {
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      push({ role: "bot", text: result.text, actions: result.actions, recap: result.recap });
    }, 420);
  }

  function applyCart(next: CartLine[]) {
    setCart(next);
    cartRef.current = next;
  }

  function context() {
    return { dishes, allDishes, status, hours, cart: cartRef.current, formatPrice };
  }

  function send(raw: string) {
    const text = raw.trim();
    if (!text) return;
    push({ role: "user", text });
    setInput("");
    const result = answer(text, context());
    if (result.cart) applyCart(result.cart);
    reply(result);
  }

  function showRecap() {
    const current = cartRef.current;
    if (!current.length) {
      reply({ text: "Ta commande est vide pour l'instant. Choisis un plat, je m'occupe du reste.", actions: dishes.slice(0, 3).map((dish) => ({ label: dish.name, kind: "dish" as const, dish })) });
      return;
    }
    reply({
      text: "Voilà ta commande. Vérifie, puis valide pour continuer sur WhatsApp.",
      recap: current,
      actions: [{ label: "Valider sur WhatsApp", kind: "confirm" }, { label: "Ajouter un plat", kind: "menu" }],
    });
  }

  function confirmOrder() {
    const current = cartRef.current;
    if (!current.length) return;
    if (!navigator.onLine) {
      try {
        window.localStorage.setItem(PENDING_KEY, JSON.stringify(current));
      } catch {
        /* stockage indisponible */
      }
      setPending(true);
      reply({
        text: "Tu es hors ligne : ta commande est enregistrée sur cet appareil. Dès que le réseau revient, je te propose de l'envoyer — rien n'est perdu.",
        actions: [{ label: "Réessayer maintenant", kind: "send" }],
      });
      return;
    }
    window.open(whatsappHref(buildOrderMessage(current, formatPrice)), "_blank", "noopener");
    try {
      window.localStorage.removeItem(PENDING_KEY);
    } catch {
      /* stockage indisponible */
    }
    setPending(false);
    reply({ text: "Je t'ouvre WhatsApp avec le récapitulatif : il ne reste qu'à envoyer le message.", actions: [{ label: "Modifier la commande", kind: "recap" }] });
  }

  function sendPending() {
    let lines: CartLine[] = cartRef.current;
    try {
      const stored = window.localStorage.getItem(PENDING_KEY);
      if (stored) lines = JSON.parse(stored) as CartLine[];
    } catch {
      /* stockage indisponible */
    }
    if (!lines.length) {
      reply({ text: "Je ne retrouve plus la commande enregistrée. Dis-moi ce que tu veux, je la refais.", actions: [{ label: "Voir la carte", kind: "menu" }] });
      return;
    }
    window.open(whatsappHref(buildOrderMessage(lines, formatPrice)), "_blank", "noopener");
    try {
      window.localStorage.removeItem(PENDING_KEY);
    } catch {
      /* stockage indisponible */
    }
    setPending(false);
    reply({ text: "C'est parti : WhatsApp est ouvert avec ta commande. Il ne reste qu'à envoyer le message." });
  }

  function handleAction(action: ChatAction) {
    if (action.kind === "dish") {
      const text = action.dish.name;
      push({ role: "user", text });
      const result = answer(text, context());
      if (result.cart) applyCart(result.cart);
      reply(result);
      return;
    }
    if (action.kind === "recap") return showRecap();
    if (action.kind === "confirm") return confirmOrder();
    if (action.kind === "send") return sendPending();
    if (action.kind === "reset") {
      applyCart([]);
      return reply({ text: "Commande effacée. On repart de zéro." });
    }
    return reply(answer("la carte", context()));
  }

  function toggleChat() {
    setHint(false);
    try {
      window.sessionStorage.setItem("bely-chat-hint", "1");
    } catch {
      /* stockage indisponible */
    }
    setOpen((value) => !value);
  }

  function startListening() {
    const Recognition = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!Recognition) {
      reply({ text: "La saisie vocale n'est pas disponible sur ce navigateur. Tu peux m'écrire, je réponds pareil." });
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "fr-FR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? "";
      if (transcript) send(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
  }

  return (
    <>
      {hint && !open && <span className="chat-hint" role="status">Une question ? Je prends ta commande.</span>}
      <button className={`chat-fab ${open ? "is-open" : ""} ${pending ? "has-pending" : ""}`} type="button" onClick={toggleChat} aria-expanded={open} aria-controls="bely-chat" aria-label={open ? "Fermer l'assistant" : "Ouvrir l'assistant de commande"}>
        {open ? <X size={22} /> : <ChefHat size={26} />}
        {pending && !open && <i className="chat-fab__dot" aria-hidden="true" />}
      </button>

      {open && (
        <section className="chat-panel" id="bely-chat" role="dialog" aria-modal="false" aria-labelledby="chat-title">
          <header className="chat-head">
            <span className="chat-avatar"><ChefHat size={17} /></span>
            <div className="chat-identity">
              <strong id="chat-title">Assistant Bely</strong>
              <small><i className={online ? "is-online" : ""} /> {online ? "En ligne · commande en direct" : "Hors ligne · commande possible"}</small>
            </div>
            <button className="chat-voice" type="button" onClick={() => setVoice((value) => !value)} aria-pressed={voice} aria-label={voice ? "Couper la lecture vocale" : "Activer la lecture vocale"}>
              {voice ? <Volume2 size={17} /> : <VolumeX size={17} />}
            </button>
            <button className="chat-close" type="button" onClick={() => setOpen(false)} aria-label="Fermer la discussion"><X size={17} /></button>
          </header>

          <div className="chat-body" ref={listRef}>
            {messages.map((message) => (
              <div className={`chat-msg chat-msg--${message.role}`} key={message.id}>
                <p>{message.text}</p>
                {message.recap && (
                  <ul className="chat-recap">
                    {message.recap.map((line) => (
                      <li key={line.name}><span>{line.qty} × {line.name}</span><em>{formatPrice(line.price * line.qty)}</em></li>
                    ))}
                    <li className="chat-recap__total"><span>Total</span><em>{formatPrice(message.recap.reduce((sum, line) => sum + line.price * line.qty, 0))}</em></li>
                  </ul>
                )}
                {message.actions && (
                  <div className="chat-actions">
                    {message.actions.map((action) => (
                      <button key={action.label} type="button" className={action.kind === "confirm" || action.kind === "send" ? "chat-chip chat-chip--primary" : "chat-chip"} onClick={() => handleAction(action)}>
                        {(action.kind === "confirm" || action.kind === "send") && <Check size={13} />}
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {typing && <div className="chat-msg chat-msg--bot chat-typing"><i /><i /><i /></div>}
          </div>

          <form className="chat-form" onSubmit={(event) => { event.preventDefault(); send(input); }}>
            <button type="button" className={`chat-mic ${listening ? "is-listening" : ""}`} onClick={startListening} aria-label={listening ? "Arrêter l'écoute" : "Parler à l'assistant"} aria-pressed={listening}>
              <Mic size={17} />
            </button>
            <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} placeholder="Écris ta question ou ta commande…" aria-label="Message" autoComplete="off" />
            <button type="submit" className="chat-send" aria-label="Envoyer"><Send size={17} /></button>
          </form>
        </section>
      )}
    </>
  );
}
