export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface DiscountCode {
  code: string;
  percentage: number;
  minSpend?: number;
}

/**
 * Calculates the total cost of items in a cart, applying sales tax.
 */
export function calculateTotal(items: CartItem[], taxRate: number = 0.08): number {
  if (!items || items.length === 0) {
    return 0;
  }

  const subtotal = items.reduce((sum, item) => {
    if (item.price < 0 || item.quantity < 0) {
      throw new Error(`Invalid item values for ${item.name}`);
    }
    return sum + item.price * item.quantity;
  }, 0);

  const tax = subtotal * taxRate;
  return Number((subtotal + tax).toFixed(2));
}

/**
 * Applies a percentage discount to a given subtotal.
 */
export const applyDiscount = (subtotal: number, discount: DiscountCode): number => {
  if (discount.minSpend && subtotal < discount.minSpend) {
    return subtotal;
  }
  const discountAmount = subtotal * (discount.percentage / 100);
  return Math.max(0, Number((subtotal - discountAmount).toFixed(2)));
};
