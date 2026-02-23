export type Role = 'admin' | 'cashier';

export interface User {
  uid: string;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  costPrice: number;
  stock: number;
  categoryId: string;
  imageUrl?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  createdAt: Date;
}

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  costPrice: number;
  quantity: number;
}

export interface Sale {
  id: string;
  items: CartItem[];
  totalAmount: number;
  discount: number;
  paymentMethod: 'cash' | 'debt';
  paymentStatus: 'paid' | 'pending';
  customerName?: string | null;
  cashierId: string;
  customerId?: string;
  status: 'completed' | 'refunded';
  source?: 'pos' | 'telegram' | 'whatsapp';
  createdAt: Date;
}

export interface InventoryLog {
  id: string;
  productId: string;
  productName: string;
  type: 'in' | 'out' | 'adjustment';
  quantity: number;
  reason: string;
  userId: string;
  createdAt: Date;
}

export interface Customer {
  id: string;
  memberId: string;
  name: string;
  phone?: string;
  address?: string;
  totalSpent: number;
  lastVisit?: Date;
  joinDate: Date;
  createdAt: Date;
}

export interface SavingsAccount {
  id: string;
  customerId: string;
  balanceWajib: number;
  balanceSukarela: number;
  balancePokok: number;
  lastWajibPayment?: Date; // Track last monthly payment
  createdAt: Date;
  updatedAt: Date;
}

export interface SavingsTransaction {
  id: string;
  savingsAccountId: string;
  customerId: string;
  type: 'deposit' | 'withdrawal';
  category: 'wajib' | 'sukarela' | 'pokok';
  amount: number;
  date: Date;
  description: string;
  userId: string;
}
