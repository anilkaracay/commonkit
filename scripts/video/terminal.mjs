// Terminal recorder + renderer for the demo video.
//
//   node scripts/video/terminal.mjs record <name> -- <command...>
//       Runs the command for real and writes video/build/rec/<name>.cast (asciicast v2: header + [t, "o", text]).
//       For ./scripts/simulate.sh it also copies that run's bridge.log / agent.log next to the cast.
//   node scripts/video/terminal.mjs render <shot-id> [seconds]
//       Renders the shot's terminal pane(s) (terminal.html) as frames and encodes video/build/shots/<id>.mp4.
//
// Replays are time-compressed to the shot length; every pane title says SIMULATED where the run was simulated.
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { H, HERE, ROOT, W, dir, ff, newPage, playwright, rmrf } from './lib.mjs';
import { SHOTS } from './shots.mjs';

const REC = dir('rec');

async function record(name, cmd) {
  const started = Date.now();
  const events = [];
  const child = spawn(cmd[0], cmd.slice(1), { cwd: ROOT, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } });
  const push = (chunk) => {
    const text = chunk.toString();
    events.push([(Date.now() - started) / 1000, 'o', text]);
    process.stdout.write(text);
  };
  child.stdout.on('data', push);
  child.stderr.on('data', push);
  const code = await new Promise((ok) => child.on('close', ok));
  const header = { version: 2, width: 200, height: 50, timestamp: Math.floor(started / 1000), started_ms: started, command: cmd.join(' '), exit: code };
  const file = join(REC, `${name}.cast`);
  writeFileSync(file, [JSON.stringify(header), ...events.map((e) => JSON.stringify(e))].join('\n') + '\n');
  const all = events.map((e) => e[2]).join('');
  const logs = /\[SIMULATED\] logs: (\S+)/.exec(all)?.[1];
  if (logs) {
    for (const [from, to] of [['bridge', 'bridge.log'], ['agent', 'agent.log']]) {
      const sub = from === 'bridge' ? logs : logs.replace('/bridge/state/', '/agent/state/');
      const src = findLog(sub, to);
      if (src) copyFileSync(src, join(REC, `${name}.${to}`));
    }
  }
  console.error(`\n[video] recorded ${file} (exit ${code})`);
  if (code !== 0) process.exit(code ?? 1);
}

function findLog(runDir, file) {
  if (!existsSync(runDir)) return null;
  const direct = join(runDir, file);
  if (existsSync(direct)) return direct;
  for (const sub of ['printer_3d', 'laser_cutter', 'washer']) if (existsSync(join(runDir, sub, file))) return join(runDir, sub, file);
  return null;
}

/** Cast → [{t (s since start), abs (ms epoch), text}] lines, ANSI stripped. */
export function castLines(name) {
  const raw = readFileSync(join(REC, `${name}.cast`), 'utf8').trim().split('\n');
  const header = JSON.parse(raw[0]);
  const lines = [];
  let buf = '';
  for (const l of raw.slice(1)) {
    const [t, , text] = JSON.parse(l);
    buf += text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
    const parts = buf.split('\n');
    buf = parts.pop();
    for (const p of parts) lines.push({ t, abs: header.started_ms + t * 1000, text: p.replace(/\r/g, '') });
  }
  if (buf) lines.push({ t: 0, abs: header.started_ms, text: buf });
  return { header, lines };
}

const short = (s) => s.replace(/\b([1-9A-HJ-NP-Za-km-z]{43,44})\b/g, (h) => `${h.slice(0, 8)}…`);

