/**
 * pnpm device:add --adapter smart_plug --vendor <shelly_gen2|shelly_gen1|tasmota> --host <ip[:port]> --asset <assetId>
 *                 [--config config.yaml] [--channel 0] [--user U --password-env VAR]
 *                 [--confirm-stand-in "desk lamp (stand-in for the laser cutter)"] [--yes]
 *
 * 1. Reads the plug (relay, power, energy) to test the connection.
 * 2. Only with --confirm-stand-in: prints a safety notice and, after an interactive "YES" from the
 *    human at the device, toggles OFF -> ON (3 s) -> OFF and checks the relay follows. `--yes` skips
 *    the prompt ONLY for device emulators (response header x-commonkit-emulated); a real plug always
 *    needs the typed confirmation (D-024, CLAUDE.md hard stop: hardware needs a human present).
 * 3. Writes/updates the asset entry in the bridge config (the stand-in label goes into `safety`).
 *    Via the root script, relative --config paths are relative to bridge/.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { parseDocument, YAMLMap } from "yaml";
import { z } from "zod";
import { shellyGen1, shellyGen2, tasmota, type PlugDriver, type PlugReading } from "../adapters/smart_plug/drivers.js";
import { assetConfigSchema } from "../config.js";
import { EMULATED_HEADER } from "../emulators/common.js";
import { accountIdSchema } from "../util/near.js";
import { systemClock, type LocalClock } from "../util/clock.js";

export const deviceAddArgsSchema = z.object({
  adapter: z.literal("smart_plug"),
  vendor: z.enum(["shelly_gen2", "shelly_gen1", "tasmota"]),
  host: z.string().regex(/^[A-Za-z0-9.-]+(:\d{1,5})?$/, "host or host:port, no scheme"),
  asset: accountIdSchema,
  config: z.string().default("config.yaml"),
  channel: z.coerce.number().int().min(0).max(3).default(0),
  user: z.string().optional(),
  passwordEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/).optional(),
  standIn: z.string().min(3).max(120).optional(),
  yes: z.boolean().default(false),
  dangerous: z.boolean().default(false),
});
export type DeviceAddArgs = z.infer<typeof deviceAddArgsSchema>;

export interface DeviceAddIo {
  print(line: string): void;
  /** Asks the human; returns the typed answer. */
  prompt(question: string): Promise<string>;
  env: NodeJS.ProcessEnv;
  clock: LocalClock;
}

export interface DeviceAddResult {
  ok: boolean;
  emulated: boolean;
  reading: PlugReading | null;
  toggle: "skipped_no_stand_in" | "declined" | "ok" | "failed";
  toggleDetail: string | null;
  configPath: string;
  configWritten: boolean;
}

async function isEmulated(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(baseUrl, { signal: AbortSignal.timeout(3_000) });
    return res.headers.get(EMULATED_HEADER) !== null;
  } catch {
    return false;
  }
}

