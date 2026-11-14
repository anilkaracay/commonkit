// Cold-context checks against the built site or public Pages deployment; no RPC interception.
// Usage: node web/scripts/measure-pages.mjs <origin> <output.json>
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
const origin = process.argv[2] ?? 'http://localhost:4331';
const paths = ['/app/', '/app/proof/', '/app/a/printer-01.makerlab.commonkit-sxflo.testnet/', '/app/t/printer-01.makerlab.commonkit-sxflo.testnet/0/', '/app/me/?as=ayse.commonkit-sxflo.testnet'];
const browser = await chromium.launch();
const results = [];
try {
  for (const path of paths.filter(p => !process.env.COMMONKIT_MEASURE_PATH || p === process.env.COMMONKIT_MEASURE_PATH)) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [], failedRequests = [], rpcs = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e)));
    page.on('requestfailed', r => failedRequests.push({url:r.url(),error:r.failure()?.errorText}));
    page.on('request', r => { if (r.method() === 'POST' && /rpc/.test(r.url())) rpcs.push(Date.now()); });
    await page.addInitScript(() => {
      window.__measure = {};
      const inspect = () => {
        const m = window.__measure;
        const record = (key, condition) => { if (condition && m[key] === undefined) m[key] = performance.now(); };
        record('proofScaffold', document.querySelectorAll('ol.panel > li').length === 11);
        record('firstSnapshot', document.querySelector('[data-snapshot]'));
        record('firstMachine', document.querySelector('article.ck-card'));
        record('firstBoardData', document.querySelector('article.ck-card:not([aria-busy="true"]) .ck-num'));
        record('firstProofResult', document.querySelector('ol.panel > li[data-status="pass"],ol.panel > li[data-status="fail"],ol.panel > li[data-status="warn"]'));
        record('firstLiveProofResult', document.querySelector('ol.panel > li[data-status="pass"]:not([data-check-id="11"]):not(:nth-child(11))'));
        record('proofComplete', [...document.querySelectorAll('ol.panel > li[data-status="pass"]')].length === 11);
        const statuses = [...document.querySelectorAll('ol.panel > li')].map(n=>n.getAttribute('data-status')).join(',');
        if (statuses) { m.proofProgress ??= []; if (m.proofProgress.at(-1)?.statuses !== statuses) m.proofProgress.push({at:performance.now(),statuses}); }
        const list = document.querySelector('ol.panel');
        if (list) { m.proofHeights ??= []; const h = list.getBoundingClientRect().height; if (!m.proofHeights.includes(h)) m.proofHeights.push(h); }
      };
      new MutationObserver(inspect).observe(document, {childList:true,subtree:true,attributes:true,characterData:true});
    });
    const start = Date.now();
    const response = await page.goto(new URL(path,origin).href, {waitUntil:'domcontentloaded'});
    if (!response?.ok()) throw new Error(`${path}: HTTP ${response?.status()}`);
    try {
    if (path === '/app/') {
      await page.waitForFunction(() => document.querySelectorAll('article.ck-card:not([aria-busy="true"]) .ck-num').length >= 4 && /live from NEAR testnet/.test(document.body.innerText), null, {timeout:60000});
      await page.getByRole('heading', {name:'Latest proposals', exact:true}).waitFor();
      await page.waitForFunction(() => !document.body.innerText.includes('Reading proposals'), null, {timeout:60000});
    } else if (path === '/app/proof/') {
      await page.waitForFunction(() => [...document.querySelectorAll('ol.panel > li[data-status="pass"]')].length === 11, null, {timeout:60000});
    } else if (path.includes('/a/')) {
      await page.getByLabel('Asset cash box').waitFor({timeout:60000});
    } else if (path.includes('/t/')) {
      await page.getByRole('heading', {name:'Rule facts',exact:true}).waitFor({timeout:60000});
    } else {
      await page.waitForFunction(() => document.querySelector('[aria-label^="Usage right"]') && !document.body.innerText.includes('Reading reservations'), null, {timeout:60000});
    }
    } catch (error) {
      console.log(JSON.stringify({path,error:String(error),errors,failedRequests,body:await page.locator('body').innerText()}));
      throw error;
    }
    // Allow the last related RPC response and rendering microtasks to settle.
    await page.waitForLoadState('networkidle', {timeout:20000});
    const data = await page.evaluate(() => ({
      ...window.__measure,
      title:document.querySelector('h1')?.textContent,
      amounts:[...document.querySelectorAll('main .ck-near .ck-num')].map(n=>n.textContent),
      machineCount:document.querySelectorAll('article.ck-card').length,
      proof:[...document.querySelectorAll('ol.panel > li')].map(n=>({status:n.getAttribute('data-status'),text:n.querySelector('summary')?.innerText})),
      snapshotLabel:document.querySelector('[data-snapshot]')?.textContent ?? null,
      text:document.querySelector('main')?.innerText ?? document.body.innerText,
    }));
    const result = {path, elapsedMs:Date.now()-start,rpcRequests:rpcs.length,errors,failedRequests,...data};
    results.push(result);
    console.log(JSON.stringify({...result,text:undefined,proof:result.proof.map(c=>c.status)}));
    if (!process.env.COMMONKIT_MEASURE_OBSERVE && (errors.length || failedRequests.length)) throw new Error(`${path}: browser errors`);
    if (path === '/app/proof/' && (data.proof.length !== 11 || data.proof.some(c=>c.status !== 'pass'))) throw new Error('Proof did not pass 11/11');
    await context.close();
  }
} finally {
  await browser.close();
  if (process.argv[3]) await writeFile(process.argv[3],JSON.stringify({origin,measuredAt:new Date().toISOString(),results},null,2)+'\n');
}
