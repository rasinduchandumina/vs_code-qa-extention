import { describe, it, expect } from "vitest";
import { calculateTotal } from "../src/cart";

describe("calculateTotal", () => {
  it("calculates total for standard items with default tax", () => {
    const items = [
      { id: "1", name: "Apple", price: 10, quantity: 2 },
      { id: "2", name: "Orange", price: 5, quantity: 1 }
    ];
    // subtotal = 25, tax (8%) = 2, total = 27
    expect(calculateTotal(items)).toBe(27);
  });
});
