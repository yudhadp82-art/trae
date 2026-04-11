import { forwardRef, useEffect, useRef, useState } from 'react';
import { Search, ShoppingCart, Minus, Plus, Trash2, CreditCard, Banknote, Package, User, ScanBarcode, X, Printer } from 'lucide-react';
import { collection, onSnapshot, query, orderBy, serverTimestamp, writeBatch, doc, increment } from 'firebase/firestore';
import { db } from '../api/firebase';
import type { Product, Customer, CartItem, User as AppUser } from '../types';
import { useCartStore } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';
import { useZxing } from "react-zxing";
import { useReactToPrint } from 'react-to-print';
import { useAppFeedback } from '../components/useAppFeedback';

function getCustomerLabel(customer: Customer | null | string): string {
  if (typeof customer === 'string') {
    return customer || 'Umum';
  }

  if (customer && typeof customer === 'object') {
    return customer.name;
  }

  return 'Umum';
}

type PaymentMethod = 'cash' | 'debt';

type CustomerUpdatePayload = {
  totalSpent: ReturnType<typeof increment>;
  lastVisit: ReturnType<typeof serverTimestamp>;
  debt?: ReturnType<typeof increment>;
};

type PrintableReceiptProps = {
  items: CartItem[];
  total: number;
  user: AppUser | null;
  customer: Customer | null | string;
  paymentMethod: string;
  date: Date;
  cashAmount: number;
  change: number;
};

