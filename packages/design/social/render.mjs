import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
const root=fileURLToPath(new URL('.',import.meta.url));
const require=createRequire(new URL('../../../landing/package.json',import.meta.url));
const {chromium}=require('playwright');
const browser=await chromium.launch();
for(const [name,width,height,scale] of [['commonkit-avatar',1024,1024,2],['commonkit-x-header',1500,500,2]]){
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:scale});
 await page.goto(pathToFileURL(join(root,`${name}.svg`)).href);
 await page.screenshot({path:join(root,`${name}.png`)});
 await page.close();
}
const avatar=await readFile(join(root,'commonkit-avatar.svg'),'utf8');
const banner=await readFile(join(root,'commonkit-x-header.svg'),'utf8');
const preview=`<!doctype html><meta charset="utf-8"><title>COMMONKIT social preview</title><style>*{box-sizing:border-box}body{margin:0;background:#0b0d11;color:#f4f6fa;font-family:Arial,sans-serif}.page{width:900px;margin:42px auto;border:1px solid #28303d;background:#10141b}.header{height:300px}.header svg{width:100%;height:100%}.profile{padding:0 26px 32px}.avatar{width:164px;height:164px;border:7px solid #10141b;border-radius:50%;overflow:hidden;margin-top:-82px;position:relative}.avatar svg{width:100%;height:100%}h1{font-size:29px;letter-spacing:-1px;margin:14px 0 5px}p{line-height:1.5;margin:3px 0;color:#9aa8bb}.bio{color:#e7edf5;margin-top:17px;font-size:17px}.link{color:#9cc3ff;margin-top:14px}.small{font-size:14px;margin-top:22px}footer{width:900px;margin:22px auto;color:#8a97aa;font-size:13px}</style><main class="page"><div class="header">${banner}</div><section class="profile"><div class="avatar">${avatar}</div><h1>CommonKit</h1><p>@usecommonkit</p><p class="bio">Shared machines. Earned access. Community-owned upkeep.</p><p class="link">commonkit.cayvox.com</p><p class="small">Profile and cover preview · existing COMMONKIT identity</p></section></main><footer>Vector masters · 2048 × 2048 avatar · 3000 × 1000 cover</footer>`;
await writeFile(join(root,'preview.html'),preview);
const page=await browser.newPage({viewport:{width:1100,height:840},deviceScaleFactor:1.5});
await page.goto(pathToFileURL(join(root,'preview.html')).href);
await page.screenshot({path:join(root,'commonkit-profile-preview.png')});
await browser.close();
console.log('Rendered social assets and profile preview');
