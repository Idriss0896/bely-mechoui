// Capture et mesure via DevTools : viewport réel forcé, rendu figé, page entière.
// usage: node tools/capture.mjs <url> <largeur> <hauteur> <sortie.png> <mobile:0|1> [selecteurACliquer]
import { writeFileSync } from "node:fs";

const [url, widthArg, heightArg, out, mobileArg] = process.argv.slice(2);
const width = Number(widthArg);
const height = Number(heightArg);
const mobile = mobileArg === "1";

const targets = await (await fetch("http://127.0.0.1:9223/json/list")).json();
const page = targets.find((t) => t.type === "page");
if (!page) throw new Error("aucune page ouverte");

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
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
  }
});

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

await send("Page.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Network.setBypassServiceWorker", { bypass: true });
await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });

await send("Page.navigate", { url });
const waitMs = Number(process.argv[8] ?? 2600);
await new Promise((resolve) => setTimeout(resolve, waitMs));

const expression = `(() => {
  const vw = innerWidth;
  const overflowing = [...document.querySelectorAll("body *")]
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.right > vw + 1 && r.width > 40)
    .sort((a, b) => b.r.right - a.r.right)
    .slice(0, 6)
    .map(({ el, r }) => ({ tag: el.tagName.toLowerCase(), cls: String(el.className).split(" ").slice(0, 2).join("."), right: Math.round(r.right) }));
  const badge = document.querySelector(".notification-badge:not(.favorite-badge)");
  return JSON.stringify({ innerWidth: vw, scrollWidth: document.documentElement.scrollWidth, badge: badge ? badge.textContent : null, overflowing });
})()`;

const measured = await send("Runtime.evaluate", { expression, returnByValue: true });
console.log(JSON.stringify(JSON.parse(measured.result.value), null, 2));

const clickSelector = process.argv[7];
if (clickSelector) {
  await send("Runtime.evaluate", { expression: `document.querySelector(${JSON.stringify(clickSelector)})?.click()` });
  await new Promise((resolve) => setTimeout(resolve, 900));
}

const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: !clickSelector });
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log(`${out} — ${width}x${height} @${mobile ? 2 : 1}x`);

ws.close();
