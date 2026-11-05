import { normalizeAddress } from "../core/addressNormalizer";
import {
  clickElement,
  dispatchInput,
  findButtonByText,
  isVisible,
  queryFirst,
  queryFirstVisible,
  visibleText,
  waitFor,
} from "../prm/domUtils";
import { SELECTORS } from "../prm/selectors";
import type { PrmOrder, Vehicle } from "../shared/types";
import { buildColumnMap, findLiveOrderTable, findOrderRow } from "./orderParser";

export interface AssignmentResult {
  success: boolean;
  reason?: string;
}

export class AssignmentQueue {
  private chain: Promise<unknown> = Promise.resolve();

  enqueue(order: PrmOrder, vehicle: Vehicle): Promise<AssignmentResult> {
    const task = this.chain.then(() => performAssignment(order, vehicle));
    this.chain = task.catch(() => undefined);
    return task;
  }
}

export class StatusUpdateQueue {
  private chain: Promise<unknown> = Promise.resolve();

  enqueue(order: PrmOrder, targetStatus: string): Promise<AssignmentResult> {
    const task = this.chain.then(() => performStatusUpdate(order, targetStatus));
    this.chain = task.catch(() => undefined);
    return task;
  }
}

export function findDeliveryTrigger(deliveryCell: HTMLElement): HTMLElement {
  const button = deliveryCell.querySelector<HTMLElement>('button, [role="button"], [role="combobox"], a');
  if (button && isVisible(button)) return button;

  const pill = deliveryCell.querySelector<HTMLElement>(
    '[class*="badge" i], [class*="chip" i], [class*="pill" i], [class*="delivery" i], [class*="btn" i], [class*="select" i]',
  );
  if (pill && isVisible(pill)) return pill;

  const inner = deliveryCell.querySelector<HTMLElement>("span, div");
  if (inner && isVisible(inner)) return inner;

  return (deliveryCell.firstElementChild as HTMLElement) ?? deliveryCell;
}

export function findDeliveryDialog(root: ParentNode = document): HTMLElement | null {
  for (const selector of SELECTORS.dialogs) {
    for (const el of root.querySelectorAll<HTMLElement>(selector)) {
      if (!isVisible(el)) continue;
      const text = normalizeAddress(visibleText(el));
      if (text.includes("teslimatci") || text.includes("kaydet") || text.includes("iptal")) {
        return el;
      }
    }
  }

  const containers = root.querySelectorAll<HTMLElement>(
    'mat-dialog-container, .mat-mdc-dialog-container, .mat-dialog-container, .cdk-overlay-pane, .modal, .modal-dialog, [class*="dialog" i], [class*="modal" i]',
  );
  for (const el of containers) {
    if (!isVisible(el)) continue;
    const text = normalizeAddress(visibleText(el));
    if (text.includes("teslimatci") && (text.includes("kaydet") || text.includes("iptal"))) {
      return el;
    }
  }

  return queryFirstVisible(SELECTORS.dialogs, root);
}

export function findDeliveryDropdown(dialog: HTMLElement): HTMLElement | null {
  const nativeSelect = dialog.querySelector<HTMLSelectElement>("select");
  if (nativeSelect && isVisible(nativeSelect)) return nativeSelect;

  for (const selector of SELECTORS.comboboxes) {
    const el = dialog.querySelector<HTMLElement>(selector);
    if (el && isVisible(el)) return el;
  }

  const custom = dialog.querySelector<HTMLElement>(
    'mat-select, .mat-mdc-select, .mat-select, [role="combobox"], [role="listbox"], [aria-haspopup="listbox"], ' +
      '.mat-mdc-form-field-flex, .mat-form-field-flex, [class*="select" i], [class*="dropdown" i], input[readonly]',
  );
  if (custom && isVisible(custom)) return custom;

  const arrow = dialog.querySelector<HTMLElement>('[class*="arrow" i], [class*="chevron" i], svg, mat-icon, i');
  if (arrow && isVisible(arrow)) {
    return arrow.closest<HTMLElement>('[class*="field" i], [class*="form" i], [class*="control" i], div') ?? arrow;
  }

  const label = [...dialog.querySelectorAll<HTMLElement>("label, span, div")].find((el) =>
    normalizeAddress(visibleText(el)).includes("teslimatci"),
  );
  if (label) {
    const nextBox = label.parentElement?.querySelector<HTMLElement>('input, div[tabindex], [role="button"], div');
    if (nextBox && nextBox !== label && isVisible(nextBox)) return nextBox;
  }

  return null;
}

