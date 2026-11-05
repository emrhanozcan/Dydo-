import { normalizeAddress } from "../core/addressNormalizer";
import { COLUMN_ALIASES, REQUIRED_ORDER_COLUMNS, type OrderColumn } from "../prm/constants";
import { visibleText } from "../prm/domUtils";
import { SELECTORS } from "../prm/selectors";
import type { PrmOrder } from "../shared/types";

export type ColumnMap = Partial<Record<OrderColumn, number>>;

export function getHeaderElements(table: HTMLElement): HTMLElement[] {
  const thead = table.querySelector("thead");
  if (thead) {
    const headerRow = thead.querySelector("tr");
    if (headerRow && headerRow.children.length > 0) {
      return [...headerRow.children] as HTMLElement[];
    }
    const ths = [...thead.querySelectorAll<HTMLElement>("th, [role=columnheader]")];
    if (ths.length > 0) return ths;
  }

  const matHeaderRow = table.querySelector<HTMLElement>(
    "tr[mat-header-row], tr.mat-mdc-header-row, tr.mat-header-row, [role=row]:has([role=columnheader])",
  );
  if (matHeaderRow && matHeaderRow.children.length > 0) {
    return [...matHeaderRow.children] as HTMLElement[];
  }

  const columnHeaders = [...table.querySelectorAll<HTMLElement>('[role="columnheader"]')];
  if (columnHeaders.length > 0) return columnHeaders;

  const firstRow = table.querySelector("tr");
  if (firstRow) {
    const cells = [...firstRow.querySelectorAll<HTMLElement>("th, td")];
    if (cells.length > 0) return cells;
  }

  return [];
}

export function buildColumnMap(table: HTMLElement): ColumnMap {
  const headers = getHeaderElements(table);
  const map: ColumnMap = {};
  headers.forEach((header, index) => {
    const normalized = normalizeAddress(visibleText(header));
    const candidates = (Object.entries(COLUMN_ALIASES) as [OrderColumn, readonly string[]][]).flatMap(([column, aliases]) =>
      aliases.map((alias) => ({ column, alias: normalizeAddress(alias) })),
    ).filter(({ alias }) => normalized === alias || normalized.includes(alias));
    candidates.sort((a, b) => {
      const exactDifference = Number(normalized === b.alias) - Number(normalized === a.alias);
      return exactDifference || b.alias.length - a.alias.length;
    });
    const best = candidates[0];
    if (best) map[best.column] ??= index;
  });
  return map;
}

export function isCompatibleColumnMap(map: ColumnMap): boolean {
  return REQUIRED_ORDER_COLUMNS.every((column) => map[column] !== undefined);
}

export function findLiveOrderTable(root: ParentNode = document): HTMLElement | null {
  for (const selector of SELECTORS.tables) {
    for (const table of root.querySelectorAll<HTMLElement>(selector)) {
      const map = buildColumnMap(table);
      if (map.orderNumber !== undefined && map.address !== undefined) return table;
    }
  }
  return null;
}

function isHeaderRow(row: HTMLElement): boolean {
  if (row.matches("thead tr, tr[mat-header-row], tr.mat-mdc-header-row, tr.mat-header-row, tr.header, [role=rowheader]")) return true;
  if (row.querySelectorAll("th").length > 2) return true;
  const text = (row.textContent ?? "").toLowerCase();
  if (text.includes("müşteri adı") && text.includes("sipariş numarası")) return true;
  return false;
}

export function getOrderRows(table: HTMLElement): HTMLElement[] {
  const matRows = [...table.querySelectorAll<HTMLElement>("tr[mat-row], tr.mat-mdc-row, tr.mat-row")].filter((r) => !isHeaderRow(r));
  if (matRows.length > 0) return matRows;

  const tbodyRows = [...table.querySelectorAll<HTMLElement>("tbody tr, [role=rowgroup] [role=row]")].filter((r) => !isHeaderRow(r));
  if (tbodyRows.length > 0) return tbodyRows;

  const allTrs = [...table.querySelectorAll<HTMLElement>("tr")].filter((tr) => {
    return !tr.matches("thead tr, tr[mat-header-row], tr.mat-mdc-header-row, tr.mat-header-row, tr:first-child") && !isHeaderRow(tr);
  });
  return allTrs;
}

