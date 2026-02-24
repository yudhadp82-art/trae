import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, where, doc, updateDoc, serverTimestamp, increment, addDoc } from 'firebase/firestore';
import { db } from '../api/firebase';
import { Sale, Customer, SavingsAccount } from '../types';
import { Search, Calendar, CheckCircle, Clock, FileText, User, TrendingUp, Download, Wallet, ShoppingBag, X, ChevronDown, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function Reports() {
  const [activeTab, setActiveTab] = useState<'sales' | 'debts' | 'profit' | 'savings' | 'member_purchases'>('sales');
  const [sales, setSales] = useState<Sale[]>([]);
  const [debts, setDebts] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [savingsAccounts, setSavingsAccounts] = useState<SavingsAccount[]>([]);
  const [debtPayments, setDebtPayments] = useState<any[]>([]); 
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  
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
  const [selectedDebtSale, setSelectedDebtSale] = useState<Sale | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [processingPayment, setProcessingPayment] = useState(false);

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
      setLoading(false);
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
    const paid = (sale as any).amountPaid || 0;
    const remaining = (sale.totalAmount || 0) - paid;
    setPaymentAmount(remaining.toString());
    setIsPaymentModalOpen(true);
  };

  const handleDebtPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDebtSale || !paymentAmount) return;

    const amount = Number(paymentAmount);
    if (amount <= 0) {
      alert('Jumlah pembayaran harus lebih dari 0');
      return;
    }

    const currentPaid = (selectedDebtSale as any).amountPaid || 0;
    const total = selectedDebtSale.totalAmount || 0;
    const remaining = total - currentPaid;

    if (amount > remaining) {
      alert(`Pembayaran melebihi sisa hutang (Rp ${remaining.toLocaleString()})`);
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

      alert('Pembayaran berhasil dicatat!');
      setIsPaymentModalOpen(false);
      setSelectedDebtSale(null);
      setPaymentAmount('');
    } catch (error) {
      console.error('Error processing debt payment:', error);
      alert('Gagal memproses pembayaran.');
    } finally {
      setProcessingPayment(false);
    }
  };

  const filteredSales = sales.filter(sale => 
    sale.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sale.customerName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredDebts = debts.filter(sale => 
    sale.customerName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  // Prepare Member Purchases Data (Aggregated)
  const memberPurchasesRaw = sales
    .filter(sale => sale.customerId) // Only transactions with a customerId (members)
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
  }, {} as Record<string, { memberId: string, memberName: string, totalSpent: number, items: typeof memberPurchasesRaw }>);

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
    } else {
      dataToExport = (activeTab === 'sales' || activeTab === 'profit' ? filteredSales : filteredDebts).map(sale => ({
        'ID Transaksi': sale.id,
        'Tanggal': sale.createdAt ? new Date(sale.createdAt).toLocaleDateString() : '-',
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Laporan & Keuangan</h1>
          <p className="text-slate-500 text-sm">Kelola laporan penjualan, piutang, dan simpanan anggota</p>
        </div>
        
        <div className="flex bg-white rounded-lg p-1 border border-slate-200 shadow-sm overflow-x-auto max-w-full">
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-emerald-600 transition-colors mr-2 border-r border-slate-100 whitespace-nowrap"
            title="Download Excel"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
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
        <div className="bg-white p-5 rounded-xl border border-emerald-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">Pendapatan</p>
            <h3 className="text-xl font-bold text-emerald-600">Rp {(totalRevenue || 0).toLocaleString()}</h3>
          </div>
          <div className="p-3 bg-emerald-50 rounded-lg">
            <CheckCircle className="w-5 h-5 text-emerald-500" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-amber-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">Piutang</p>
            <h3 className="text-xl font-bold text-amber-600">Rp {(totalDebt || 0).toLocaleString()}</h3>
          </div>
          <div className="p-3 bg-amber-50 rounded-lg">
            <Clock className="w-5 h-5 text-amber-500" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-purple-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">Total Simpanan</p>
            <h3 className="text-xl font-bold text-purple-600">Rp {(totalSavingsAll || 0).toLocaleString()}</h3>
          </div>
          <div className="p-3 bg-purple-50 rounded-lg">
            <Wallet className="w-5 h-5 text-purple-500" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">Laba Kotor</p>
            <h3 className="text-xl font-bold text-blue-600">Rp {(totalProfit || 0).toLocaleString()}</h3>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg">
            <TrendingUp className="w-5 h-5 text-blue-500" />
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder={activeTab === 'sales' ? "Cari ID Transaksi atau Nama..." : activeTab === 'member_purchases' ? "Cari Anggota atau Barang..." : "Cari Nama Pelanggan..."}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
        />
      </div>

      {/* Content Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
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
                    {activeTab === 'debts' && <th className="px-6 py-4 text-right">Aksi</th>}
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
                                      {item.date ? new Date(item.date).toLocaleDateString() : '-'}
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
              ) : (
                (activeTab === 'sales' || activeTab === 'profit' ? filteredSales : filteredDebts).map((sale) => (
                  <tr key={sale.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-slate-600">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        {sale.createdAt ? new Date(sale.createdAt).toLocaleDateString() : '-'}
                      </div>
                      <div className="text-xs text-slate-400 pl-6">
                        {sale.createdAt ? new Date(sale.createdAt).toLocaleTimeString() : ''}
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
                    {activeTab === 'debts' && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs text-slate-500">
                            Terbayar: Rp {((sale as any).amountPaid || 0).toLocaleString()}
                          </span>
                          <button
                            onClick={() => openPaymentModal(sale)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shadow-sm"
                          >
                            Bayar
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
                    Rp {((selectedDebtSale.totalAmount || 0) - ((selectedDebtSale as any).amountPaid || 0)).toLocaleString()}
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
                    max={(selectedDebtSale.totalAmount || 0) - ((selectedDebtSale as any).amountPaid || 0)}
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
    </div>
  );
}
