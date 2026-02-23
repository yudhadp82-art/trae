import { collection, addDoc, serverTimestamp, updateDoc, doc, getDoc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { InventoryLog } from '../types';

export const getInventoryLogs = (callback: (logs: InventoryLog[]) => void) => {
  const q = query(collection(db, 'inventory_logs'), orderBy('createdAt', 'desc'));
  
  return onSnapshot(q, (snapshot) => {
    const logs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate()
    })) as InventoryLog[];
    callback(logs);
  });
};

export const addStockAdjustment = async (
  productId: string,
  productName: string,
  type: 'in' | 'out' | 'adjustment',
  quantity: number,
  reason: string,
  userId: string
) => {
  try {
    // 1. Get current product stock
    const productRef = doc(db, 'products', productId);
    const productSnap = await getDoc(productRef);
    
    if (!productSnap.exists()) {
      throw new Error('Product not found');
    }

    const currentStock = productSnap.data().stock || 0;
    let newStock = currentStock;

    // 2. Calculate new stock based on type
    if (type === 'in') {
      newStock += quantity;
    } else if (type === 'out') {
      newStock -= quantity;
    } else if (type === 'adjustment') {
      // If adjustment, quantity is the new absolute value (optional, or treat as diff)
      // Let's treat adjustment as absolute value for simplicity, or difference
      // But typically adjustment means "set to X". 
      // However, to keep it simple with signed quantity, let's assume:
      // adjustment with positive quantity = add, negative = remove.
      // But standard UI usually has "Stock In" and "Stock Out".
      // Let's stick to: 'in' adds, 'out' subtracts.
      // 'adjustment' might be used for corrections. Let's say it adds (can be negative).
      newStock += quantity;
    }

    if (newStock < 0) {
      throw new Error('Insufficient stock');
    }

    // 3. Update product stock
    await updateDoc(productRef, {
      stock: newStock,
      updatedAt: serverTimestamp()
    });

    // 4. Create inventory log
    await addDoc(collection(db, 'inventory_logs'), {
      productId,
      productName,
      type,
      quantity,
      reason,
      userId,
      createdAt: serverTimestamp()
    });

    return true;
  } catch (error) {
    console.error('Error adjusting stock:', error);
    throw error;
  }
};
