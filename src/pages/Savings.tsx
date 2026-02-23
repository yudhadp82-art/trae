import { useState, useEffect } from 'react';
import { 
  Search, 
  Wallet, 
  ArrowUpCircle, 
  ArrowDownCircle, 
  History, 
  User, 
  CreditCard,
  Plus,
  Minus,
  Loader
} from 'lucide-react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../api/firebase';
import { Customer, SavingsAccount, SavingsTransaction } from '../types';
import { getSavingsAccount, processTransaction, getTransactions } from '../api/savings';
import { useAuthStore } from '../store/authStore';

export default function Savings() {
  const { user } = useAuthStore();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [savingsAccount, setSavingsAccount] = useState<SavingsAccount | null>(null);
  const [transactions, setTransactions] = useState<SavingsTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAccount, setLoadingAccount] = useState(false);
  
  // Modal states
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<'deposit' | 'withdrawal'>('deposit');
  const [transactionCategory, setTransactionCategory] = useState<'wajib' | 'sukarela' | 'pokok'>('sukarela');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [processing, setProcessing] = useState(false);

  // Fetch Customers
  useEffect(() => {
    const q = query(collection(db, 'customers'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const customersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Customer[];
      setCustomers(customersData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Fetch Savings Data when customer selected
  useEffect(() => {
    if (selectedCustomer) {
      setLoadingAccount(true);
      fetchSavingsData(selectedCustomer.id);
    } else {
      setSavingsAccount(null);
      setTransactions([]);
    }
  }, [selectedCustomer]);

  const fetchSavingsData = async (customerId: string) => {
    try {
      const account = await getSavingsAccount(customerId);
      setSavingsAccount(account);
      const history = await getTransactions(customerId);
      setTransactions(history);
    } catch (error) {
      console.error("Error fetching savings data:", error);
    } finally {
      setLoadingAccount(false);
    }
  };

  const handleTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !user) return;
    
    setProcessing(true);
    try {
      await processTransaction(selectedCustomer.id, {
        customerId: selectedCustomer.id,
        type: transactionType,
        category: transactionCategory,
        amount: Number(amount),
        description: description || `${transactionType === 'deposit' ? 'Setoran' : 'Penarikan'} Simpanan ${transactionCategory}`,
        userId: user.uid
      });
      
      setAmount('');
      setDescription('');
      setIsTransactionModalOpen(false);
      fetchSavingsData(selectedCustomer.id);
      alert('Transaksi berhasil!');
    } catch (error: any) {
      console.error("Transaction error:", error);
      alert(`Gagal memproses transaksi: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const openTransactionModal = (type: 'deposit' | 'withdrawal', category?: 'wajib' | 'sukarela' | 'pokok') => {
    setTransactionType(type);
    
    // Set default category
    const targetCategory = category || 'sukarela';
    setTransactionCategory(targetCategory);
    
    // Set default amounts based on rules
    if (type === 'deposit') {
      if (targetCategory === 'pokok') {
        setAmount('50000');
      } else if (targetCategory === 'wajib') {
        setAmount('10000');
      } else {
        setAmount('');
      }
    } else {
      setAmount('');
    }

    setDescription('');
    setIsTransactionModalOpen(true);
  };

  // Handle category change in modal
  const handleCategoryChange = (category: 'wajib' | 'sukarela' | 'pokok') => {
    setTransactionCategory(category);
    if (transactionType === 'deposit') {
      if (category === 'pokok') {
        setAmount('50000');
      } else if (category === 'wajib') {
        setAmount('10000');
      } else {
        setAmount('');
      }
    } else {
        setAmount('');
    }
  };

  const isPokokLunas = (savingsAccount?.balancePokok || 0) >= 50000;
  
  const isWajibLunasBulanIni = () => {
    if (!savingsAccount?.lastWajibPayment) return false;
    const lastPayment = new Date(savingsAccount.lastWajibPayment);
    const now = new Date();
    return lastPayment.getMonth() === now.getMonth() && lastPayment.getFullYear() === now.getFullYear();
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.memberId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-theme(spacing.24))] gap-6">
      {/* Left Sidebar: Customer List */}
      <div className="w-80 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="font-bold text-slate-800 mb-4">Pilih Anggota</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari anggota..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-slate-500 text-sm">Memuat data...</div>
          ) : filteredCustomers.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Anggota tidak ditemukan</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {filteredCustomers.map(customer => (
                <button
                  key={customer.id}
                  onClick={() => setSelectedCustomer(customer)}
                  className={`w-full p-4 text-left hover:bg-slate-50 transition-colors flex items-center gap-3 ${
                    selectedCustomer?.id === customer.id ? 'bg-emerald-50 border-l-4 border-emerald-500' : 'border-l-4 border-transparent'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    selectedCustomer?.id === customer.id ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'
                  }`}>
                    <User className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className={`font-medium truncate ${selectedCustomer?.id === customer.id ? 'text-emerald-900' : 'text-slate-800'}`}>
                      {customer.name}
                    </h3>
                    <p className="text-xs text-slate-500 truncate">{customer.memberId}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content: Savings Details */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!selectedCustomer ? (
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-slate-400">
            <Wallet className="w-16 h-16 mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-slate-600">Pilih Anggota</h3>
            <p className="text-sm">Pilih anggota dari daftar untuk melihat data simpanan</p>
          </div>
        ) : loadingAccount ? (
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center">
            <Loader className="w-8 h-8 text-emerald-600 animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col h-full gap-6">
            {/* Header */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-bold text-slate-800">{selectedCustomer.name}</h1>
                <p className="text-slate-500 flex items-center gap-2 mt-1">
                  <CreditCard className="w-4 h-4" />
                  {selectedCustomer.memberId}
                </p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => openTransactionModal('deposit')}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors"
                >
                  <Plus className="w-4 h-4" /> Setor
                </button>
                <button 
                  onClick={() => openTransactionModal('withdrawal')}
                  className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors"
                >
                  <Minus className="w-4 h-4" /> Tarik
                </button>
              </div>
            </div>

            {/* Balance Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: 'Simpanan Pokok', value: savingsAccount?.balancePokok || 0, color: 'blue', type: 'pokok' },
                { label: 'Simpanan Wajib', value: savingsAccount?.balanceWajib || 0, color: 'emerald', type: 'wajib' },
                { label: 'Simpanan Sukarela', value: savingsAccount?.balanceSukarela || 0, color: 'purple', type: 'sukarela' }
              ].map((item) => (
                <div key={item.label} className={`bg-white p-5 rounded-xl shadow-sm border border-slate-100 relative overflow-hidden group`}>
                  <div className={`absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity bg-${item.color}-500 rounded-bl-3xl`}>
                    <Wallet className={`w-8 h-8 text-${item.color}-600`} />
                  </div>
                  <p className="text-sm text-slate-500 font-medium mb-1">{item.label}</p>
                  <h3 className="text-2xl font-bold text-slate-800">
                    Rp {item.value.toLocaleString()}
                  </h3>
                  <div className="mt-4 flex gap-2">
                    <button 
                      onClick={() => openTransactionModal('deposit', item.type as any)}
                      className="text-xs font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded"
                    >
                      <Plus className="w-3 h-3" /> Setor
                    </button>
                    {item.value > 0 && (
                      <button 
                        onClick={() => openTransactionModal('withdrawal', item.type as any)}
                        className="text-xs font-medium text-red-600 hover:text-red-700 flex items-center gap-1 bg-red-50 px-2 py-1 rounded"
                      >
                        <Minus className="w-3 h-3" /> Tarik
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Transaction History */}
            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col min-h-0">
              <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                <History className="w-5 h-5 text-slate-400" />
                <h3 className="font-bold text-slate-800">Riwayat Transaksi</h3>
              </div>
              
              <div className="flex-1 overflow-y-auto">
                {transactions.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400">
                    <p className="text-sm">Belum ada transaksi</p>
                  </div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-3 font-medium">Tanggal</th>
                        <th className="px-6 py-3 font-medium">Jenis</th>
                        <th className="px-6 py-3 font-medium">Kategori</th>
                        <th className="px-6 py-3 font-medium">Keterangan</th>
                        <th className="px-6 py-3 font-medium text-right">Jumlah</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {transactions.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-3 text-slate-500 whitespace-nowrap">
                            {t.date?.toLocaleDateString('id-ID')} {t.date?.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-6 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                              t.type === 'deposit' 
                                ? 'bg-emerald-100 text-emerald-700' 
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {t.type === 'deposit' ? <ArrowUpCircle className="w-3 h-3" /> : <ArrowDownCircle className="w-3 h-3" />}
                              {t.type === 'deposit' ? 'Setor' : 'Tarik'}
                            </span>
                          </td>
                          <td className="px-6 py-3 capitalize text-slate-700 font-medium">
                            Simpanan {t.category}
                          </td>
                          <td className="px-6 py-3 text-slate-600 max-w-xs truncate">
                            {t.description}
                          </td>
                          <td className={`px-6 py-3 text-right font-medium ${
                            t.type === 'deposit' ? 'text-emerald-600' : 'text-red-600'
                          }`}>
                            {t.type === 'deposit' ? '+' : '-'} Rp {t.amount.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Transaction Modal */}
      {isTransactionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800 capitalize">
                {transactionType === 'deposit' ? 'Setor Tunai' : 'Tarik Tunai'}
              </h2>
              <button onClick={() => setIsTransactionModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <Plus className="w-5 h-5 rotate-45" />
              </button>
            </div>
            
            <form onSubmit={handleTransaction} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Jenis Simpanan</label>
                <div className="grid grid-cols-3 gap-2">
                  {['pokok', 'wajib', 'sukarela'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      disabled={transactionType === 'deposit' && cat === 'pokok' && isPokokLunas}
                      onClick={() => handleCategoryChange(cat as any)}
                      className={`py-2 px-1 rounded-lg text-sm capitalize border transition-all ${
                        transactionCategory === cat
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                          : transactionType === 'deposit' && cat === 'pokok' && isPokokLunas
                            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {cat} 
                      {transactionType === 'deposit' && cat === 'pokok' && isPokokLunas && ' (Lunas)'}
                      {transactionType === 'deposit' && cat === 'wajib' && isWajibLunasBulanIni() && ' (Lunas Bulan Ini)'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Jumlah (Rp)</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  readOnly={transactionType === 'deposit' && (transactionCategory === 'pokok' || transactionCategory === 'wajib')}
                  className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-lg font-medium ${
                    transactionType === 'deposit' && (transactionCategory === 'pokok' || transactionCategory === 'wajib') 
                      ? 'bg-slate-100 text-slate-500 cursor-not-allowed' 
                      : ''
                  }`}
                  placeholder="0"
                />
                {transactionType === 'deposit' && transactionCategory === 'pokok' && (
                  <p className="text-xs text-slate-500 mt-1">Simpanan Pokok (1x bayar): Rp 50.000</p>
                )}
                {transactionType === 'deposit' && transactionCategory === 'wajib' && (
                  <p className="text-xs text-slate-500 mt-1">Simpanan Wajib (per bulan): Rp 10.000</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Keterangan (Opsional)</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                  placeholder="Catatan transaksi..."
                />
              </div>

              <button
                type="submit"
                disabled={processing || !amount}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-200 transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2 mt-2"
              >
                {processing ? <Loader className="w-5 h-5 animate-spin" /> : 'Proses Transaksi'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
