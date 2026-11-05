import { createId } from "../shared/id";
import type { ExtensionState, LogEntry, OrderHistoryEntry } from "../shared/types";
import { migrateState } from "./migrations";

const STATE_KEY = "prmAssistantState";
let writeChain: Promise<void> = Promise.resolve();

export async function getState(): Promise<ExtensionState> {
  const result = await chrome.storage.local.get(STATE_KEY);
  return migrateState(result[STATE_KEY]);
}

export async function setState(state: ExtensionState): Promise<void> {
  await chrome.storage.local.set({ [STATE_KEY]: state });
}

export function updateState(mutator: (state: ExtensionState) => ExtensionState | void): Promise<void> {
  writeChain = writeChain.then(async () => {
    const state = await getState();
    const result = mutator(state);
    await setState(result ?? state);
  });
  return writeChain;
}

export async function initializeStorage(): Promise<ExtensionState> {
  const state = await getState();
  await setState(state);
  return state;
}

export async function appendHistory(entry: Omit<OrderHistoryEntry, "id" | "createdAt">): Promise<void> {
  await updateState((state) => {
    state.orderHistory.unshift({ ...entry, id: createId("history"), createdAt: Date.now() });
    state.orderHistory = state.orderHistory.slice(0, state.settings.maximumHistory);
  });
}

export async function appendLog(entry: Omit<LogEntry, "id" | "createdAt">): Promise<void> {
  await updateState((state) => {
    state.logs.unshift({ ...entry, id: createId("log"), createdAt: Date.now() });
    state.logs = state.logs.slice(0, 500);
  });
}

export async function rememberOrder(orderId: string, now = Date.now()): Promise<boolean> {
  let isNew = false;
  await updateState((state) => {
    isNew = state.seenOrders[orderId] === undefined;
    state.seenOrders[orderId] = now;
    const cutoff = now - 30 * 24 * 60 * 60 * 1000;
    const recent = Object.entries(state.seenOrders)
      .filter(([, timestamp]) => timestamp >= cutoff)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 1000);
    state.seenOrders = Object.fromEntries(recent);
  });
  return isNew;
}