export function findVehicleOption(vehicle: Vehicle, root: ParentNode = document): HTMLElement | null {
  const normPrm = normalizeAddress(vehicle.prmName);
  const normShort = normalizeAddress(vehicle.shortName);

  for (const selector of SELECTORS.options) {
    for (const el of root.querySelectorAll<HTMLElement>(selector)) {
      if (!isVisible(el)) continue;
      const text = normalizeAddress(visibleText(el));
      if (text === normPrm || text.includes(normPrm) || text === normShort || (text.includes("arac") && text.includes(normShort))) {
        return el;
      }
    }
  }

  const overlays = root.querySelectorAll<HTMLElement>(
    '.cdk-overlay-container, .cdk-overlay-pane, [role="listbox"], mat-select-panel, .mat-mdc-select-panel, .p-dropdown-panel, .ant-select-dropdown, [class*="dropdown-menu" i], [class*="select-panel" i]',
  );
  for (const overlay of overlays) {
    if (!isVisible(overlay)) continue;
    for (const child of overlay.querySelectorAll<HTMLElement>("*")) {
      if (!isVisible(child)) continue;
      const text = normalizeAddress(visibleText(child));
      if (text === normPrm || (text.includes("istanbul") && text.includes(normShort))) {
        return child.closest<HTMLElement>('mat-option, [role="option"], li, div') ?? child;
      }
    }
  }

  const allCandidates = root.querySelectorAll<HTMLElement>("div, span, li, a");
  for (const el of allCandidates) {
    if (!isVisible(el) || el.children.length > 2) continue;
    const text = normalizeAddress(visibleText(el));
    if (text === normPrm || (text.includes("istanbul") && text.includes(normShort))) {
      return el;
    }
  }

  return null;
}

export function findSaveButton(dialog: HTMLElement): HTMLElement | null {
  const saveTexts = ["kaydet", "onayla", "guncelle", "tamam"];
  const buttons = dialog.querySelectorAll<HTMLElement>('button, [role="button"], input[type="submit"], [class*="btn" i]');
  for (const btn of buttons) {
    if (!isVisible(btn)) continue;
    const text = normalizeAddress(visibleText(btn));
    if (saveTexts.some((target) => text.includes(target))) {
      return btn;
    }
  }

  const submitBtn = dialog.querySelector<HTMLElement>('button[type="submit"], input[type="submit"]');
  if (submitBtn && isVisible(submitBtn)) return submitBtn;

  return findButtonByText(["Kaydet", "Onayla"], dialog);
}

