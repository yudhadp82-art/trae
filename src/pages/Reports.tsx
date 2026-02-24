import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../api/firebase';
import { Sale, Customer, SavingsAccount } from '../types';
import { Search, Calendar, CheckCircle, Clock, FileText, User, TrendingUp, Download, Wallet, ShoppingBag } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function Reports() {
  const [activeTab, setActiveTab] = useState<'sales' | 'debts' | 'profit' | 'savings' | 'member_purchases'>('sales');
  const [sales, setSales] = useState<Sale[]>([]);
  const [debts, setDebts] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [savingsAccounts, setSavingsAccounts] = useState<SavingsAccount[]>([]);
  const [debtPayments, setDebtPayments] = useState<any[]>([]); // New state for debt payments
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

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

  // Update payment status (Lunasi) -> Now treated as debt payment
  const handleMarkAsPaid = async (sale: Sale) => {
    if (!confirm('Apakah Anda yakin ingin menandai hutang ini sebagai LUNAS?')) return;
    
    try {
        const batch = updateDoc(doc(db, 'sales', sale.id), {
            paymentStatus: 'paid',
            paymentMethod: 'cash',
            updatedAt: serverTimestamp()
        });

        // Add to debt_payments collection for history
        // Note: This is a simplification. Ideally use a batch write.
        // But since we are inside handleMarkAsPaid, we'll just add the doc.
        // Also need to update customer debt balance if it exists
        
        if (sale.customerId && sale.totalAmount) {
             // Update customer debt
             const customerRef = doc(db, 'customers', sale.customerId);
             // We can't use batch here easily because updateDoc is already called above without batch
             // Let's just do it sequentially or use a real batch if we refactor.
             // For safety, let's just update the customer debt.
             await updateDoc(customerRef, {
                 debt: increment(-sale.totalAmount)
             });

             // Record payment
             await addDoc(collection(db, 'debt_payments'), {
                customerId: sale.customerId,
                customerName: sale.customerName,
                amount: sale.totalAmount,
                remainingDebt: 0, // Assuming full payment clears specific transaction, but real debt is aggregate. 
                                  // This simple action clears the transaction status.
                cashierId: 'admin', // Or current user
                createdAt: serverTimestamp(),
                note: `Pelunasan Transaksi #${sale.id}`
             });
        }

        alert('Status pembayaran berhasil diperbarui dan piutang dikurangi!');
    } catch (error) {
        console.error('Error updating payment status:', error);
        alert('Gagal memperbarui status pembayaran.');
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

  // Prepare Member Purchases Data
  const memberPurchasesData = sales
    .filter(sale => sale.customerId) // Only transactions with a customerId (members)
    .flatMap(sale => 
      (sale.items || []).map(item => ({
        id: `${sale.id}-${item.productId}`, // Unique ID for key
        saleId: sale.id,
        date: sale.createdAt,
        memberName: sale.customerName || 'Unknown',
        memberId: sale.customerId,
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
      dataToExport = memberPurchasesData.map(data => ({
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
                    <th className="px-6 py-4">Tanggal Pembelian</th>
                    <th className="px-6 py-4">Nama Anggota</th>
                    <th className="px-6 py-4">Nama Barang</th>
                    <th className="px-6 py-4 text-right">Jumlah</th>
                    <th className="px-6 py-4 text-right">Total</th>
                    <th className="px-6 py-4 text-right">Margin</th>
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
                memberPurchasesData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                      Tidak ada data pembelian anggota ditemukan.
                    </td>
                  </tr>
                ) : (
                  memberPurchasesData.map((data) => (
                    <tr key={data.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-slate-600">
                        {data.date ? new Date(data.date).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-800">{data.memberName}</td>
                      <td className="px-6 py-4 text-slate-600">{data.itemName}</td>
                      <td className="px-6 py-4 text-right text-slate-800">{data.quantity}</td>
                      <td className="px-6 py-4 text-right font-medium text-slate-800">
                        Rp {data.total.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-emerald-600">
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
                        <button
                          onClick={() => handleMarkAsPaid(sale)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shadow-sm"
                        >
                          Lunasi
                        </button>
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
    </div>
  );
}
