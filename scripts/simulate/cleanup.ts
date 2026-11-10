/**
 * Children (sandbox node, bridge, agent) must not outlive simulate.sh, also on Ctrl-C.
 * Async stops run on SIGINT/SIGTERM; a synchronous SIGKILL sweep runs on any exit.
 */
type Stop = { stop: () => Promise<void>; kill: () => void };
const live = new Set<Stop>();

export function track(s: Stop): () => void {
  live.add(s);
  return () => live.delete(s);
}

let installed = false;
export function installSignalCleanup(label: string): void {
  if (installed) return;
  installed = true;
  const onSignal = (sig: NodeJS.Signals): void => {
    console.error(`\n${label} ${sig}: stopping the sandbox node, bridge and agent…`);
    void Promise.allSettled([...live].map((s) => s.stop())).then(() => process.exit(130));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  process.on('exit', () => {
    for (const s of live) s.kill();
  });
}
