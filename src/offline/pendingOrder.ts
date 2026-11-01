const KEY = "bely-pending-order";
const EVENT = "bely-pending-change";

export type PendingOrder = {
  id: string;
  message: string;
  createdAt: string;
};

function read(): PendingOrder | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingOrder;
    return parsed?.message ? parsed : null;
  } catch {
    return null;
  }
}

function announce() {
  window.dispatchEvent(new Event(EVENT));
}

export function readPendingOrder(): PendingOrder | null {
  return read();
}

export function savePendingOrder(message: string): PendingOrder {
  const order: PendingOrder = {
    id: `${Date.now()}`,
    message,
    createdAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(order));
  } catch {
    /* stockage indisponible */
  }
  announce();
  return order;
}

export function clearPendingOrder() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* stockage indisponible */
  }
  announce();
}

export function subscribePending(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
