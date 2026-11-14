import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('.',import.meta.url));
const require=createRequire(new URL('../../../../landing/package.json',import.meta.url));
const {chromium}=require('playwright');
const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
const browser=await chromium.launch();
for(const p of manifest){
 const page=await browser.newPage({viewport:{width:1600,height:1100},deviceScaleFactor:1.5});
 await page.goto(pathToFileURL(join(root,p.image.replace('.png','.html'))).href);
 await page.screenshot({path:join(root,p.image)});
 await page.close();
}
const gallery=`<!doctype html><meta charset="utf-8"><title>COMMONKIT five-image story</title><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#eaf0f8;color:#0a1526;font-family:Arial}h1{font-size:20px;margin:0 0 20px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}figure{margin:0}img{width:100%;display:block;border:1px solid #c6d1e1}figcaption{font-size:12px;margin:8px 0 2px}</style><h1>COMMONKIT — five-image story</h1><div class="grid">${manifest.map((p,i)=>`<figure><img src="${p.image}"><figcaption>${i+1}/5 · ${p.headline}</figcaption></figure>`).join('')}</div>`;
await writeFile(join(root,'preview.html'),gallery);
const page=await browser.newPage({viewport:{width:1200,height:1600},deviceScaleFactor:1});
await page.goto(pathToFileURL(join(root,'preview.html')).href);
await page.screenshot({path:join(root,'commonkit-thread-preview.png'),fullPage:true});
await browser.close();
console.log('Five 2400×1650 posters and contact sheet rendered');
