import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildAssetPdf, loadFonts, parseAssets, PLACEHOLDER_BASE_URL, sheetUrl } from "./qr-sheets.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("qr-sheets", () => {
  it("builds /app URLs per action (D-025)", () => {
    expect(sheetUrl("https://demo.example/", "printer-01.makerlab.commonkit-sxflo.testnet", "reserve")).toBe(
      "https://demo.example/app/a/printer-01.makerlab.commonkit-sxflo.testnet?action=reserve",
    );
    expect(sheetUrl("https://demo.example", "a.testnet", "fault")).toBe("https://demo.example/app/a/a.testnet?action=fault");
    expect(() => sheetUrl("ftp://x", "a.testnet", "return")).toThrow();
  });

  it("validates pilot/assets.json and keeps simulated assets labelled", async () => {
    const assets = parseAssets(JSON.parse(await readFile(path.join(repoRoot, "pilot", "assets.json"), "utf8")));
    for (const id of ["printer-01", "laser-01", "washer-01", "fridge-01"]) {
      expect(assets.find((a) => a.alias === id)?.label).toBe("simulated");
    }
    expect(() => parseAssets({ assets: [{ alias: "BAD ALIAS" }] })).toThrow();
  });

  it("renders a three-page PDF with Turkish glyphs", async () => {
    const bytes = await buildAssetPdf(
      {
        alias: "t",
        assetId: "t.testnet",
        name_en: "Test item",
        name_tr: "Deneme eşyası İĞŞıç",
        label: "stand-in",
        label_note_en: "Stand-in.",
        label_note_tr: "Yedek cihaz.",
      },
      PLACEHOLDER_BASE_URL,
      await loadFonts(),
    );
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3);
  });
});
