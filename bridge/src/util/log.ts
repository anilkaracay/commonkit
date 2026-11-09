import type { Logger } from "pino";

/** Child logger labelled `simulated`, without repeating the key if an ancestor already set it. */
export function labelled(logger: Logger, simulated: boolean, extra: Record<string, unknown> = {}): Logger {
  const has = Object.prototype.hasOwnProperty.call(logger.bindings(), "simulated");
  return logger.child(has ? extra : { ...extra, simulated });
}

/** Log fields for an event line: the `simulated` field unless the logger already carries it. */
export function simulatedField(logger: Logger, simulated: boolean): Record<string, boolean> {
  return Object.prototype.hasOwnProperty.call(logger.bindings(), "simulated") ? {} : { simulated };
}