export function extractOrderNumbers(
  orderCell: HTMLElement | null,
  rawOrderNumber?: string,
  rawSecondaryId?: string,
): { id: string; secondaryId?: string } {
  let id = rawOrderNumber?.replace(/content_copy/gi, "").replace(/\s+/g, "") ?? "";
  let secondaryId = rawSecondaryId?.replace(/content_copy/gi, "").replace(/\s+/g, "");

  if (!orderCell) return { id, secondaryId };

  // 1. Check title/attribute for full untruncated ID (e.g. title="2026110310780415")
  for (const el of orderCell.querySelectorAll<HTMLElement>("[title], [aria-label], [data-clipboard-text], [data-copy], [data-id]")) {
    const attr = (el.getAttribute("title") || el.getAttribute("aria-label") || el.getAttribute("data-clipboard-text") || el.getAttribute("data-copy") || el.getAttribute("data-id") || "").replace(/content_copy/gi, "").replace(/\s+/g, "");
    if (/^\d{10,20}$/.test(attr)) {
      id = attr;
      break;
    }
  }

  // 2. Parse numbers from text
  const cellText = (orderCell.textContent ?? "").replace(/content_copy/gi, " ");
  const digitMatches = cellText.match(/\d+/g) ?? [];

  if (!secondaryId && digitMatches.length >= 2) {
    // Second number is typically 8-digit secondary ID (e.g. 10780415)
    const candidateSecondary = digitMatches.find((m) => m.length >= 6 && m.length <= 10 && !m.startsWith("202"));
    if (candidateSecondary) {
      secondaryId = candidateSecondary;
    }
  }

  // Clean main order ID if truncated with dots, too short, or concatenated with extra text
  if (id.includes(".") || id.length < 14 || id.length > 25) {
    const mainId = digitMatches.find((m) => m.length >= 14 && m.startsWith("202"));
    if (mainId) {
      id = mainId;
    } else {
      const datePrefix = digitMatches.find((m) => m.length >= 8 && m.startsWith("202"));
      if (datePrefix && secondaryId && datePrefix.length === 8) {
        id = `${datePrefix}${secondaryId}`;
      } else if (digitMatches[0] && digitMatches[0].length >= 12) {
        id = digitMatches[0];
      }
    }
  }

  return { id, secondaryId };
}

export function parseOrderRow(row: HTMLElement, map: ColumnMap, detectedAt = Date.now()): PrmOrder | null {
  const cellNodes = [...row.querySelectorAll<HTMLElement>(":scope > td, :scope > th, :scope > [role=gridcell], :scope > [role=cell]")];
  const cells = cellNodes.length > 0 ? cellNodes : ([...row.children] as HTMLElement[]);

  const read = (column: OrderColumn): string | undefined => {
    const index = map[column];
    return index === undefined ? undefined : visibleText(cells[index]) || undefined;
  };

  const orderCell = map.orderNumber !== undefined ? cells[map.orderNumber] : null;
  const { id, secondaryId } = extractOrderNumbers(orderCell, read("orderNumber"), read("secondaryId"));
  const rawAddress = read("address") ?? "";
  if (!id || !rawAddress || !/\d/.test(id)) return null;
  if (/^(musteri|müşteri)\s*adresi$/i.test(rawAddress.trim())) return null;

  const minutesText = read("minutesPassed");
  const minutes = minutesText?.match(/\d+/)?.[0];
  return {
    id,
    secondaryId,
    channel: read("channel"),
    customerName: read("customerName"),
    phone: read("phone"),
    rawAddress,
    normalizedAddress: normalizeAddress(rawAddress),
    details: read("details"),
    notes: read("notes"),
    status: read("status"),
    currentVehicle: read("deliveryPerson"),
    amount: read("amount"),
    paymentType: read("paymentType"),
    createdAt: read("createdAt"),
    appointmentDelivery: read("appointmentDelivery"),
    minutesPassed: minutes ? Number.parseInt(minutes, 10) : undefined,
    detectedAt,
  };
}

export function parseOrders(table: HTMLElement): PrmOrder[] {
  const map = buildColumnMap(table);
  if (!isCompatibleColumnMap(map)) return [];
  const rows = getOrderRows(table);
  return rows.map((row) => parseOrderRow(row, map)).filter((order): order is PrmOrder => Boolean(order));
}

export function findOrderRow(table: HTMLElement, orderColumn: number, order: PrmOrder | string): HTMLElement | null {
  const targetId = typeof order === "string" ? order : order.id;
  const secondaryId = typeof order === "string" ? undefined : order.secondaryId;
  const cleanTarget = targetId.replace(/\s+/g, "");

  const rows = getOrderRows(table);
  for (const row of rows) {
    const cellNodes = [...row.querySelectorAll<HTMLElement>(":scope > td, :scope > th, :scope > [role=gridcell], :scope > [role=cell]")];
    const cells = cellNodes.length > 0 ? cellNodes : ([...row.children] as HTMLElement[]);
    const cell = cells[orderColumn];
    if (!cell) continue;

    const cellText = visibleText(cell).replace(/\s+/g, "");
    if (cellText === cleanTarget || cellText.includes(cleanTarget)) return row;
    if (secondaryId && cellText.includes(secondaryId)) return row;

    for (const el of cell.querySelectorAll<HTMLElement>("[title], [aria-label], [data-clipboard-text], [data-copy]")) {
      const attr = (el.getAttribute("title") || el.getAttribute("aria-label") || el.getAttribute("data-clipboard-text") || el.getAttribute("data-copy") || "").replace(/\s+/g, "");
      if (attr && (attr === cleanTarget || attr.includes(cleanTarget) || (secondaryId && attr.includes(secondaryId)))) {
        return row;
      }
    }
  }
  return null;
}
