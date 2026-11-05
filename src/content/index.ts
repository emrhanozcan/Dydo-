import { planOrder } from "../core/orderEngine";
import { applyConfirmedAssignment } from "../core/learningEngine";
import { matchOrderVehicle } from "../core/vehicleMatcher";
import { normalizeAddress } from "../core/addressNormalizer";
import { addLearnedAddressRules } from "../core/addressRuleExtractor";
import { mergeReportOrders } from "../core/reportEngine";
import { MESSAGE, sendMessage, type ExtensionMessage } from "../shared/messages";
import type { ExtensionState, PrmOrder, Vehicle } from "../shared/types";
import { getState, rememberOrder } from "../storage/storage";
import { updateState } from "../storage/storage";
import { AssignmentQueue, StatusUpdateQueue } from "./assignmentAutomation";
import { tryAutomaticLogin } from "./loginAutomation";
import { OrderObserver } from "./orderObserver";
import { findLiveOrderTable, isCompatibleColumnMap, buildColumnMap, parseOrders } from "./orderParser";
import { OrderOverlay } from "./overlay";
import { detectPage, getDiagnostics, type PageKind } from "./prmDetector";
import { scrapeAllProductPrices } from "../productPrices/productPriceScraper";
import { fetchRemoteAssignmentsFromCloud, initializeCloudSync, isCloudConfigured, syncOrderToCloud, syncOrdersToCloud, syncReportsToCloud } from "../cloud/cloudSync";

let state: ExtensionState;
let observer: OrderObserver | null = null;
let processing: Promise<void> = Promise.resolve();
let activePage: PageKind | null = null;
let observedTable: HTMLElement | null = null;
let pageMonitor: MutationObserver | null = null;
let pageCheckTimer: number | null = null;
let loginRetryTimer: number | null = null;
let activationChain: Promise<void> = Promise.resolve();
let productPriceScrape: Promise<void> | null = null;
const assignmentQueue = new AssignmentQueue();
const statusQueue = new StatusUpdateQueue();
const overlay = new OrderOverlay(assignFromOverlay);
const lastVehicleByOrder = new Map<string, string>();
const recentExtensionAssignments = new Map<string, number>();

void bootstrap();

async function bootstrap(): Promise<void> {
  await initializeCloudSync();
  state = await getState();
  startPageMonitor();
  await activateCurrentPage(true);
}

function startPageMonitor(): void {
  pageMonitor = new MutationObserver(() => schedulePageCheck());
  pageMonitor.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", () => queueActivation(true));
  window.setInterval(() => schedulePageCheck(), 5000);
  window.setInterval(() => void pollRemoteAssignments(), 5000);
  window.setInterval(() => void syncLiveOrdersPeriodically(), 10000);
}

function syncLiveOrdersPeriodically(): void {
  if (!isCloudConfigured()) return;
  const table = findLiveOrderTable();
  if (!table) return;
  const currentOrders = parseOrders(table);
  if (currentOrders.length > 0) {
    void syncOrdersToCloud(currentOrders);
  }
}

async function pollRemoteAssignments(): Promise<void> {
  if (!isCloudConfigured()) return;
  const assignments = await fetchRemoteAssignmentsFromCloud();
  if (assignments.length === 0) return;
  const table = findLiveOrderTable();
  if (!table) return;
  const currentOrders = parseOrders(table);
  for (const item of assignments) {
    const order = currentOrders.find((o) => o.id === item.orderId || o.secondaryId === item.orderId);
    if (!order) continue;

    if (item.vehicleId === "STATUS_UPDATE" || item.vehicleId.startsWith("STATUS_")) {
      const targetStatus = item.vehicleName; // "Yolda" or "Teslim Edildi"
      debug("Remote status update received from mobile", { orderId: order.id, status: targetStatus });
      const res = await statusQueue.enqueue(order, targetStatus);
      if (res.success) {
        void syncOrderToCloud({ ...order, status: targetStatus });
      }
    } else {
      const vehicle = state.vehicles.find((v) => v.id === item.vehicleId || v.shortName === item.vehicleId);
      if (vehicle) {
        debug("Remote assignment received from mobile", { orderId: order.id, vehicle: vehicle.shortName });
        await runAssignment(order, vehicle, "manual_override", true);
      }
    }
  }
}

