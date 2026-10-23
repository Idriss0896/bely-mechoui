// Teste le parcours de commande : ajout, quantité, annulation, validation WhatsApp.
import { writeFileSync } from "node:fs";

const out = process.argv[2] ?? "captures/chat.png";
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

const typeAndSend = async (text) => {
  await evaluate(`(() => {
    const input = document.querySelector(".chat-form input");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, ${JSON.stringify(text)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector(".chat-form").requestSubmit();
    return true;
  })()`);
  await sleep(1000);
};

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
await sleep(600);

await clickText(".chat-chip", "La carte");
await sleep(1000);
await clickText(".chat-chip", "Méchoui");
await sleep(1000);
await typeAndSend("2 brochettes de boeuf");
await typeAndSend("laisse tomber");
const afterCancel = await evaluate(`JSON.stringify({
  messages: [...document.querySelectorAll(".chat-msg p")].map((p) => p.textContent),
  recap: document.querySelector(".chat-recap")?.innerText ?? null
})`);
console.log("apres annulation:", afterCancel);

await clickText(".chat-chip", "Voir la carte");
await sleep(1000);
await clickText(".chat-chip", "Méchoui");
await sleep(1000);
await clickText(".chat-chip", "Voir ma commande");
await sleep(1000);
await clickText(".chat-chip", "Valider");
await sleep(900);

const opened = await evaluate(`window.__opened`);
console.log("whatsapp:", opened?.[0] ?? "aucun");
const decoded = opened?.[0] ? decodeURIComponent(opened[0].split("text=")[1] ?? "") : "";
console.log("message:", JSON.stringify(decoded));

const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log(out);
ws.close();
