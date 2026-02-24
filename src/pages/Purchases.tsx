import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, writeBatch, doc, increment } from 'firebase/firestore';
import { db } from '../api/firebase';
import { Product } from '../types';
import { Search, Plus, ShoppingBag, Truck, DollarSign, Package } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export default function Purchases() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<{product: Product, quantity: number, costPrice: number}[]>([]);
  const [supplier, setSupplier] = useState('');
  const [shippingCost, setShippingCost] = useState(0);
  const [processing, setProcessing] = useState(false);
  const { user } = useAuthStore();

  useEffect(() => {
    const q = query(collection(db, 'products'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const productsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Product[];
      setProducts(productsData);
    });
    return () => unsubscribe();
  }, []);

  const addToPurchase = (product: Product) => {
    const existing = cart.find(item => item.product.id === product.id);
    if (existing) {
      setCart(cart.map(item => 
        item.product.id === product.id 
          ? { ...item, quantity: item.quantity + 1 } 
          : item
      ));
    } else {
      setCart([...cart, { product, quantity: 1, costPrice: product.costPrice || 0 }]);
    }
  };

  const updateItem = (productId: string, field: 'quantity' | 'costPrice', value: number) => {
    setCart(cart.map(item => 
      item.product.id === productId 
        ? { ...item, [field]: value } 
        : item
    ));
  };

  const removeFromPurchase = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const handlePurchase = async () => {
    if (cart.length === 0) return;
    if (!supplier.trim()) {
      alert('Mohon isi nama supplier');
      return;
    }
    setProcessing(true);

    try {
      const batch = writeBatch(db);
      
      // 1. Create Purchase Record (Optional, separate collection)
      const purchaseRef = doc(collection(db, 'purchases'));
      const subtotal = cart.reduce((acc, item) => acc + (item.quantity * item.costPrice), 0);
      
      batch.set(purchaseRef, {
        supplier,
        items: cart.map(item => ({
          productId: item.product.id,
          name: item.product.name,
          quantity: item.quantity,
          costPrice: item.costPrice,
          total: item.quantity * item.costPrice
        })),
        subtotal: subtotal,
        shippingCost: shippingCost,
        totalAmount: subtotal + shippingCost,
        userId: user?.uid,
        createdAt: serverTimestamp()
      });

      // 2. Update Stock & Cost Price
      cart.forEach(item => {
        const productRef = doc(db, 'products', item.product.id);
        batch.update(productRef, {
          stock: increment(item.quantity),
          costPrice: item.costPrice, // Update cost price to latest purchase price
          updatedAt: serverTimestamp()
        });

        // 3. Inventory Log
        const logRef = doc(collection(db, 'inventory_logs'));
        batch.set(logRef, {
          productId: item.product.id,
          productName: item.product.name,
          type: 'in',
          quantity: item.quantity,
          reason: `Pembelian dari ${supplier}`,
          userId: user?.uid,
          createdAt: serverTimestamp()
        });
      });

      await batch.commit();
      
      setCart([]);
      setSupplier('');
      setShippingCost(0);
      alert('Pembelian berhasil disimpan! Stok telah bertambah.');
    } catch (error) {
      console.error('Error processing purchase:', error);
      alert('Gagal menyimpan pembelian');
    } finally {
      setProcessing(false);
    }
  };

  const filteredProducts = products.filter(product => 
    product.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const subtotal = cart.reduce((acc, item) => acc + (item.quantity * item.costPrice), 0);
  const totalPurchase = subtotal + shippingCost;

  return (
    <div className="flex h-[calc(100vh-theme(spacing.24))] gap-6">
      {/* Product Selection */}
      <div className="flex-1 flex flex-col min-w-0">
        <h1 className="text-2xl font-bold text-slate-800 mb-4">Pembelian Stok (Restock)</h1>
        
        <div className="mb-4 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Cari produk untuk dibeli..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto pr-2">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {filteredProducts.map(product => {
              const margin = product.price - (product.costPrice || 0);
              const marginPercent = product.price > 0 ? (margin / product.price) * 100 : 0;

              return (
                <button
                  key={product.id}
                  onClick={() => addToPurchase(product)}
                  className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all text-left group h-full flex flex-col"
                >
                  <div className="flex justify-between items-start mb-2 w-full">
                    <h3 className="font-medium text-slate-800 line-clamp-1">{product.name}</h3>
                    <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500 shrink-0 ml-2">
                      Stok: {product.stock || 0}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mb-3 truncate">ID: {product.id.slice(0,5)}</p>
                  
                  <div className="mt-auto space-y-1.5 bg-slate-50 p-2.5 rounded-lg text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 text-xs">Modal:</span>
                      <span className="font-medium text-slate-700">Rp {(product.costPrice || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 text-xs">Jual:</span>
                      <span className="font-medium text-slate-700">Rp {product.price.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1.5 border-t border-slate-200">
                      <span className="text-slate-500 text-xs">Margin:</span>
                      <span className={`font-bold text-xs ${margin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        Rp {margin.toLocaleString()} ({Math.round(marginPercent)}%)
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Purchase Form */}
      <div className="w-96 bg-white rounded-2xl shadow-lg border border-slate-100 flex flex-col h-full">
        <div className="p-6 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3 mb-4">
            <Truck className="w-6 h-6 text-emerald-600" />
            <h2 className="text-xl font-bold text-slate-800">Draft Pembelian</h2>
          </div>
          
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Supplier</label>
            <input
              type="text"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Nama Supplier..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="mt-4">
            <label className="text-sm font-medium text-slate-700 block mb-1">Biaya Pengiriman</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">Rp</span>
              <input
                type="number"
                min="0"
                value={shippingCost}
                onChange={(e) => setShippingCost(parseInt(e.target.value) || 0)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4 opacity-50">
              <ShoppingBag className="w-16 h-16" />
              <p>Belum ada barang dipilih</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.product.id} className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium text-slate-800 line-clamp-1">{item.product.name}</h4>
                  <button onClick={() => removeFromPurchase(item.product.id)} className="text-slate-400 hover:text-red-500">
                    <Plus className="w-4 h-4 rotate-45" />
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Jumlah</label>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.product.id, 'quantity', parseInt(e.target.value) || 0)}
                      className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Harga Beli (Satuan)</label>
                    <input
                      type="number"
                      min="0"
                      value={item.costPrice}
                      onChange={(e) => updateItem(item.product.id, 'costPrice', parseInt(e.target.value) || 0)}
                      className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
                <div className="mt-2 text-right text-sm font-medium text-slate-600">
                  Subtotal: Rp {(item.quantity * item.costPrice).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50">
          <div className="space-y-2 mb-4">
            <div className="flex justify-between items-center text-sm text-slate-500">
              <span>Subtotal</span>
              <span>Rp {subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center text-sm text-slate-500">
              <span>Biaya Pengiriman</span>
              <span>Rp {shippingCost.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-200">
              <span className="text-slate-600 font-bold">Total Akhir</span>
              <span className="text-xl font-bold text-emerald-600">Rp {totalPurchase.toLocaleString()}</span>
            </div>
          </div>

          <button
            onClick={handlePurchase}
            disabled={cart.length === 0 || processing}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-200 transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
          >
            {processing ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Truck className="w-5 h-5" />
                <span>Proses Restock</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
