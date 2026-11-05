// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isTargetGroup } from "../src/whatsapp/whatsappDetector";
import { findMessageNodes, isOutgoingMessageNode, isRecentWhatsAppTimestamp, isWhatsAppTimestampToday, messageNodeIdentity, readMessage, readRecentIncomingMessages, readTodayIncomingMessages, readTodayMessages } from "../src/whatsapp/whatsappObserver";

describe("WhatsApp semantic DOM adapter", () => {
  it("matches only the configured active group", () => {
    expect(isTargetGroup("SAKA", "Saka")).toBe(true);
    expect(isTargetGroup("Aile", "Saka")).toBe(false);
  });

  it("reads message text, sender, timestamp and stable DOM key", () => {
    document.body.innerHTML = `<main><div role="application"><div role="row" data-id="msg-123" data-pre-plain-text="[17:15, 27.08.2026] Ahmet:"><span class="selectable-text">Arıköy manolya 49 2 tane</span></div></div></main>`;
    const nodes = findMessageNodes(document);
    expect(nodes).toHaveLength(1);
    expect(readMessage(nodes[0], "Saka")).toMatchObject({ groupName: "Saka", sender: "Ahmet", timestamp: "17:15, 27.08.2026", messageKey: "msg-123", text: "Arıköy manolya 49 2 tane" });
  });

  it("recovers only recent incoming messages when the observer connects", () => {
    const now = new Date(2026, 7, 28, 9, 6).getTime();
    document.body.innerHTML = `<main><div role="application">
      <div role="row" data-id="false_recent" data-pre-plain-text="[09:00, 28.08.2026] Sakasu:"><div class="message-in"><span class="selectable-text">Noya B1/5 3 PC 1 paket 1 lt</span></div></div>
      <div role="row" data-id="true_recent" data-pre-plain-text="[09:01, 28.08.2026] Siz:"><div class="message-out"><span class="selectable-text">Gönderildi</span></div></div>
      <div role="row" data-id="false_old" data-pre-plain-text="[08:00, 28.08.2026] Sakasu:"><div class="message-in"><span class="selectable-text">Eski mesaj 2 tane</span></div></div>
    </div></main>`;
    const nodes = findMessageNodes(document);
    expect(isOutgoingMessageNode(nodes[1])).toBe(true);
    expect(readRecentIncomingMessages(nodes, "Saka", now).map((message) => message.messageKey)).toEqual(["false_recent"]);
  });

  it("recognizes WhatsApp date formats and time-only metadata", () => {
    const now = new Date(2026, 7, 28, 9, 6).getTime();
    expect(isRecentWhatsAppTimestamp("09:00, 28/08/2026", now)).toBe(true);
    expect(isRecentWhatsAppTimestamp("28.08.2026 09:00", now)).toBe(true);
    expect(isRecentWhatsAppTimestamp("09:00", now)).toBe(true);
    expect(isRecentWhatsAppTimestamp("08:00, 28.08.2026", now)).toBe(false);
    expect(isWhatsAppTimestampToday("00:01, 28.08.2026", now)).toBe(true);
    expect(isWhatsAppTimestampToday("23:59, 27.08.2026", now)).toBe(false);
  });

  it("recovers all rendered incoming messages from the same day for approval", () => {
    const now = new Date(2026, 7, 29, 15, 40).getTime();
    document.body.innerHTML = `<main><div role="application">
      <div role="row" data-id="false_morning" data-pre-plain-text="[08:05, 29.08.2026] Sakasu:"><span class="selectable-text">Sabah 2 tane</span></div>
      <div role="row" data-id="false_afternoon" data-pre-plain-text="[15:00, 29.08.2026] Sakasu:"><span class="selectable-text">Karafil 17 2 tane</span></div>
      <div role="row" data-id="true_mine" data-pre-plain-text="[15:34, 29.08.2026] Siz:"><div class="message-out"><span class="selectable-text">Ormanada 2 tane</span></div></div>
      <div role="row" data-id="false_yesterday" data-pre-plain-text="[23:59, 28.08.2026] Sakasu:"><span class="selectable-text">Dünkü 1 tane</span></div>
    </div></main>`;
    const recovered = readTodayIncomingMessages(findMessageNodes(document), "Saka", now);
    expect(recovered.map((message) => message.messageKey)).toEqual(["false_morning", "false_afternoon"]);
    expect(recovered.every((message) => message.historical)).toBe(true);
    const allToday = readTodayMessages(findMessageNodes(document), "Saka", now);
    expect(allToday.map((message) => message.messageKey)).toEqual(["false_morning", "false_afternoon", "true_mine"]);
    expect(allToday.find((message) => message.messageKey === "true_mine")?.outgoing).toBe(true);
  });

  it("recognizes a new message when WhatsApp reuses the same row element", () => {
    const row = document.createElement("div");
    row.setAttribute("role", "row");
    row.setAttribute("data-id", "false_old");
    row.innerHTML = `<span class="selectable-text">Eski mesaj</span>`;
    const oldIdentity = messageNodeIdentity(row);
    row.setAttribute("data-id", "false_new");
    row.innerHTML = `<div data-pre-plain-text="[15:00, 29.08.2026] Sakasu:"><span class="selectable-text">Karafil 17 2 tane</span></div>`;
    expect(messageNodeIdentity(row)).not.toBe(oldIdentity);
    expect(readMessage(row, "Saka")).toMatchObject({ sender: "Sakasu", text: "Karafil 17 2 tane", messageKey: "false_new" });
  });

  it("deduplicates overlapping modern WhatsApp message selectors", () => {
    document.body.innerHTML = `<main><div role="application"><div role="row" data-id="false_1"><div data-testid="msg-container"><div data-pre-plain-text="[15:00, 29.08.2026] Sakasu:"><span class="selectable-text copyable-text">Karafil 17 2 tane</span></div></div></div></div></main>`;
    expect(findMessageNodes(document)).toHaveLength(1);
  });
});