function schedulePageCheck(): void {
  if (pageCheckTimer !== null) return;
  pageCheckTimer = window.setTimeout(() => {
    pageCheckTimer = null;
    queueActivation();
  }, 400);
}

function queueActivation(force = false): void {
  activationChain = activationChain.then(() => activateCurrentPage(force)).catch((error: unknown) => {
    console.error("[PRM Assistant] Page activation failed", error);
  });
}

async function activateCurrentPage(force = false): Promise<void> {
  state = await getState();
  if (!state.settings.enabled) {
    observer?.stop();
    observer = null;
    observedTable = null;
    activePage = null;
    return;
  }
  const page = detectPage();
  const liveTable = page === "live_orders" ? findLiveOrderTable() : null;
  if (!force && page === activePage && (page !== "live_orders" || (liveTable === observedTable && observedTable?.isConnected))) return;

  if (page !== "live_orders" || liveTable !== observedTable) {
    observer?.stop();
    observer = null;
    observedTable = null;
  }
  activePage = page;
  if (page === "product_prices") {
    await runProductPriceScrape();
    return;
  }
  if (page === "security_challenge") {
    await reportStatus("login_page");
    await chrome.runtime.sendMessage({ type: MESSAGE.PAGE_STATUS, status: { health: "login_page", diagnostics: { securityChallenge: true } } });
    return;
  }
  if (page === "login") {
    await reportStatus("login_page");
    if (state.settings.automaticLogin) {
      const result = await tryAutomaticLogin();
      if (result === "not_filled" || result === "not_found") {
        await chrome.runtime.sendMessage({ type: MESSAGE.PAGE_STATUS, status: { health: "login_page", diagnostics: { automaticLoginFailed: true } } });
      }
      scheduleLoginRetry(result === "clicked" ? 12_000 : result === "cooldown" ? 30_000 : 5_000);
    }
    return;
  }
  const table = liveTable;
  if (!table || !isCompatibleColumnMap(buildColumnMap(table))) {
    if (location.pathname.includes("live-order")) await reportStatus("dom_incompatible");
    return;
  }
  if (loginRetryTimer !== null) {
    window.clearTimeout(loginRetryTimer);
    loginRetryTimer = null;
  }
  await reportStatus("connected");
  const initialOrders = parseOrders(table);
  await captureReportOrders(initialOrders);
  await learnRulesFromExistingAssignments(initialOrders);
  state = await getState();
  await reconcilePendingAssignments(initialOrders);
  initialOrders.forEach((order) => lastVehicleByOrder.set(order.id, order.currentVehicle ?? ""));
  if (initialOrders.length > 0) {
    void syncOrdersToCloud(initialOrders);
  }
  if (Object.keys(state.seenOrders).length === 0) {
    for (const order of initialOrders) await rememberOrder(order.id);
  } else {
    await processOrders(initialOrders);
  }
  observer = new OrderObserver(table, queueProcessing);
  observedTable = table;
  observer.start();
}

function scheduleLoginRetry(delayMs: number): void {
  if (loginRetryTimer !== null) window.clearTimeout(loginRetryTimer);
  loginRetryTimer = window.setTimeout(() => {
    loginRetryTimer = null;
    queueActivation(true);
  }, delayMs);
}

function queueProcessing(orders: PrmOrder[]): Promise<void> {
  processing = processing.then(() => processOrders(orders));
  return processing;
}

async function processOrders(orders: PrmOrder[]): Promise<void> {
  await captureReportOrders(orders);
  state = await getState();
  await processNativeAssignmentChanges(orders);
  if (orders.length > 0) {
    void syncOrdersToCloud(orders);
  }
  for (const order of orders) {
    if (!(await rememberOrder(order.id))) continue;
    state = await getState();
    const plan = planOrder(order, state, true);
    debug("Order detected", { orderId: order.id, address: order.normalizedAddress, decision: plan.decision });
    await sendMessage({ type: MESSAGE.NEW_ORDER, order, decision: plan.decision });
    if (plan.action === "assign" && plan.decision.vehicleId) {
      const vehicle = state.vehicles.find((candidate) => candidate.id === plan.decision.vehicleId);
      if (vehicle) await runAssignment(order, vehicle, "automatic", state.settings.learnAddresses);
    } else {
      overlay.enqueue(order, plan.decision, state.vehicles);
    }
  }
}