export async function performAssignment(order: PrmOrder, vehicle: Vehicle): Promise<AssignmentResult> {
  const table = findLiveOrderTable();
  if (!table) return fail("live_order_table_not_found");
  const map = buildColumnMap(table);
  if (map.orderNumber === undefined || map.deliveryPerson === undefined) return fail("delivery_column_not_found");
  const row = findOrderRow(table, map.orderNumber, order);
  if (!row) return fail("order_row_not_found");

  const cellNodes = [...row.querySelectorAll<HTMLElement>(":scope > td, :scope > th, :scope > [role=gridcell], :scope > [role=cell]")];
  const cells = cellNodes.length > 0 ? cellNodes : ([...row.children] as HTMLElement[]);
  const deliveryCell = cells[map.deliveryPerson];
  if (!deliveryCell || !row.isConnected) return fail("delivery_cell_not_found");

  // Step 1: Click the delivery pill / button in the row to open the modal (Image 1 -> Image 2)
  const trigger = findDeliveryTrigger(deliveryCell);
  clickElement(trigger);

  // Step 2: Wait for the modal dialog to appear (Image 2)
  const dialog = await waitFor(() => findDeliveryDialog(document), 5000);
  if (!dialog || !row.isConnected) return fail("delivery_modal_not_found");

  // Step 3: Find the dropdown inside the modal
  const combobox = findDeliveryDropdown(dialog);
  if (!combobox) return fail("delivery_dropdown_not_found");

  if (combobox instanceof HTMLSelectElement) {
    const targetNorm = normalizeAddress(vehicle.prmName);
    const shortNorm = normalizeAddress(vehicle.shortName);
    const option = [...combobox.options].find((candidate) => {
      const text = normalizeAddress(candidate.text);
      return text === targetNorm || text.includes(targetNorm) || text.includes(shortNorm);
    });
    if (!option) return fail("vehicle_option_not_found");
    dispatchInput(combobox, option.value);
  } else {
    // Custom dropdown / Angular Material select (Image 2 -> Image 3)
    clickElement(combobox);

    // Step 4: Wait for the option list and click the vehicle option (Image 3)
    const option = await waitFor(() => findVehicleOption(vehicle, document), 4000);
    if (!option) return fail("vehicle_option_not_found");
    clickElement(option);

    // Wait briefly for the UI to update with selected vehicle (Image 3 -> Image 4)
    await new Promise((resolve) => window.setTimeout(resolve, 200));
  }

  // Step 5: Click the "Kaydet" button in the modal (Image 4)
  const saveButton = findSaveButton(dialog);
  if (!saveButton || !row.isConnected) return fail("save_button_not_found");
  clickElement(saveButton);

  // Step 6: Verify assignment in the table row
  const targetShort = normalizeAddress(vehicle.shortName);
  const targetPrm = normalizeAddress(vehicle.prmName);

  const verified = await waitFor(() => {
    const currentTable = findLiveOrderTable();
    if (!currentTable) return null;
    const currentMap = buildColumnMap(currentTable);
    if (currentMap.orderNumber === undefined || currentMap.deliveryPerson === undefined) return null;
    const currentRow = findOrderRow(currentTable, currentMap.orderNumber, order);
    if (!currentRow) return null;
    const currentCellNodes = [...currentRow.querySelectorAll<HTMLElement>(":scope > td, :scope > th, :scope > [role=gridcell], :scope > [role=cell]")];
    const currentCells = currentCellNodes.length > 0 ? currentCellNodes : ([...currentRow.children] as HTMLElement[]);
    const value = normalizeAddress(visibleText(currentCells[currentMap.deliveryPerson]));
    return value.includes(targetShort) || value.includes(targetPrm) ? true : null;
  }, 8000, 250);

  return verified ? { success: true } : fail("assignment_not_verified");
}

export function findStatusTrigger(statusCell: HTMLElement): HTMLElement {
  const button = statusCell.querySelector<HTMLElement>('button, [role="button"], [role="combobox"], a');
  if (button && isVisible(button)) return button;

  const pill = statusCell.querySelector<HTMLElement>(
    '[class*="badge" i], [class*="chip" i], [class*="pill" i], [class*="status" i], [class*="btn" i], span, div',
  );
  if (pill && isVisible(pill)) return pill;

  return (statusCell.firstElementChild as HTMLElement) ?? statusCell;
}

export function findStatusDialog(root: ParentNode = document): HTMLElement | null {
  for (const selector of SELECTORS.dialogs) {
    for (const el of root.querySelectorAll<HTMLElement>(selector)) {
      if (!isVisible(el)) continue;
      const text = normalizeAddress(visibleText(el));
      if (text.includes("siparis durumu") && (text.includes("kaydet") || text.includes("iptal"))) {
        return el;
      }
    }
  }

  const containers = root.querySelectorAll<HTMLElement>(
    'mat-dialog-container, .mat-mdc-dialog-container, .mat-dialog-container, .cdk-overlay-pane, .modal, .modal-dialog, [class*="dialog" i], [class*="modal" i]',
  );
  for (const el of containers) {
    if (!isVisible(el)) continue;
    const text = normalizeAddress(visibleText(el));
    if (text.includes("siparis durumu") && (text.includes("kaydet") || text.includes("iptal"))) {
      return el;
    }
  }

  return null;
}

