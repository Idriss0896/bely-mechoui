// Vérifie le survol du bouton de validation et le champ de recherche.
import { writeFileSync } from "node:fs";

const out = process.argv[2] ?? "captures/ui.png";
const url = process.argv[3] ?? "http://127.0.0.1:4173/";

const targets = await (await fetch("http://127.0.0.1:9223/json/list")).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve);
  ws.addEventListener("error", reject);
});

let nextId = 1;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve } = pending.get(message.id);
    pending.delete(message.id);
    resolve(message.result);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, { resolve });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result?.value;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clickText = (selector, text) =>
  evaluate(`(() => {
    const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find((el) => el.textContent.trim().includes(${JSON.stringify(text)}));
    if (!node) return false;
    node.click();
    return true;
  })()`);

await send("Page.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Network.setBypassServiceWorker", { bypass: true });
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await send("Page.navigate", { url });
await sleep(2600);

// Recherche : saisie puis effacement.
await evaluate(`(() => {
  const input = document.querySelector(".search-box input");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, "mechoui");
  input.dispatchEvent(new Event("input", { bubbles: true }));
})()`);
await sleep(500);
console.log("recherche:", await evaluate(`JSON.stringify({
  count: document.querySelectorAll(".dish-card").length,
  clear: Boolean(document.querySelector(".search-clear")),
  fontSize: getComputedStyle(document.querySelector(".search-box input")).fontSize
})`));
await evaluate(`document.querySelector(".search-clear")?.click()`);
await sleep(300);
console.log("apres effacement:", await evaluate(`document.querySelector(".search-box input").value`));

// Assistant : ajout d'un plat puis survol du bouton de validation.
await evaluate(`document.querySelector(".chat-fab")?.click()`);
await sleep(500);
await clickText(".chat-chip", "La carte");
await sleep(900);
await clickText(".chat-chip", "Méchoui");
await sleep(900);
await clickText(".chat-chip", "Voir ma commande");
await sleep(900);

const rect = await evaluate(`(() => {
  const node = [...document.querySelectorAll(".chat-chip")].find((el) => el.textContent.includes("Valider"));
  if (!node) return null;
  const r = node.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
})()`);
console.log("bouton valider:", JSON.stringify(rect));

if (rect) {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect.x, y: rect.y, button: "none" });
  await sleep(300);
}
console.log("style au survol:", await evaluate(`(() => {
  const node = [...document.querySelectorAll(".chat-chip")].find((el) => el.textContent.includes("Valider"));
  if (!node) return "absent";
  const s = getComputedStyle(node);
  return JSON.stringify({ color: s.color, background: s.backgroundColor, border: s.borderColor });
})()`));

const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log(out);
ws.close();
