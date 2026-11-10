import { defineConfig, type Plugin } from 'vite';
import { loadData } from './render/data.ts';
import { renderSlots } from './render/render.ts';

/** Fills the <!--ck:slot--> markers of index.html with build-time HTML and preloads the two first-paint fonts. */
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
        const fonts = ctx.bundle
          ? Object.keys(ctx.bundle).filter((f) => /\/(display|text)-[\w-]+\.woff2$/.test(f) && !f.includes('-ext'))
          : ['src/fonts/display.woff2', 'src/fonts/text.woff2'];
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

export default defineConfig({
  base: '/',
  plugins: [commonkitPage()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    cssCodeSplit: false,
  },
  server: { port: 5180 },
  preview: { port: 4180 },
});
