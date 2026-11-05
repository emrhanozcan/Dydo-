import { describeProductPriceDom, findNextPageButton, findProductPriceTable, parseProductPriceTable, tableSignature, type ProductPriceCandidate } from "./productPriceParser";

export interface ProductPriceScrapeResult {
  products: ProductPriceCandidate[];
  pageCount: number;
  complete: boolean;
}

export async function scrapeAllProductPrices(timeoutMs = 90_000): Promise<ProductPriceScrapeResult> {
  let table = await waitForTable(timeoutMs);
  if (!table) throw new Error(`Ürün fiyat tablosu/grid'i bulunamadı. ${describeProductPriceDom()}`);
  const products = new Map<string, ProductPriceCandidate>();
  const visited = new Set<string>();
  let pageCount = 0;

  for (let page = 0; page < 100; page += 1) {
    const signature = tableSignature(table);
    if (!signature || visited.has(signature)) {
      return { products: [...products.values()], pageCount, complete: !signature ? false : pageCount > 0 };
    }
    visited.add(signature);
    pageCount += 1;
    await collectVirtualRows(table, products);

    const next = findNextPageButton(table);
    if (!next) {
      const expectedRows = expectedRowCount(table);
      return { products: [...products.values()], pageCount, complete: expectedRows === undefined || products.size >= expectedRows };
    }
    next.click();
    const changed = await waitForSignatureChange(signature, 10_000);
    if (!changed) return { products: [...products.values()], pageCount, complete: false };
    table = changed;
  }
  return { products: [...products.values()], pageCount, complete: false };
}

async function waitForTable(timeoutMs: number): Promise<HTMLElement | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const table = findProductPriceTable();
    if (table && parseProductPriceTable(table).length > 0) return table;
    await delay(300);
  }
  return null;
}

async function waitForSignatureChange(previous: string, timeoutMs: number): Promise<HTMLElement | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const table = findProductPriceTable();
    if (table) {
      const next = tableSignature(table);
      if (next && next !== previous) return table;
    }
    await delay(200);
  }
  return null;
}

async function collectVirtualRows(table: HTMLElement, products: Map<string, ProductPriceCandidate>): Promise<void> {
  const viewport = findScrollableViewport(table);
  let unchanged = 0;
  for (let step = 0; step < 200; step += 1) {
    const before = products.size;
    parseProductPriceTable(table).forEach((product) => products.set(product.id, product));
    unchanged = products.size === before ? unchanged + 1 : 0;
    if (!viewport || viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 2 || unchanged >= 3) return;
    const previousTop = viewport.scrollTop;
    viewport.scrollTop = Math.min(viewport.scrollHeight, viewport.scrollTop + Math.max(160, Math.floor(viewport.clientHeight * 0.8)));
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
    if (viewport.scrollTop === previousTop) return;
    await delay(180);
  }
}

function findScrollableViewport(table: HTMLElement): HTMLElement | null {
  const elements = [table, ...table.querySelectorAll<HTMLElement>("div, section")];
  return elements.find((element) => element.scrollHeight > element.clientHeight + 10) ?? null;
}

function expectedRowCount(table: HTMLElement): number | undefined {
  const values = [table, ...table.querySelectorAll<HTMLElement>('[aria-rowcount]')]
    .map((element) => Number(element.getAttribute("aria-rowcount")))
    .filter((value) => Number.isSafeInteger(value) && value > 0);
  if (!values.length) return undefined;
  const count = Math.max(...values);
  return Math.max(0, count - 1);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
