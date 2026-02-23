import { useState, useEffect } from 'react';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  updateDoc,
  doc
} from 'firebase/firestore';
import { db } from '../api/firebase';
import { Sale, Product, Customer } from '../types';
import { useAuthStore } from '../store/authStore';
import { 
  Send, 
  Plus, 
  Search, 
  Copy, 
  CheckCircle, 
  Clock, 
  Trash2, 
  ExternalLink,
  MessageCircle,
  ShoppingBag,
  User,
  X
} from 'lucide-react';

export default function TelegramOrders() {
  const { user } = useAuthStore();
  const [orders, setOrders] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Form State
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [cart, setCart] = useState<{product: Product, quantity: number}[]>([]);
  const [productSearch, setProductSearch] = useState('');

  // Fetch Data
  useEffect(() => {
    // Fetch Telegram Orders
    const qOrders = query(
      collection(db, 'sales'), 
      where('source', '==', 'telegram'),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribeOrders = onSnapshot(qOrders, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()
      })) as Sale[];
      setOrders(ordersData);
      setLoading(false);
    });

    // Fetch Products
    const qProducts = query(collection(db, 'products'), where('isActive', '==', true));
    const unsubscribeProducts = onSnapshot(qProducts, (snapshot) => {
      const productsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Product[];
      setProducts(productsData);
    });

    // Fetch Customers
    const qCustomers = query(collection(db, 'customers'), orderBy('name'));
    const unsubscribeCustomers = onSnapshot(qCustomers, (snapshot) => {
      const customersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Customer[];
      setCustomers(customersData);
    });

    return () => {
      unsubscribeOrders();
      unsubscribeProducts();
      unsubscribeCustomers();
    };
  }, []);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.product.id === product.id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      alert('Keranjang pesanan kosong!');
      return;
    }
    if (!customerName && !selectedCustomer) {
      alert('Nama pelanggan harus diisi!');
      return;
    }

    try {
      const totalAmount = calculateTotal();
      const orderData = {
        items: cart.map(item => ({
          productId: item.product.id,
          name: item.product.name,
          price: item.product.price,
          costPrice: item.product.costPrice,
          quantity: item.quantity
        })),
        totalAmount,
        discount: 0,
        paymentMethod: 'cash', // Default, can be changed later
        paymentStatus: 'pending', // Telegram orders usually pending payment
        customerName: selectedCustomer ? selectedCustomer.name : customerName,
        customerId: selectedCustomer ? selectedCustomer.id : undefined,
        cashierId: user?.uid || 'system',
        status: 'completed', // Sale record created
        source: 'telegram',
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'sales'), orderData);
      
      setIsModalOpen(false);
      setCart([]);
      setCustomerName('');
      setSelectedCustomer(null);
      alert('Pesanan Telegram berhasil ditambahkan!');
    } catch (error) {
      console.error('Error adding order:', error);
      alert('Gagal menambahkan pesanan.');
    }
  };

  const handleStatusUpdate = async (orderId: string, status: 'paid' | 'pending') => {
    try {
      await updateDoc(doc(db, 'sales', orderId), {
        paymentStatus: status
      });
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Gagal update status pembayaran');
    }
  };

  const copyOrderFormat = () => {
    const format = `
Halo, saya ingin memesan:
Nama: [Nama Anda]
Pesanan:
1. [Nama Barang] - [Jumlah]
2. ...
Alamat: [Alamat Pengiriman]
No HP: [Nomor WhatsApp/Telegram]

Terima kasih!
    `.trim();
    navigator.clipboard.writeText(format);
    alert('Format pesanan disalin! Kirimkan ke pelanggan.');
  };

  const filteredOrders = orders.filter(order => 
    order.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Send className="w-6 h-6 text-blue-500" />
            Pesanan Telegram
          </h1>
          <p className="text-slate-500 text-sm">Kelola pesanan yang masuk melalui Telegram</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={copyOrderFormat}
            className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
          >
            <Copy className="w-4 h-4" />
            <span className="hidden sm:inline">Salin Format Pesan</span>
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Input Pesanan</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
              <MessageCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Total Pesanan</p>
              <h3 className="text-xl font-bold text-slate-800">{orders.length}</h3>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Belum Bayar</p>
              <h3 className="text-xl font-bold text-slate-800">
                {orders.filter(o => o.paymentStatus === 'pending').length}
              </h3>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Selesai</p>
              <h3 className="text-xl font-bold text-slate-800">
                {orders.filter(o => o.paymentStatus === 'paid').length}
              </h3>
            </div>
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari pesanan..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium">
              <tr>
                <th className="px-6 py-4">ID / Tanggal</th>
                <th className="px-6 py-4">Pelanggan</th>
                <th className="px-6 py-4">Item</th>
                <th className="px-6 py-4">Total</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">Memuat data...</td></tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <Send className="w-12 h-12 text-slate-200 mb-3" />
                      <p>Belum ada pesanan dari Telegram</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredOrders.map(order => (
                  <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-mono text-xs text-slate-500">#{order.id.slice(0, 8)}</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-800">
                      {order.customerName || 'Umum'}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div className="flex flex-col gap-1">
                        {order.items.slice(0, 2).map((item, idx) => (
                          <span key={idx} className="text-xs">
                            {item.quantity}x {item.name}
                          </span>
                        ))}
                        {order.items.length > 2 && (
                          <span className="text-xs text-slate-400">+{order.items.length - 2} lainnya</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-800">
                      Rp {order.totalAmount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        order.paymentStatus === 'paid' 
                          ? 'bg-emerald-100 text-emerald-700' 
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {order.paymentStatus === 'paid' ? 'Lunas' : 'Belum Bayar'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {order.paymentStatus === 'pending' && (
                        <button
                          onClick={() => handleStatusUpdate(order.id, 'paid')}
                          className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 transition-colors"
                        >
                          Tandai Lunas
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Input Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-[90vh] flex overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Left: Product Selection */}
            <div className="w-2/3 border-r border-slate-100 flex flex-col bg-slate-50">
              <div className="p-4 border-b border-slate-100 bg-white">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari produk..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {filteredProducts.map(product => (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="bg-white p-3 rounded-xl border border-slate-200 hover:border-blue-500 hover:shadow-sm transition-all text-left flex flex-col h-full"
                    >
                      <div className="font-medium text-slate-800 line-clamp-2 mb-1">{product.name}</div>
                      <div className="mt-auto flex justify-between items-end">
                        <span className="text-blue-600 font-bold text-sm">Rp {product.price.toLocaleString()}</span>
                        <div className="w-6 h-6 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
                          <Plus className="w-3 h-3" />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Cart & Customer */}
            <div className="w-1/3 flex flex-col bg-white">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                <h2 className="font-bold text-slate-800">Detail Pesanan</h2>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-4 border-b border-slate-100 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Pelanggan</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onChange={(e) => {
                      if (e.target.value === 'new') {
                        setSelectedCustomer(null);
                      } else {
                        const cust = customers.find(c => c.id === e.target.value);
                        setSelectedCustomer(cust || null);
                      }
                    }}
                    value={selectedCustomer?.id || 'new'}
                  >
                    <option value="new">Pelanggan Baru / Umum</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name} - {c.memberId}</option>
                    ))}
                  </select>
                </div>
                {!selectedCustomer && (
                  <input
                    type="text"
                    placeholder="Nama Pelanggan"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400">
                    <ShoppingBag className="w-12 h-12 mb-2 opacity-50" />
                    <p className="text-sm">Keranjang kosong</p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div key={item.product.id} className="flex justify-between items-center bg-slate-50 p-3 rounded-lg">
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="text-sm font-medium text-slate-800 truncate">{item.product.name}</div>
                        <div className="text-xs text-slate-500">Rp {item.product.price.toLocaleString()}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => updateQuantity(item.product.id, -1)}
                          className="w-6 h-6 bg-white border border-slate-200 rounded flex items-center justify-center text-slate-600 hover:bg-slate-100"
                        >
                          -
                        </button>
                        <span className="text-sm font-medium w-4 text-center">{item.quantity}</span>
                        <button 
                          onClick={() => updateQuantity(item.product.id, 1)}
                          className="w-6 h-6 bg-white border border-slate-200 rounded flex items-center justify-center text-slate-600 hover:bg-slate-100"
                        >
                          +
                        </button>
                        <button 
                          onClick={() => removeFromCart(item.product.id)}
                          className="ml-2 text-red-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-slate-600 font-medium">Total</span>
                  <span className="text-xl font-bold text-slate-800">Rp {calculateTotal().toLocaleString()}</span>
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={cart.length === 0}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-200 transition-all disabled:opacity-50 disabled:shadow-none"
                >
                  Simpan Pesanan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}