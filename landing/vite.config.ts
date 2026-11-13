import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { loadData } from './render/data.ts';
import { renderSlots } from './render/render.ts';

/** Fills the <!--ck:slot--> markers of index.html with build-time HTML and preloads the headline font. */
function commonkitPage(): Plugin {
  return {
    name: 'commonkit-page',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const slots = renderSlots(loadData());
        let out = html.replace(/<!--ck:([a-z0-9-]+)-->/g, (_, k: string) => {
          if (!(k in slots) && k !== 'preload') throw new Error(`unknown slot ${k}`);
          return slots[k] ?? '';
        });
        // Preload the one font every headline uses (CK Sans, from @commonkit/design).
        const fonts = ctx.bundle ? Object.keys(ctx.bundle).filter((f) => /\/ck-sans-[\w-]+\.woff2$/.test(f) && !/ck-sans-tr/.test(f)) : [];
        // Inline the single stylesheet (about 11 kB gzipped): one fewer render-blocking request.
        if (ctx.bundle) {
          const cssName = Object.keys(ctx.bundle).find((f) => f.endsWith('.css'));
          const asset = cssName ? ctx.bundle[cssName] : undefined;
          if (cssName && asset && asset.type === 'asset') {
            out = out.replace(new RegExp(`<link rel="stylesheet"[^>]*href="/${cssName}"[^>]*>`), `<style>${String(asset.source)}</style>`);
            delete ctx.bundle[cssName];
          }
        }
        const preload = fonts.map((f) => `<link rel="preload" href="/${f}" as="font" type="font/woff2" crossorigin>`).join('');
        out = out.replace('</title>', `</title>${preload}`);
        return out;
      },
    },
  };
}

/**
 * Machine posters live in @commonkit/design/posters (one source for landing and app). They are served
 * and emitted at /posters/m-*.webp, next to the landing's own hero and close-up stills in public/posters.
 */
function designPosters(): Plugin {
  const dir = resolve(import.meta.dirname, '../packages/design/posters');
  const files = () => readdirSync(dir).filter((f) => f.endsWith('.webp'));
  return {
    name: 'commonkit-design-posters',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.match(/^\/posters\/(m-[\w-]+\.webp)(?:\?|$)/)?.[1];
        if (!name || !files().includes(name)) return next();
        res.setHeader('Content-Type', 'image/webp');
        res.end(readFileSync(resolve(dir, name)));
      });
    },
    generateBundle() {
      for (const f of files()) this.emitFile({ type: 'asset', fileName: `posters/${f}`, source: readFileSync(resolve(dir, f)) });
    },
  };
}

export default defineConfig({
  base: '/',
  plugins: [commonkitPage(), designPosters()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    // The three.js chunk (~150 kB gzip) is lazy: it loads after interaction, never before first paint.
    chunkSizeWarningLimit: 700,
  },
  server: { port: 5180 },
  preview: { port: 4180 },
});
