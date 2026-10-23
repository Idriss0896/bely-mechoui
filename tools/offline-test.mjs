// Vérifie que l'application fonctionne hors ligne (service worker).
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
  return result.result?.value;
};

await send("Page.enable");
await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url });
await new Promise((resolve) => setTimeout(resolve, 3500));

console.log("service worker:", await evaluate(`navigator.serviceWorker.controller ? "actif" : "non"`));
console.log("caches:", await evaluate(`caches.keys().then((k) => k.join(", "))`));

await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
await send("Page.reload", { ignoreCache: false });
await new Promise((resolve) => setTimeout(resolve, 3000));

const state = await evaluate(`JSON.stringify({
  rendered: Boolean(document.querySelector(".app-shell")),
  hasMenu: /Méchoui|Menu digital/i.test(document.body.innerText),
  fab: Boolean(document.querySelector(".chat-fab")),
  online: navigator.onLine
})`);
console.log("hors ligne:", state);

await evaluate(`document.querySelector(".chat-fab")?.click()`);
await new Promise((resolve) => setTimeout(resolve, 900));
const chat = await evaluate(`JSON.stringify({
  panel: Boolean(document.querySelector(".chat-panel")),
  status: document.querySelector(".chat-identity small")?.textContent ?? null
})`);
console.log("assistant:", chat);

const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log(out);

await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
ws.close();
