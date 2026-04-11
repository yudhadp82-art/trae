import { Outlet, NavLink } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Users, 
  Settings, 
  Menu,
  X,
  ClipboardList,
  BarChart3,
  Truck,
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
    <div className="min-h-screen flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 px-3 pt-3 md:px-5 md:pt-5">
        <div className="mx-auto max-w-7xl rounded-[28px] border border-red-950/10 bg-[linear-gradient(135deg,#991b1b_0%,#b91c1c_40%,#f97316_100%)] text-white shadow-[0_20px_80px_rgba(127,29,29,0.28)]">
          <div className="flex items-center justify-between gap-4 px-4 py-4 md:px-6 md:py-5">
            {/* Logo Section */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-lg shadow-red-950/20 shrink-0 overflow-hidden p-1">
                <img 
                  src="/kdmp-logo.svg"
                  alt="Logo" 
                  className="w-full h-full object-contain" 
                />
              </div>
              <div className="flex flex-col overflow-hidden">
                <h1 className="text-lg font-bold leading-tight truncate">KDMP</h1>
                <span className="text-[10px] font-medium uppercase tracking-[0.28em] text-red-100/80 truncate">Sindangjaya Cipanas</span>
              </div>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1.5 overflow-x-auto no-scrollbar mx-4 rounded-2xl bg-white/10 p-1.5 backdrop-blur-md">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `
                    flex min-w-[74px] flex-col items-center justify-center rounded-xl px-3 py-2.5 transition-all
                    ${isActive 
                      ? 'bg-white text-red-700 shadow-md shadow-red-950/10 font-bold' 
                      : 'text-red-50/88 hover:bg-white/12 hover:text-white'}
                  `}
                >
                  <item.icon className="mb-1 h-5 w-5" />
                  <span className="text-[10px] uppercase tracking-[0.16em]">{item.label}</span>
                </NavLink>
              ))}
            </nav>

            {/* User Profile & Mobile Menu Toggle */}
            <div className="flex items-center gap-4 shrink-0">
              <div className="hidden md:flex items-center gap-3 rounded-2xl border border-white/12 bg-black/10 px-3 py-2">
                <div className="text-right hidden xl:block">
                  <p className="text-sm font-medium leading-none text-white">{user?.name}</p>
                  <p className="mt-1 text-[11px] capitalize text-red-100/80">{user?.role}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-300 text-red-900 font-bold text-sm shadow-lg">
                  {user?.name?.charAt(0) || 'U'}
                </div>
              </div>

              {/* Mobile Menu Button */}
              <button 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
                className="rounded-2xl border border-white/15 bg-black/10 p-2.5 text-red-50/85 transition-colors hover:bg-black/20 hover:text-white lg:hidden"
              >
                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        {isMobileMenuOpen && (
          <nav className="mx-auto mt-3 max-w-7xl overflow-hidden rounded-[26px] border border-red-950/10 bg-[linear-gradient(180deg,rgba(127,29,29,0.96),rgba(153,27,27,0.94))] shadow-[0_22px_70px_rgba(127,29,29,0.22)] animate-in slide-in-from-top-2 z-40 lg:hidden">
            <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={({ isActive }) => `
                    flex flex-col items-center justify-center rounded-2xl border p-4 transition-colors
                    ${isActive 
                      ? 'border-white bg-white text-red-700 shadow-lg' 
                      : 'border-white/10 bg-white/8 text-red-100 hover:bg-white/12 hover:text-white'}
                  `}
                >
                  <item.icon className="w-6 h-6 mb-2" />
                  <span className="text-xs font-medium">{item.label}</span>
                </NavLink>
              ))}
            </div>
            
            {/* Mobile User Info */}
            <div className="flex items-center gap-3 border-t border-white/10 bg-black/10 p-4">
               <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-300 font-bold text-red-900">
                  {user?.name?.charAt(0) || 'U'}
               </div>
               <div>
                  <p className="text-sm font-medium text-white">{user?.name}</p>
                  <p className="text-xs capitalize text-red-100/80">{user?.role}</p>
               </div>
            </div>
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="mx-auto flex-1 w-full max-w-7xl px-3 pb-8 pt-6 md:px-5 md:pb-10 md:pt-8">
        <Outlet />
      </main>
    </div>
  );
}