async function captureReportOrders(orders: PrmOrder[]): Promise<void> {
  if (orders.length === 0) return;
  await updateState((current) => {
    const visibleOrders = orders.filter((order) => current.dismissedReportOrders[order.id] === undefined);
    current.reportOrders = mergeReportOrders(current.reportOrders, visibleOrders, current.vehicles);
  });
  const updated = await getState();
  void syncReportsToCloud(updated.reportOrders, updated.vehicles);
}

async function assignFromOverlay(
  item: { order: PrmOrder; decision: ReturnType<typeof planOrder>["decision"]; vehicles: Vehicle[] },
  vehicleId: string,
): Promise<void> {
  const vehicle = item.vehicles.find((candidate) => candidate.id === vehicleId && candidate.active);
  if (!vehicle) return;
  const isOverride = item.decision.vehicleId !== vehicleId;
  const canonicalInactiveOverride = item.decision.reason === "inactive" && isOverride;
  await runAssignment(
    item.order,
    vehicle,
    isOverride ? "manual_override" : "safe",
    state.settings.learnAddresses && !canonicalInactiveOverride,
  );
}

async function runAssignment(
  order: PrmOrder,
  vehicle: Vehicle,
  mode: "safe" | "automatic" | "manual_override",
  learn: boolean,
): Promise<void> {
  await updateState((current) => {
    current.pendingAssignments = current.pendingAssignments.filter((pending) => pending.orderId !== order.id);
    current.pendingAssignments.push({ orderId: order.id, vehicleId: vehicle.id, startedAt: Date.now(), order, mode, learn });
  });
  const result = await assignmentQueue.enqueue(order, vehicle);
  if (result.success) {
    recentExtensionAssignments.set(order.id, Date.now());
    void syncOrderToCloud({ ...order, currentVehicle: vehicle.prmName });
  }
  debug(result.success ? "Assignment verified" : "Assignment failed", { orderId: order.id, vehicle: vehicle.id, reason: result.reason });
  await sendMessage({
    type: MESSAGE.ASSIGNMENT_RESULT,
    order,
    vehicleId: vehicle.id,
    success: result.success,
    reason: result.reason,
    mode,
    learn,
  });
}

async function reconcilePendingAssignments(orders: PrmOrder[]): Promise<void> {
  const current = await getState();
  for (const pending of current.pendingAssignments) {
    const order = orders.find((candidate) => candidate.id === pending.orderId);
    const vehicle = current.vehicles.find((candidate) => candidate.id === pending.vehicleId);
    if (!order || !vehicle) continue;
    const assigned = normalizeAddress(order.currentVehicle ?? "");
    const verified = assigned.includes(normalizeAddress(vehicle.shortName)) || assigned.includes(normalizeAddress(vehicle.prmName));
    if (verified || Date.now() - pending.startedAt > 120_000) {
      await sendMessage({
        type: MESSAGE.ASSIGNMENT_RESULT,
        order: pending.order,
        vehicleId: pending.vehicleId,
        success: verified,
        reason: verified ? "verified_after_navigation" : "pending_assignment_not_verified",
        mode: pending.mode,
        learn: pending.learn && verified,
      });
    }
  }
}

