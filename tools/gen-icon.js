"use strict";

// Rasterize build/icon.svg into the app-icon assets, using Electron's bundled
// Chromium so we need no native image library (no sharp / ImageMagick).
//
//   npx electron tools/gen-icon.js
//
// Produces: build/icon.png (512, for Linux / electron-builder)
//           build/icon.ico (16..256, for Windows + the BrowserWindow icon)
//
// We draw the SVG onto an exact-size offscreen <canvas> (vector → bitmap) rather
// than screenshotting the window: capturePage clamps to the on-screen content
// area, which under Windows display scaling clips the icon's right/bottom edges.
// Canvas rendering is resolution-independent and renders each size from the
// vector, so small sizes stay crisp.
//
// The .ico embeds PNG-compressed frames (supported on Vista+), so we can write
// it by hand from the per-size PNG buffers — no ICO encoder dependency either.

const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const BUILD = path.join(__dirname, "..", "build");
const SVG_B64 = fs.readFileSync(path.join(BUILD, "icon.svg")).toString("base64");

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const PNG_SIZE = 512;

function buildIco(pngs) {
  // pngs: [{ size, buffer }]. ICONDIR header + one ICONDIRENTRY per image,
  // then the PNG payloads concatenated.
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(count, 4);

  const entries = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  pngs.forEach((p, i) => {
    const e = i * 16;
    entries.writeUInt8(p.size >= 256 ? 0 : p.size, e + 0); // 0 means 256
    entries.writeUInt8(p.size >= 256 ? 0 : p.size, e + 1);
    entries.writeUInt8(0, e + 2); // palette
    entries.writeUInt8(0, e + 3); // reserved
    entries.writeUInt16LE(1, e + 4); // color planes
    entries.writeUInt16LE(32, e + 6); // bits per pixel
    entries.writeUInt32LE(p.buffer.length, e + 8);
    entries.writeUInt32LE(offset, e + 12);
    offset += p.buffer.length;
  });

  return Buffer.concat([header, entries, ...pngs.map((p) => p.buffer)]);
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 256, height: 256, show: false });
  await win.loadURL("data:text/html,<!doctype html><meta charset=utf-8>");

  // Render one size from the SVG vector and return the PNG as base64.
  async function renderPng(size) {
    const b64 = await win.webContents.executeJavaScript(`(async () => {
      const img = new Image();
      img.src = "data:image/svg+xml;base64,${SVG_B64}";
      await img.decode();
      const c = document.createElement("canvas");
      c.width = ${size}; c.height = ${size};
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, ${size}, ${size});
      ctx.drawImage(img, 0, 0, ${size}, ${size});
      return c.toDataURL("image/png").split(",")[1];
    })()`);
    return Buffer.from(b64, "base64");
  }

  fs.writeFileSync(path.join(BUILD, "icon.png"), await renderPng(PNG_SIZE));

  const frames = [];
  for (const size of ICO_SIZES) frames.push({ size, buffer: await renderPng(size) });
  fs.writeFileSync(path.join(BUILD, "icon.ico"), buildIco(frames));

  console.log("wrote build/icon.png (" + PNG_SIZE + ") and build/icon.ico (" + ICO_SIZES.join(",") + ")");
  win.destroy();
  app.quit();
});
