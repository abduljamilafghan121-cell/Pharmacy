import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Medicine } from "@workspace/api-client-react/src/generated/api.schemas";

export interface CartItem extends Medicine {
  selectedQuantity: number;
}

interface CartStore {
  items: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (medicineId: number) => void;
  updateQuantity: (medicineId: number, quantity: number) => void;
  clearCart: () => void;
  getCartTotal: () => number;
  requiresPrescription: () => boolean;
}

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      
      addToCart: (item) => set((state) => {
        const existing = state.items.find((i) => i.id === item.id);
        if (existing) {
          return {
            items: state.items.map((i) => 
              i.id === item.id 
                ? { ...i, selectedQuantity: i.selectedQuantity + item.selectedQuantity }
                : i
            )
          };
        }
        return { items: [...state.items, item] };
      }),
      
      removeFromCart: (id) => set((state) => ({
        items: state.items.filter((i) => i.id !== id)
      })),
      
      updateQuantity: (id, quantity) => set((state) => ({
        items: state.items.map((i) => 
          i.id === id ? { ...i, selectedQuantity: quantity } : i
        )
      })),
      
      clearCart: () => set({ items: [] }),
      
      getCartTotal: () => {
        const { items } = get();
        return items.reduce((total, item) => total + (parseFloat(item.price) * item.selectedQuantity), 0);
      },
      
      requiresPrescription: () => {
        const { items } = get();
        return items.some(item => item.prescriptionRequired);
      }
    }),
    {
      name: 'pharma-cart-storage',
    }
  )
);
