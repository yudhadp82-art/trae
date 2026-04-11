import { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  X,
  Package,
  Upload,
  Loader
} from 'lucide-react';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../api/firebase';
import { Product } from '../types';
import { useAuthStore } from '../store/authStore';
import { useAppFeedback } from '../components/useAppFeedback';

export default function Products() {
  const { notify, confirm } = useAppFeedback();
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const { user } = useAuthStore();

  const [formData, setFormData] = useState({
    name: '',
    price: '',
    costPrice: '',
    stock: '',
    category: 'General',
    description: '',
    imageUrl: ''
  });

  useEffect(() => {
    const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const productsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Product[];
      setProducts(productsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        price: (product.price || 0).toString(),
        costPrice: (product.costPrice || 0).toString(),
        stock: (product.stock || 0).toString(),
        category: product.categoryId || 'General',
        description: product.description || '',
        imageUrl: product.imageUrl || ''
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: '',
        price: '',
        costPrice: '',
        stock: '',
        category: 'General',
        description: '',
        imageUrl: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validasi ukuran file (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      notify({
        title: 'Ukuran file terlalu besar',
        description: 'Batas maksimum upload gambar adalah 2MB.',
        tone: 'error',
      });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);

      // Upload to Imgur (Free & No Auth Required for Anonymous Upload)
      const response = await fetch('https://api.imgur.com/3/image', {
        method: 'POST',
        headers: {
          Authorization: 'Client-ID 546c25a59c58ad7', // Alternate Public Client ID
        },
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setFormData(prev => ({ ...prev, imageUrl: data.data.link }));
      } else {
        throw new Error(data.data.error || 'Failed to upload');
      }
    } catch (error) {
      console.error('Upload failed:', error);
      notify({
        title: 'Upload gambar gagal',
        description: 'Coba lagi atau gunakan URL gambar manual.',
        tone: 'error',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const productData = {
      name: formData.name,
      price: Number(formData.price),
      costPrice: Number(formData.costPrice),
      stock: Number(formData.stock),
      categoryId: formData.category,
      description: formData.description,
      imageUrl: formData.imageUrl,
      isActive: true,
      updatedAt: serverTimestamp()
    };

    try {
      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), productData);
      } else {
        await addDoc(collection(db, 'products'), {
          ...productData,
          createdAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
      notify({
        title: editingProduct ? 'Produk diperbarui' : 'Produk baru ditambahkan',
        description: 'Perubahan katalog sudah tersimpan.',
        tone: 'success',
      });
    } catch (error) {
      console.error('Error saving product:', error);
      notify({
        title: 'Produk gagal disimpan',
        description: 'Periksa data produk lalu coba lagi.',
        tone: 'error',
      });
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: 'Hapus produk ini?',
      description: 'Produk akan dihapus dari katalog.',
      confirmLabel: 'Hapus',
      tone: 'danger',
    });

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'products', id));
      notify({
        title: 'Produk berhasil dihapus',
        tone: 'success',
      });
    } catch (error) {
      console.error('Error deleting product:', error);
      notify({
        title: 'Produk gagal dihapus',
        description: 'Coba ulangi proses penghapusan.',
        tone: 'error',
      });
    }
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const productNameOptions = Array.from(new Set(products.map(p => p.name).filter(Boolean))).slice(0, 100);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-white/70 bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(30,41,59,0.92)_45%,rgba(14,116,144,0.8))] px-6 py-7 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] md:px-8 md:py-9">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.16),transparent_58%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-sky-100/75">Catalogue Control</p>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Produk yang lebih mudah diaudit</h1>
            <p className="mt-3 max-w-xl text-sm text-slate-100/80 md:text-base">
              Kelola nama, kategori, stok, dan harga dari panel yang lebih padat informasi tapi tetap enak dibaca.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 md:min-w-[360px]">
            <div className="rounded-2xl border border-white/12 bg-white/10 p-4 backdrop-blur-md">
              <div className="text-[11px] uppercase tracking-[0.2em] text-sky-100/75">Produk</div>
              <div className="mt-2 text-2xl font-bold">{products.length}</div>
            </div>
            <div className="rounded-2xl border border-white/12 bg-black/10 p-4 backdrop-blur-md">
              <div className="text-[11px] uppercase tracking-[0.2em] text-sky-100/75">Hasil Filter</div>
              <div className="mt-2 text-2xl font-bold">{filteredProducts.length}</div>
            </div>
            <div className="rounded-2xl border border-white/12 bg-white/10 p-4 backdrop-blur-md">
              <div className="text-[11px] uppercase tracking-[0.2em] text-sky-100/75">Stok Tipis</div>
              <div className="mt-2 text-2xl font-bold">{products.filter((product) => (product.stock || 0) <= 5).length}</div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="section-headline mb-2">Master Data</p>
          <h2 className="text-2xl font-bold text-slate-800">Products</h2>
        </div>
        {user?.role === 'admin' && (
          <button
            onClick={() => handleOpenModal()}
            className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-white shadow-lg shadow-emerald-200 transition-colors hover:bg-emerald-700 flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add Product
          </button>
        )}
      </div>

      <div className="section-shell overflow-hidden">
        <div className="border-b border-slate-100/80 p-4 md:p-5">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/90 text-slate-600 font-medium">
              <tr>
                <th className="px-6 py-4">Product</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Price</th>
                <th className="px-6 py-4">Stock</th>
                {user?.role === 'admin' && <th className="px-6 py-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    Loading products...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <Package className="w-12 h-12 text-slate-300 mb-2" />
                      <p>No products found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.id} className="transition-colors hover:bg-sky-50/40">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden">
                          {product.imageUrl ? (
                            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{product.name}</p>
                          <p className="text-xs text-slate-500 truncate max-w-[200px]">{product.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        {product.categoryId}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-900">
                      Rp {(product.price || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className={`flex items-center gap-2 ${(product.stock || 0) <= 5 ? 'text-red-600' : 'text-emerald-600'}`}>
                        <span className={`w-2 h-2 rounded-full ${(product.stock || 0) <= 5 ? 'bg-red-500' : 'bg-emerald-500'}`} />
                        {product.stock || 0} units
                      </div>
                    </td>
                    {user?.role === 'admin' && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleOpenModal(product)}
                            className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-emerald-600 transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(product.id)}
                            className="p-2 hover:bg-red-50 rounded-lg text-slate-600 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-[28px] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-800">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Product Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  list="product-name-options"
                  placeholder="Type name…"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <datalist id="product-name-options">
                  {productNameOptions.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Price (Rp)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.price}
                    onChange={e => setFormData({ ...formData, price: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cost Price (Rp)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.costPrice}
                    onChange={e => setFormData({ ...formData, costPrice: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Stock</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.stock}
                    onChange={e => setFormData({ ...formData, stock: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="General">General</option>
                    <option value="Food">Food</option>
                    <option value="Drink">Drink</option>
                    <option value="Snack">Snack</option>
                    <option value="Electronics">Electronics</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Product Image</label>
                
                {/* Image Preview */}
                {formData.imageUrl && (
                  <div className="mb-3 relative w-full h-48 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 group">
                    <img 
                      src={formData.imageUrl} 
                      alt="Preview" 
                      className="w-full h-full object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, imageUrl: '' })}
                      className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <div className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <input
                      type="file"
                      id="image-upload"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                      disabled={uploading}
                    />
                    <label
                      htmlFor="image-upload"
                      className={`flex items-center justify-center gap-2 w-full px-4 py-2 border-2 border-dashed border-slate-300 rounded-lg text-slate-600 font-medium cursor-pointer hover:border-emerald-500 hover:text-emerald-600 transition-colors ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {uploading ? (
                        <>
                          <Loader className="w-5 h-5 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="w-5 h-5" />
                          Choose File
                        </>
                      )}
                    </label>
                  </div>
                  <div className="text-sm text-slate-400">OR</div>
                  <div className="flex-1">
                    <input
                      type="url"
                      placeholder="Paste image URL..."
                      value={formData.imageUrl}
                      onChange={e => setFormData({ ...formData, imageUrl: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                      disabled={uploading}
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-1">Supported: JPG, PNG, WEBP (Max 2MB)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium"
                >
                  {editingProduct ? 'Update Product' : 'Add Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