function jsonl(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

/** Bridge + emulated device + agent console lines from the simulate run's logs (real events, formatted). */
function consoleLines(name) {
  const out = [];
  for (const e of jsonl(join(REC, `${name}.bridge.log`))) {
    const d = e.data ?? {};
    const at = e.time;
    if (e.device === 'moonraker' && e.msg === 'incoming request' && e.req?.method === 'POST' && e.req.url.startsWith('/server/files/upload')) {
      out.push({ abs: at, who: 'moonraker', text: 'POST /server/files/upload (print=true): job uploaded and started' });
      continue;
    }
    switch (e.event) {
      case 'session_started':
        out.push({ abs: at, who: 'bridge', text: `session_started  ${d.account_id} · reservation #${d.reservation_id} · NEP-413 (${d.key_permission}) · mark_session_started tx ${d.tx}` });
        break;
      case 'device_unlocked':
        out.push({ abs: at, who: 'bridge', text: `device_unlocked  reservation #${d.reservation_id}` });
        break;
      case 'access_granted':
        out.push({ abs: at, who: 'bridge', text: `access_granted   ${d.account_id} → 200` });
        break;
      case 'telemetry_reported': {
        const m = d.metrics ?? {};
        out.push({ abs: at, who: 'bridge', text: `telemetry        nozzle_seconds=${m.nozzle_seconds} jobs_total=${m.jobs_total} simulated=${m.simulated} · tx ${d.tx}` });
        break;
      }
      case 'device_locked':
        out.push({ abs: at, who: 'bridge', text: `device_locked    reason ${d.reason}` });
        break;
      case 'session_finished':
        out.push({ abs: at, who: 'bridge', text: `session_finished reason ${d.reason} · mark_session_finished tx ${d.tx}` });
        break;
      case 'verification_started':
        out.push({ abs: at, who: 'bridge', text: `verification     task #${d.task_id} ${d.rule_id}: ${d.test?.type} on the emulated printer` });
        break;
      case 'verification_reported':
        out.push({ abs: at, who: 'bridge', text: `verification     passed=${d.passed} · submit_verification_result tx ${d.tx}` });
        break;
      default:
    }
  }
  for (const e of jsonl(join(REC, `${name}.agent.log`))) {
    if (e.type !== 'task_opened') continue;
    const d = e.data ?? {};
    if (d.rule_id !== 'nozzle_clean') continue;
    out.push({ abs: Date.parse(e.at), who: 'agent', text: `task_opened      ${d.rule_id} (${d.kind}, ${d.trigger}) · "${d.rationale}"` });
  }
  return out.sort((a, b) => a.abs - b.abs).map((l) => ({ ...l, text: short(l.text) }));
}

/** Pane specs per terminal shot. Each line has `at` (seconds into the shot) when it appears. */
function shotPanes(id, secs) {
  if (id === 's04-unlock') {
    const { lines } = castLines('simulate-printer');
    const startIdx = lines.findIndex((l) => /bridge up: adapter moonraker/.test(l.text));
    const endIdx = lines.findIndex((l) => /verifier approves/.test(l.text));
    if (startIdx < 0 || endIdx < 0) throw new Error('simulate-printer.cast: expected lines not found; re-record with --rerecord');
    const top = lines.slice(startIdx, endIdx + 1).map((l) => ({ abs: l.abs, text: short(l.text.replace(/^\[SIMULATED\]\s+/, '')) }));
    const t0 = top[0].abs;
    const t1 = top[top.length - 1].abs;
    const bottom = consoleLines('simulate-printer').filter((l) => l.abs >= t0 - 500 && l.abs <= t1 + 200);
    // Real order and spacing, compressed into the shot (0.4 s lead-in, 1.6 s hold on the last line).
    const span = secs - 2.0;
    const at = (abs) => 0.4 + ((abs - t0) / Math.max(1, t1 - t0)) * span;
    return {
      layout: 'split',
      panes: [
        { title: '$ ./scripts/simulate.sh printer_3d', badge: 'SIMULATED · local NEAR sandbox, real contracts', lines: top.map((l) => ({ at: at(l.abs), text: l.text, tag: 'SIMULATED' })) },
        {
          title: 'bridge console · moonraker adapter → emulated Moonraker',
          badge: 'SIMULATED · emulated printer, no hardware',
          lines: bottom.map((l) => ({ at: Math.max(0.2, at(l.abs)), text: l.text, tag: 'SIMULATED', who: l.who })),
        },
      ],
      note: `replay of a real run recorded ${new Date(t0).toISOString().slice(0, 16).replace('T', ' ')} UTC, time-compressed`,
    };
  }
  if (id === 's08-verify') {
    const { header, lines } = castLines('verify');
    const body = lines.filter((l) => l.text.trim() !== '');
    const span = secs - 2.2;
    return {
      layout: 'single',
      panes: [{ title: '$ ./scripts/verify.sh', badge: 'read-only · keyless · testnet', lines: body.map((l, i) => ({ at: 0.3 + (i / body.length) * span, text: short(l.text) })) }],
      note: `replay of a real run recorded ${new Date(header.started_ms).toISOString().slice(0, 16).replace('T', ' ')} UTC (exit ${header.exit}), time-compressed`,
    };
  }
  if (id === 's01-refusal') {
    // Judge step 4 as recorded in evidence/steps.json (bridge + emulated printer against testnet; no tx by design).
    const step = JSON.parse(readFileSync(join(ROOT, 'evidence/steps.json'), 'utf8')).find((s) => s.step === 4);
    const a = (re) => step.assertions.find((x) => re.test(x.what));
    const access = JSON.parse(a(/can_access/).detail);
    const bridge = JSON.parse(a(/bridge answers/).detail);
    const device = JSON.parse(a(/emulated printer/).detail);
    const chain = JSON.parse(a(/no on-chain change/).detail);
    const lines = [
      { who: 'bridge', text: `POST /access  printer-01 · can.commonkit-sxflo.testnet · NEP-413 signed · reservation #0 (Alex's)` },
      { who: 'bridge', text: `can_access(can, #0) on NEAR testnet → ok=${access.ok}, reason "${access.reason}"` },
      { who: 'bridge', text: `→ ${bridge.status} ${bridge.reason}  (no valid reservation)` },
      { who: 'moonraker', text: `print_state "${device.print_state}" · no job started` },
      { who: 'bridge', text: `on chain: no transaction, no change (Casey's reservations: ${chain.can_reservations})` },
    ];
    return {
      layout: 'single',
      big: true,
      panes: [{
        title: 'bridge console · printer-01 · access request without a booking',
        badge: 'SIMULATED · emulated printer, no hardware',
        lines: lines.map((l, i) => ({ ...l, tag: 'SIMULATED', at: 0.5 + i * ((secs - 3) / (lines.length - 1)) })),
      }],
      note: `judge step 4 as recorded in evidence/steps.json (${step.timestamp.slice(0, 16).replace('T', ' ')} UTC), replayed; the printer is an emulator`,
    };
  }
  throw new Error(`no terminal panes for ${id}`);
}

async function render(id, secs) {
  const spec = shotPanes(id, secs);
  const frames = dir('frames', id);
  const { chromium } = playwright();
  const browser = await chromium.launch();
  const page = await newPage(browser);
  await page.goto(`file://${join(HERE, 'terminal.html')}`);
  await page.evaluate((s) => window.term.load(s), spec);
  await page.evaluate(() => document.fonts.ready);
  // One screenshot per change; the concat list holds each one until the next change.
  const times = [...new Set([0, ...spec.panes.flatMap((p) => p.lines.map((l) => Math.min(secs - 0.05, Math.max(0, l.at))))])].sort((a, b) => a - b);
  const list = [];
  for (let i = 0; i < times.length; i++) {
    await page.evaluate((t) => window.term.at(t), times[i] + 1e-6);
    const png = join(frames, `${String(i).padStart(4, '0')}.png`);
    await page.screenshot({ path: png });
    const next = i + 1 < times.length ? times[i + 1] : secs;
    list.push(`file '${png}'\nduration ${(next - times[i]).toFixed(4)}`);
  }
  list.push(`file '${join(frames, `${String(times.length - 1).padStart(4, '0')}.png`)}'`);
  await browser.close();
  const listFile = join(frames, 'list.txt');
  writeFileSync(listFile, list.join('\n') + '\n');
  const out = join(dir('shots'), `${id}.mp4`);
  ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-vf', `fps=30,scale=${W}:${H},setsar=1`, '-t', String(secs), '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-an', out]);
  rmrf(frames);
  console.log(`[video] ${id}: ${out}`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'record') {
  const sep = rest.indexOf('--');
  await record(rest[0], rest.slice(sep + 1));
} else if (cmd === 'render') {
  await render(rest[0], Number(rest[1]) || SHOTS.find((s) => s.id === rest[0]).dur);
} else {
  console.error('usage: terminal.mjs record <name> -- <cmd...> | render <shot-id> [seconds]');
  process.exit(2);
}
