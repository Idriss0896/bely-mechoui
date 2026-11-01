import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

type Props = {
  label: string;
  hint?: string;
  icon?: ReactNode;
  disabled?: boolean;
  tone?: "coral" | "dark" | "green";
  className?: string;
  onConfirm: () => void;
};

/**
 * Bouton à glisser : on pose le doigt sur la pastille et on la fait glisser
 * jusqu'au bout. La piste se remplit de couleur au fur et à mesure.
 */
export default function SlideButton({ label, hint = "Glisse pour confirmer", icon, disabled = false, tone = "coral", className = "", onConfirm }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState(false);
  const startX = useRef(0);
  const [travel, setTravel] = useState(1);

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const thumb = track.querySelector<HTMLElement>(".slide-btn__thumb");
    setTravel(Math.max(1, track.clientWidth - (thumb?.offsetWidth ?? 54) - 10));
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const finish = () => {
    setDone(true);
    setProgress(1);
    if (navigator.vibrate) navigator.vibrate([12, 40, 18]);
    window.setTimeout(() => {
      onConfirm();
      setDone(false);
      setProgress(0);
    }, 260);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || done) return;
    measure();
    startX.current = event.clientX;
    setDragging(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* capture indisponible : le glissement reste fonctionnel */
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || disabled || done) return;
    const delta = Math.max(0, Math.min(travel, event.clientX - startX.current));
    setProgress(delta / travel);
  };

  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    if (progress >= 0.82) return finish();
    setProgress(0);
  };

  return (
    <div
      ref={trackRef}
      className={`slide-btn slide-btn--${tone} ${dragging ? "is-dragging" : ""} ${done ? "is-done" : ""} ${disabled ? "is-disabled" : ""} ${className}`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={`${label} — ${hint}`}
      aria-disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          finish();
        }
      }}
    >
      <span className="slide-btn__fill" style={{ width: `${Math.round(progress * 100)}%` }} aria-hidden="true" />
      <span className="slide-btn__label">
        {icon}
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      <span className="slide-btn__thumb" style={{ transform: `translateX(${progress * travel}px)` }} aria-hidden="true">
        <ChevronRight size={19} />
        <ChevronRight size={19} className="slide-btn__chev" />
      </span>
    </div>
  );
}
