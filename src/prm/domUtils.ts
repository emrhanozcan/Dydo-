import { normalizeAddress } from "../core/addressNormalizer";

export function queryFirst(selectors: readonly string[], root: ParentNode = document): HTMLElement | null {
  for (const selector of selectors) {
    const element = root.querySelector<HTMLElement>(selector);
    if (element) return element;
  }
  return null;
}

export function visibleText(element: Element | null): string {
  return (element?.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function findByText<T extends HTMLElement>(
  selectors: readonly string[],
  texts: readonly string[],
  root: ParentNode = document,
  exact = true,
): T | null {
  const targets = texts.map(normalizeAddress);
  for (const selector of selectors) {
    for (const element of root.querySelectorAll<T>(selector)) {
      const value = normalizeAddress(
        element instanceof HTMLInputElement ? element.value || element.getAttribute("aria-label") || "" : visibleText(element),
      );
      if (targets.some((target) => (exact ? value === target : value.includes(target)))) return element;
    }
  }
  return null;
}

export function findButtonByText(texts: readonly string[], root: ParentNode = document): HTMLElement | null {
  const buttonSelectors = ["button", '[role="button"]', 'input[type="submit"]', '[class*="btn" i]'] as const;
  const exactMatch = findByText(buttonSelectors, texts, root, true);
  if (exactMatch) return exactMatch;
  return findByText(buttonSelectors, texts, root, false);
}

export function clickElement(element: HTMLElement): void {
  element.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  element.focus?.();
  if (typeof PointerEvent !== "undefined") {
    try {
      element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    } catch {
      // ignore
    }
  }
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  if (typeof PointerEvent !== "undefined") {
    try {
      element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true }));
    } catch {
      // ignore
    }
  }
  element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  element.click();
}

export function isVisible(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current) {
    const style = getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden") return false;
    current = current.parentElement;
  }
  return !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true";
}

export function queryFirstVisible(selectors: readonly string[], root: ParentNode = document): HTMLElement | null {
  for (const selector of selectors) {
    for (const element of root.querySelectorAll<HTMLElement>(selector)) {
      if (isVisible(element)) return element;
    }
  }
  return null;
}

export async function waitFor<T>(getter: () => T | null, timeoutMs = 5000, intervalMs = 100): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const value = getter();
    if (value) return value;
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }
  return null;
}

export function dispatchInput(element: HTMLInputElement | HTMLSelectElement, value: string): void {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}
