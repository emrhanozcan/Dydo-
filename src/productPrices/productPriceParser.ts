import { normalizeAddress } from "../core/addressNormalizer";
import { PRODUCT_PRICE_HEADER_ALIASES, PRODUCT_PRICE_SELECTORS } from "./productPriceSelectors";

export interface ProductPriceCandidate {
  id: string;
  productCode?: string;
  productName: string;
  unit?: string;
  priceMinor: number;
  rawPrice: string;
}

type ColumnKind = keyof typeof PRODUCT_PRICE_HEADER_ALIASES;
type ColumnMap = Partial<Record<ColumnKind, number>>;

export function isProductPricePage(url = location.href): boolean {
  try {
    return new URL(url).pathname.replace(/\/$/, "") === "/main/product-management/product-price-list";
  } catch {
    return false;
  }
}

export function parseMoneyMinor(raw: string): number | null {
  let value = raw.replace(/\u00a0/g, " ").replace(/[^\d,.-]/g, "").trim();
  if (!/\d/.test(value)) return null;
  const negative = value.startsWith("-");
  value = value.replace(/-/g, "");
  const comma = value.lastIndexOf(",");
  const dot = value.lastIndexOf(".");
  const separator = Math.max(comma, dot);
  let normalized: string;
  if (separator >= 0 && value.length - separator - 1 <= 2) {
    normalized = `${value.slice(0, separator).replace(/[.,]/g, "")}.${value.slice(separator + 1)}`;
  } else {
    normalized = value.replace(/[.,]/g, "");
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) * (negative ? -1 : 1) : null;
}

export function findProductPriceTable(root: ParentNode = document): HTMLElement | null {
  const tables = uniqueElements(PRODUCT_PRICE_SELECTORS.tables.flatMap((selector) => [...root.querySelectorAll<HTMLElement>(selector)]));
  return tables
    .map((table) => ({ table, map: buildColumnMap(table) }))
    .find(({ map }) => map.price !== undefined && (map.name !== undefined || map.code !== undefined))?.table ?? null;
}

export function parseProductPriceTable(table: HTMLElement): ProductPriceCandidate[] {
  const map = buildColumnMap(table);
  if (map.price === undefined || (map.name === undefined && map.code === undefined)) return [];
  const headerRow = findHeaderRow(table);
  const rows = uniqueElements(PRODUCT_PRICE_SELECTORS.dataRows.flatMap((selector) => [...table.querySelectorAll<HTMLElement>(selector)]))
    .filter((row) => row !== headerRow && getDataCells(row).length > 0);
  const products = new Map<string, ProductPriceCandidate>();
  for (const row of rows) {
    const cells = getDataCells(row);
    const rawPrice = cellText(cells, map.price);
    const priceMinor = parseMoneyMinor(rawPrice);
    const productCode = cleanText(cellText(cells, map.code));
    const productName = cleanText(cellText(cells, map.name)) || productCode;
    if (!productName || priceMinor === null) continue;
    const id = stableProductId(productCode || productName);
    products.set(id, {
      id,
      productCode: productCode || undefined,
      productName,
      unit: cleanText(cellText(cells, map.unit)) || undefined,
      priceMinor,
      rawPrice: cleanText(rawPrice),
    });
  }
  return [...products.values()];
}

export function getProductPriceDiagnostics(root: ParentNode = document): Record<string, boolean> {
  const table = findProductPriceTable(root);
  const map = table ? buildColumnMap(table) : {};
  return {
    productPricePage: isProductPricePage(),
    productPriceTable: Boolean(table),
    productNameColumn: map.name !== undefined || map.code !== undefined,
    productPriceColumn: map.price !== undefined,
    productPriceRows: Boolean(table && parseProductPriceTable(table).length),
  };
}

export function findNextPageButton(table: HTMLElement): HTMLElement | null {
  const scope = findPaginationScope(table);
  const candidates = uniqueElements(PRODUCT_PRICE_SELECTORS.nextPageButtons.flatMap((selector) => [...scope.querySelectorAll<HTMLElement>(selector)]));
  return candidates.find((button) => isEnabled(button) && isVisible(button)) ?? null;
}

export function tableSignature(table: HTMLElement): string {
  return parseProductPriceTable(table).map((product) => `${product.id}:${product.priceMinor}`).join("|");
}

function buildColumnMap(table: HTMLElement): ColumnMap {
  const row = findHeaderRow(table);
  return row ? buildColumnMapForRow(row) : {};
}