export function findStatusDropdown(dialog: HTMLElement): HTMLElement | null {
  const nativeSelect = dialog.querySelector<HTMLSelectElement>("select");
  if (nativeSelect && isVisible(nativeSelect)) return nativeSelect;

  for (const selector of SELECTORS.comboboxes) {
    const el = dialog.querySelector<HTMLElement>(selector);
    if (el && isVisible(el)) return el;
  }

  const custom = dialog.querySelector<HTMLElement>(
    'mat-select, .mat-mdc-select, .mat-select, [role="combobox"], [role="listbox"], [aria-haspopup="listbox"], ' +
      '.mat-mdc-form-field-flex, .mat-form-field-flex, [class*="select" i], [class*="dropdown" i], input[readonly]',
  );
  if (custom && isVisible(custom)) return custom;

  const arrow = dialog.querySelector<HTMLElement>('[class*="arrow" i], [class*="chevron" i], svg, mat-icon, i');
  if (arrow && isVisible(arrow)) {
    return arrow.closest<HTMLElement>('[class*="field" i], [class*="form" i], [class*="control" i], div') ?? arrow;
  }

  return null;
}

export function findStatusOption(targetStatus: string, root: ParentNode = document): HTMLElement | null {
  const normTarget = normalizeAddress(targetStatus);
  for (const selector of SELECTORS.options) {
    for (const el of root.querySelectorAll<HTMLElement>(selector)) {
      if (!isVisible(el)) continue;
      const text = normalizeAddress(visibleText(el));
      if (text === normTarget || text.includes(normTarget)) {
        return el;
      }
    }
  }

  const overlays = root.querySelectorAll<HTMLElement>(
    '.cdk-overlay-container, .cdk-overlay-pane, [role="listbox"], mat-select-panel, .mat-mdc-select-panel, [class*="dropdown-menu" i], [class*="select-panel" i]',
  );
  for (const overlay of overlays) {
    if (!isVisible(overlay)) continue;
    for (const el of overlay.querySelectorAll<HTMLElement>("div, span, li, a")) {
      if (!isVisible(el) || el.children.length > 2) continue;
      const text = normalizeAddress(visibleText(el));
      if (text === normTarget || text.includes(normTarget)) {
        return el;
      }
    }
  }

  return null;
}

export async function performStatusUpdate(order: PrmOrder, targetStatus: string): Promise<AssignmentResult> {
  const table = findLiveOrderTable();
  if (!table) return fail("live_order_table_not_found");
  const map = buildColumnMap(table);
  if (map.orderNumber === undefined || map.status === undefined) return fail("status_column_not_found");
  const row = findOrderRow(table, map.orderNumber, order);
  if (!row) return fail("order_row_not_found");

  const cellNodes = [...row.querySelectorAll<HTMLElement>(":scope > td, :scope > th, :scope > [role=gridcell], :scope > [role=cell]")];
  const cells = cellNodes.length > 0 ? cellNodes : ([...row.children] as HTMLElement[]);
  const statusCell = cells[map.status];
  if (!statusCell || !row.isConnected) return fail("status_cell_not_found");

  // Step 1: Click the status pill in the row (e.g. "Bekliyor") to open modal
  const trigger = findStatusTrigger(statusCell);
  clickElement(trigger);

  // Step 2: Wait for "Sipariş Durumu" modal
  const dialog = await waitFor(() => findStatusDialog(document), 5000);
  if (!dialog || !row.isConnected) return fail("status_dialog_not_found");

  // Step 3: Find and click the dropdown inside the modal
  const combobox = findStatusDropdown(dialog);
  if (!combobox) return fail("status_dropdown_not_found");

  if (combobox instanceof HTMLSelectElement) {
    const normTarget = normalizeAddress(targetStatus);
    const option = [...combobox.options].find((candidate) => {
      const text = normalizeAddress(candidate.text);
      return text === normTarget || text.includes(normTarget);
    });
    if (!option) return fail("status_option_not_found");
    dispatchInput(combobox, option.value);
  } else {
    clickElement(combobox);

    // Step 4: Wait for options panel and click target status ("Yolda" / "Teslim Edildi")
    const option = await waitFor(() => findStatusOption(targetStatus, document), 4000);
    if (!option) return fail("status_option_not_found");
    clickElement(option);

    await new Promise((resolve) => window.setTimeout(resolve, 200));
  }

  // Step 5: Click "Kaydet" button
  const saveButton = findSaveButton(dialog);
  if (!saveButton || !row.isConnected) return fail("save_button_not_found");
  clickElement(saveButton);

  // Step 6: Wait for dialog to close
  await new Promise((resolve) => window.setTimeout(resolve, 500));
  return { success: true };
}

function fail(reason: string): AssignmentResult {
  return { success: false, reason };
}