async function learnRulesFromExistingAssignments(orders: PrmOrder[]): Promise<void> {
  await updateState((current) => {
    if (!current.settings.learnNativeAssignments) return;
    for (const order of orders) {
      const assignedName = normalizeAddress(order.currentVehicle ?? "");
      if (!assignedName) continue;
      const assignedVehicle = current.vehicles.find((vehicle) =>
        assignedName.includes(normalizeAddress(vehicle.prmName)) || assignedName.includes(normalizeAddress(vehicle.shortName)),
      );
      if (!assignedVehicle) continue;
      const canonical = matchOrderVehicle(order, current.vehicles, current.learnedAddresses);
      if (canonical.reason === "inactive" && canonical.vehicleId !== assignedVehicle.id) continue;
      current.vehicles = addLearnedAddressRules(current.vehicles, assignedVehicle.id, order.rawAddress).vehicles;
    }
  });
}

async function processNativeAssignmentChanges(orders: PrmOrder[]): Promise<void> {
  if (!state.settings.learnNativeAssignments) {
    orders.forEach((order) => lastVehicleByOrder.set(order.id, order.currentVehicle ?? ""));
    return;
  }
  for (const order of orders) {
    const currentVehicleName = order.currentVehicle ?? "";
    const previous = lastVehicleByOrder.get(order.id);
    lastVehicleByOrder.set(order.id, currentVehicleName);
    if (previous === undefined || previous === currentVehicleName || !currentVehicleName) continue;
    if (Date.now() - (recentExtensionAssignments.get(order.id) ?? 0) < 10_000) continue;
    if (state.pendingAssignments.some((pending) => pending.orderId === order.id)) continue;
    await new Promise((resolve) => window.setTimeout(resolve, 750));
    const stableOrder = findLiveOrderTable() ? parseOrders(findLiveOrderTable()!).find((item) => item.id === order.id) : undefined;
    if (!stableOrder || stableOrder.currentVehicle !== currentVehicleName) continue;
    const assignedVehicle = state.vehicles.find((vehicle) => {
      const normalized = normalizeAddress(currentVehicleName);
      return normalized.includes(normalizeAddress(vehicle.shortName)) || normalized.includes(normalizeAddress(vehicle.prmName));
    });
    if (!assignedVehicle) continue;
    const canonical = matchOrderVehicle(order, state.vehicles, state.learnedAddresses);
    const canonicalInactiveOverride = canonical.reason === "inactive" && canonical.vehicleId !== assignedVehicle.id;
    await updateState((current) => {
      current.learnedAddresses = applyConfirmedAssignment(
        current.learnedAddresses,
        order.rawAddress,
        canonical.vehicleId,
        assignedVehicle.id,
        canonicalInactiveOverride,
        "manual_selection",
      );
      if (!canonicalInactiveOverride) {
        current.vehicles = addLearnedAddressRules(current.vehicles, assignedVehicle.id, order.rawAddress).vehicles;
      }
    });
  }
}

function debug(message: string, details?: unknown): void {
  if (state?.settings.debugMode) console.info("[PRM Assistant]", message, details ?? "");
}

async function reportStatus(health: ExtensionState["runtime"]["health"]): Promise<void> {
  await sendMessage({
    type: MESSAGE.PAGE_STATUS,
    status: { health, lastCheckAt: Date.now(), diagnostics: getDiagnostics() },
  });
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === MESSAGE.SCRAPE_PRODUCT_PRICES) {
    void runProductPriceScrape().then(() => sendResponse({ ok: true })).catch((error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  }
  if (message.type === MESSAGE.STATE_CHANGED) {
    void getState().then((next) => { state = next; queueActivation(true); sendResponse({ ok: true }); });
    return true;
  }
  return false;
});

async function runProductPriceScrape(): Promise<void> {
  if (productPriceScrape) return productPriceScrape;
  productPriceScrape = (async () => {
    try {
      const result = await scrapeAllProductPrices();
      const response = await sendMessage({ type: MESSAGE.PRODUCT_PRICES_SCRAPED, ...result });
      if (!response.ok) throw new Error(response.error ?? "Ürün fiyatları kaydedilemedi.");
    } catch (error) {
      await sendMessage({ type: MESSAGE.PRODUCT_PRICE_SYNC_FAILED, error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      productPriceScrape = null;
    }
  })();
  return productPriceScrape;
}

window.addEventListener("pagehide", () => {
  observer?.stop();
  pageMonitor?.disconnect();
  overlay.destroy();
});
