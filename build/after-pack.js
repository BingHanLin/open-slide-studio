"use strict";

// electron-builder strips `node_modules` out of `extraResources`, but the
// self-contained build needs the slide deck's FULL node_modules (Vite, the
// open-slide CLI, the esbuild/rollup native binaries) shipped as a template.
// Copy the whole slides/ dir into resources/slides-template ourselves, after
// the app is packed. First launch copies this into the writable data dir.

const fs = require("fs");
const path = require("path");

exports.default = async function afterPack(context) {
  const src = path.join(context.packager.projectDir, "slides");
  if (!fs.existsSync(src)) {
    throw new Error(
      "slides/ not found — scaffold the deck (npm run init-slides) before building the self-contained installer"
    );
  }
  const dest = path.join(context.appOutDir, "resources", "slides-template");
  await fs.promises.rm(dest, { recursive: true, force: true });
  // Skip Vite's local cache; everything else (incl. node_modules) ships.
  await fs.promises.cp(src, dest, {
    recursive: true,
    filter: (s) => !s.split(path.sep).includes(".vite"),
  });
  console.log(`  • bundled slide template (with node_modules) -> ${path.relative(context.packager.projectDir, dest)}`);
};
