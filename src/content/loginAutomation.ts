import { normalizeAddress } from "../core/addressNormalizer";
import { clickElement, findButtonByText, isVisible, visibleText } from "../prm/domUtils";
import { SELECTORS } from "../prm/selectors";

const RETRY_DELAYS = [0, 400, 1200] as const;
const CLICK_COOLDOWN_MS = 10_000;
const CLICK_WINDOW_MS = 2 * 60_000;
const MAX_CLICKS_PER_WINDOW = 3;
let lastClickAt = 0;
let clickTimestamps: number[] = [];

export function findLoginElements(root: ParentNode = document): {
  username: HTMLInputElement | null;
  password: HTMLInputElement | null;
  button: HTMLElement | null;
} {
  // 1. Password input
  let password: HTMLInputElement | null = null;
  for (const selector of SELECTORS.passwordInputs) {
    for (const el of root.querySelectorAll<HTMLInputElement>(selector)) {
      if (isVisible(el)) {
        password = el;
        break;
      }
    }
    if (password) break;
  }

  // 2. Username input
  let username: HTMLInputElement | null = null;

  // 2a. Look by label text "Kullanıcı Adı"
  const labels = root.querySelectorAll<HTMLElement>("label, span, div");
  for (const label of labels) {
    const text = normalizeAddress(visibleText(label));
    if (text.includes("kullanici adi")) {
      const parent = label.closest("mat-form-field, .form-group, [class*='field' i], div");
      const candidate = parent?.querySelector<HTMLInputElement>("input");
      if (candidate && isVisible(candidate) && candidate !== password) {
        username = candidate;
        break;
      }
    }
  }

  // 2b. Look by selectors
  if (!username) {
    for (const selector of SELECTORS.usernameInputs) {
      for (const el of root.querySelectorAll<HTMLInputElement>(selector)) {
        if (isVisible(el) && el !== password) {
          username = el;
          break;
        }
      }
      if (username) break;
    }
  }

  // 2c. Fallback: input directly before password in the form
  if (!username && password) {
    const allInputs = [...root.querySelectorAll<HTMLInputElement>("input:not([type='hidden']):not([type='submit'])")].filter(isVisible);
    const passIdx = allInputs.indexOf(password);
    if (passIdx > 0) {
      username = allInputs[passIdx - 1];
    }
  }

  // 3. Login Button
  let button: HTMLElement | null = findButtonByText(["Giriş", "Giris", "Oturum Aç", "Oturum Ac", "Login"], root);
  if (!button) {
    const submitBtn = root.querySelector<HTMLElement>('button[type="submit"], input[type="submit"], button[class*="login" i]');
    if (submitBtn && isVisible(submitBtn)) {
      button = submitBtn;
    }
  }

  return { username, password, button };
}

export async function tryAutomaticLogin(): Promise<"clicked" | "not_filled" | "cooldown" | "not_found"> {
  const now = Date.now();
  clickTimestamps = clickTimestamps.filter((timestamp) => now - timestamp < CLICK_WINDOW_MS);
  if (clickTimestamps.length >= MAX_CLICKS_PER_WINDOW || now - lastClickAt < CLICK_COOLDOWN_MS) return "cooldown";
  let formFound = false;

  for (const delay of RETRY_DELAYS) {
    if (delay > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, delay));
    }
    const { username, password, button } = findLoginElements();
    if (!username || !password || !button) continue;
    formFound = true;

    if (username.value.trim() && password.value) {
      syncAutofilledField(username);
      syncAutofilledField(password);
      await new Promise((resolve) => window.setTimeout(resolve, 80));

      const { button: activeBtn } = findLoginElements();
      const targetButton = activeBtn ?? button;

      if (!targetButton || !isVisible(targetButton)) continue;
      if (targetButton.hasAttribute("disabled") || targetButton.getAttribute("aria-disabled") === "true") {
        await new Promise((resolve) => window.setTimeout(resolve, 150));
        if (targetButton.hasAttribute("disabled") || targetButton.getAttribute("aria-disabled") === "true") {
          continue;
        }
      }

      clickElement(targetButton);

      lastClickAt = Date.now();
      clickTimestamps.push(lastClickAt);
      return "clicked";
    }
  }
  return formFound ? "not_filled" : "not_found";
}

export function syncAutofilledField(input: HTMLInputElement): void {
  try {
    input.focus?.();
  } catch {
    // ignore
  }
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter && input.value) {
    setter.call(input, input.value);
  }
  input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true }));
  input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true }));
  try {
    input.blur?.();
  } catch {
    // ignore
  }
}
