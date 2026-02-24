import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Users, 
  Settings, 
  LogOut,
  Menu,
  X,
  ClipboardList,
  BarChart3,
  Truck,
  Store,
  Wallet,
  Send
} from 'lucide-react';
import { useState } from 'react';

export default function DashboardLayout() {
  const { user } = useAuthStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/pos', icon: ShoppingCart, label: 'POS' },
    { to: '/telegram-orders', icon: Send, label: 'Telegram' },
    { to: '/products', icon: Package, label: 'Products' },
    { to: '/inventory', icon: ClipboardList, label: 'Inventory' },
    { to: '/purchases', icon: Truck, label: 'Purchases' },
    { to: '/reports', icon: BarChart3, label: 'Reports' },
    { to: '/customers', icon: Users, label: 'Customers' },
    { to: '/savings', icon: Wallet, label: 'Savings' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navbar */}
      <header className="bg-red-700 text-white shadow-md sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-20">
            {/* Logo Section */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shrink-0 overflow-hidden p-0.5">
                <img 
                  src="https://i.imgur.com/XOFzm4u.png" 
                  onError={(e) => {
                    e.currentTarget.onerror = null; 
                    e.currentTarget.src = "https://ui-avatars.com/api/?name=KOP+DES&background=fff&color=dc2626&bold=true";
                  }}
                  alt="Logo" 
                  className="w-full h-full object-contain" 
                />
              </div>
              <div className="flex flex-col overflow-hidden">
                <h1 className="text-base font-bold text-white leading-tight truncate">KDMP</h1>
                <span className="text-[10px] text-slate-400 font-medium truncate tracking-wide">SINDANGJAYA CIPANAS</span>
              </div>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center space-x-1 overflow-x-auto no-scrollbar mx-4">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `
                    flex flex-col items-center justify-center px-3 py-2 rounded-lg transition-colors min-w-[70px]
                    ${isActive 
                      ? 'bg-white text-red-700 shadow-sm font-bold' 
                      : 'text-red-100 hover:bg-red-800 hover:text-white'}
                  `}
                >
                  <item.icon className="w-5 h-5 mb-1" />
                  <span className="text-[10px] uppercase tracking-wide">{item.label}</span>
                </NavLink>
              ))}
            </nav>

            {/* User Profile & Mobile Menu Toggle */}
            <div className="flex items-center gap-4 shrink-0">
              <div className="hidden md:flex items-center gap-3 pl-4 border-l border-slate-800">
                <div className="text-right hidden xl:block">
                  <p className="text-sm font-medium leading-none">{user?.name}</p>
                  <p className="text-xs text-slate-500 capitalize mt-1">{user?.role}</p>
                </div>
                <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center font-bold text-sm shadow-sm border-2 border-slate-800">
                  {user?.name?.charAt(0) || 'U'}
                </div>
              </div>

              {/* Mobile Menu Button */}
              <button 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
                className="lg:hidden p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        {isMobileMenuOpen && (
          <nav className="lg:hidden border-t border-red-800 bg-red-700 absolute w-full left-0 shadow-xl animate-in slide-in-from-top-2 z-40">
            <div className="container mx-auto p-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={({ isActive }) => `
                    flex flex-col items-center justify-center p-4 rounded-xl transition-colors border border-red-800
                    ${isActive 
                      ? 'bg-white text-red-700 border-white shadow-lg' 
                      : 'bg-red-800/50 text-red-200 hover:bg-red-800 hover:text-white'}
                  `}
                >
                  <item.icon className="w-6 h-6 mb-2" />
                  <span className="text-xs font-medium">{item.label}</span>
                </NavLink>
              ))}
            </div>
            
            {/* Mobile User Info */}
            <div className="p-4 border-t border-red-800 bg-red-900/50 flex items-center gap-3">
               <div className="w-10 h-10 rounded-full bg-white text-red-700 flex items-center justify-center font-bold">
                  {user?.name?.charAt(0) || 'U'}
               </div>
               <div>
                  <p className="text-sm font-medium text-white">{user?.name}</p>
                  <p className="text-xs text-red-300 capitalize">{user?.role}</p>
               </div>
            </div>
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto p-4 md:p-6 w-full max-w-7xl">
        <Outlet />
      </main>
    </div>
  );
}
