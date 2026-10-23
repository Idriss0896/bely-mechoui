import { useEffect, useRef, useState } from "react";
import { Check, ChefHat, Mic, MessageCircle, Send, Volume2, VolumeX, X } from "lucide-react";
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

  const cartRef = useRef<CartLine[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  cartRef.current = cart;

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
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

  const push = (message: Omit<Message, "id">) => {
    setMessages((current) => [...current, { ...message, id: current.length + 1 }]);
  };

  const reply = (result: ChatAnswer) => {
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      push({ role: "bot", text: result.text, actions: result.actions, recap: result.recap });
    }, 420);
  };

  const context = () => ({
    dishes,
    allDishes,
    status,
    hours,
    cart: cartRef.current,
    formatPrice,
  });

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    push({ role: "user", text });
    setInput("");
    reply(answer(text, context()));
  };

  const addDish = (dish: Dish) => {
    const current = cartRef.current;
    const existing = current.find((line) => line.name === dish.name);
    const next = existing
      ? current.map((line) => (line.name === dish.name ? { ...line, qty: line.qty + 1 } : line))
      : [...current, { name: dish.name, price: dish.price, qty: 1 }];
    setCart(next);
    cartRef.current = next;
    push({ role: "user", text: dish.name });
    reply({
      text: `C'est noté : ${dish.name} (${formatPrice(dish.price)}). Tu veux autre chose ?`,
      actions: [
        { label: "Voir ma commande", kind: "recap" },
        ...dishes.filter((item) => item.name !== dish.name).slice(0, 2).map((item) => ({ label: item.name, kind: "dish" as const, dish: item })),
      ],
    });
  };

  const showRecap = () => {
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
  };

  const confirmOrder = () => {
    const current = cartRef.current;
    if (!current.length) return;
    window.open(whatsappHref(buildOrderMessage(current, formatPrice)), "_blank", "noopener");
    reply({ text: "Je t'ouvre WhatsApp avec le récapitulatif : il ne reste qu'à envoyer le message pour finaliser.", actions: [{ label: "Modifier la commande", kind: "recap" }] });
  };

  const handleAction = (action: ChatAction) => {
    if (action.kind === "dish") return addDish(action.dish);
    if (action.kind === "recap") return showRecap();
    if (action.kind === "confirm") return confirmOrder();
    if (action.kind === "reset") {
      setCart([]);
      cartRef.current = [];
      return reply({ text: "Commande effacée. On repart de zéro." });
    }
    return reply(answer("la carte", context()));
  };

  const startListening = () => {
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
  };

  return (
    <>
      <button className={`chat-fab ${open ? "is-open" : ""}`} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="bely-chat">
        {open ? <X size={19} /> : <MessageCircle size={18} />}
        <span>{open ? "Fermer" : "Commander"}</span>
      </button>

      {open && (
        <section className="chat-panel" id="bely-chat" role="dialog" aria-modal="false" aria-labelledby="chat-title">
          <header className="chat-head">
            <span className="chat-avatar"><ChefHat size={17} /></span>
            <div className="chat-identity">
              <strong id="chat-title">Assistant Bely</strong>
              <small><i className={online ? "is-online" : ""} /> {online ? "En ligne · répond en direct" : "Hors ligne · réponses enregistrées"}</small>
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
                      <button key={action.label} type="button" className={action.kind === "confirm" ? "chat-chip chat-chip--primary" : "chat-chip"} onClick={() => handleAction(action)}>
                        {action.kind === "confirm" && <Check size={13} />}
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
            <button type="button" className={`chat-mic ${listening ? "is-listening" : ""}`} onClick={startListening} aria-label={listening ? "Arrêter l'écoute" : "Parler au assistant"} aria-pressed={listening}>
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
