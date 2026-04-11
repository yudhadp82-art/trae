import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, increment, addDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../api/firebase';
import type { CartItem, Customer, Sale, SavingsAccount } from '../types';
// Force Vercel Rebuild Trigger
import { Search, Calendar, CheckCircle, Clock, FileText, User, TrendingUp, Download, Wallet, ShoppingBag, X, ChevronDown, ChevronRight, Edit, Trash2, Printer, Package, BookOpen } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAppFeedback } from '../components/useAppFeedback';

type SaleWithPayment = Sale & { amountPaid?: number };
type DebtPayment = {
  id: string;
  amount?: number;
  createdAt?: Date;
  customerId?: string;
  customerName?: string;
  saleId?: string;
  remainingDebtOnTransaction?: number;
};
type MemberPurchaseItem = {
  id: string;
  saleId: string;
  date: Date;
  memberName: string;
  memberId: string;
  itemName: string;
  quantity: number;
  total: number;
  margin: number;
};
type JsPdfWithAutoTable = jsPDF & {
  lastAutoTable?: {
    finalY: number;
  };
};

function getAmountPaid(sale: SaleWithPayment | null): number {
  return sale?.amountPaid || 0;
}

export default function Reports() {
  const { notify, confirm } = useAppFeedback();
  const [activeTab, setActiveTab] = useState<'sales' | 'debts' | 'profit' | 'savings' | 'member_purchases' | 'product_sales' | 'financial_statement'>('sales');
  const [sales, setSales] = useState<Sale[]>([]);
  const [debts, setDebts] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [savingsAccounts, setSavingsAccounts] = useState<SavingsAccount[]>([]);
  const [debtPayments, setDebtPayments] = useState<DebtPayment[]>([]); 
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Expandable state for member purchases
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set());

  const toggleMemberExpand = (memberId: string) => {
    const newSet = new Set(expandedMembers);
    if (newSet.has(memberId)) {
      newSet.delete(memberId);
    } else {
      newSet.add(memberId);
    }
    setExpandedMembers(newSet);
  };

  // Modal State for Partial Payment
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedDebtSale, setSelectedDebtSale] = useState<SaleWithPayment | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [processingPayment, setProcessingPayment] = useState(false);

  // Edit Transaction State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [editedCustomerName, setEditedCustomerName] = useState('');
  const [editedPaymentMethod, setEditedPaymentMethod] = useState<'cash' | 'debt'>('cash');
  const [editedPaymentStatus, setEditedPaymentStatus] = useState<'paid' | 'pending'>('paid');
  const [editedItems, setEditedItems] = useState<CartItem[]>([]);
  const [processingEdit, setProcessingEdit] = useState(false);

  // Fetch Data
  useEffect(() => {
    const qSales = query(collection(db, 'sales'), orderBy('createdAt', 'desc'));
    const unsubscribeSales = onSnapshot(qSales, (snapshot) => {
      const salesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()
      })) as Sale[];
      
      setSales(salesData);
      setDebts(salesData.filter(sale => sale.paymentStatus === 'pending'));
    });

    // Fetch Debt Payments
    const qDebtPayments = query(collection(db, 'debt_payments'), orderBy('createdAt', 'desc'));
    const unsubscribeDebtPayments = onSnapshot(qDebtPayments, (snapshot) => {
      const payments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()
      }));
      setDebtPayments(payments);
    });

    const qCustomers = query(collection(db, 'customers'), orderBy('name'));
    const unsubscribeCustomers = onSnapshot(qCustomers, (snapshot) => {
      const customersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        joinDate: doc.data().joinDate?.toDate(),
        createdAt: doc.data().createdAt?.toDate()
      })) as Customer[];
      setCustomers(customersData);
    });

    const qSavings = query(collection(db, 'savings_accounts'));
    const unsubscribeSavings = onSnapshot(qSavings, (snapshot) => {
      const savingsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SavingsAccount[];
      setSavingsAccounts(savingsData);
    });

    return () => {
      unsubscribeSales();
      unsubscribeCustomers();
      unsubscribeSavings();
      unsubscribeDebtPayments();
    };
  }, []);

  const openPaymentModal = (sale: Sale) => {
    setSelectedDebtSale(sale);
    // Suggest full remaining amount, or 0
    // Since we don't track partial payment per transaction explicitly in sale object yet (we only have paymentStatus 'pending'/'paid'),
    // we assume full amount is due. If you want to track partial, we need 'amountPaid' field in Sale.
    // For now, let's assume 'totalAmount' is the debt.
    // If we want to support partial payments that reduce the debt of a specific transaction, 
    // we should ideally add 'amountPaid' to the sale document.
    // Let's implement robust partial payment:
    // 1. Check if sale has 'amountPaid'. If not, 0.
    // 2. Remaining = totalAmount - amountPaid.
    const paid = getAmountPaid(sale);
    const remaining = (sale.totalAmount || 0) - paid;
    setPaymentAmount(remaining.toString());
    setIsPaymentModalOpen(true);
  };

  const handleDebtPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDebtSale || !paymentAmount) return;

    const amount = Number(paymentAmount);
    if (amount <= 0) {
      notify({
        title: 'Jumlah pembayaran tidak valid',
        description: 'Masukkan nominal yang lebih dari 0.',
        tone: 'error',
      });
      return;
    }

    const currentPaid = getAmountPaid(selectedDebtSale);
    const total = selectedDebtSale.totalAmount || 0;
    const remaining = total - currentPaid;

    if (amount > remaining) {
      notify({
        title: 'Nominal melebihi sisa hutang',
        description: `Sisa hutang saat ini Rp ${remaining.toLocaleString()}.`,
        tone: 'error',
      });
      return;
    }

    setProcessingPayment(true);
    try {
      const saleRef = doc(db, 'sales', selectedDebtSale.id);
      
      // 1. Update Sale Document
      const newPaid = currentPaid + amount;
      const isPaidOff = newPaid >= total;
      
      await updateDoc(saleRef, {
        amountPaid: newPaid,
        paymentStatus: isPaidOff ? 'paid' : 'pending', // Only mark 'paid' if fully paid
        updatedAt: serverTimestamp()
      });

      // 2. Update Customer Debt Balance (Global)
      if (selectedDebtSale.customerId) {
        const customerRef = doc(db, 'customers', selectedDebtSale.customerId);
        await updateDoc(customerRef, {
          debt: increment(-amount)
        });
      }

      // 3. Record Payment History
      await addDoc(collection(db, 'debt_payments'), {
        saleId: selectedDebtSale.id,
        customerId: selectedDebtSale.customerId,
        customerName: selectedDebtSale.customerName,
        amount: amount,
        remainingDebtOnTransaction: total - newPaid,
        cashierId: 'admin', // Replace with auth user if available
        createdAt: serverTimestamp(),
        note: `Angsuran Transaksi #${selectedDebtSale.id.slice(0,8)}`
      });

      notify({
        title: 'Pembayaran berhasil dicatat',
        description: 'Riwayat angsuran dan saldo hutang sudah diperbarui.',
        tone: 'success',
      });
      setIsPaymentModalOpen(false);
      setSelectedDebtSale(null);
      setPaymentAmount('');
    } catch (error) {
      console.error('Error processing debt payment:', error);
      notify({
        title: 'Pembayaran gagal diproses',
        description: 'Coba ulangi pencatatan angsuran.',
        tone: 'error',
      });
    } finally {
      setProcessingPayment(false);
    }
  };

  // Delete Transaction
  const handleDeleteSale = async (sale: Sale) => {
    const confirmed = await confirm({
      title: `Hapus transaksi #${sale.id.slice(0, 8)}?`,
      description: 'Stok akan dikembalikan dan data transaksi tidak dapat dipulihkan.',
      confirmLabel: 'Hapus transaksi',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      // 1. Restore Stock
      if (sale.items) {
        for (const item of sale.items) {
          const productRef = doc(db, 'products', item.productId);
          await updateDoc(productRef, {
            stock: increment(item.quantity),
            updatedAt: serverTimestamp()
          });

          // Log inventory restore
          await addDoc(collection(db, 'inventory_logs'), {
            productId: item.productId,
            productName: item.name,
            type: 'in',
            quantity: item.quantity,
            reason: `Hapus Transaksi #${sale.id.slice(0, 8)}`,
            userId: 'admin',
            createdAt: serverTimestamp()
          });
        }
      }

      // 2. Revert Customer Debt/Spending (if applicable)
      if (sale.customerId) {
        const customerRef = doc(db, 'customers', sale.customerId);
        
        let debtChange = 0;
        if (sale.paymentStatus === 'pending') {
            debtChange = -((sale.totalAmount || 0) - getAmountPaid(sale));
        }

        await updateDoc(customerRef, {
          totalSpent: increment(-(sale.totalAmount || 0)),
          debt: increment(debtChange)
        });
      }

      // 3. Delete Sale Document
      // Instead of deleting, it's safer to mark as 'void' or 'deleted', but user asked to delete.
      // Let's delete for now as per request, or deleteDoc.
      // Ideally move to 'deleted_sales' collection, but deleteDoc is direct.
      // const { deleteDoc } = await import('firebase/firestore'); // Removed dynamic import
      await deleteDoc(doc(db, 'sales', sale.id));

      notify({
        title: 'Transaksi berhasil dihapus',
        description: 'Stok dan data pelanggan terkait sudah disesuaikan.',
        tone: 'success',
      });
    } catch (error) {
      console.error('Error deleting transaction:', error);
      notify({
        title: 'Transaksi gagal dihapus',
        description: 'Coba ulangi proses penghapusan.',
        tone: 'error',
      });
    }
  };

  const openEditModal = (sale: Sale) => {
    setEditingSale(sale);
    setEditedCustomerName(sale.customerName || '');
    setEditedPaymentMethod(sale.paymentMethod);
    setEditedPaymentStatus(sale.paymentStatus);
    setEditedItems(sale.items ? sale.items.map(i => ({...i})) : []);
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSale) return;

    // Calculate new total
    const newTotal = editedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const oldTotal = editingSale.totalAmount || 0;

    setProcessingEdit(true);
    try {
      const saleRef = doc(db, 'sales', editingSale.id);

      // 1. Update Stock
      const stockUpdates = new Map<string, number>(); // productId -> change (positive = add to stock/return, negative = remove/sold)
      const productNames = new Map<string, string>();

      // Process original items (removing them conceptually adds to stock)
      editingSale.items.forEach(item => {
        stockUpdates.set(item.productId, (stockUpdates.get(item.productId) || 0) + item.quantity);
        productNames.set(item.productId, item.name);
      });

      // Process new items (adding them conceptually removes from stock)
      editedItems.forEach(item => {
        stockUpdates.set(item.productId, (stockUpdates.get(item.productId) || 0) - item.quantity);
        productNames.set(item.productId, item.name);
      });

      // Apply updates
      for (const [productId, change] of stockUpdates.entries()) {
        if (change !== 0) {
            const productRef = doc(db, 'products', productId);
            await updateDoc(productRef, {
                stock: increment(change),
                updatedAt: serverTimestamp()
            });
            
            // Log inventory change
            await addDoc(collection(db, 'inventory_logs'), {
                productId,
                productName: productNames.get(productId) || 'Unknown Product',
                type: change > 0 ? 'in' : 'out',
                quantity: Math.abs(change),
                reason: `Edit Transaksi #${editingSale.id.slice(0, 8)}`,
                userId: 'admin',
                createdAt: serverTimestamp()
            });
        }
      }

      // 2. Update Customer Data (if applicable)
      if (editingSale.customerId) {
        const customerRef = doc(db, 'customers', editingSale.customerId);
        
        // Handle Total Spent
        const spendingDiff = newTotal - oldTotal;
        
        // Handle Debt
        let debtChange = 0;
        const oldStatus = editingSale.paymentStatus;
        const newStatus = editedPaymentStatus;

        // Calculate debt impact
        if (oldStatus === 'paid' && newStatus === 'pending') {
            debtChange = newTotal;
        } else if (oldStatus === 'pending' && newStatus === 'paid') {
            // If it was pending, we remove the OLD debt amount.
            // Wait, if we edit the amount too, we remove the OLD amount from debt.
            debtChange = -oldTotal;
        } else if (oldStatus === 'pending' && newStatus === 'pending') {
            debtChange = newTotal - oldTotal;
        } else if (oldStatus === 'paid' && newStatus === 'paid') {
            debtChange = 0;
        }

        await updateDoc(customerRef, {
            totalSpent: increment(spendingDiff),
            debt: increment(debtChange)
        });
      }

      // 3. Update Sale Document
      await updateDoc(saleRef, {
        customerName: editedCustomerName,
        paymentMethod: editedPaymentMethod,
        paymentStatus: editedPaymentStatus,
        items: editedItems,
        totalAmount: newTotal,
        updatedAt: serverTimestamp()
      });

      notify({
        title: 'Transaksi berhasil diperbarui',
        description: 'Perubahan item, pembayaran, dan stok sudah tersimpan.',
        tone: 'success',
      });
      setIsEditModalOpen(false);
      setEditingSale(null);
    } catch (error) {
      console.error('Error updating transaction:', error);
      notify({
        title: 'Transaksi gagal diperbarui',
        description: 'Periksa perubahan data lalu coba lagi.',
        tone: 'error',
      });
    } finally {
      setProcessingEdit(false);
    }
  };

  const filteredSales = sales.filter(sale => {
    const matchesSearch = sale.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sale.customerName?.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!startDate && !endDate) return matchesSearch;

    const saleDate = sale.createdAt ? new Date(sale.createdAt) : new Date(0);
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();
    // Set end date to end of day
    end.setHours(23, 59, 59, 999);

    return matchesSearch && saleDate >= start && saleDate <= end;
  });

  const filteredDebts = debts.filter(sale => {
    const matchesSearch = sale.customerName?.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!startDate && !endDate) return matchesSearch;

    const saleDate = sale.createdAt ? new Date(sale.createdAt) : new Date(0);
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    return matchesSearch && saleDate >= start && saleDate <= end;
  });

  // Merge customer and savings data for savings report
  const savingsReportData = customers.map(customer => {
    const account = savingsAccounts.find(acc => acc.customerId === customer.id);
    return {
      ...customer,
      balancePokok: account?.balancePokok || 0,
      balanceWajib: account?.balanceWajib || 0,
      balanceSukarela: account?.balanceSukarela || 0,
      totalSavings: (account?.balancePokok || 0) + (account?.balanceWajib || 0) + (account?.balanceSukarela || 0)
    };
  }).filter(data => 
    data.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    data.memberId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Prepare Product Sales Data (Aggregated)
  const productSalesRaw = sales
    .filter(sale => {
        if (!startDate && !endDate) return true;
        const saleDate = sale.createdAt ? new Date(sale.createdAt) : new Date(0);
        const start = startDate ? new Date(startDate) : new Date(0);
        const end = endDate ? new Date(endDate) : new Date();
        end.setHours(23, 59, 59, 999);
        return saleDate >= start && saleDate <= end;
    })
    .flatMap(sale => 
      (sale.items || []).map(item => ({
        id: item.productId,
        name: item.name,
        quantity: item.quantity,
        total: (item.price || 0) * (item.quantity || 0),
        margin: ((item.price || 0) - (item.costPrice || 0)) * (item.quantity || 0)
      }))
    );

  // Group by product
  const productSalesGrouped = productSalesRaw.reduce((acc, curr) => {
    if (!acc[curr.id]) {
        acc[curr.id] = {
            id: curr.id,
            name: curr.name,
            quantity: 0,
            total: 0,
            margin: 0
        };
    }
    acc[curr.id].quantity += curr.quantity;
    acc[curr.id].total += curr.total;
    acc[curr.id].margin += curr.margin;
    return acc;
  }, {} as Record<string, { id: string, name: string, quantity: number, total: number, margin: number }>);

  const productSalesList = Object.values(productSalesGrouped)
    .filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => b.quantity - a.quantity); // Sort by quantity sold desc

  // Prepare Member Purchases Data (Aggregated)
  const memberPurchasesRaw = sales
    .filter(sale => sale.customerId) // Only transactions with a customerId (members)
    .filter(sale => {
        if (!startDate && !endDate) return true;
        const saleDate = sale.createdAt ? new Date(sale.createdAt) : new Date(0);
        const start = startDate ? new Date(startDate) : new Date(0);
        const end = endDate ? new Date(endDate) : new Date();
        end.setHours(23, 59, 59, 999);
        return saleDate >= start && saleDate <= end;
    })
    .flatMap(sale => 
      (sale.items || []).map(item => ({
        id: `${sale.id}-${item.productId}`, // Unique ID for key
        saleId: sale.id,
        date: sale.createdAt,
        memberName: sale.customerName || 'Unknown',
        memberId: sale.customerId!,
        itemName: item.name,
        quantity: item.quantity,
        total: (item.price || 0) * (item.quantity || 0),
        margin: ((item.price || 0) - (item.costPrice || 0)) * (item.quantity || 0)
      }))
    )
    .filter(item => 
      item.memberName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.itemName.toLowerCase().includes(searchTerm.toLowerCase())
    );

  // Group by member
  const memberPurchasesGrouped = memberPurchasesRaw.reduce((acc, curr) => {
    if (!acc[curr.memberId]) {
        acc[curr.memberId] = {
            memberId: curr.memberId,
            memberName: curr.memberName,
            totalSpent: 0,
            items: []
        };
    }
    acc[curr.memberId].totalSpent += curr.total;
    acc[curr.memberId].items.push(curr);
    return acc;
  }, {} as Record<string, { memberId: string, memberName: string, totalSpent: number, items: MemberPurchaseItem[] }>);

  const memberPurchasesList = Object.values(memberPurchasesGrouped);

  const totalRevenue = sales.filter(s => s.paymentStatus === 'paid').reduce((acc, sale) => acc + (sale.totalAmount || 0), 0) +
                       debtPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
  
  const totalDebt = customers.reduce((acc, c) => acc + (c.debt || 0), 0);
  
  // Calculate Profit
  const calculateProfit = (sale: Sale) => {
    if (!sale.items) return 0;
    return sale.items.reduce((acc, item) => {
      const cost = item.costPrice || 0;
      return acc + (((item.price || 0) - cost) * (item.quantity || 0));
    }, 0);
  };

  const totalProfit = sales.reduce((acc, sale) => acc + calculateProfit(sale), 0);
  const totalSavingsAll = savingsAccounts.reduce((acc, curr) => acc + (curr.balancePokok || 0) + (curr.balanceWajib || 0) + (curr.balanceSukarela || 0), 0);

  // Financial Statement Calculation (SAK EP Simple Version)
  const financialData = {
    incomeStatement: {
      revenue: totalRevenue,
      cogs: sales.reduce((acc, sale) => {
        const saleCost = (sale.items || []).reduce((s, i) => s + ((i.costPrice || 0) * (i.quantity || 0)), 0);
        return acc + saleCost;
      }, 0),
      grossProfit: totalProfit,
      expenses: 0, // Placeholder for operating expenses (not tracked yet)
      netProfit: totalProfit, // Assuming no expenses for now
    },
    balanceSheet: {
      assets: {
        current: {
          cash: totalRevenue - totalDebt, // Cash on hand from sales
          receivables: totalDebt, // Debt from customers
          inventory: 0 // Ideally this should be fetched from total product value (need to pass products or fetch here)
        }
      },
      liabilities: {
        savings: totalSavingsAll // Savings as liability to members
      },
      equity: {
        retainedEarnings: totalProfit
      }
    }
  };

  const exportToExcel = () => {
    let dataToExport;
    let sheetName;

    if (activeTab === 'savings') {
      dataToExport = savingsReportData.map(data => ({
        'ID Anggota': data.memberId,
        'Nama': data.name,
        'Tanggal Bergabung': data.joinDate ? new Date(data.joinDate).toLocaleDateString() : '-',
        'Simpanan Pokok': data.balancePokok,
        'Simpanan Wajib': data.balanceWajib,
        'Simpanan Sukarela': data.balanceSukarela,
        'Total Simpanan': data.totalSavings
      }));
      sheetName = "Laporan Simpanan";
    } else if (activeTab === 'financial_statement') {
        // Financial Statement Export
        dataToExport = [
            { 'Kategori': 'LAPORAN LABA RUGI', 'Akun': '', 'Nilai': '' },
            { 'Kategori': '', 'Akun': 'Pendapatan Usaha', 'Nilai': financialData.incomeStatement.revenue },
            { 'Kategori': '', 'Akun': 'Beban Pokok Penjualan', 'Nilai': financialData.incomeStatement.cogs },
            { 'Kategori': '', 'Akun': 'Laba Kotor', 'Nilai': financialData.incomeStatement.grossProfit },
            { 'Kategori': '', 'Akun': 'Beban Operasional', 'Nilai': financialData.incomeStatement.expenses },
            { 'Kategori': '', 'Akun': 'Laba Bersih', 'Nilai': financialData.incomeStatement.netProfit },
            { 'Kategori': '', 'Akun': '', 'Nilai': '' },
            { 'Kategori': 'LAPORAN POSISI KEUANGAN (NERACA)', 'Akun': '', 'Nilai': '' },
            { 'Kategori': 'ASET', 'Akun': '', 'Nilai': '' },
            { 'Kategori': '', 'Akun': 'Kas dan Setara Kas', 'Nilai': financialData.balanceSheet.assets.current.cash },
            { 'Kategori': '', 'Akun': 'Piutang Usaha', 'Nilai': financialData.balanceSheet.assets.current.receivables },
            { 'Kategori': 'LIABILITAS', 'Akun': '', 'Nilai': '' },
            { 'Kategori': '', 'Akun': 'Simpanan Anggota', 'Nilai': financialData.balanceSheet.liabilities.savings },
            { 'Kategori': 'EKUITAS', 'Akun': '', 'Nilai': '' },
            { 'Kategori': '', 'Akun': 'Saldo Laba', 'Nilai': financialData.balanceSheet.equity.retainedEarnings }
        ];
        sheetName = "Laporan Keuangan SAK EP";
    } else if (activeTab === 'member_purchases') {
      // For Excel export, we can flatten the data or just show summary. Let's flatten.
      dataToExport = memberPurchasesRaw.map(data => ({
        'Tanggal Pembelian': data.date ? new Date(data.date).toLocaleDateString() : '-',
        'Nama Anggota': data.memberName,
        'Nama Barang': data.itemName,
        'Jumlah': data.quantity,
        'Total': data.total,
        'Margin Pembelian': data.margin
      }));
      sheetName = "Laporan Pembelian Anggota";
    } else if (activeTab === 'product_sales') {
      dataToExport = productSalesList.map(data => ({
        'Nama Barang': data.name,
        'Terjual': data.quantity,
        'Total Pendapatan': data.total,
        'Total Margin': data.margin
      }));
      sheetName = "Laporan Penjualan Produk";
    } else {
      dataToExport = (activeTab === 'sales' || activeTab === 'profit' ? filteredSales : filteredDebts).map(sale => ({
        'ID Transaksi': sale.id,
        'Tanggal': sale.createdAt ? new Date(sale.createdAt).toLocaleDateString('en-GB') : '-',
        'Pelanggan': sale.customerName || 'Umum',
        'Total': sale.totalAmount,
        'Metode': sale.paymentMethod,
        'Status': sale.paymentStatus,
        'Laba (Estimasi)': activeTab === 'profit' ? calculateProfit(sale) : '-',
        'Item': sale.items?.map(i => `${i.name} (x${i.quantity})`).join(', ')
      }));
      sheetName = "Laporan Transaksi";
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `Laporan_${activeTab}_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF() as JsPdfWithAutoTable;
    const title = activeTab === 'sales' ? 'Laporan Penjualan' : 
                  activeTab === 'debts' ? 'Laporan Hutang' : 
                  activeTab === 'profit' ? 'Laporan Laba' : 
                  activeTab === 'product_sales' ? 'Laporan Penjualan Produk' :
                  activeTab === 'savings' ? 'Laporan Simpanan' : 'Laporan Pembelian Anggota';
    
    doc.setFontSize(18);
    doc.text(title, 14, 22);
    doc.setFontSize(10);
    doc.text(`Dicetak pada: ${new Date().toLocaleString('en-GB')}`, 14, 30);
    if (startDate || endDate) {
        const startStr = startDate ? new Date(startDate).toLocaleDateString('en-GB') : 'Awal';
        const endStr = endDate ? new Date(endDate).toLocaleDateString('en-GB') : 'Akhir';
        doc.text(`Periode: ${startStr} - ${endStr}`, 14, 36);
    }

    if (activeTab === 'savings') {
      const tableData = savingsReportData.map(data => [
        data.memberId,
        data.name,
        data.joinDate ? new Date(data.joinDate).toLocaleDateString('en-GB') : '-',
        `Rp ${data.balancePokok.toLocaleString()}`,
        `Rp ${data.balanceWajib.toLocaleString()}`,
        `Rp ${data.balanceSukarela.toLocaleString()}`,
        `Rp ${data.totalSavings.toLocaleString()}`
      ]);

      autoTable(doc, {
        head: [['ID', 'Nama', 'Tgl Gabung', 'Pokok', 'Wajib', 'Sukarela', 'Total']],
        body: tableData,
        startY: startDate || endDate ? 42 : 40,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [16, 185, 129] }
      });
    } else if (activeTab === 'member_purchases') {
        const tableData = memberPurchasesRaw.map(data => [
            data.date ? new Date(data.date).toLocaleDateString('en-GB') : '-',
            data.memberName,
            data.itemName,
            data.quantity,
            `Rp ${data.total.toLocaleString()}`,
            `Rp ${data.margin.toLocaleString()}`
        ]);

        autoTable(doc, {
            head: [['Tanggal', 'Anggota', 'Barang', 'Qty', 'Total', 'Margin']],
            body: tableData,
            startY: startDate || endDate ? 42 : 40,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [13, 148, 136] }
        });
    } else if (activeTab === 'product_sales') {
        const tableData = productSalesList.map(data => [
            data.name,
            data.quantity,
            `Rp ${data.total.toLocaleString()}`,
            `Rp ${data.margin.toLocaleString()}`
        ]);

        autoTable(doc, {
            head: [['Nama Barang', 'Terjual', 'Total Pendapatan', 'Total Margin']],
            body: tableData,
            startY: startDate || endDate ? 42 : 40,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [59, 130, 246] } // Blue
        });
    } else if (activeTab === 'financial_statement') {
        // Financial Statement PDF
        doc.setFontSize(14);
        doc.text('Laporan Laba Rugi', 14, 45);
        
        autoTable(doc, {
            body: [
                ['Pendapatan Usaha', `Rp ${financialData.incomeStatement.revenue.toLocaleString()}`],
                ['Beban Pokok Penjualan', `(Rp ${financialData.incomeStatement.cogs.toLocaleString()})`],
                ['Laba Kotor', `Rp ${financialData.incomeStatement.grossProfit.toLocaleString()}`],
                ['Beban Operasional', `(Rp ${financialData.incomeStatement.expenses.toLocaleString()})`],
                ['Laba Bersih', `Rp ${financialData.incomeStatement.netProfit.toLocaleString()}`]
            ],
            startY: 50,
            styles: { fontSize: 10 },
            theme: 'plain',
            columnStyles: {
                0: { cellWidth: 100 },
                1: { cellWidth: 50, halign: 'right', fontStyle: 'bold' }
            }
        });

        const nextY = (doc.lastAutoTable?.finalY || 50) + 20;
        doc.setFontSize(14);
        doc.text('Laporan Posisi Keuangan (Neraca)', 14, nextY);

        autoTable(doc, {
            body: [
                [{ content: 'ASET', styles: { fontStyle: 'bold' } }, ''],
                ['Aset Lancar', ''],
                ['  Kas dan Setara Kas', `Rp ${financialData.balanceSheet.assets.current.cash.toLocaleString()}`],
                ['  Piutang Usaha', `Rp ${financialData.balanceSheet.assets.current.receivables.toLocaleString()}`],
                ['Total Aset', `Rp ${(financialData.balanceSheet.assets.current.cash + financialData.balanceSheet.assets.current.receivables).toLocaleString()}`],
                ['', ''],
                [{ content: 'LIABILITAS DAN EKUITAS', styles: { fontStyle: 'bold' } }, ''],
                ['Liabilitas', ''],
                ['  Simpanan Anggota', `Rp ${financialData.balanceSheet.liabilities.savings.toLocaleString()}`],
                ['Ekuitas', ''],
                ['  Saldo Laba', `Rp ${financialData.balanceSheet.equity.retainedEarnings.toLocaleString()}`],
                ['Total Liabilitas dan Ekuitas', `Rp ${(financialData.balanceSheet.liabilities.savings + financialData.balanceSheet.equity.retainedEarnings).toLocaleString()}`]
            ],
            startY: nextY + 5,
            styles: { fontSize: 10 },
            theme: 'plain',
            columnStyles: {
                0: { cellWidth: 100 },
                1: { cellWidth: 50, halign: 'right' }
            },
            didParseCell: (data) => {
                if (data.row.raw[0] === 'Total Aset' || (typeof data.row.raw[0] === 'string' && data.row.raw[0].includes('Total Liabilitas'))) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = [240, 240, 240];
                }
            }
        });
    } else {
      // Sales, Debts, Profit
      const data = activeTab === 'sales' || activeTab === 'profit' ? filteredSales : filteredDebts;
      
      const tableData = data.map(sale => [
        sale.createdAt ? new Date(sale.createdAt).toLocaleDateString('en-GB') : '-',
        sale.id.slice(0, 8),
        sale.customerName || 'Umum',
        `Rp ${sale.totalAmount.toLocaleString()}`,
        sale.paymentMethod === 'debt' ? 'HUTANG' : 'CASH',
        sale.paymentStatus === 'paid' ? 'LUNAS' : 'BELUM',
        activeTab === 'profit' ? `Rp ${calculateProfit(sale).toLocaleString()}` : (sale.items?.map(i => `${i.name} (x${i.quantity})`).join(', ') || '-')
      ]);

      autoTable(doc, {
        head: [['Tanggal', 'ID', 'Pelanggan', 'Total', 'Metode', 'Status', activeTab === 'profit' ? 'Laba' : 'Item']],
        body: tableData,
        startY: startDate || endDate ? 42 : 40,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [16, 185, 129] },
        didParseCell: (data) => {
            // Check if column index is 4 (Metode) and value is 'HUTANG'
            if (data.section === 'body' && data.column.index === 4 && data.cell.raw === 'HUTANG') {
                data.cell.styles.textColor = [220, 38, 38]; // Red color for Debt
                data.cell.styles.fontStyle = 'bold';
            }
        }
      });

      // Summary for Sales Report
      if (activeTab === 'sales') {
          const totalTransactions = data.length;
          const totalAmount = data.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
          const totalDebt = data.filter(s => s.paymentMethod === 'debt').reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
          const totalCash = totalAmount - totalDebt;
          const totalItems = data.reduce((sum, sale) => sum + (sale.items?.reduce((s, i) => s + i.quantity, 0) || 0), 0);
          const totalMargin = data.reduce((sum, sale) => sum + calculateProfit(sale), 0);

          let finalY = (doc.lastAutoTable?.finalY || 40) + 10;
          const pageHeight = doc.internal.pageSize.height;
          
          // Check if there is enough space for the summary (approx 50 units)
          if (finalY + 50 > pageHeight) {
            doc.addPage();
            finalY = 20;
          }
          
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.text('Rekapitulasi Penjualan:', 14, finalY);
          
          doc.setFont('helvetica', 'normal');
          doc.text(`Total Transaksi: ${totalTransactions}`, 14, finalY + 6);
          doc.text(`Total Barang Terjual: ${totalItems} pcs`, 14, finalY + 12);
          doc.text(`Total Pendapatan: Rp ${totalAmount.toLocaleString()}`, 14, finalY + 18);
          doc.text(`- Cash: Rp ${totalCash.toLocaleString()}`, 20, finalY + 24);
          doc.setTextColor(220, 38, 38); // Red
          doc.text(`- Hutang: Rp ${totalDebt.toLocaleString()}`, 20, finalY + 30);
          doc.setTextColor(0, 0, 0); // Reset black
          doc.text(`Total Margin (Laba Kotor): Rp ${totalMargin.toLocaleString()}`, 14, finalY + 36);

          // Product Summary Breakdown
          let breakdownY = finalY + 46;
          
          // Check if there is enough space for the breakdown title and table header (approx 30 units)
          if (breakdownY + 30 > pageHeight) {
            doc.addPage();
            breakdownY = 20;
          }

          doc.setFont('helvetica', 'bold');
          doc.text('Rincian Barang Terjual:', 14, breakdownY);
          
          const productSummary = data.flatMap(sale => sale.items || []).reduce((acc, item) => {
              if (!acc[item.name]) {
                  acc[item.name] = 0;
              }
              acc[item.name] += item.quantity;
              return acc;
          }, {} as Record<string, number>);

          // Convert to array and sort by quantity desc
          const productSummaryList = Object.entries(productSummary)
              .sort(([, qtyA], [, qtyB]) => qtyB - qtyA)
              .map(([name, qty]) => [name, `${qty} pcs`]);

          autoTable(doc, {
              head: [['Nama Barang', 'Jumlah']],
              body: productSummaryList,
              startY: breakdownY + 4,
              styles: { fontSize: 8 },
              headStyles: { fillColor: [59, 130, 246] }, // Blue header for product breakdown
              theme: 'grid',
              columnStyles: {
                  0: { cellWidth: 100 },
                  1: { cellWidth: 40, halign: 'right' }
              },
              margin: { left: 14 }
          });
      }
    }

    doc.save(`Laporan_${activeTab}_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-white/70 bg-[linear-gradient(135deg,rgba(88,28,135,0.96),rgba(79,70,229,0.9)_48%,rgba(14,165,233,0.8))] px-6 py-7 text-white shadow-[0_24px_80px_rgba(79,70,229,0.2)] md:px-8 md:py-9">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.18),transparent_58%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-indigo-100/75">Insights & Finance</p>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Laporan yang lebih terstruktur</h1>
            <p className="mt-3 max-w-xl text-sm text-indigo-50/84 md:text-base">
              Tinjau penjualan, hutang, margin, simpanan, dan pembelian anggota dari panel analitik yang lebih tenang dan lebih padat informasi.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 md:min-w-[360px]">
            <div className="rounded-2xl border border-white/12 bg-white/10 p-4 backdrop-blur-md">
              <div className="text-[11px] uppercase tracking-[0.2em] text-indigo-100/75">Transaksi</div>
              <div className="mt-2 text-2xl font-bold">{sales.length}</div>
            </div>
            <div className="rounded-2xl border border-white/12 bg-black/10 p-4 backdrop-blur-md">
              <div className="text-[11px] uppercase tracking-[0.2em] text-indigo-100/75">Piutang</div>
              <div className="mt-2 text-2xl font-bold">Rp {totalDebt.toLocaleString()}</div>
            </div>
            <div className="rounded-2xl border border-white/12 bg-white/10 p-4 backdrop-blur-md">
              <div className="text-[11px] uppercase tracking-[0.2em] text-indigo-100/75">Laba</div>
              <div className="mt-2 text-2xl font-bold">Rp {totalProfit.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="section-headline mb-2">Analitik</p>
          <h2 className="text-2xl font-bold text-slate-800">Laporan & Keuangan</h2>
          <p className="text-slate-500 text-sm">Kelola laporan penjualan, piutang, dan simpanan anggota</p>
        </div>
        
        <div className="flex max-w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white/85 p-1.5 shadow-sm backdrop-blur-md">
          <button
            onClick={exportToPDF}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-red-600 transition-colors mr-2 border-r border-slate-100 whitespace-nowrap"
            title="Download PDF"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">PDF</span>
          </button>
          
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-emerald-600 transition-colors mr-2 border-r border-slate-100 whitespace-nowrap"
            title="Download Excel"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Excel</span>
          </button>
          
          <button
            onClick={() => setActiveTab('sales')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'sales'
                ? 'bg-emerald-100 text-emerald-700'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <FileText className="w-4 h-4" />
            Penjualan
          </button>
          <button
            onClick={() => setActiveTab('member_purchases')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'member_purchases'
                ? 'bg-teal-100 text-teal-700'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            Pembelian Anggota
          </button>
          <button
            onClick={() => setActiveTab('product_sales')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'product_sales'
                ? 'bg-blue-100 text-blue-700'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Package className="w-4 h-4" />
            Produk Terlaris
          </button>
          <button
            onClick={() => setActiveTab('debts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'debts'
                ? 'bg-amber-100 text-amber-700'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <User className="w-4 h-4" />
            Hutang
            {debts.length > 0 && (
              <span className="bg-amber-600 text-white text-xs px-1.5 rounded-full ml-1">
                {debts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('savings')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'savings'
                ? 'bg-purple-100 text-purple-700'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Wallet className="w-4 h-4" />
            Simpanan
          </button>
          <button
            onClick={() => setActiveTab('financial_statement')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'financial_statement'
                ? 'bg-indigo-100 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Laporan Keuangan
          </button>
          <button
            onClick={() => setActiveTab('profit')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'profit'
                ? 'bg-blue-100 text-blue-700'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Laba
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="section-shell flex items-center justify-between p-5">
          <div>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">Pendapatan</p>
            <h3 className="text-xl font-bold text-emerald-600">Rp {(totalRevenue || 0).toLocaleString()}</h3>
          </div>
          <div className="p-3 bg-emerald-50 rounded-lg">
            <CheckCircle className="w-5 h-5 text-emerald-500" />
          </div>
        </div>
        <div className="section-shell flex items-center justify-between p-5">
          <div>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">Piutang</p>
            <h3 className="text-xl font-bold text-amber-600">Rp {(totalDebt || 0).toLocaleString()}</h3>
          </div>
          <div className="p-3 bg-amber-50 rounded-lg">
            <Clock className="w-5 h-5 text-amber-500" />
          </div>
        </div>
        <div className="section-shell flex items-center justify-between p-5">
          <div>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">Total Simpanan</p>
            <h3 className="text-xl font-bold text-purple-600">Rp {(totalSavingsAll || 0).toLocaleString()}</h3>
          </div>
          <div className="p-3 bg-purple-50 rounded-lg">
            <Wallet className="w-5 h-5 text-purple-500" />
          </div>
        </div>
        <div className="section-shell flex items-center justify-between p-5">
          <div>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">Laba Kotor</p>
            <h3 className="text-xl font-bold text-blue-600">Rp {(totalProfit || 0).toLocaleString()}</h3>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg">
            <TrendingUp className="w-5 h-5 text-blue-500" />
          </div>
        </div>
      </div>

      {/* Search and Date Filter */}
      <div className="section-shell flex flex-col gap-4 justify-between p-4 md:flex-row">
        <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
            type="text"
            placeholder={activeTab === 'sales' ? "Cari ID Transaksi atau Nama..." : activeTab === 'member_purchases' ? "Cari Anggota atau Barang..." : activeTab === 'product_sales' ? "Cari Nama Barang..." : "Cari Nama Pelanggan..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 pl-10 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
        </div>
        
        <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <span className="text-slate-500 text-sm">Dari:</span>
                <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="outline-none text-slate-700 text-sm"
                />
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <span className="text-slate-500 text-sm">Sampai:</span>
                <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="outline-none text-slate-700 text-sm"
                />
            </div>
            {(startDate || endDate) && (
                <button 
                    onClick={() => { setStartDate(''); setEndDate(''); }}
                    className="text-slate-400 hover:text-red-500"
                    title="Reset Filter Tanggal"
                >
                    <X className="w-5 h-5" />
                </button>
            )}
        </div>
      </div>

      {/* Content Table */}
      <div className="section-shell overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium">
              <tr>
                {activeTab === 'savings' ? (
                  <>
                    <th className="px-6 py-4">ID Anggota</th>
                    <th className="px-6 py-4">Nama</th>
                    <th className="px-6 py-4">Tgl Bergabung</th>
                    <th className="px-6 py-4 text-right">Pokok</th>
                    <th className="px-6 py-4 text-right">Wajib</th>
                    <th className="px-6 py-4 text-right">Sukarela</th>
                    <th className="px-6 py-4 text-right">Total</th>
                  </>
                ) : activeTab === 'member_purchases' ? (
                  <>
                    <th className="px-6 py-4 w-10"></th>
                    <th className="px-6 py-4">ID Anggota</th>
                    <th className="px-6 py-4">Nama Anggota</th>
                    <th className="px-6 py-4 text-right">Total Belanja</th>
                    <th className="px-6 py-4 text-right">Jumlah Transaksi</th>
                  </>
                ) : activeTab === 'product_sales' ? (
                  <>
                    <th className="px-6 py-4">Nama Barang</th>
                    <th className="px-6 py-4 text-center">Terjual</th>
                    <th className="px-6 py-4 text-right">Total Pendapatan</th>
                    <th className="px-6 py-4 text-right">Total Margin</th>
                  </>
                ) : activeTab === 'financial_statement' ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8">
                    <div className="max-w-3xl mx-auto space-y-8">
                        {/* Income Statement */}
                        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
                            <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">Laporan Laba Rugi</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-slate-600">Pendapatan Usaha</span>
                                    <span className="font-medium text-slate-800">Rp {financialData.incomeStatement.revenue.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-600">Beban Pokok Penjualan</span>
                                    <span className="text-red-600">(Rp {financialData.incomeStatement.cogs.toLocaleString()})</span>
                                </div>
                                <div className="flex justify-between pt-2 border-t border-slate-100 font-bold">
                                    <span className="text-slate-800">Laba Kotor</span>
                                    <span className="text-emerald-600">Rp {financialData.incomeStatement.grossProfit.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between pt-2">
                                    <span className="text-slate-600">Beban Operasional</span>
                                    <span className="text-red-600">(Rp {financialData.incomeStatement.expenses.toLocaleString()})</span>
                                </div>
                                <div className="flex justify-between pt-2 border-t border-slate-200 font-bold text-base">
                                    <span className="text-slate-800">Laba Bersih</span>
                                    <span className="text-blue-600">Rp {financialData.incomeStatement.netProfit.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        {/* Balance Sheet */}
                        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
                            <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">Laporan Posisi Keuangan (Neraca)</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Assets */}
                                <div>
                                    <h4 className="font-bold text-slate-700 mb-3 uppercase text-xs tracking-wider">Aset</h4>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-slate-600 pl-2">Kas dan Setara Kas</span>
                                            <span className="font-medium">Rp {financialData.balanceSheet.assets.current.cash.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-600 pl-2">Piutang Usaha</span>
                                            <span className="font-medium">Rp {financialData.balanceSheet.assets.current.receivables.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between pt-2 border-t border-slate-100 font-bold">
                                            <span className="text-slate-800">Total Aset</span>
                                            <span className="text-slate-800">Rp {(financialData.balanceSheet.assets.current.cash + financialData.balanceSheet.assets.current.receivables).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Liabilities & Equity */}
                                <div>
                                    <h4 className="font-bold text-slate-700 mb-3 uppercase text-xs tracking-wider">Liabilitas & Ekuitas</h4>
                                    <div className="space-y-4 text-sm">
                                        <div>
                                            <p className="font-medium text-slate-700 mb-1">Liabilitas</p>
                                            <div className="flex justify-between">
                                                <span className="text-slate-600 pl-2">Simpanan Anggota</span>
                                                <span className="font-medium">Rp {financialData.balanceSheet.liabilities.savings.toLocaleString()}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="font-medium text-slate-700 mb-1">Ekuitas</p>
                                            <div className="flex justify-between">
                                                <span className="text-slate-600 pl-2">Saldo Laba</span>
                                                <span className="font-medium">Rp {financialData.balanceSheet.equity.retainedEarnings.toLocaleString()}</span>
                                            </div>
                                        </div>
                                        <div className="flex justify-between pt-2 border-t border-slate-100 font-bold">
                                            <span className="text-slate-800">Total Liabilitas & Ekuitas</span>
                                            <span className="text-slate-800">Rp {(financialData.balanceSheet.liabilities.savings + financialData.balanceSheet.equity.retainedEarnings).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                  </td>
                </tr>
              ) : (
                  <>
                    <th className="px-6 py-4">Tanggal</th>
                    <th className="px-6 py-4">ID Transaksi</th>
                    <th className="px-6 py-4">Pelanggan</th>
                    <th className="px-6 py-4">Total</th>
                    {activeTab === 'profit' ? (
                      <th className="px-6 py-4">Laba</th>
                    ) : (
                      <>
                        <th className="px-6 py-4">Metode</th>
                        <th className="px-6 py-4">Status</th>
                      </>
                    )}
                    {(activeTab === 'debts' || activeTab === 'sales') && <th className="px-6 py-4 text-right">Aksi</th>}
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeTab === 'savings' ? (
                savingsReportData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                      Tidak ada data simpanan ditemukan.
                    </td>
                  </tr>
                ) : (
                  savingsReportData.map((data) => (
                    <tr key={data.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-slate-500">{data.memberId}</td>
                      <td className="px-6 py-4 font-medium text-slate-800">{data.name}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {data.joinDate ? new Date(data.joinDate).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-blue-600">
                        Rp {data.balancePokok.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-emerald-600">
                        Rp {data.balanceWajib.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-purple-600">
                        Rp {data.balanceSukarela.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-slate-800">
                        Rp {data.totalSavings.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )
              ) : activeTab === 'financial_statement' ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8">
                    <div className="max-w-3xl mx-auto space-y-8">
                        {/* Income Statement */}
                        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
                            <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">Laporan Laba Rugi</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-slate-600">Pendapatan Usaha</span>
                                    <span className="font-medium text-slate-800">Rp {financialData.incomeStatement.revenue.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-600">Beban Pokok Penjualan</span>
                                    <span className="text-red-600">(Rp {financialData.incomeStatement.cogs.toLocaleString()})</span>
                                </div>
                                <div className="flex justify-between pt-2 border-t border-slate-100 font-bold">
                                    <span className="text-slate-800">Laba Kotor</span>
                                    <span className="text-emerald-600">Rp {financialData.incomeStatement.grossProfit.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between pt-2">
                                    <span className="text-slate-600">Beban Operasional</span>
                                    <span className="text-red-600">(Rp {financialData.incomeStatement.expenses.toLocaleString()})</span>
                                </div>
                                <div className="flex justify-between pt-2 border-t border-slate-200 font-bold text-base">
                                    <span className="text-slate-800">Laba Bersih</span>
                                    <span className="text-blue-600">Rp {financialData.incomeStatement.netProfit.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        {/* Balance Sheet */}
                        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
                            <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">Laporan Posisi Keuangan (Neraca)</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Assets */}
                                <div>
                                    <h4 className="font-bold text-slate-700 mb-3 uppercase text-xs tracking-wider">Aset</h4>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-slate-600 pl-2">Kas dan Setara Kas</span>
                                            <span className="font-medium">Rp {financialData.balanceSheet.assets.current.cash.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-600 pl-2">Piutang Usaha</span>
                                            <span className="font-medium">Rp {financialData.balanceSheet.assets.current.receivables.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between pt-2 border-t border-slate-100 font-bold">
                                            <span className="text-slate-800">Total Aset</span>
                                            <span className="text-slate-800">Rp {(financialData.balanceSheet.assets.current.cash + financialData.balanceSheet.assets.current.receivables).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Liabilities & Equity */}
                                <div>
                                    <h4 className="font-bold text-slate-700 mb-3 uppercase text-xs tracking-wider">Liabilitas & Ekuitas</h4>
                                    <div className="space-y-4 text-sm">
                                        <div>
                                            <p className="font-medium text-slate-700 mb-1">Liabilitas</p>
                                            <div className="flex justify-between">
                                                <span className="text-slate-600 pl-2">Simpanan Anggota</span>
                                                <span className="font-medium">Rp {financialData.balanceSheet.liabilities.savings.toLocaleString()}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="font-medium text-slate-700 mb-1">Ekuitas</p>
                                            <div className="flex justify-between">
                                                <span className="text-slate-600 pl-2">Saldo Laba</span>
                                                <span className="font-medium">Rp {financialData.balanceSheet.equity.retainedEarnings.toLocaleString()}</span>
                                            </div>
                                        </div>
                                        <div className="flex justify-between pt-2 border-t border-slate-100 font-bold">
                                            <span className="text-slate-800">Total Liabilitas & Ekuitas</span>
                                            <span className="text-slate-800">Rp {(financialData.balanceSheet.liabilities.savings + financialData.balanceSheet.equity.retainedEarnings).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                  </td>
                </tr>
              ) : activeTab === 'member_purchases' ? (
                memberPurchasesList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      Tidak ada data pembelian anggota ditemukan.
                    </td>
                  </tr>
                ) : (
                  memberPurchasesList.map((data) => (
                    <>
                    <tr key={data.memberId} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => toggleMemberExpand(data.memberId)}>
                      <td className="px-6 py-4 text-slate-400">
                        {expandedMembers.has(data.memberId) ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                      </td>
                      <td className="px-6 py-4 font-mono text-slate-500">{data.memberId}</td>
                      <td className="px-6 py-4 font-medium text-slate-800">{data.memberName}</td>
                      <td className="px-6 py-4 text-right font-bold text-emerald-600">
                        Rp {data.totalSpent.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right text-slate-600">
                        {data.items.length} Item
                      </td>
                    </tr>
                    {expandedMembers.has(data.memberId) && (
                      <tr>
                        <td colSpan={5} className="bg-slate-50 px-6 py-4">
                          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="bg-slate-100 text-slate-600">
                                <tr>
                                  <th className="px-4 py-2 text-left">Tanggal</th>
                                  <th className="px-4 py-2 text-left">Barang</th>
                                  <th className="px-4 py-2 text-right">Qty</th>
                                  <th className="px-4 py-2 text-right">Harga Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {data.items.map((item, idx) => (
                                  <tr key={`${item.id}-${idx}`}>
                                    <td className="px-4 py-2 text-slate-500">
                                      {item.date ? new Date(item.date).toLocaleDateString('en-GB') : '-'}
                                    </td>
                                    <td className="px-4 py-2 text-slate-800">{item.itemName}</td>
                                    <td className="px-4 py-2 text-right text-slate-600">{item.quantity}</td>
                                    <td className="px-4 py-2 text-right font-medium text-emerald-600">
                                      Rp {item.total.toLocaleString()}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                    </>
                  ))
                )
              ) : activeTab === 'product_sales' ? (
                productSalesList.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                      Tidak ada data penjualan produk ditemukan.
                    </td>
                  </tr>
                ) : (
                    productSalesList.map((data) => (
                    <tr key={data.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-800">{data.name}</td>
                      <td className="px-6 py-4 text-center font-bold text-blue-600">{data.quantity}</td>
                      <td className="px-6 py-4 text-right font-medium text-emerald-600">
                        Rp {data.total.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-purple-600">
                        Rp {data.margin.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )
              ) : (
                (activeTab === 'sales' || activeTab === 'profit' ? filteredSales : filteredDebts).map((sale) => (
                  <tr key={sale.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-slate-600">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        {sale.createdAt ? new Date(sale.createdAt).toLocaleDateString('en-GB') : '-'}
                      </div>
                      <div className="text-xs text-slate-400 pl-6">
                        {sale.createdAt ? new Date(sale.createdAt).toLocaleTimeString('en-GB') : ''}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-500">#{sale.id.slice(0, 8)}</td>
                    <td className="px-6 py-4 font-medium text-slate-800">
                      {sale.customerName || '-'}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-800">
                      Rp {(sale.totalAmount || 0).toLocaleString()}
                    </td>
                    {activeTab === 'profit' ? (
                      <td className="px-6 py-4 font-bold text-blue-600">
                        Rp {(calculateProfit(sale) || 0).toLocaleString()}
                      </td>
                    ) : (
                      <>
                        <td className="px-6 py-4 capitalize text-slate-600">
                          {sale.paymentMethod}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                            sale.paymentStatus === 'paid'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {sale.paymentStatus === 'paid' ? 'LUNAS' : 'BELUM LUNAS'}
                          </span>
                        </td>
                      </>
                    )}
                    {(activeTab === 'debts' || activeTab === 'sales') && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {activeTab === 'debts' && (
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-xs text-slate-500">
                                Terbayar: Rp {getAmountPaid(sale).toLocaleString()}
                              </span>
                              <button
                                onClick={() => openPaymentModal(sale)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shadow-sm"
                              >
                                Bayar
                              </button>
                            </div>
                          )}
                          <button 
                            onClick={() => openEditModal(sale)} 
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit Transaksi"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteSale(sale)} 
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Hapus Transaksi"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
              {activeTab !== 'savings' && activeTab !== 'member_purchases' && (activeTab === 'sales' || activeTab === 'profit' ? filteredSales : filteredDebts).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    Tidak ada data transaksi ditemukan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* Debt Payment Modal */}
      {isPaymentModalOpen && selectedDebtSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-800">Pembayaran Angsuran</h3>
              <button 
                onClick={() => setIsPaymentModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleDebtPaymentSubmit} className="p-6 space-y-4">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-500">ID Transaksi</span>
                  <span className="font-mono text-slate-700">#{selectedDebtSale.id.slice(0, 8)}</span>
                </div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-500">Pelanggan</span>
                  <span className="font-medium text-slate-800">{selectedDebtSale.customerName}</span>
                </div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-500">Total Tagihan</span>
                  <span className="font-bold text-slate-800">Rp {(selectedDebtSale.totalAmount || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-slate-200 mt-2">
                  <span className="text-slate-500">Sisa Hutang</span>
                  <span className="font-bold text-red-600">
                    Rp {((selectedDebtSale.totalAmount || 0) - getAmountPaid(selectedDebtSale)).toLocaleString()}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Jumlah Pembayaran</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">Rp</span>
                  <input
                    type="number"
                    required
                    min="1"
                    max={(selectedDebtSale.totalAmount || 0) - getAmountPaid(selectedDebtSale)}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-lg"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="flex-1 py-2 px-4 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={processingPayment}
                  className="flex-1 py-2 px-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  {processingPayment ? 'Memproses...' : 'Simpan Pembayaran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Transaction Modal */}
      {isEditModalOpen && editingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-xl max-h-[90vh] flex flex-col">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-800">Edit Transaksi #{editingSale.id.slice(0, 8)}</h3>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleEditSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nama Pelanggan</label>
                  <input
                    type="text"
                    value={editedCustomerName}
                    onChange={(e) => setEditedCustomerName(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="Nama Pelanggan"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Metode Pembayaran</label>
                  <select
                    value={editedPaymentMethod}
                    onChange={(e) => setEditedPaymentMethod(e.target.value as 'cash' | 'debt')}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="cash">Cash</option>
                    <option value="debt">Hutang</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Status Pembayaran</label>
                  <select
                    value={editedPaymentStatus}
                    onChange={(e) => setEditedPaymentStatus(e.target.value as 'paid' | 'pending')}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="paid">Lunas</option>
                    <option value="pending">Belum Lunas</option>
                  </select>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-slate-800 mb-2">Item Transaksi</h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-4 py-2 text-left">Barang</th>
                        <th className="px-4 py-2 text-right">Harga</th>
                        <th className="px-4 py-2 text-center w-24">Qty</th>
                        <th className="px-4 py-2 text-right">Total</th>
                        <th className="px-4 py-2 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {editedItems.map((item, index) => (
                        <tr key={index}>
                          <td className="px-4 py-2 font-medium text-slate-700">{item.name}</td>
                          <td className="px-4 py-2 text-right text-slate-500">Rp {item.price.toLocaleString()}</td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => {
                                const newQty = parseInt(e.target.value) || 0;
                                if (newQty > 0) {
                                  const newItems = [...editedItems];
                                  newItems[index].quantity = newQty;
                                  setEditedItems(newItems);
                                }
                              }}
                              className="w-full px-2 py-1 border border-slate-200 rounded text-center focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </td>
                          <td className="px-4 py-2 text-right font-medium text-emerald-600">
                            Rp {(item.price * item.quantity).toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                const removeItem = async () => {
                                  const confirmed = await confirm({
                                    title: 'Hapus item ini?',
                                    description: 'Stok akan dikembalikan saat transaksi disimpan.',
                                    confirmLabel: 'Hapus item',
                                    tone: 'danger',
                                  });
                                  if (!confirmed) return;
                                  const newItems = [...editedItems];
                                  newItems.splice(index, 1);
                                  setEditedItems(newItems);
                                };
                                void removeItem();
                              }}
                              className="text-red-400 hover:text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold text-slate-800">
                      <tr>
                        <td colSpan={3} className="px-4 py-2 text-right">Total Baru:</td>
                        <td className="px-4 py-2 text-right text-emerald-600">
                          Rp {editedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0).toLocaleString()}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="text-xs text-amber-600 mt-2">
                  * Mengubah jumlah atau menghapus item akan otomatis menyesuaikan stok barang.
                </p>
              </div>
            </form>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleEditSubmit}
                disabled={processingEdit}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {processingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
