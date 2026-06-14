// Headless check of block-A logic: permission config is accepted, and the event
// stream yields incremental assistant text (the basis for chat:stream). Mirrors
// the filtering in src/main.js subscribeEvents().
import { readFileSync } from "node:fs";
import { createOpencode } from "@opencode-ai/sdk";

const cfg = JSON.parse(readFileSync(new URL("./config.json", import.meta.url))).opencode;

const oc = await createOpencode({
  hostname: cfg.hostname,
  port: 4100, // separate port so it won't collide with a running app on 4099
  config: { model: cfg.model, permission: cfg.permission },
});
console.log("server up with permission:", JSON.stringify(cfg.permission));

const unwrap = (r) => (r && r.data !== undefined && ("request" in r || "response" in r) ? r.data : r);
const session = unwrap(await oc.client.session.create({ body: { title: "stream-test" } }));

let currentAssistantMsg = null;
let updates = 0;
let lastText = "";
(async () => {
  const events = await oc.client.event.subscribe();
  for await (const e of events.stream) {
    const p = e.properties || {};
    if (e.type === "message.updated" && p.info?.sessionID === session.id && p.info?.role === "assistant") {
      currentAssistantMsg = p.info.id;
    }
    if (e.type === "message.part.updated" && p.part?.sessionID === session.id && p.part?.messageID === currentAssistantMsg) {
      if (p.part.type === "text" && p.part.text) {
        updates++;
        lastText = p.part.text;
        process.stdout.write(`\r[stream] update #${updates}: ${lastText.slice(0, 50)}`);
      }
    }
  }
})();

const [providerID, ...rest] = cfg.model.split("/");
await oc.client.session.prompt({
  path: { id: session.id },
  body: { model: { providerID, modelID: rest.join("/") }, parts: [{ type: "text", text: "Reply in one short sentence: introduce yourself." }] },
});

console.log(`\n[result] streamed ${updates} incremental text update(s)`);
console.log(`[final] ${lastText}`);
console.log(updates > 1 ? "PASS: streaming works (multiple updates)" : updates === 1 ? "OK: got text (single update)" : "FAIL: no text streamed");
oc.server?.close?.();
process.exit(0);
