/**
 * Expérience tactile maison : quand le doigt glisse sur l'écran, l'élément
 * actionnable sous le doigt s'illumine et se soulève, comme un survol.
 * Le tap reste l'action de confirmation — on ne déclenche jamais un lien
 * par accident pendant un simple défilement.
 */

const SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "[role='button']",
  ".dish-card",
  ".book-card",
  ".visit-action",
].join(",");

const IGNORE = [
  "[aria-disabled='true']",
  ".is-disabled",
  ".is-unavailable",
  ".book__cover",
  "input",
  "select",
  "textarea",
].join(",");

let current: HTMLElement | null = null;
let glow: HTMLDivElement | null = null;
let tracking = false;
let moved = false;
let startX = 0;
let startY = 0;
let lastX = 0;
let lastY = 0;
let frame = 0;
let clearTimer = 0;
let lastBuzz = 0;

function ensureGlow() {
  if (glow?.isConnected) return glow;
  if (typeof document === "undefined") return null;
  glow = document.createElement("div");
  glow.className = "touch-glow";
  glow.setAttribute("aria-hidden", "true");
  document.body.appendChild(glow);
  return glow;
}

function targetAt(x: number, y: number): HTMLElement | null {
  const element = document.elementFromPoint(x, y);
  if (!element) return null;
  const hit = element.closest<HTMLElement>(SELECTOR);
  if (!hit || hit.closest(IGNORE)) return null;
  return hit;
}

function paint(x: number, y: number) {
  const target = targetAt(x, y);
  if (target !== current) {
    current?.classList.remove("is-sweep");
    current = target;
    if (current) {
      current.classList.add("is-sweep");
      const now = Date.now();
      if (now - lastBuzz > 150) {
        lastBuzz = now;
        try {
          navigator.vibrate?.(7);
        } catch {
          /* vibration non supportée */
        }
      }
    }
  }
  if (glow) glow.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

function stop() {
  if (!tracking && !current) return;
  tracking = false;
  if (frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  glow?.classList.remove("is-on");
  window.clearTimeout(clearTimer);
  clearTimer = window.setTimeout(() => {
    current?.classList.remove("is-sweep");
    current = null;
  }, 200);
}

function onDown(event: PointerEvent) {
  if (event.pointerType !== "touch" || !event.isPrimary) return;
  window.clearTimeout(clearTimer);
  tracking = true;
  moved = false;
  startX = lastX = event.clientX;
  startY = lastY = event.clientY;
  ensureGlow();
  glow?.classList.remove("is-on");
}

function onMove(event: PointerEvent) {
  if (!tracking) return;
  lastX = event.clientX;
  lastY = event.clientY;
  if (!moved) {
    if (Math.hypot(lastX - startX, lastY - startY) < 10) return;
    moved = true;
    ensureGlow()?.classList.add("is-on");
  }
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    paint(lastX, lastY);
  });
}

function clearSweep() {
  current?.classList.remove("is-sweep");
  current = null;
  glow?.classList.remove("is-on");
}

let installed = false;

export function installTouchSweep() {
  if (installed || typeof window === "undefined" || typeof document === "undefined") return;
  const coarse =
    window.matchMedia("(hover: none) and (pointer: coarse)").matches ||
    navigator.maxTouchPoints > 0 ||
    "ontouchstart" in window;
  if (!coarse) return;

  installed = true;
  document.documentElement.classList.add("is-touch");

  window.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerup", stop, { passive: true });
  window.addEventListener("pointercancel", stop, { passive: true });
  window.addEventListener("scroll", clearSweep, { passive: true, capture: true });
  window.addEventListener("blur", stop);
}
