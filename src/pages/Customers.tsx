import { useState, useEffect } from 'react';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  writeBatch,
  doc, 
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../api/firebase';
import { Customer } from '../types';
import * as XLSX from 'xlsx';
import { 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  User, 
  MapPin, 
  Phone, 
  CreditCard,
  X,
  Download,
  Upload,
  Loader,
  FileSpreadsheet
} from 'lucide-react';

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  const [formData, setFormData] = useState({
    memberId: '',
    name: '',
    phone: '',
    address: '',
    joinDate: new Date().toISOString().slice(0, 10) // Default to today
  });

  // Fetch Customers
  useEffect(() => {
    const q = query(collection(db, 'customers'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const customersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        lastVisit: doc.data().lastVisit?.toDate(),
        joinDate: doc.data().joinDate?.toDate(),
        createdAt: doc.data().createdAt?.toDate()
      })) as Customer[];
      setCustomers(customersData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleOpenModal = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({
        memberId: customer.memberId || '',
        name: customer.name,
        phone: customer.phone || '',
        address: customer.address || '',
        joinDate: customer.joinDate ? new Date(customer.joinDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
      });
    } else {
      setEditingCustomer(null);
      // Generate simple Member ID recommendation (e.g., M-001)
      const nextId = `M-${String(customers.length + 1).padStart(3, '0')}`;
      setFormData({
        memberId: nextId,
        name: '',
        phone: '',
        address: '',
        joinDate: new Date().toISOString().slice(0, 10)
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.memberId.trim() || !formData.name.trim()) {
      alert('Member ID and Name are required!');
      return;
    }

    const customerData = {
      memberId: formData.memberId,
      name: formData.name,
      phone: formData.phone,
      address: formData.address,
      joinDate: new Date(formData.joinDate),
      updatedAt: serverTimestamp()
    };

    try {
      if (editingCustomer) {
        await updateDoc(doc(db, 'customers', editingCustomer.id), customerData);
      } else {
        await addDoc(collection(db, 'customers'), {
          ...customerData,
          totalSpent: 0,
          createdAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error saving customer:', error);
      alert('Failed to save customer');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this customer?')) {
      try {
        await deleteDoc(doc(db, 'customers', id));
      } catch (error) {
        console.error('Error deleting customer:', error);
        alert('Failed to delete customer');
      }
    }
  };

  const exportCustomers = () => {
    const data = customers.map(c => ({
      'Member ID': c.memberId,
      'Name': c.name,
      'Phone': c.phone,
      'Address': c.address,
      'Total Spent': c.totalSpent
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    XLSX.writeFile(wb, `Customers_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const downloadTemplate = () => {
    const templateData = [
      {
        'Member ID': 'M-001 (Optional)',
        'Name': 'Contoh Nama (Wajib)',
        'Phone': '08123456789',
        'Address': 'Jl. Contoh No. 123',
        'Join Date': '2023-01-01 (YYYY-MM-DD)'
      }
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Format_Upload_Pelanggan.xlsx");
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    const reader = new FileReader();
    
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const batch = writeBatch(db);
        let count = 0;

        data.forEach((row, index) => {
          if (!row.Name) return; // Skip invalid rows
          
          const docRef = doc(collection(db, 'customers'));
          
          // Parse Join Date if exists, otherwise use today
          let joinDate = new Date();
          if (row['Join Date']) {
            const parsedDate = new Date(row['Join Date']);
            if (!isNaN(parsedDate.getTime())) {
              joinDate = parsedDate;
            }
          }

          batch.set(docRef, {
            memberId: row['Member ID'] || `M-${String(customers.length + index + 1).padStart(3, '0')}`,
            name: row.Name,
            phone: row.Phone || '',
            address: row.Address || '',
            joinDate: joinDate,
            totalSpent: 0,
            createdAt: serverTimestamp()
          });
          count++;
        });

        await batch.commit();
        alert(`Berhasil mengimpor ${count} pelanggan!`);
      } catch (error) {
        console.error('Import failed:', error);
        alert('Gagal mengimpor file Excel. Pastikan format sesuai.');
      } finally {
        setImporting(false);
        // Reset file input
        e.target.value = ''; 
      }
    };
    
    reader.readAsBinaryString(file);
  };

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.memberId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (customer.phone && customer.phone.includes(searchTerm))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Manajemen Pelanggan</h1>
          <p className="text-slate-500 text-sm">Kelola data anggota dan pelanggan toko</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCustomers}
            className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
            title="Download Excel"
          >
            <Download className="w-5 h-5" />
            <span className="hidden sm:inline">Export</span>
          </button>
          
          <div className="relative">
            <input
              type="file"
              accept=".xlsx, .xls"
              onChange={handleImport}
              className="hidden"
              id="import-customers"
              disabled={importing}
            />
            <label
              htmlFor="import-customers"
              className={`bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm cursor-pointer ${importing ? 'opacity-50 cursor-wait' : ''}`}
              title="Upload Excel"
            >
              {importing ? <Loader className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
              <span className="hidden sm:inline">Import</span>
            </label>
          </div>

          <button
            onClick={downloadTemplate}
            className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
            title="Download Template Format"
          >
            <FileSpreadsheet className="w-5 h-5" />
            <span className="hidden sm:inline">Format</span>
          </button>

          <button
            onClick={() => handleOpenModal()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Tambah</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama, nomor anggota..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium">
              <tr>
                <th className="px-6 py-4">No. Anggota</th>
                <th className="px-6 py-4">Nama Pelanggan</th>
                <th className="px-6 py-4">Tanggal Bergabung</th>
                <th className="px-6 py-4">Alamat</th>
                <th className="px-6 py-4">Total Belanja</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    Memuat data pelanggan...
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <User className="w-12 h-12 text-slate-300 mb-2" />
                      <p>Belum ada data pelanggan</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-mono font-medium text-emerald-600">
                      {customer.memberId || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-800">{customer.name}</div>
                      {customer.phone && (
                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />
                          {customer.phone}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {customer.joinDate ? new Date(customer.joinDate).toLocaleDateString('id-ID') : '-'}
                    </td>
                    <td className="px-6 py-4 text-slate-600 max-w-xs truncate">
                      {customer.address || '-'}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-800">
                      Rp {(customer.totalSpent || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleOpenModal(customer)}
                          className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-emerald-600 transition-colors"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(customer.id)}
                          className="p-2 hover:bg-red-50 rounded-lg text-slate-600 hover:text-red-600 transition-colors"
                          title="Hapus"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800">
                {editingCustomer ? 'Edit Anggota' : 'Tambah Anggota Baru'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nomor Anggota <span className="text-red-500">*</span></label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={formData.memberId}
                    onChange={e => setFormData({ ...formData, memberId: e.target.value })}
                    className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                    placeholder="Contoh: M-001"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nama Lengkap <span className="text-red-500">*</span></label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="Nama Pelanggan"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nomor Telepon (Opsional)</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="08xxxxxxxxxx"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tanggal Bergabung</label>
                <div className="relative">
                  <input
                    type="date"
                    required
                    value={formData.joinDate}
                    onChange={e => setFormData({ ...formData, joinDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Alamat Lengkap</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <textarea
                    rows={3}
                    value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                    placeholder="Jalan, Kota, Kode Pos..."
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors shadow-sm"
                >
                  Simpan Data
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
