import { normalizeAddress } from "../core/addressNormalizer";
import { REQUIRED_ORDER_COLUMNS } from "../prm/constants";
import { visibleText } from "../prm/domUtils";
import { buildColumnMap, findLiveOrderTable } from "./orderParser";
import { findDeliveryDialog, findDeliveryDropdown, findSaveButton } from "./assignmentAutomation";
import { findLoginElements } from "./loginAutomation";

export type PageKind = "login" | "live_orders" | "product_prices" | "unknown" | "security_challenge";

export function detectPage(): PageKind {
  if (location.pathname.replace(/\/$/, "") === "/main/product-management/product-price-list") return "product_prices";
  const pageText = normalizeAddress(document.body?.innerText ?? "");
  const liveTable = findLiveOrderTable();
  if (!liveTable && ["captcha", "dogrulama kodu", "sms kodu", "tek kullanimlik sifre", "mfa"].some((value) => pageText.includes(value))) {
    return "security_challenge";
  }

  const { username, password, button } = findLoginElements();
  if (username && password && button) return "login";

  const hasLoginText =
    pageText.includes("kullanici adi") &&
    pageText.includes("sifre") &&
    (pageText.includes("giris") || pageText.includes("sifremi unuttum") || pageText.includes("drinco"));
  if (hasLoginText && !liveTable) {
    return "login";
  }

  if (liveTable || looksLikeLiveOrderBreadcrumb()) return "live_orders";
  return "unknown";
}

export function getDiagnostics(): Record<string, boolean> {
  const table = findLiveOrderTable();
  const map = table ? buildColumnMap(table) : {};
  const dialog = findDeliveryDialog(document);
  const combobox = dialog ? findDeliveryDropdown(dialog) : null;
  const saveButton = dialog ? findSaveButton(dialog) : null;
  const { username, password, button: loginBtn } = findLoginElements();
  return {
    loginButton: Boolean(loginBtn),
    liveOrderTable: Boolean(table),
    requiredColumns: REQUIRED_ORDER_COLUMNS.every((column) => map[column] !== undefined),
    deliveryColumn: map.deliveryPerson !== undefined,
    deliveryModal: Boolean(dialog),
    deliveryCombobox: Boolean(combobox),
    saveButton: Boolean(saveButton),
    loginUsernameFound: username instanceof HTMLInputElement,
    loginUsernameFilled: username instanceof HTMLInputElement && Boolean(username.value.trim()),
    loginPasswordFound: password instanceof HTMLInputElement,
    loginPasswordFilled: password instanceof HTMLInputElement && Boolean(password.value),
  };
}

export function looksLikeLiveOrderBreadcrumb(): boolean {
  const text = normalizeAddress(visibleText(document.body));
  return (
    (text.includes(normalizeAddress("Sipariş Yönetimi")) && text.includes(normalizeAddress("Canlı Sipariş"))) ||
    location.pathname.includes("live-order") ||
    location.pathname.includes("canli-siparis")
  );
}
