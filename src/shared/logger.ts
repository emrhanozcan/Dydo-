import { appendLog, getState } from "../storage/storage";
import type { LogEntry } from "./types";

export async function log(
  level: LogEntry["level"],
  code: string,
  message: string,
  orderId?: string,
): Promise<void> {
  await appendLog({ level, code, message, orderId });
  const state = await getState();
  if (state.settings.debugMode) {
    const method = level === "ERROR" ? console.error : level === "WARNING" ? console.warn : console.info;
    method("[PRM Assistant]", code, message, orderId ?? "");
  }
}
