import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { ArrowUpRight, ChefHat, X } from "lucide-react";

/** Adresse encodée : ouvrir l'application directement sur la carte en livre. */
const targetUrl = () => {
  if (typeof window === "undefined") return "/carte";
  return `${window.location.origin}/carte`;
};

type Matrix = { size: number; path: string };

/**
 * Matrice QR calculée de façon synchrone (aucune image à charger) :
 * le code s'affiche immédiatement, et reste net à toutes les tailles.
 */
function buildMatrix(url: string): Matrix {
  const qr = QRCode.create(url, { errorCorrectionLevel: "Q" });
  const size = qr.modules.size;
  const data = qr.modules.data;
  const chunks: string[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (data[row * size + column]) chunks.push(`M${column} ${row}h1v1h-1z`);
    }
  }
  return { size, path: chunks.join("") };
}

/** Deux QR cohabitent (en-tête + barre fixe) : une seule matrice partagée. */
let cached: { url: string; matrix: Matrix } | null = null;

function getMatrix(url: string) {
  if (!cached || cached.url !== url) cached = { url, matrix: buildMatrix(url) };
  return cached.matrix;
}

function QrSvg({ matrix, className }: { matrix: Matrix; className?: string }) {
  // Zone de silence de 4 modules : c'est ce que réclament les appareils photo.
  const quiet = 4;
  return (
    <svg
      className={className}
      viewBox={`${-quiet} ${-quiet} ${matrix.size + quiet * 2} ${matrix.size + quiet * 2}`}
      shapeRendering="crispEdges"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <rect x={-quiet} y={-quiet} width={matrix.size + quiet * 2} height={matrix.size + quiet * 2} fill="#ffffff" />
      <path d={matrix.path} fill="#211b18" />
    </svg>
  );
}

export default function QrBadge() {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const url = useMemo(targetUrl, []);
  const matrix = useMemo(() => getMatrix(url), [url]);

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
          <QrSvg matrix={matrix} className="qr__img" />
          <span className="qr__logo" aria-hidden="true"><ChefHat size={9} /></span>
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
              <QrSvg matrix={matrix} className="qr-modal__svg" />
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
