import { useEffect, useState } from 'react';
import { 
  Banknote, 
  ShoppingBag, 
  Package, 
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Wallet
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import { collection, query, orderBy, onSnapshot, where, Timestamp } from 'firebase/firestore';
import { db } from '../api/firebase';
import { Sale, Product, SavingsAccount } from '../types';

export default function Dashboard() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [totalSavings, setTotalSavings] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch Sales
    const salesQuery = query(collection(db, 'sales'), orderBy('createdAt', 'desc'));
    const unsubscribeSales = onSnapshot(salesQuery, (snapshot) => {
      const salesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()
      })) as Sale[];
      setSales(salesData);
    });

    // Fetch Products for Low Stock Alert
    const productsQuery = query(collection(db, 'products'));
    const unsubscribeProducts = onSnapshot(productsQuery, (snapshot) => {
      const productsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Product[];
      setProducts(productsData);
    });

    // Fetch Savings for Total
    const savingsQuery = query(collection(db, 'savings_accounts'));
    const unsubscribeSavings = onSnapshot(savingsQuery, (snapshot) => {
      const accounts = snapshot.docs.map(doc => ({
        ...doc.data()
      })) as SavingsAccount[];
      const total = accounts.reduce((acc, curr) => 
        acc + (curr.balanceWajib || 0) + (curr.balanceSukarela || 0) + (curr.balancePokok || 0), 0
      );
      setTotalSavings(total);
      setLoading(false);
    });

    return () => {
      unsubscribeSales();
      unsubscribeProducts();
      unsubscribeSavings();
    };
  }, []);

  // Calculate Stats
  const totalRevenue = sales.reduce((acc, sale) => acc + (sale.totalAmount || 0), 0);
  const totalOrders = sales.length;
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const lowStockProducts = products.filter(p => (p.stock || 0) <= 5);

  // Prepare Chart Data (Last 7 Days)
  const getLast7DaysData = () => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayStr = date.toLocaleDateString('en-US', { weekday: 'short' });
      
      const daySales = sales.filter(sale => {
        if (!sale.createdAt) return false;
        const saleDate = new Date(sale.createdAt);
        return saleDate.getDate() === date.getDate() && 
               saleDate.getMonth() === date.getMonth() &&
               saleDate.getFullYear() === date.getFullYear();
      });

      days.push({
        name: dayStr,
        amount: daySales.reduce((acc, sale) => acc + (sale.totalAmount || 0), 0),
        orders: daySales.length
      });
    }
    return days;
  };

  const chartData = getLast7DaysData();

  const StatCard = ({ title, value, icon: Icon, color, trend }: any) => (
    <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        {trend && (
          <div className={`flex items-center text-sm font-medium ${trend > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {trend > 0 ? <ArrowUpRight className="w-4 h-4 mr-1" /> : <ArrowDownRight className="w-4 h-4 mr-1" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <h3 className="text-slate-500 text-sm font-medium mb-1">{title}</h3>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
    </div>
  );

  if (loading) return <div className="p-8 text-center">Loading dashboard...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Dashboard Overview</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Revenue" 
          value={`Rp ${(totalRevenue || 0).toLocaleString()}`} 
          icon={Banknote} 
          color="bg-emerald-500"
          trend={12.5}
        />
        <StatCard 
          title="Total Savings" 
          value={`Rp ${(totalSavings || 0).toLocaleString()}`} 
          icon={Wallet} 
          color="bg-blue-600"
          trend={5.0}
        />
        <StatCard 
          title="Total Orders" 
          value={totalOrders} 
          icon={ShoppingBag} 
          color="bg-blue-500"
          trend={8.2}
        />
        <StatCard 
          title="Avg. Order Value" 
          value={`Rp ${(Math.round(averageOrderValue) || 0).toLocaleString()}`} 
          icon={TrendingUp} 
          color="bg-purple-500"
          trend={-2.4}
        />
        <StatCard 
          title="Low Stock Items" 
          value={lowStockProducts.length} 
          icon={Package} 
          color="bg-orange-500"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-6">Revenue Overview</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b'}} tickFormatter={(value) => `Rp${value/1000}k`} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`Rp ${(value || 0).toLocaleString()}`, 'Revenue']}
                />
                <Area type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Activity / Low Stock */}
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-6">Low Stock Alert</h3>
          <div className="space-y-4">
            {lowStockProducts.length === 0 ? (
              <p className="text-slate-500 text-center py-4">All stock levels are good!</p>
            ) : (
              lowStockProducts.slice(0, 5).map(product => (
                <div key={product.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-md flex items-center justify-center overflow-hidden">
                       {product.imageUrl ? (
                         <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                       ) : (
                         <Package className="w-5 h-5 text-red-400" />
                       )}
                    </div>
                    <div>
                      <p className="font-medium text-slate-800 line-clamp-1">{product.name}</p>
                      <p className="text-xs text-red-600 font-medium">Only {product.stock || 0} left</p>
                    </div>
                  </div>
                  <button className="text-xs bg-white text-slate-600 px-2 py-1 rounded border border-slate-200 hover:bg-slate-50">
                    Restock
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Transactions Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-800">Recent Transactions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium">
              <tr>
                <th className="px-6 py-4">Transaction ID</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Items</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sales.slice(0, 5).map((sale) => (
                <tr key={sale.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-mono text-slate-500">#{sale.id.slice(0, 8)}</td>
                  <td className="px-6 py-4 text-slate-600">
                    {sale.createdAt ? new Date(sale.createdAt).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {sale.items?.length || 0} items
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-800">
                    Rp {(sale.totalAmount || 0).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full text-xs font-medium capitalize">
                      {sale.status || 'Unknown'}
                    </span>
                  </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }
