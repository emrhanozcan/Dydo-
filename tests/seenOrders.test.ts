import { describe, expect, it } from "vitest";
import { detectUnseenOrderIds } from "../src/core/seenOrders";

describe("seen orders", () => {
  it("does not emit the same order twice", () => {
    expect(detectUnseenOrderIds({ "1001": Date.now() }, ["1001", "1002", "1002"])).toEqual(["1002"]);
  });
});
