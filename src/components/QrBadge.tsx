import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { ArrowUpRight, ChefHat, X } from "lucide-react";

/** Adresse encodée : ouvrir l'application directement sur la carte en livre. */
const targetUrl = () => {
  if (typeof window === "undefined") return "/carte";
  return `${window.location.origin}/carte`;
};

/** Deux QR cohabitent (en-tête + barre fixe) : une seule génération partagée. */
let cachedCode: Promise<string> | null = null;

function qrCode(url: string) {
  cachedCode ??= QRCode.toDataURL(url, {
    margin: 1,
    width: 420,
    errorCorrectionLevel: "H",
    color: { dark: "#211b18", light: "#ffffff" },
  });
  return cachedCode;
}

export default function QrBadge() {
  const [code, setCode] = useState("");
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const url = useMemo(targetUrl, []);

  useEffect(() => {
    let alive = true;
    qrCode(url)
      .then((data) => {
        if (alive) setCode(data);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [url]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const timer = window.setTimeout(() => closeRef.current?.focus(), 120);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="qr"
        onClick={() => setOpen(true)}
        aria-label="Afficher le QR code de la carte"
        title="Scanne pour ouvrir la carte"
      >
        <span className="qr__frame">
          {code ? <img className="qr__img" src={code} alt="" /> : <span className="qr__placeholder" aria-hidden="true" />}
          <span className="qr__logo" aria-hidden="true"><ChefHat size={11} /></span>
        </span>
        <span className="qr__glow" aria-hidden="true" />
      </button>

      {open && createPortal(
        <div className="qr-modal-backdrop" onClick={() => setOpen(false)}>
          <div className="qr-modal" role="dialog" aria-modal="true" aria-labelledby="qr-title" onClick={(event) => event.stopPropagation()}>
            <button ref={closeRef} type="button" className="qr-modal__close" onClick={() => setOpen(false)} aria-label="Fermer">
              <X size={18} />
            </button>

            <span className="qr-modal__eyebrow">Bely Mechoui</span>
            <h2 id="qr-title">Scanne,<br /><i>choisis, commande.</i></h2>
            <p>Pointe l'appareil photo de ton téléphone : la carte du jour s'ouvre en livre, tu choisis ton plat et tu commandes.</p>

            <div className="qr-modal__code">
              {code && <img src={code} alt="QR code vers la carte du restaurant" width={420} height={420} />}
              <span className="qr-modal__logo" aria-hidden="true"><ChefHat size={20} /></span>
            </div>

            <a className="qr-modal__cta" href="/carte">
              Ouvrir la carte <ArrowUpRight size={16} />
            </a>
            <span className="qr-modal__url">{url.replace(/^https?:\/\//, "")}</span>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
