import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { db } from '../api/firebase';
import { Product, InventoryLog } from '../types';
import { Search, Plus, Minus, History, Save, X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export default function Inventory() {
  const [activeTab, setActiveTab] = useState<'stock' | 'history'>('stock');
  const [products, setProducts] = useState<Product[]>([]);
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<'in' | 'out'>('in');
  const [adjustmentQty, setAdjustmentQty] = useState<number>(0);
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const { user } = useAuthStore();

  // Fetch Products
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

  // Fetch Logs
  useEffect(() => {
    if (activeTab === 'history') {
      const q = query(collection(db, 'inventory_logs'), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const logsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate()
        })) as InventoryLog[];
        setLogs(logsData);
      });
      return () => unsubscribe();
    }
  }, [activeTab]);

  const handleAdjustStock = async () => {
    if (!selectedProduct || adjustmentQty <= 0) return;
    setProcessing(true);

    try {
      // Get latest product data to ensure stock is accurate
      const currentProduct = products.find(p => p.id === selectedProduct.id);
      if (!currentProduct) {
        alert('Product not found');
        return;
      }

      const newStock = adjustmentType === 'in' 
        ? currentProduct.stock + adjustmentQty
        : currentProduct.stock - adjustmentQty;

      if (newStock < 0) {
        alert('Insufficient stock!');
        setProcessing(false);
        return;
      }

      // Update Product Stock
      const productRef = doc(db, 'products', selectedProduct.id);
      await updateDoc(productRef, {
        stock: newStock,
        updatedAt: serverTimestamp()
      });

      // Create Log
      await addDoc(collection(db, 'inventory_logs'), {
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        type: adjustmentType,
        quantity: adjustmentQty,
        reason: adjustmentReason || 'Manual Adjustment',
        userId: user?.uid,
        createdAt: serverTimestamp()
      });

      setSelectedProduct(null);
      setAdjustmentQty(0);
      setAdjustmentReason('');
      alert('Stock updated successfully!');
    } catch (error) {
      console.error('Error adjusting stock:', error);
      alert('Failed to update stock');
    } finally {
      setProcessing(false);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800">Inventory Management</h1>
        <div className="flex bg-white rounded-lg p-1 border border-slate-200">
          <button
            onClick={() => setActiveTab('stock')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'stock'
                ? 'bg-emerald-100 text-emerald-700'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Stock Levels
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'history'
                ? 'bg-emerald-100 text-emerald-700'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            History Logs
          </button>
        </div>
      </div>

      {activeTab === 'stock' ? (
        <>
          {/* Search Bar */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Product Table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4 font-semibold text-slate-600">Product Name</th>
                  <th className="px-6 py-4 font-semibold text-slate-600">Current Stock</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map(product => (
                  <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-800">{product.name}</div>
                      <div className="text-sm text-slate-500">Rp {(product.price || 0).toLocaleString()}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-sm font-medium ${
                        (product.stock || 0) <= 5 
                          ? 'bg-red-100 text-red-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {product.stock || 0} Units
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedProduct(product);
                          setAdjustmentType('in');
                          setAdjustmentQty(0);
                        }}
                        className="text-emerald-600 hover:text-emerald-700 font-medium text-sm"
                      >
                        Adjust Stock
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        /* History Logs Table */
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-600">Date</th>
                <th className="px-6 py-4 font-semibold text-slate-600">Product</th>
                <th className="px-6 py-4 font-semibold text-slate-600">Type</th>
                <th className="px-6 py-4 font-semibold text-slate-600">Quantity</th>
                <th className="px-6 py-4 font-semibold text-slate-600">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-slate-600">
                    {log.createdAt?.toLocaleDateString()} {log.createdAt?.toLocaleTimeString()}
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-800">{log.productName}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${
                      log.type === 'in' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {log.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-medium">
                    {log.type === 'in' ? '+' : '-'}{log.quantity}
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-sm">{log.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-lg text-slate-800">Adjust Stock: {selectedProduct.name}</h3>
              <button 
                onClick={() => setSelectedProduct(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 p-1 bg-slate-100 rounded-lg">
                <button
                  onClick={() => setAdjustmentType('in')}
                  className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
                    adjustmentType === 'in'
                      ? 'bg-white text-emerald-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Plus className="w-4 h-4" /> Stock In
                </button>
                <button
                  onClick={() => setAdjustmentType('out')}
                  className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
                    adjustmentType === 'out'
                      ? 'bg-white text-amber-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Minus className="w-4 h-4" /> Stock Out
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={adjustmentQty || ''}
                  onChange={(e) => setAdjustmentQty(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Enter quantity"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Reason (Optional)</label>
                <textarea
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 h-20 resize-none"
                  placeholder="e.g. New stock arrived, Damaged goods..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdjustStock}
                  disabled={processing || adjustmentQty <= 0}
                  className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium shadow-lg shadow-emerald-200 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                >
                  {processing ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
