import { create } from 'zustand';
import { CartItem, Product } from '../types';

interface CartState {
  items: CartItem[];
  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  getTotal: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  
  addToCart: (product) => {
    const items = get().items;
    const existingItem = items.find(item => item.productId === product.id);

    if (existingItem) {
      set({
        items: items.map(item =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      });
    } else {
      set({
        items: [...items, {
          productId: product.id,
          name: product.name,
          price: product.price,
          costPrice: product.costPrice,
          quantity: 1
        }]
      });
    }
  },

  removeFromCart: (productId) => {
    set({
      items: get().items.filter(item => item.productId !== productId)
    });
  },

  updateQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      get().removeFromCart(productId);
    } else {
      set({
        items: get().items.map(item =>
          item.productId === productId
            ? { ...item, quantity }
            : item
        )
      });
    }
  },

  clearCart: () => set({ items: [] }),

  getTotal: () => {
    return get().items.reduce((total, item) => total + (item.price * item.quantity), 0);
  }
}));
