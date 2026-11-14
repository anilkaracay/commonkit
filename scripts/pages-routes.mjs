// Static hosting without rewrites (GitHub Pages, D-041): gives every known app route its own copy of
// site/app/index.html, so deep links answer 200, and writes site/404.html (the app shell) for any other path.
//   node scripts/pages-routes.mjs [siteDir=site]
// Routes come from deployments/testnet.json (communities, assets) plus the app's fixed pages (web/src/routes.tsx).
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const site = resolve(process.argv[2] ?? 'site');
const shell = join(site, 'app', 'index.html');
const deployment = JSON.parse(readFileSync(resolve('deployments/testnet.json'), 'utf8'));

const routes = ['proof', 'agent', 'me', 'train', 'approvals', 'pilot'];
for (const [slug, community] of Object.entries(deployment.communities)) {
  routes.push(`c/${slug}`);
  for (const asset of community.assets) {
    routes.push(`a/${asset}`, `a/${asset}/reserve`);
    for (let task = 0; task < 4; task++) routes.push(`t/${asset}/${task}`);
  }
}

for (const route of routes) {
  const dir = join(site, 'app', route);
  mkdirSync(dir, { recursive: true });
  copyFileSync(shell, join(dir, 'index.html'));
}
writeFileSync(join(site, '404.html'), readFileSync(shell));
writeFileSync(join(site, '.nojekyll'), '');
console.log(`pages: ${routes.length} app routes + 404.html in ${site}`);