function buildColumnMapForRow(row: HTMLElement): ColumnMap {
  const headers = getHeaderCells(row);
  const map: ColumnMap = {};
  const scores: Partial<Record<ColumnKind, number>> = {};
  headers.forEach((header, index) => {
    const value = normalizeHeader(header.innerText || header.textContent || "");
    for (const kind of Object.keys(PRODUCT_PRICE_HEADER_ALIASES) as ColumnKind[]) {
      const aliases = PRODUCT_PRICE_HEADER_ALIASES[kind];
      const aliasIndex = aliases.findIndex((alias) => headerMatches(value, normalizeHeader(alias)));
      if (aliasIndex < 0) continue;
      const exact = value === normalizeHeader(aliases[aliasIndex]);
      const score = (exact ? 1_000 : 500) - aliasIndex;
      if ((scores[kind] ?? -1) < score) {
        map[kind] = index;
        scores[kind] = score;
      }
    }
  });
  return map;
}

function headerMatches(value: string, alias: string): boolean {
  return value === alias || (alias.includes(" ") && value.includes(alias));
}

function findHeaderRow(table: HTMLElement): HTMLElement | null {
  const rows = uniqueElements(PRODUCT_PRICE_SELECTORS.headerRows.flatMap((selector) => [...table.querySelectorAll<HTMLElement>(selector)]));
  return rows
    .filter((row) => getHeaderCells(row).length > 0)
    .map((row) => ({ row, map: buildColumnMapForRow(row) }))
    .sort((left, right) => columnMapScore(right.map) - columnMapScore(left.map))[0]?.row ?? null;
}

function columnMapScore(map: ColumnMap): number {
  return (map.price !== undefined ? 4 : 0) + (map.name !== undefined ? 2 : 0) + (map.code !== undefined ? 1 : 0) + (map.unit !== undefined ? 1 : 0);
}

function findPaginationScope(table: HTMLElement): ParentNode {
  let current: HTMLElement | null = table.parentElement;
  for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
    if (PRODUCT_PRICE_SELECTORS.nextPageButtons.some((selector) => current?.querySelector(selector))) return current;
  }
  return table.parentElement ?? table;
}

function getHeaderCells(row: HTMLElement): HTMLElement[] {
  return uniqueElements(PRODUCT_PRICE_SELECTORS.headerCells.flatMap((selector) => [...row.querySelectorAll<HTMLElement>(selector)]));
}

function getDataCells(row: HTMLElement): HTMLElement[] {
  return uniqueElements(PRODUCT_PRICE_SELECTORS.dataCells.flatMap((selector) => [...row.querySelectorAll<HTMLElement>(selector)]));
}

export function describeProductPriceDom(root: ParentNode = document): string {
  const headings = uniqueElements([
    ...root.querySelectorAll<HTMLElement>('th, [role="columnheader"], mat-header-cell, .mat-header-cell, .mat-mdc-header-cell'),
  ]).map((element) => cleanText(element.innerText || element.textContent || "")).filter(Boolean).slice(0, 20);
  const pageHeadings = [...root.querySelectorAll<HTMLElement>("h1, h2, h3")]
    .map((element) => cleanText(element.innerText || element.textContent || "")).filter(Boolean).slice(0, 8);
  return `URL: ${location.href}; table: ${root.querySelectorAll("table").length}; grid: ${root.querySelectorAll('[role="grid"]').length}; başlıklar: ${headings.join(" | ") || "yok"}; sayfa: ${pageHeadings.join(" | ") || document.title || "yok"}`;
}

function normalizeHeader(value: string): string {
  return normalizeAddress(value).replace(/[^a-z0-9çğıöşü ]/g, " ").replace(/\s+/g, " ").trim();
}

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function cellText(cells: HTMLElement[], index?: number): string {
  if (index === undefined) return "";
  const cell = cells[index];
  if (!cell) return "";
  const input = cell.querySelector<HTMLInputElement>('input:not([type="checkbox"]):not([type="radio"]), [contenteditable="true"]');
  if (input instanceof HTMLInputElement && input.value.trim()) return input.value;
  if (input instanceof HTMLElement) return input.innerText || input.textContent || "";
  return cell.innerText || cell.textContent || "";
}

function stableProductId(value: string): string {
  const normalized = normalizeAddress(value) || value.trim().toLocaleLowerCase("tr-TR");
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `prm_product_${(hash >>> 0).toString(36)}`;
}

function uniqueElements<T extends Element>(elements: T[]): T[] {
  return [...new Set(elements)];
}

function isEnabled(element: HTMLElement): boolean {
  return !(element instanceof HTMLButtonElement && element.disabled) && element.getAttribute("aria-disabled") !== "true" && !element.classList.contains("disabled");
}

function isVisible(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}