// Receipt Component for Printing
const PrintableReceipt = forwardRef<HTMLDivElement, PrintableReceiptProps>(({
  items,
  total,
  user,
  customer,
  paymentMethod,
  date,
  cashAmount,
  change,
}, ref) => {
  return (
    <div ref={ref} className="w-[80mm] bg-white p-4 font-mono text-xs text-black">
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
          <span className="truncate max-w-[100px]">{getCustomerLabel(customer)}</span>
        </div>
      </div>

      <div className="mb-2 border-b border-dashed border-black pb-2">
        {items.map((item, idx) => (
          <div key={idx} className="mb-1">
            <div className="font-bold">{item.name}</div>
            <div className="flex justify-between">
              <span>{item.quantity} x {item.price.toLocaleString()}</span>
              <span>{(item.quantity * item.price).toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="border-b border-dashed border-black pb-2 mb-2">
        <div className="flex justify-between font-bold text-sm">
          <span>TOTAL</span>
          <span>Rp {total.toLocaleString()}</span>
        </div>
        {paymentMethod === 'cash' && (
          <>
            <div className="flex justify-between">
              <span>Tunai</span>
              <span>Rp {cashAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Kembalian</span>
              <span>Rp {change.toLocaleString()}</span>
            </div>
          </>
        )}
      </div>

      <div className="text-center text-xs mb-4">
        <p>Metode: {paymentMethod === 'debt' ? 'HUTANG' : 'CASH'}</p>
        {paymentMethod === 'debt' && <p className="font-bold mt-1">*** BELUM LUNAS ***</p>}
      </div>

      <div className="text-center">
        <p>Terima Kasih</p>
        <p>Barang yang sudah dibeli</p>
        <p>tidak dapat ditukar/dikembalikan</p>
      </div>
    </div>
  );
});

PrintableReceipt.displayName = 'PrintableReceipt';

export default function POS() {
  const { notify, confirm } = useAppFeedback();
  const receiptRef = useRef<HTMLDivElement>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [cashAmount, setCashAmount] = useState<number>(0);
  
  // State for last transaction receipt
  const [lastTransaction, setLastTransaction] = useState<{
    items: CartItem[],
    total: number,
    customer: Customer | null | string,
    paymentMethod: string,
    date: Date,
    cashAmount: number,
    change: number
  } | null>(null);

  const { items, addToCart, removeFromCart, updateQuantity, getTotal, clearCart } = useCartStore();
  const { user } = useAuthStore();
  const total = getTotal();
  const handlePrintReceipt = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: () => {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      return `nota-${stamp}`;
    },
    pageStyle: `
      @page {
        size: 80mm auto;
        margin: 4mm;
      }

      @media print {
        html, body {
          margin: 0;
          padding: 0;
          background: white;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }
    `,
    onPrintError: (_location, error) => {
      console.error('Receipt print error:', error);
      notify({
        title: 'Gagal membuka print nota',
        description: 'Periksa browser atau printer yang aktif lalu coba lagi.',
        tone: 'error',
      });
    },
  });

  const addToCartWithStockCheck = (product: Product) => {
    const existingItem = items.find(i => i.productId === product.id);
    const currentQty = existingItem ? existingItem.quantity : 0;
    
    if (currentQty + 1 > (product.stock || 0)) {
      notify({
        title: `Stok ${product.name} tidak mencukupi`,
        description: 'Kurangi jumlah item atau pilih produk lain.',
        tone: 'error',
      });
      return;
    }
    
    addToCart(product);
  };

  const { ref } = useZxing({
    onResult(result) {
      const code = result.getText();
      // Mencari produk berdasarkan ID (karena belum ada field barcode, kita pakai ID dulu)
      // Nanti bisa diganti: p.barcode === code
      const product = products.find(p => p.id === code || p.name.toLowerCase() === code.toLowerCase());
      
      if (product) {
        addToCartWithStockCheck(product);
        // Play beep sound (optional)
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.play().catch(() => {});
        
        setIsScanning(false); // Stop scanning after success? Or keep scanning? Let's stop to confirm.
        notify({
          title: `Produk ditemukan: ${product.name}`,
          description: 'Produk sudah ditambahkan ke keranjang.',
          tone: 'success',
        });
      } else {
        notify({
          title: `Kode "${code}" tidak ditemukan`,
          description: 'Periksa barcode atau data produk yang tersimpan.',
          tone: 'error',
        });
        setIsScanning(false);
      }
    },
    paused: !isScanning,
    constraints: {
      video: {
        facingMode: 'environment' // Force back camera
      }
    }
  });

  useEffect(() => {
    // Fetch Products
    const qProducts = query(collection(db, 'products'), orderBy('name'));
    const unsubProducts = onSnapshot(qProducts, (snapshot) => {
      const productsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Product[];
      setProducts(productsData);
    });

    // Fetch Customers
    const qCustomers = query(collection(db, 'customers'), orderBy('name'));
    const unsubCustomers = onSnapshot(qCustomers, (snapshot) => {
      const customersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Customer[];
      setCustomers(customersData);
    });

    return () => {
      unsubProducts();
      unsubCustomers();
    };
  }, []);

  const categories = ['All', ...Array.from(new Set(products.map(p => p.categoryId || 'Uncategorized')))];

  const filteredProducts = products.filter(product => 
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (selectedCategory === 'All' || product.categoryId === selectedCategory)
  );

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.memberId.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const productNameOptions = Array.from(new Set(products.map(p => p.name).filter(Boolean))).slice(0, 200);

  const handleCheckout = async () => {
    if (items.length === 0) return;
    const total = getTotal();
    
    // Check for stock availability
    const outOfStockItems = items.filter(item => {
      const product = products.find(p => p.id === item.productId);
      return !product || (product.stock || 0) < item.quantity;
    });

    if (outOfStockItems.length > 0) {
      notify({
        title: 'Stok tidak cukup',
        description: `Produk bermasalah: ${outOfStockItems.map(i => i.name).join(', ')}`,
        tone: 'error',
      });
      return;
    }
    
    if (paymentMethod === 'debt' && !selectedCustomer) {
      notify({
        title: 'Pelanggan belum dipilih',
        description: 'Pembayaran hutang wajib terkait ke pelanggan.',
        tone: 'error',
      });
      return;
    }

    if (paymentMethod === 'cash' && cashAmount < total) {
      notify({
        title: 'Uang tunai kurang',
        description: 'Jumlah pembayaran belum menutup total transaksi.',
        tone: 'error',
      });
      return;
    }

    setProcessing(true);

    try {
      const batch = writeBatch(db);
      
      // 1. Create Sale Record
      const saleRef = doc(collection(db, 'sales'));
      const saleData = {
        items,
        totalAmount: total,
        discount: 0,
        paymentMethod,
        paymentStatus: paymentMethod === 'cash' ? 'paid' : 'pending',
        customerName: selectedCustomer ? selectedCustomer.name : (customerSearch || null),
        customerId: selectedCustomer ? selectedCustomer.id : null,
        cashierId: user?.uid,
        status: 'completed',
        createdAt: serverTimestamp(),
        cashAmount: paymentMethod === 'cash' ? cashAmount : 0,
        change: paymentMethod === 'cash' ? cashAmount - total : 0
      };
      batch.set(saleRef, saleData);

      // 2. Update Stock & Create Logs for each item
      items.forEach(item => {
        const productRef = doc(db, 'products', item.productId);
        batch.update(productRef, {
          stock: increment(-item.quantity),
          updatedAt: serverTimestamp()
        });

        const logRef = doc(collection(db, 'inventory_logs'));
        batch.set(logRef, {
          productId: item.productId,
          productName: item.name,
          type: 'out',
          quantity: item.quantity,
          reason: 'Sale Transaction',
          userId: user?.uid,
          createdAt: serverTimestamp()
        });
      });

      // 3. Update Customer Total Spent
      if (selectedCustomer) {
        const customerRef = doc(db, 'customers', selectedCustomer.id);
        const updates: CustomerUpdatePayload = {
          totalSpent: increment(getTotal()),
          lastVisit: serverTimestamp()
        };
        
        // If payment is debt, increment debt amount
        if (paymentMethod === 'debt') {
          updates.debt = increment(getTotal());
        }
        
        batch.update(customerRef, updates);
      }

      await batch.commit();
      
      // Save last transaction data for printing
      const transactionData = {
        items: [...items],
        total: total,
        customer: selectedCustomer || customerSearch,
        paymentMethod,
        date: new Date(),
        cashAmount: paymentMethod === 'cash' ? cashAmount : 0,
        change: paymentMethod === 'cash' ? cashAmount - total : 0
      };
      setLastTransaction(transactionData);

      clearCart();
      setSelectedCustomer(null);
      setCustomerSearch('');
      setPaymentMethod('cash');
      setCashAmount(0);
      
      // Auto print prompt
      // We need to wait for state update to reflect in DOM before printing
      notify({
        title: 'Transaksi berhasil diproses',
        description: 'Stok, penjualan, dan data pelanggan sudah diperbarui.',
        tone: 'success',
      });
      setTimeout(async () => {
        const shouldPrint = await confirm({
          title: 'Cetak struk sekarang?',
          description: 'Struk transaksi terakhir siap dicetak.',
          confirmLabel: 'Cetak',
          cancelLabel: 'Nanti',
        });
        if (shouldPrint) {
          handlePrintReceipt();
        }
      }, 500);
    } catch (error) {
      console.error('Error processing sale:', error);
      notify({
        title: 'Transaksi gagal diproses',
        description: 'Periksa data transaksi lalu coba lagi.',
        tone: 'error',
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      {/* Hidden Receipt for Printing */}
      {lastTransaction && (
        <div className="pointer-events-none fixed left-[-9999px] top-0 opacity-0">
          <PrintableReceipt 
            ref={receiptRef}
            items={lastTransaction.items}
            total={lastTransaction.total}
            user={user}
            customer={lastTransaction.customer}
            paymentMethod={lastTransaction.paymentMethod}
            date={lastTransaction.date}
            cashAmount={lastTransaction.cashAmount}
            change={lastTransaction.change}
          />
        </div>
      )}

      {/* Main POS Interface */}
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-[32px] border border-white/70 bg-[linear-gradient(135deg,rgba(6,78,59,0.96),rgba(5,150,105,0.9)_45%,rgba(16,185,129,0.78))] px-6 py-7 text-white shadow-[0_24px_80px_rgba(5,150,105,0.22)] md:px-8 md:py-9">
          <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.18),transparent_58%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-100/75">Point Of Sale</p>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Checkout lebih cepat, scan lebih rapi</h1>
              <p className="mt-3 max-w-xl text-sm text-emerald-50/82 md:text-base">
                Kelola kasir, pemilihan pelanggan, dan pembayaran dari satu permukaan kerja yang lebih bersih dan fokus.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 md:min-w-[360px]">
              <div className="rounded-2xl border border-white/12 bg-white/10 p-4 backdrop-blur-md">
                <div className="text-[11px] uppercase tracking-[0.2em] text-emerald-100/75">Keranjang</div>
                <div className="mt-2 text-2xl font-bold">{items.length}</div>
              </div>
              <div className="rounded-2xl border border-white/12 bg-black/10 p-4 backdrop-blur-md">
                <div className="text-[11px] uppercase tracking-[0.2em] text-emerald-100/75">Pelanggan</div>
                <div className="mt-2 text-lg font-bold truncate">{selectedCustomer?.name || 'Umum'}</div>
              </div>
              <div className="rounded-2xl border border-white/12 bg-white/10 p-4 backdrop-blur-md">
                <div className="text-[11px] uppercase tracking-[0.2em] text-emerald-100/75">Total</div>
                <div className="mt-2 text-xl font-bold">Rp {total.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </section>

      <div className="flex min-h-[calc(100vh-theme(spacing.24))] gap-6">
        {/* Product Grid Section */}
      <div className="section-shell flex-1 flex flex-col min-w-0 p-5 md:p-6">
        <div className="mb-6 space-y-4">
          
          {/* Scanner Modal */}
          {isScanning && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
              <div className="bg-white rounded-2xl overflow-hidden w-full max-w-sm relative">
                <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
                  <h3 className="font-bold">Scan Barcode Produk</h3>
                  <button onClick={() => setIsScanning(false)} className="text-slate-400 hover:text-white">
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <div className="relative aspect-square bg-black">
                  <video ref={ref} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 border-2 border-emerald-500/50 m-12 rounded-lg animate-pulse pointer-events-none"></div>
                  <div className="absolute bottom-4 left-0 right-0 text-center text-white text-xs bg-black/50 py-1">
                    Arahkan kamera ke barcode produk
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="section-headline mb-2">Katalog</p>
              <h2 className="text-xl font-bold text-slate-800">Pilih produk</h2>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === category
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredProducts.map(product => (
              <button
                key={product.id}
                onClick={() => addToCartWithStockCheck(product)}
                disabled={(product.stock || 0) <= 0}
                className={`bg-white p-3 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all text-left group flex flex-col h-full ${
                  (product.stock || 0) <= 0 ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <div className="h-32 w-full bg-slate-100 rounded-lg mb-3 overflow-hidden flex items-center justify-center relative">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <Package className="w-8 h-8 text-slate-300" />
                  )}
                  {(product.stock || 0) <= 0 && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-white font-bold text-sm bg-red-600 px-2 py-1 rounded">Stok Habis</span>
                    </div>
                  )}
                </div>
                <h3 className="font-medium text-slate-800 line-clamp-1 mb-0 text-sm">{product.name}</h3>
                <p className="text-xs text-slate-400 mb-2 truncate">
                  {product.categoryId || 'General'} • ID: {product.id.slice(0, 5)}
                </p>
                <div className="mt-auto flex justify-between items-center">
                  <span className="text-emerald-600 font-bold text-sm">
                    Rp {(product.price || 0).toLocaleString()}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    (product.stock || 0) <= 5 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {product.stock || 0}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cart Section */}
      <div className="section-shell w-96 flex flex-col h-full overflow-hidden">
        <div className="border-b border-slate-100/80 p-6">
          <div className="flex items-center gap-3 mb-1">
            <ShoppingCart className="w-6 h-6 text-emerald-600" />
            <h2 className="text-xl font-bold text-slate-800">Pesanan Saat Ini</h2>
            {lastTransaction && (
              <button
                onClick={() => handlePrintReceipt()}
                className="ml-auto p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                title="Cetak Ulang Nota Terakhir"
              >
                <Printer className="w-5 h-5" />
              </button>
            )}
          </div>
          <p className="text-slate-500 text-sm">{items.length} item dipilih</p>

          {/* Search / Add Product (moved here) */}
          <div className="mt-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                list="pos-product-options"
                placeholder="Cari / pilih barang…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const p = products.find(pr => pr.name.toLowerCase() === searchTerm.toLowerCase());
                    if (p) {
                      addToCartWithStockCheck(p);
                      setSearchTerm('');
                    }
                  }
                }}
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <datalist id="pos-product-options">
                {productNameOptions.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
            <button
              onClick={() => {
                const p = products.find(pr => pr.name.toLowerCase() === searchTerm.toLowerCase());
                if (p) {
                  addToCartWithStockCheck(p);
                  setSearchTerm('');
                } else {
                  notify({
                    title: 'Produk tidak ditemukan',
                    description: 'Cek nama produk lalu coba tambah lagi.',
                    tone: 'error',
                  });
                }
              }}
              className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
              title="Tambah ke keranjang"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsScanning(true)}
              className="px-3 py-2 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200"
              title="Scan Barcode"
            >
              <ScanBarcode className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4 opacity-50">
              <ShoppingCart className="w-16 h-16" />
              <p>Keranjang kosong</p>
            </div>
          ) : (
            items.map(item => (
              <div key={item.productId} className="flex gap-4">
                <div className="flex-1">
                  <h4 className="font-medium text-slate-800">{item.name}</h4>
                  <p className="text-emerald-600 text-sm font-medium">
                    Rp {(item.price || 0).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center border border-slate-200 rounded-lg">
                    <button
                      onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                      className="p-1 hover:bg-slate-50 text-slate-600"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                      className="p-1 hover:bg-slate-50 text-slate-600"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => removeFromCart(item.productId)}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-4 border-t border-slate-100 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.98))] p-6">
          <div className="space-y-2">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>Rp {total.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Pajak (0%)</span>
              <span>Rp 0</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-slate-800 pt-2 border-t border-slate-200">
              <span>Total</span>
              <span>Rp {total.toLocaleString()}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {([
              { id: 'cash', icon: Banknote, label: 'Cash' },
              { id: 'debt', icon: CreditCard, label: 'Hutang' }
            ] as const).map(method => (
              <button
                key={method.id}
                onClick={() => setPaymentMethod(method.id)}
                className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all ${
                  paymentMethod === method.id
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-200'
                }`}
              >
                <method.icon className="w-5 h-5 mb-1" />
                <span className="text-xs font-medium">{method.label}</span>
              </button>
            ))}
          </div>

          {paymentMethod === 'cash' && (
            <div className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <label className="text-sm font-medium text-slate-700 block">Bayar (Tunai)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">Rp</span>
                <input
                  type="number"
                  value={cashAmount || ''}
                  onChange={(e) => setCashAmount(Number(e.target.value))}
                  placeholder="0"
                  className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-lg"
                />
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-slate-200 mt-2">
                <span className="text-slate-600">Kembalian:</span>
                <span className={`font-bold ${cashAmount >= total ? 'text-emerald-600' : 'text-red-500'}`}>
                  Rp {(cashAmount - total).toLocaleString()}
                </span>
              </div>
            </div>
          )}

          <div className="relative">
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Pilih Pelanggan {paymentMethod === 'debt' && <span className="text-red-500">*</span>}
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={selectedCustomer ? selectedCustomer.name : customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setSelectedCustomer(null);
                  setShowCustomerDropdown(true);
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                placeholder="Cari nama pelanggan (Opsional)..."
                className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                  paymentMethod === 'debt' && !selectedCustomer ? 'border-red-300' : 'border-slate-200'
                }`}
              />
              {selectedCustomer && (
                <button 
                  onClick={() => {
                    setSelectedCustomer(null);
                    setCustomerSearch('');
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            
            {showCustomerDropdown && !selectedCustomer && customerSearch && (
              <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                {filteredCustomers.length === 0 ? (
                  <div className="p-3 text-sm text-slate-500 text-center">Pelanggan tidak ditemukan</div>
                ) : (
                  filteredCustomers.map(customer => (
                    <button
                      key={customer.id}
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setCustomerSearch(customer.name);
                        setShowCustomerDropdown(false);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm flex flex-col border-b border-slate-50 last:border-0"
                    >
                      <span className="font-medium text-slate-800">{customer.name}</span>
                      <span className="text-xs text-slate-500">{customer.memberId}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleCheckout}
            disabled={items.length === 0 || processing}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-emerald-200 transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
          >
            {processing ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Proses Pembayaran</span>
                <span className="bg-emerald-500 px-2 py-0.5 rounded text-sm">
                  Rp {total.toLocaleString()}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
      </div>
      </div>
    </>
  );
}
