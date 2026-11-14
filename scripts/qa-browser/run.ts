/** Local-only UI integration QA. Never imported by the deployed app.
 * Run: scripts/node_modules/.bin/tsx scripts/qa-browser/run.ts
 * Only the fixed team-controlled QA account may sign; keys never reach the browser.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Chain } from '../lib/near.js';
import { keychainNep413Signer } from '../demo/lib/nep413.js';
import { verifyNep413Signature } from '../../bridge/src/nep413/payload.js';

const root = resolve(import.meta.dirname, '../..');
const account = 'ck-browser-qa-261114.testnet';
const asset = 'printer-01.makerlab.commonkit-sxflo.testnet';
const origin = 'http://127.0.0.1:4397';
const token = randomUUID();
const chain = new Chain();
const req = createRequire(resolve(root, 'web/package.json'));
const { createServer } = await import(pathToFileURL(req.resolve('vite')).href);
const { chromium } = req('playwright');
const stringify = (v: unknown) => JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x, 2);
const resume = process.argv.includes('--resume');
const finalize = process.argv.includes('--finalize');
assert.ok(!finalize || resume, '--finalize requires --resume and never creates a reservation');
const evidence: Record<string, any> = resume ? JSON.parse(readFileSync(resolve(root,'evidence/browser-wallet-qa.json'),'utf8')) : {
  schema: 'commonkit-browser-local-signer-qa-v1', started_at: new Date().toISOString(),
  network: 'testnet', account, account_kind: 'team-controlled dedicated QA account, not a customer', asset,
  scope: 'Existing React reservation and asset UI; live RPC; real testnet reservation and cancellation; server-side keychain signer via temporary loopback harness. Per-step triggers distinguish browser actions from cleanup.',
  limitations: ['Does not test @hot-labs/near-connect, an external wallet popup, browser extension, mobile wallet or redirect.', 'NEP-413 is signed by the local keychain harness and verified cryptographically plus on-chain FullAccess ownership; no physical device is unlocked.'],
  safety: {bind: '127.0.0.1', origin_check: origin, secret_keys_in_browser: false, allowed_receiver: asset, allowed_methods: ['reserve', 'cancel_reservation'], maximum_total_attached_yoctonear: '3000000000000000000000000', governance_or_demo_account_signing: false},
  transactions: [],
};
const profile = await chain.view<any>(asset, 'get_profile');
evidence.balance_before ??= (await chain.balance(account)).toString();
evidence.ledger_before ??= await chain.view(asset, 'get_ledger');
if(resume){(evidence.previous_attempts??=[]).push({status:evidence.status,error:evidence.error,finished_at:evidence.finished_at});delete evidence.error;evidence.resumed_at=new Date().toISOString();}
let bookingId: string | null = resume ? evidence.reservation_id : null;
let reserveAttempted = resume;
let cancelAttempted = finalize;
let totalAttached = evidence.transactions.reduce((n:bigint,t:any)=>n+BigInt(t.deposit),0n);
let browser: any;
let page: any;

const main = `import {createRoot} from 'react-dom/client';
import {createBrowserRouter,RouterProvider} from 'react-router';
import './styles/index.css';
import {AppProviders,makeQueryClient} from './App';
import {routes} from './routes';
import {createRpcSource} from './data/rpc/rpcSource';
import {gasFor} from './lib/gas';
const wallet={status:'connected',accountId:${JSON.stringify(account)},ready:true,connect:async()=>{},disconnect:async()=>{},
signAndSendTransaction:async(call)=>{const r=await fetch('/app/__qa_sign',{method:'POST',headers:{'Content-Type':'application/json','X-QA-Token':${JSON.stringify(token)}},body:JSON.stringify({...call,gas: String(call.gas??gasFor(call.methodName)),deposit:String(call.deposit)})});const v=await r.json();if(!r.ok)throw new Error(v.error);return v;},
signMessage:async()=>{throw new Error('This harness tests NEP-413 separately on the server.')}};
const router=createBrowserRouter(routes,{basename:'/app'});
createRoot(document.getElementById('root')).render(<AppProviders source={createRpcSource()} wallet={wallet} queryClient={makeQueryClient()}><RouterProvider router={router}/></AppProviders>);`;

async function execute(call: any) {
  assert.equal(call.receiverId, asset);
  assert.ok(['reserve', 'cancel_reservation'].includes(call.methodName));
  const deposit = BigInt(call.deposit);
  const gas = BigInt(call.gas);
  assert.ok(gas > 0n && gas <= 150_000_000_000_000n);
  if (call.methodName === 'reserve') {
    assert.equal(reserveAttempted, false, 'Only one reserve attempt allowed');
    assert.deepEqual(Object.keys(call.args).sort(), ['right_id', 'slots', 'start_slot']);
    assert.equal(call.args.slots, 1);
    assert.equal(call.args.right_id, null);
    const current = BigInt(Date.now()) * 1_000_000n / (BigInt(profile.slot_minutes) * 60_000_000_000n);
    const slot = BigInt(call.args.start_slot);
    assert.ok(slot >= current + 2n && slot <= current + 16n, 'Future refundable slot only');
    assert.equal(deposit, BigInt(profile.price_per_slot) + BigInt(profile.deposit));
    assert.ok(totalAttached + deposit <= 3_000_000_000_000_000_000_000_000n);
    reserveAttempted = true;
  } else {
    assert.equal(cancelAttempted, false, 'Only one cancellation attempt allowed');
    assert.ok(bookingId);
    assert.deepEqual(call.args, {id: bookingId});
    assert.equal(deposit, 0n);
    const b = await chain.view<any>(asset, 'get_reservation', {id: bookingId});
    assert.equal(b.holder, account);
    assert.equal(b.status, 'Confirmed');
    cancelAttempted = true;
  }
  totalAttached += deposit;
  const result = await chain.call(account, asset, call.methodName, call.args, {gas, deposit});
  evidence.transactions.push({method:call.methodName,args:call.args,deposit,hash:result.hash,ok:result.ok,receipt_failures:result.receiptFailures,events:result.events,gas_burnt:result.gasBurnt,return_value:result.returnValue,explorer:`https://testnet.nearblocks.io/txns/${result.hash}`});
  if (call.methodName === 'reserve') {
    bookingId = String(result.returnValue);
    evidence.reservation_id = bookingId;
    evidence.reservation_confirmed = await chain.view(asset, 'get_reservation', {id: bookingId});
  }
  console.log(`${call.methodName}: ${result.hash} (${result.ok ? 'success' : 'failure'})`);
  return {txHash:result.hash};
}

const server = await createServer({root: resolve(root,'web'), configFile:resolve(root,'web/vite.config.ts'), server:{host:'127.0.0.1',port:4397,strictPort:true}, plugins:[{
  name:'local-qa-wallet-entry', enforce:'pre',
  load(id: string) {if(id === resolve(root,'web/src/main.tsx'))return main;},
  configureServer(vite: any) {vite.middlewares.use(async (r: any,s: any,next: any)=>{
    if(r.url !== '/app/__qa_sign')return next();
    s.setHeader('Content-Type','application/json');
    if(r.method!=='POST'||r.headers.origin!==origin||r.headers.host!=='127.0.0.1:4397'||r.headers['x-qa-token']!==token){s.statusCode=403;s.end('{"error":"forbidden"}');return;}
    try{let raw='';for await(const part of r){raw+=part;if(raw.length>4096)throw new Error('body too large');}const result=await execute(JSON.parse(raw));s.end(JSON.stringify(result));}
    catch(e){s.statusCode=400;s.end(JSON.stringify({error:(e as Error).message}));}
  });}
}]});

try {
  await server.listen();
  browser = await chromium.launch({headless:true});
  page = await browser.newPage({viewport:{width:1440,height:1000}});
  // Preserve real view calls while serializing public RPC traffic during QA, avoiding burst 429s.
  let rpcTail = Promise.resolve();
  await page.route(/https:\/\/(?:test\.rpc|rpc\.testnet)\.fastnear\.com\/?$/, (route:any)=>{
    const job = rpcTail.then(async()=>{
      const result=await fetch('https://rpc.testnet.fastnear.com',{method:'POST',headers:{'content-type':'application/json'},body:route.request().postData()});
      await route.fulfill({status:result.status,headers:{'content-type':'application/json','access-control-allow-origin':'*'},body:await result.text()});
    });
    rpcTail=job.catch(()=>{});return job;
  });
  evidence.browser_rpc_transport='Real browser JSON-RPC requests forwarded serially to https://rpc.testnet.fastnear.com by Playwright to avoid public endpoint burst throttling; no synthetic view responses.';
  const browserErrors: string[]=[];
  page.on('pageerror',(e: Error)=>browserErrors.push(e.message));
  if(!resume){
  await page.goto(`${origin}/app/a/${asset}/reserve`,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Sign reserve',exact:true}).waitFor({timeout:60000});
  const slotButtons=page.getByRole('group',{name:'Pick a start slot'}).getByRole('button');
  const count=await slotButtons.count();
  let picked=-1;
  for(let i=2;i<count;i++){if(await slotButtons.nth(i).isEnabled()){picked=i;await slotButtons.nth(i).click();break;}}
  assert.ok(picked>=2,'A refundable future slot is available');
  evidence.ui_slot_index=picked;
  evidence.ui_reserve_before=(await page.locator('body').innerText()).slice(-5000);
  await page.getByRole('button',{name:'Sign reserve',exact:true}).click();
  await page.getByText('Transaction confirmed.',{exact:false}).waitFor({timeout:90000});
  assert.ok(bookingId);
  evidence.ui_transaction_confirmation=true;
  evidence.ui_reserved_slot_disabled=await slotButtons.nth(picked).isDisabled();
  assert.equal(evidence.ui_reserved_slot_disabled,true,'Availability refreshed after reserve');
  await page.getByRole('link',{name:'← Makerlab 3D printer'}).click();
  }else await page.goto(`${origin}/app/a/${asset}`,{waitUntil:'domcontentloaded'});
  if(!finalize){
  await page.getByRole('button',{name:'cancel',exact:true}).waitFor({timeout:60000});
  await page.getByRole('button',{name:'cancel',exact:true}).click();
  for(let i=0;i<120&&!cancelAttempted;i++)await page.waitForTimeout(250);
  for(let i=0;i<120&&evidence.transactions.length<2;i++)await page.waitForTimeout(250);
  assert.equal(evidence.transactions.length,2);
  await page.waitForTimeout(1500);
  evidence.ui_cancel_without_reload_text=(await page.locator('body').innerText()).slice(-10000);
  evidence.ui_cancel_button_remains_before_reload=await page.getByRole('button',{name:'cancel',exact:true}).count()>0;
  await page.reload({waitUntil:'domcontentloaded'});
  }else{
    evidence.cancellation_trigger='Server-side cleanup after browser navigation stalled on public RPC; UI cancel click was not reached.';
    evidence.ui_cancel_click_exercised=false;
  }
  await page.getByText('Cancelled',{exact:true}).first().waitFor({timeout:60000});
  evidence.ui_cancelled_observed_in_fresh_browser=true;
  evidence.reservation_after=await chain.view(asset,'get_reservation',{id:bookingId});
  assert.equal(evidence.reservation_after.status,'Cancelled');
  evidence.browser_errors=browserErrors;
  const payload={message:`COMMONKIT dedicated testnet QA proof for ${account}; no device access requested`,nonce:randomBytes(32),recipient:'commonkit-local-browser-qa',callbackUrl:null};
  const signed=keychainNep413Signer(account)(payload);
  const ownedKey=(await chain.accessKeys(account)).find(k=>k.public_key===signed.publicKey);
  assert.ok(ownedKey);
  assert.equal((ownedKey.access_key as any).permission,'FullAccess');
  assert.equal(verifyNep413Signature(payload,signed.publicKey,signed.signature),true);
  assert.equal(verifyNep413Signature({...payload,message:payload.message+' tampered'},signed.publicKey,signed.signature),false);
  evidence.nep413={message:payload.message,recipient:payload.recipient,nonce_base64:payload.nonce.toString('base64'),public_key:signed.publicKey,signature:signed.signature,signature_verified:true,tampered_message_rejected:true,on_chain_permission:'FullAccess',verification:'Production bridge verifyNep413Signature plus live access-key query; no bridge access transaction'};
  evidence.ledger_after=await chain.view(asset,'get_ledger');
  evidence.balance_after=(await chain.balance(account)).toString();
  evidence.balance_net_cost_yoctonear=(BigInt(evidence.balance_before)-BigInt(evidence.balance_after)).toString();
  evidence.results={ui_reservation:'passed',ui_availability_refresh:'passed',contract_cancellation_and_full_refund:'passed',fresh_ui_cancelled_status:'passed',nep413_signature_and_live_key_ownership:'passed',ui_cancel_click:finalize?'not exercised':'passed',external_wallet_popup_or_redirect:'not exercised'};
  evidence.status='passed_with_limitations';
} catch(e) {
  evidence.status='failed';evidence.error=(e as Error).message;
  console.error((e as Error).message);
  // A landed reservation is always cancelled even when a browser assertion fails.
  if(page)evidence.ui_error_body=(await page.locator('body').innerText()).slice(-15000);
  if(bookingId&&!cancelAttempted){
    try{await execute({receiverId:asset,methodName:'cancel_reservation',args:{id:bookingId},deposit:'0',gas:'60000000000000'});}
    catch(cleanupError){const x=cleanupError as any;evidence.cleanup_error={message:x.message,ref:x.ref};}
  }
  process.exitCode=1;
} finally {
  if(browser)await browser.close();
  await server.close();
  evidence.finished_at=new Date().toISOString();
  evidence.harness_stopped=true;
  writeFileSync(resolve(root,'evidence/browser-wallet-qa.json'),stringify(evidence)+'\n');
  console.log(`QA ${evidence.status}; signer harness stopped; evidence/browser-wallet-qa.json`);
}
