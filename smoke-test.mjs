// Headless end-to-end check of the opencode path the GUI uses.
// Verifies: createOpencode boots, session.create, session.prompt, reply parsing.
import { readFileSync } from "node:fs";
import { createOpencode } from "@opencode-ai/sdk";

const cfg = JSON.parse(readFileSync(new URL("./config.json", import.meta.url))).opencode;

function unwrap(r) {
  if (r && typeof r === "object" && "data" in r && ("request" in r || "response" in r || "error" in r)) {
    if (r.error) throw new Error(JSON.stringify(r.error));
    return r.data;
  }
  return r;
}

const oc = await createOpencode({ hostname: cfg.hostname, port: cfg.port, config: { model: cfg.model } });
console.log("server:", oc.server.url, "| model:", cfg.model);

const session = unwrap(await oc.client.session.create({ body: { title: "smoke" } }));
console.log("session:", session.id);

const [providerID, ...rest] = cfg.model.split("/");
const result = unwrap(
  await oc.client.session.prompt({
    path: { id: session.id },
    body: { model: { providerID, modelID: rest.join("/") }, parts: [{ type: "text", text: "Reply with exactly: PONG" }] },
  })
);

const parts = result?.parts || result?.message?.parts || [];
console.log("reply:", parts.filter((p) => p.type === "text").map((p) => p.text).join(" ").trim());
console.log("raw part types:", parts.map((p) => p.type).join(","));

oc.server?.close?.();
process.exit(0);
