// Vérifie le fonctionnement hors ligne et la commande mise en attente.
import { writeFileSync } from "node:fs";

const out = process.argv[2] ?? "captures/offline.png";
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
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url });
await sleep(3500);
console.log("service worker:", await evaluate(`navigator.serviceWorker.controller ? "actif" : "non"`));

// Coupe le réseau puis recharge : l'application doit venir du cache.
await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
await send("Page.reload", { ignoreCache: false });
await sleep(3000);
console.log("hors ligne:", await evaluate(`JSON.stringify({
  rendered: Boolean(document.querySelector(".app-shell")),
  hasMenu: /Méchoui|Menu digital/i.test(document.body.innerText),
  fab: Boolean(document.querySelector(".chat-fab")),
  online: navigator.onLine
})`));

// Commande hors ligne.
await evaluate(`window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; };`);
await evaluate(`document.querySelector(".chat-fab")?.click()`);
await sleep(600);
await clickText(".chat-chip", "La carte");
await sleep(1000);
await clickText(".chat-chip", "Méchoui");
await sleep(1000);
await clickText(".chat-chip", "Voir ma commande");
await sleep(1000);
await clickText(".chat-chip", "Valider");
await sleep(900);

console.log("commande en attente:", await evaluate(`localStorage.getItem("bely-commande-en-attente")`));
console.log("dernier message:", await evaluate(`[...document.querySelectorAll(".chat-msg p")].pop()?.textContent`));

// Retour du réseau : le message de reprise doit apparaître.
await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await evaluate(`window.dispatchEvent(new Event("online"))`);
await sleep(900);
console.log("reprise:", await evaluate(`[...document.querySelectorAll(".chat-msg p")].pop()?.textContent`));

await clickText(".chat-chip", "Envoyer ma commande");
await sleep(900);
const opened = await evaluate(`window.__opened`);
console.log("whatsapp apres retour:", opened?.[0] ? decodeURIComponent(opened[0].split("text=")[1] ?? "") : "aucun");
console.log("pending restant:", await evaluate(`localStorage.getItem("bely-commande-en-attente")`));

const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log(out);
ws.close();
