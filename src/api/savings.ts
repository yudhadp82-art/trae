import { 
  collection, 
  doc, 
  getDocs, 
  query, 
  where, 
  addDoc, 
  updateDoc, 
  serverTimestamp,
  Timestamp,
  orderBy,
  runTransaction
} from 'firebase/firestore';
import { db } from './firebase';
import { SavingsAccount, SavingsTransaction } from '../types';

const SAVINGS_COLLECTION = 'savings_accounts';
const TRANSACTIONS_COLLECTION = 'savings_transactions';

export const getSavingsAccount = async (customerId: string): Promise<SavingsAccount | null> => {
  const q = query(collection(db, SAVINGS_COLLECTION), where('customerId', '==', customerId));
  const querySnapshot = await getDocs(q);
  
  if (querySnapshot.empty) {
    return null;
  }
  
  const doc = querySnapshot.docs[0];
  const data = doc.data();
  
  return {
    id: doc.id,
    ...data,
    createdAt: data.createdAt?.toDate(),
    updatedAt: data.updatedAt?.toDate(),
    lastWajibPayment: data.lastWajibPayment?.toDate(),
  } as SavingsAccount;
};

export const createSavingsAccount = async (customerId: string): Promise<SavingsAccount> => {
  const newAccount = {
    customerId,
    balanceWajib: 0,
    balanceSukarela: 0,
    balancePokok: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  
  const docRef = await addDoc(collection(db, SAVINGS_COLLECTION), newAccount);
  
  return {
    id: docRef.id,
    customerId,
    balanceWajib: 0,
    balanceSukarela: 0,
    balancePokok: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
};

export const processTransaction = async (
  customerId: string, 
  transactionData: Omit<SavingsTransaction, 'id' | 'savingsAccountId' | 'date'>
): Promise<void> => {
  try {
    await runTransaction(db, async (transaction) => {
      // 1. Get or create savings account
      const q = query(collection(db, SAVINGS_COLLECTION), where('customerId', '==', customerId));
      const querySnapshot = await getDocs(q);
      
      let accountRef;
      let currentAccount: any;
      
      if (querySnapshot.empty) {
        // Create new account reference
        accountRef = doc(collection(db, SAVINGS_COLLECTION));
        currentAccount = {
          customerId,
          balanceWajib: 0,
          balanceSukarela: 0,
          balancePokok: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        transaction.set(accountRef, currentAccount);
      } else {
        accountRef = querySnapshot.docs[0].ref;
        currentAccount = querySnapshot.docs[0].data();
      }
      
      // 2. Calculate new balance
      const amount = Number(transactionData.amount);
      const isDeposit = transactionData.type === 'deposit';
      const change = isDeposit ? amount : -amount;
      
      let newBalanceWajib = currentAccount.balanceWajib || 0;
      let newBalanceSukarela = currentAccount.balanceSukarela || 0;
      let newBalancePokok = currentAccount.balancePokok || 0;
      
      if (transactionData.category === 'wajib') {
        newBalanceWajib += change;
      } else if (transactionData.category === 'sukarela') {
        newBalanceSukarela += change;
      } else if (transactionData.category === 'pokok') {
        newBalancePokok += change;
      }
      
      // Check for sufficient funds if withdrawal
      if (!isDeposit) {
        if (transactionData.category === 'wajib' && newBalanceWajib < 0) throw new Error('Insufficient Wajib balance');
        if (transactionData.category === 'sukarela' && newBalanceSukarela < 0) throw new Error('Insufficient Sukarela balance');
        if (transactionData.category === 'pokok' && newBalancePokok < 0) throw new Error('Insufficient Pokok balance');
      }
      
      // 3. Update account
      const updateData: any = {
        balanceWajib: newBalanceWajib,
        balanceSukarela: newBalanceSukarela,
        balancePokok: newBalancePokok,
        updatedAt: serverTimestamp(),
      };

      // Update lastWajibPayment if this is a Wajib deposit
      if (isDeposit && transactionData.category === 'wajib') {
        updateData.lastWajibPayment = serverTimestamp();
      }

      transaction.update(accountRef, updateData);
      
      // 4. Create transaction record
      const transactionRef = doc(collection(db, TRANSACTIONS_COLLECTION));
      transaction.set(transactionRef, {
        ...transactionData,
        savingsAccountId: accountRef.id,
        customerId,
        amount,
        date: serverTimestamp(),
      });
    });
  } catch (e) {
    console.error("Transaction failed: ", e);
    throw e;
  }
};

export const getTransactions = async (customerId: string): Promise<SavingsTransaction[]> => {
  const q = query(
    collection(db, TRANSACTIONS_COLLECTION), 
    where('customerId', '==', customerId),
    orderBy('date', 'desc')
  );
  
  const querySnapshot = await getDocs(q);
  
  return querySnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      date: data.date?.toDate(),
    } as SavingsTransaction;
  });
};
