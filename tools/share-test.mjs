// Vérifie le bloc de partage : boutons, URLs et retour visuel.
import { writeFileSync } from "node:fs";

const out = process.argv[2] ?? "captures/share.png";
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

await evaluate(`window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; };`);
await evaluate(`document.querySelector(".chat-fab")?.click()`);
await sleep(700);
console.log("panel:", await evaluate(`JSON.stringify({ panel: Boolean(document.querySelector(".chat-panel")), fab: document.querySelector(".chat-fab")?.className, errors: window.__err ?? null })`));
await clickText(".chat-chip", "La carte");
await sleep(900);
await clickText(".chat-chip", "Méchoui");
await sleep(900);
await clickText(".chat-chip", "Voir ma commande");
await sleep(1000);

console.log("boutons:", await evaluate(`JSON.stringify([...document.querySelectorAll(".chat-msg .share-btn")].map((b) => b.getAttribute("aria-label")))`));

await evaluate(`document.querySelector('.chat-msg .share-btn--wa')?.click()`);
await sleep(400);
await evaluate(`document.querySelector('.chat-msg .share-btn--fb')?.click()`);
await sleep(400);
await evaluate(`document.querySelector('.chat-msg .share-btn--ig')?.click()`);
await sleep(1200);

const opened = await evaluate(`window.__opened`);
const safe = (value) => { try { return decodeURIComponent(value ?? ""); } catch { return value ?? ""; } };
console.log("whatsapp:", safe(opened?.[0]).slice(0, 220));
console.log("facebook:", (opened?.[1] ?? "").slice(0, 200));
console.log("instagram ouvert:", opened?.[2] ?? "aucun");
console.log("toast:", await evaluate(`document.querySelector(".chat-msg .share__toast")?.textContent ?? "aucun"`));

const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log(out);
ws.close();
