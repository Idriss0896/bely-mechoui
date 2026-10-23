// Déroule une commande dans l'assistant et capture le résultat.
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
};

await send("Page.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Network.setBypassServiceWorker", { bypass: true });
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await send("Page.navigate", { url });
await new Promise((resolve) => setTimeout(resolve, 2600));

const clickByText = (selector, text) =>
  evaluate(`(() => {
    const node = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((element) => element.textContent.trim().includes(${JSON.stringify(text)}));
    if (!node) return false;
    node.click();
    return true;
  })()`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await evaluate(`document.querySelector(".chat-fab")?.click()`);
await sleep(700);
console.log("carte:", await clickByText(".chat-chip", "La carte"));
await sleep(1100);
console.log("plat:", await clickByText(".chat-chip", "Méchoui"));
await sleep(1100);
console.log("recap:", await clickByText(".chat-chip", "Voir ma commande"));
await sleep(1200);

const state = await evaluate(`JSON.stringify({
  messages: [...document.querySelectorAll(".chat-msg p")].map((p) => p.textContent),
  recap: document.querySelector(".chat-recap")?.innerText ?? null,
  confirmButton: [...document.querySelectorAll(".chat-chip")].some((b) => b.textContent.includes("Valider")),
  panel: Boolean(document.querySelector(".chat-panel"))
})`);
console.log(state);

const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log(out);
ws.close();
