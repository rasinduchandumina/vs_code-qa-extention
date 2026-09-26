import { describe, it, expect } from 'vitest';
import { applyDiscount } from '../../src/cart';

describe('applyDiscount', () => {
  /**
   * @requirement REQ-001
   */
  it('tc-1: Apply standard percentage discount successfully', () => {
    const subtotal = 100;
    const discount = { percentage: 20 };
    const result = applyDiscount(subtotal, discount);
    expect(result).toBe(80);
  });

  /**
   * @requirement REQ-002
   */
  it('tc-2: Apply percentage discount with minimum spend met', () => {
    const subtotal = 50;
    const discount = { percentage: 10, minSpend: 50 };
    const result = applyDiscount(subtotal, discount);
    expect(result).toBe(45);
  });

  /**
   * @requirement REQ-005
   */
  it('tc-5: Handle decimal precision accurately', () => {
    const subtotal = 33.33;
    const discount = { percentage: 15 };
    const result = applyDiscount(subtotal, discount);
    expect(result).toBe(28.33);
  });
});
