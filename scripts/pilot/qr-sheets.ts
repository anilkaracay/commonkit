/**
 * Printable QR sheets for pilot assets (docs/PILOT.md, pilot/RUNBOOK.md, D-024).
 *
 * One A4 PDF per asset in pilot/qr/<alias>.pdf with three pages: check out (reserve),
 * return, report a fault. Each QR points to `<base>/app/a/<assetId>?action=reserve|return|fault`
 * (D-025: the app lives under /app). Labels are Turkish + English. Simulated and stand-in
 * assets carry that label in a banner on every page.
 *
 * Usage (from the repo root):
 *   pnpm --filter @commonkit/scripts exec tsx pilot/qr-sheets.ts [--base-url https://host] [--assets ../pilot/assets.json] [--out ../pilot/qr]
 * The base URL can also come from COMMONKIT_APP_BASE_URL. Without one, a placeholder is used
 * and every page is stamped DRAFT; regenerate once the hosted domain exists.
 *
 * Libraries: qrcode (MIT), pdf-lib + @pdf-lib/fontkit (MIT), DejaVu Sans (Bitstream Vera
 * derived license) for Turkish glyphs.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { z } from "zod";

export const PLACEHOLDER_BASE_URL = "https://commonkit-app.example";

export const ACTIONS = ["reserve", "return", "fault"] as const;
export type SheetAction = (typeof ACTIONS)[number];

const assetSchema = z.object({
  alias: z.string().regex(/^[a-z0-9-]{1,32}$/),
  assetId: z.string().regex(/^[a-z0-9._-]{2,64}$/).nullable(),
  name_en: z.string().min(1).max(80),
  name_tr: z.string().min(1).max(80),
  label: z.enum(["simulated", "stand-in", "real"]),
  label_note_en: z.string().max(160),
  label_note_tr: z.string().max(160),
});
export type SheetAsset = z.infer<typeof assetSchema>;
const fileSchema = z.object({ assets: z.array(assetSchema).min(1) });

const ACTION_TEXT: Record<SheetAction, { tr: string; en: string; steps_tr: string; steps_en: string }> = {
  reserve: {
    tr: "Rezerve et",
    en: "Check out (reserve)",
    steps_tr:
      "Telefonunla tara, NEAR testnet cüzdanınla giriş yap, bir zaman dilimi seç ve onayla. Eşya yalnız zincirde onaylanmış bir rezervasyona verilir.",
    steps_en:
      "Scan with your phone, sign in with your NEAR testnet wallet, pick a slot and confirm. The item is handed out only for a reservation confirmed on chain.",
  },
  return: {
    tr: "İade et",
    en: "Return",
    steps_tr:
      "Eşyayı sorumlu üyeye geri getir. Sorumlu üye: tara, eşyayı kontrol et ve iadeyi onayla; depozito zincirde iade edilir.",
    steps_en:
      "Bring the item back to the steward. Steward: scan, check the item and confirm the return; the deposit is refunded on chain.",
  },
  fault: {
    tr: "Arıza bildir",
    en: "Report a fault",
    steps_tr:
      "Son 14 günde kullandıysan bildirebilirsin. Sorunu yaz; zincire yalnız notunun özeti (hash) yazılır.",
    steps_en:
      "You can report if you used it in the last 14 days. Describe the problem; only a hash of your note goes on chain.",
  },
};

const LABEL_BANNER: Record<SheetAsset["label"], { tr: string; en: string } | null> = {
  simulated: { tr: "SİMÜLASYON", en: "SIMULATED" },
  "stand-in": { tr: "YEDEK CİHAZ", en: "STAND-IN" },
  real: null,
};

/** The app URL a sheet's QR code points to. */
export function sheetUrl(baseUrl: string, assetId: string, action: SheetAction): string {
  const base = new URL(baseUrl);
  if (base.protocol !== "https:" && base.protocol !== "http:") throw new Error(`bad base URL: ${baseUrl}`);
  const root = base.href.replace(/\/+$/, "");
  return `${root}/app/a/${encodeURIComponent(assetId)}?action=${action}`;
}

export function parseAssets(json: unknown): SheetAsset[] {
  return fileSchema.parse(json).assets;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.38, 0.38, 0.42);

function centered(page: PDFPage, text: string, font: PDFFont, size: number, y: number, color = INK): void {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (A4[0] - w) / 2, y, size, font, color });
}

function paragraph(page: PDFPage, text: string, font: PDFFont, size: number, y: number, color = INK): number {
  for (const line of wrap(text, font, size, A4[0] - 2 * MARGIN)) {
    page.drawText(line, { x: MARGIN, y, size, font, color });
    y -= size * 1.35;
  }
  return y;
}

