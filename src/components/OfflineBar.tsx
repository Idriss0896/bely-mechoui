import { useEffect, useState } from "react";
import { ShoppingBag, WifiOff } from "lucide-react";
import { readPendingOrder, subscribePending, type PendingOrder } from "../offline/pendingOrder";

type Props = {
  onSend: (order: PendingOrder) => void;
};

/** Bandeau discret : hors ligne, et rappel d'une commande gardée en attente. */
export default function OfflineBar({ onSend }: Props) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pending, setPending] = useState<PendingOrder | null>(() => readPendingOrder());

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    const unsubscribe = subscribePending(() => setPending(readPendingOrder()));
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      unsubscribe();
    };
  }, []);

  if (online && !pending) return null;

  return (
    <div className={`offline-bar ${online ? "is-pending" : "is-offline"}`} role="status">
      <span className="offline-bar__icon">{online ? <ShoppingBag size={15} /> : <WifiOff size={15} />}</span>
      <span className="offline-bar__text">
        {online ? "Ta commande attend d'être envoyée" : "Hors ligne · la carte reste disponible"}
      </span>
      {online && pending && (
        <button type="button" onClick={() => onSend(pending)}>
          Envoyer
        </button>
      )}
    </div>
  );
}
