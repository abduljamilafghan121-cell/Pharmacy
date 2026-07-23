// Cart is no longer used — this is a POS system.
// Sales are processed directly on the New Sale screen.
// This file is kept as a stub to avoid breaking any stale imports.

export interface CartItem {
  id: number;
  name: string;
  price: string;
  quantity: number;
  prescriptionRequired: boolean;
  selectedQuantity: number;
  [key: string]: unknown;
}

export const useCart = () => ({
  items: [] as CartItem[],
  addToCart: (_item: CartItem) => {},
  removeFromCart: (_id: number) => {},
  updateQuantity: (_id: number, _qty: number) => {},
  clearCart: () => {},
  getCartTotal: () => 0,
  requiresPrescription: () => false,
});