async function drawSheet(
  doc: PDFDocument,
  fonts: Fonts,
  asset: SheetAsset & { assetId: string },
  action: SheetAction,
  url: string,
  draft: boolean,
): Promise<void> {
  const page = doc.addPage(A4);
  const text = ACTION_TEXT[action];
  let y = A4[1] - MARGIN;

  const banner = LABEL_BANNER[asset.label];
  if (banner) {
    const h = 34;
    page.drawRectangle({ x: 0, y: y - h + 12, width: A4[0], height: h, color: rgb(0.98, 0.78, 0.25) });
    centered(page, `${banner.en} · ${banner.tr}`, fonts.bold, 18, y - 12);
    y -= h + 8;
  }
  if (draft) {
    centered(page, "DRAFT — placeholder base URL, regenerate before printing · TASLAK", fonts.bold, 11, y, rgb(0.75, 0.1, 0.1));
    y -= 20;
  }

  y -= 24;
  centered(page, text.tr, fonts.bold, 34, y);
  y -= 34;
  centered(page, text.en, fonts.regular, 22, y, MUTED);
  y -= 34;
  centered(page, asset.name_tr, fonts.bold, 16, y);
  y -= 20;
  centered(page, asset.name_en, fonts.regular, 13, y, MUTED);
  y -= 16;

  const qrSize = 280;
  const png = await QRCode.toBuffer(url, { errorCorrectionLevel: "M", margin: 2, width: 800 });
  const image = await doc.embedPng(png);
  y -= qrSize;
  page.drawImage(image, { x: (A4[0] - qrSize) / 2, y, width: qrSize, height: qrSize });
  y -= 18;
  for (const line of wrap(url, fonts.regular, 9, A4[0] - 2 * MARGIN)) {
    centered(page, line, fonts.regular, 9, y, MUTED);
    y -= 12;
  }
  centered(page, `NEAR account: ${asset.assetId}`, fonts.regular, 9, y, MUTED);
  y -= 26;

  y = paragraph(page, text.steps_tr, fonts.regular, 11, y);
  y -= 4;
  y = paragraph(page, text.steps_en, fonts.regular, 11, y, MUTED);
  y -= 8;
  if (asset.label_note_tr) y = paragraph(page, asset.label_note_tr, fonts.bold, 9.5, y);
  if (asset.label_note_en) paragraph(page, asset.label_note_en, fonts.regular, 9.5, y, MUTED);

  centered(page, "Yalnız NEAR testnet — test NEAR'ın değeri yoktur · NEAR testnet only — test NEAR has no value", fonts.regular, 8.5, MARGIN - 14, MUTED);
}

/** Builds one PDF (three pages) for an asset. */
export async function buildAssetPdf(
  asset: SheetAsset & { assetId: string },
  baseUrl: string,
  fontBytes: { regular: Uint8Array; bold: Uint8Array },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`COMMONKIT QR sheets — ${asset.alias}`);
  doc.setCreator("scripts/pilot/qr-sheets.ts");
  doc.setProducer("COMMONKIT");
  // Fixed dates keep the output byte-stable between runs.
  doc.setCreationDate(new Date(0));
  doc.setModificationDate(new Date(0));
  const fonts: Fonts = {
    regular: await doc.embedFont(fontBytes.regular, { subset: true }),
    bold: await doc.embedFont(fontBytes.bold, { subset: true }),
  };
  const draft = new URL(baseUrl).hostname === new URL(PLACEHOLDER_BASE_URL).hostname;
  for (const action of ACTIONS) {
    await drawSheet(doc, fonts, asset, action, sheetUrl(baseUrl, asset.assetId, action), draft);
  }
  return doc.save();
}

export async function loadFonts(): Promise<{ regular: Uint8Array; bold: Uint8Array }> {
  const require = createRequire(import.meta.url);
  const dir = path.join(path.dirname(require.resolve("dejavu-fonts-ttf/package.json")), "ttf");
  return {
    regular: await readFile(path.join(dir, "DejaVuSans.ttf")),
    bold: await readFile(path.join(dir, "DejaVuSans-Bold.ttf")),
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const baseUrl = arg("base-url") ?? process.env.COMMONKIT_APP_BASE_URL ?? PLACEHOLDER_BASE_URL;
  const assetsFile = path.resolve(arg("assets") ?? path.join(repoRoot, "pilot", "assets.json"));
  const outDir = path.resolve(arg("out") ?? path.join(repoRoot, "pilot", "qr"));

  const assets = parseAssets(JSON.parse(await readFile(assetsFile, "utf8")));
  const fonts = await loadFonts();
  await mkdir(outDir, { recursive: true });
  if (baseUrl === PLACEHOLDER_BASE_URL) console.log(`base URL not set: using ${PLACEHOLDER_BASE_URL}, pages stamped DRAFT`);

  for (const asset of assets) {
    if (asset.assetId === null) {
      console.log(`skip ${asset.alias}: no asset account yet`);
      continue;
    }
    const bytes = await buildAssetPdf({ ...asset, assetId: asset.assetId }, baseUrl, fonts);
    const file = path.join(outDir, `${asset.alias}.pdf`);
    await writeFile(file, bytes);
    console.log(`wrote ${path.relative(repoRoot, file)} (${asset.label}, ${ACTIONS.length} pages)`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