export async function deviceAdd(args: DeviceAddArgs, io: DeviceAddIo): Promise<DeviceAddResult> {
  const baseUrl = `http://${args.host}`;
  const password = args.passwordEnv ? io.env[args.passwordEnv] : undefined;
  if (args.passwordEnv && !password) throw new Error(`environment variable ${args.passwordEnv} is not set`);
  const opts = { baseUrl, channel: args.channel, credentials: args.user && password ? { user: args.user, password } : null };
  const driver: PlugDriver = args.vendor === "shelly_gen2" ? shellyGen2(opts) : args.vendor === "shelly_gen1" ? shellyGen1(opts) : tasmota(opts);
  const configPath = resolve(args.config);
  const result: DeviceAddResult = { ok: false, emulated: false, reading: null, toggle: "skipped_no_stand_in", toggleDetail: null, configPath, configWritten: false };

  // 1. connection test (read only)
  result.emulated = await isEmulated(baseUrl);
  io.print(`Device: ${args.vendor} at ${baseUrl}${result.emulated ? " (EMULATED device: x-commonkit-emulated)" : ""}`);
  try {
    result.reading = await driver.read();
  } catch (err) {
    io.print(`Connection test FAILED: ${(err as Error).message}`);
    return result;
  }
  const r = result.reading;
  io.print(`Connection OK: relay ${r.on ? "ON" : "OFF"}, ${r.watts} W, energy ${r.energyWh.toFixed(3)} Wh${r.temperatureC !== null ? `, ${r.temperatureC} C` : ""}`);

  // 2. toggle test, only with an explicit stand-in and a human confirmation
  if (!args.standIn) {
    io.print("Toggle test skipped: pass --confirm-stand-in \"<what is plugged in>\" to switch it on once.");
  } else {
    io.print("");
    io.print("SAFETY NOTICE");
    io.print(`  The plug will be switched ON for about 3 seconds. Plugged in must be ONLY: ${args.standIn}`);
    io.print("  Never a laser cutter, heater or anything that is unsafe unattended. A person must be at the device.");
    let confirmed: boolean;
    if (args.yes && result.emulated) {
      io.print("  --yes accepted because the device is an emulator.");
      confirmed = true;
    } else {
      if (args.yes) io.print("  --yes is ignored for a real device: type the confirmation yourself.");
      confirmed = (await io.prompt('  Type YES if you are at the device and only the stand-in is plugged in: ')).trim() === "YES";
    }
    if (!confirmed) {
      result.toggle = "declined";
      io.print("Toggle test declined: the plug was not switched.");
    } else {
      try {
        await driver.set(false);
        await driver.set(true);
        await io.clock.sleep(3_000);
        const on = await driver.read();
        await driver.set(false);
        const off = await driver.read();
        if (!on.on || off.on) throw new Error(`relay did not follow (on-phase ${on.on ? "ON" : "OFF"}, off-phase ${off.on ? "ON" : "OFF"})`);
        result.toggle = "ok";
        result.toggleDetail = `ON drew ${on.watts} W; OFF again`;
        io.print(`Toggle test OK: ${result.toggleDetail}`);
      } catch (err) {
        result.toggle = "failed";
        result.toggleDetail = (err as Error).message;
        await driver.set(false).catch(() => undefined);
        io.print(`Toggle test FAILED: ${result.toggleDetail}. Sent OFF again; check the plug before use.`);
        return result;
      }
    }
  }

  // 3. config entry
  const entry: Record<string, unknown> = {
    asset_id: args.asset,
    adapter: "smart_plug",
    ...(result.emulated ? { emulated_device: true } : {}),
    adapter_config: {
      vendor: args.vendor,
      base_url: baseUrl,
      channel: args.channel,
      ...(args.user ? { user: args.user } : {}),
      ...(args.passwordEnv ? { password_env: args.passwordEnv } : {}),
      session_end: "manual",
      ...(args.vendor === "shelly_gen2" && r.temperatureC !== null ? { report_temperature: true } : {}),
    },
    telemetry_interval_sec: 30,
    session_timeout_min: 60,
    ...(args.standIn || args.dangerous ? { safety: { dangerous: args.dangerous, ...(args.standIn ? { stand_in: args.standIn } : {}) } } : {}),
  };
  const check = assetConfigSchema.safeParse(entry);
  if (!check.success) {
    io.print(`Config entry rejected: ${z.prettifyError(check.error)}`);
    return result;
  }
  let text: string;
  try {
    text = await readFile(configPath, "utf8");
  } catch {
    text = `# Bridge config written by device:add. Fill in bridge_account before running with chain: near.\nnetwork: testnet\nbridge_account: \${BRIDGE_ACCOUNT_ID}\nchain: near\nassets: []\n`;
  }
  const doc = parseDocument(text);
  const assets = doc.get("assets");
  if (!(assets && typeof assets === "object" && "items" in assets)) throw new Error(`${configPath}: assets must be a list`);
  const items = (assets as { items: unknown[] }).items;
  const idx = items.findIndex((it) => it instanceof YAMLMap && it.get("asset_id") === args.asset);
  const node = doc.createNode(entry);
  if (idx >= 0) items[idx] = node;
  else items.push(node);
  (assets as { flow?: boolean }).flow = false; // block style, readable
  await writeFile(configPath, doc.toString(), "utf8");
  result.configWritten = true;
  io.print(`${idx >= 0 ? "Updated" : "Added"} ${args.asset} in ${configPath}${args.standIn ? ` (stand-in: ${args.standIn})` : ""}.`);
  result.ok = true;
  return result;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      adapter: { type: "string" },
      vendor: { type: "string" },
      host: { type: "string" },
      asset: { type: "string" },
      config: { type: "string" },
      channel: { type: "string" },
      user: { type: "string" },
      "password-env": { type: "string" },
      "confirm-stand-in": { type: "string" },
      yes: { type: "boolean" },
      dangerous: { type: "boolean" },
    },
  });
  const parsed = deviceAddArgsSchema.safeParse({
    ...values,
    passwordEnv: values["password-env"],
    standIn: values["confirm-stand-in"],
  });
  if (!parsed.success) {
    console.error(`device:add: ${z.prettifyError(parsed.error)}`);
    process.exit(2);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const res = await deviceAdd(parsed.data, {
      print: (l) => console.log(l),
      prompt: (q) => (process.stdin.isTTY ? rl.question(q) : Promise.resolve("")),
      env: process.env,
      clock: systemClock,
    });
    process.exitCode = res.ok ? 0 : 1;
  } finally {
    rl.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
