import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, where, orderBy, doc, updateDoc, increment, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../api/firebase';
import { Customer } from '../types';
import { Search, CreditCard, Printer, X, History, Banknote } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

// Receipt Component for Debt Payment
const DebtPaymentReceipt = ({ 
  customer, 
  amount, 
  remainingDebt, 
  date,
  user
}: { 
  customer: Customer, 
  amount: number, 
  remainingDebt: number, 
  date: Date,
  user: any
}) => {
  return (
    <div className="hidden print:block p-4 font-mono text-xs w-[80mm] mx-auto">
      <div className="text-center mb-4">
        <h2 className="text-lg font-bold">TOKO RETAIL</h2>
        <p>Jl. Contoh No. 123</p>
        <p>Telp: 0812-3456-7890</p>
      </div>
      
      <div className="border-b border-dashed border-black mb-2 pb-2">
        <div className="flex justify-between">
          <span>Tgl:</span>
          <span>{date.toLocaleDateString('id-ID')} {date.toLocaleTimeString('id-ID')}</span>
        </div>
        <div className="flex justify-between">
          <span>Kasir:</span>
          <span>{user?.email?.split('@')[0] || 'Admin'}</span>
        </div>
        <div className="flex justify-between">
          <span>Plg:</span>
          <span className="truncate max-w-[100px]">{customer.name}</span>
        </div>
      </div>

      <div className="text-center font-bold mb-2">BUKTI PEMBAYARAN HUTANG</div>

      <div className="mb-2 border-b border-dashed border-black pb-2">
        <div className="flex justify-between mb-1">
          <span>Jumlah Bayar</span>
          <span className="font-bold">Rp {amount.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span>Sisa Hutang</span>
          <span>Rp {remainingDebt.toLocaleString()}</span>
        </div>
      </div>

      <div className="text-center">
        <p>Terima Kasih</p>
        <p>Simpan struk ini sebagai</p>
        <p>bukti pembayaran yang sah</p>
      </div>
    </div>
  );
};

export default function Debts() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastPayment, setLastPayment] = useState<{
    customer: Customer,
    amount: number,
    remainingDebt: number,
    date: Date
  } | null>(null);

  const { user } = useAuthStore();

  useEffect(() => {
    // Query customers who have debt (debt > 0)
    // Note: Firestore requires an index for this if mixed with orderBy. 
    // For now, we fetch all and filter client-side to avoid index issues during dev, 
    // or we can use a simple query if the dataset isn't huge.
    // Let's try simple query first.
    const q = query(collection(db, 'customers'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const customersData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Customer))
        .filter(c => (c.debt || 0) > 0); // Client-side filter for active debts
      setCustomers(customersData);
    });

    return () => unsubscribe();
  }, []);

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.memberId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !paymentAmount) return;

    const amount = Number(paymentAmount);
    if (amount <= 0) {
      alert('Jumlah pembayaran harus lebih dari 0');
      return;
    }

    if (amount > (selectedCustomer.debt || 0)) {
      alert('Jumlah pembayaran melebihi total hutang');
      return;
    }

    setIsProcessing(true);
    try {
      const customerRef = doc(db, 'customers', selectedCustomer.id);
      const remaining = (selectedCustomer.debt || 0) - amount;

      // 1. Update Customer Debt
      await updateDoc(customerRef, {
        debt: increment(-amount)
      });

      // 2. Record Payment History
      await addDoc(collection(db, 'debt_payments'), {
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        amount: amount,
        remainingDebt: remaining,
        cashierId: user?.uid,
        createdAt: serverTimestamp()
      });

      // Prepare receipt data
      setLastPayment({
        customer: selectedCustomer,
        amount,
        remainingDebt: remaining,
        date: new Date()
      });

      // Reset form
      setPaymentAmount('');
      setSelectedCustomer(null);
      
      // Auto print
      setTimeout(() => {
        if (confirm('Pembayaran berhasil! Cetak struk?')) {
          window.print();
        }
      }, 500);

    } catch (error) {
      console.error('Error processing debt payment:', error);
      alert('Gagal memproses pembayaran');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      {lastPayment && (
        <DebtPaymentReceipt 
          customer={lastPayment.customer}
          amount={lastPayment.amount}
          remainingDebt={lastPayment.remainingDebt}
          date={lastPayment.date}
          user={user}
        />
      )}

      <div className="p-6 print:hidden">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <CreditCard className="w-8 h-8 text-emerald-600" />
            Daftar Hutang Pelanggan
          </h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari pelanggan..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCustomers.length === 0 ? (
            <div className="col-span-full text-center py-12 text-slate-500">
              Tidak ada data hutang pelanggan
            </div>
          ) : (
            filteredCustomers.map(customer => (
              <div key={customer.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-slate-800">{customer.name}</h3>
                    <p className="text-sm text-slate-500">{customer.memberId}</p>
                    <p className="text-sm text-slate-500">{customer.phone || '-'}</p>
                  </div>
                  <div className="bg-red-50 text-red-600 px-3 py-1 rounded-lg text-sm font-bold">
                    Rp {(customer.debt || 0).toLocaleString()}
                  </div>
                </div>
                
                <button
                  onClick={() => setSelectedCustomer(customer)}
                  className="w-full py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Banknote className="w-4 h-4" />
                  Bayar Hutang
                </button>
              </div>
            ))
          )}
        </div>

        {/* Payment Modal */}
        {selectedCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-bold text-lg text-slate-800">Pembayaran Hutang</h3>
                <button 
                  onClick={() => setSelectedCustomer(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <form onSubmit={handlePayment} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Pelanggan</label>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="font-bold">{selectedCustomer.name}</div>
                    <div className="text-sm text-slate-500">Total Hutang: Rp {(selectedCustomer.debt || 0).toLocaleString()}</div>
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
                      max={selectedCustomer.debt}
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
                    onClick={() => setSelectedCustomer(null)}
                    className="flex-1 py-2 px-4 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="flex-1 py-2 px-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {isProcessing ? 'Memproses...' : 'Konfirmasi Bayar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}