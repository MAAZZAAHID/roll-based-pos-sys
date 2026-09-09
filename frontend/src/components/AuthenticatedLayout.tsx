import { useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const links = [
  { label: 'Home', path: '/dashboard', icon: 'home' },
  { label: 'POS / Cart', path: '/pos', icon: 'cart' },
  { label: 'Inventory', path: '/inventory', icon: 'box' },
  { label: 'Products', path: '/products', icon: 'tag' },
  { label: 'Categories', path: '/categories', icon: 'folder' },
  { label: 'Sales', path: '/sales', icon: 'sales' },
  { label: 'Reports', path: '/reports', icon: 'chart' },
  { label: 'User Management', path: '/users', icon: 'users', ownerOnly: true },
];

type IconName = (typeof links)[number]['icon'];

function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    home: <path d="M3.5 10.5 12 3l8.5 7.5M5.5 9v10.5h13V9M9 19.5v-6h6v6" />,
    cart: <><path d="M3.5 4h2l1.4 9.2a1.5 1.5 0 0 0 1.5 1.3h7.8a1.5 1.5 0 0 0 1.5-1.2L19.5 8H6" /><path d="M9 19h.01M17 19h.01" /></>,
    box: <path d="m4 7 8-4 8 4v10l-8 4-8-4V7Zm0 0 8 4 8-4M12 11v10" />,
    tag: <path d="m20 13-7 7-9-9V4h7l9 9ZM7.5 7.5h.01" />,
    folder: <path d="M3.5 6.5h6l2 2h9v9.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9.5a2 2 0 0 1 2-2Z" />,
    sales: <path d="M4 19.5V9.5M10 19.5v-6M16 19.5V5.5M22 19.5V2.5" />,
    chart: <><path d="M4 19.5V4.5M4 19.5h17" /><path d="m7 15 4-4 3 2 5-6" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8M16.5 13a5.5 5.5 0 0 1 4 6" /></>,
  };
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden="true">{paths[name]}</svg>;
}

export default function AuthenticatedLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const visibleLinks = links.filter(link => !link.ownerOnly || user?.role === 'owner');

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="sticky top-0 z-40 border-b border-gray-700 bg-gray-900 px-4 shadow-sm backdrop-blur no-print sm:px-6">
        <div className="mx-auto flex min-h-16 max-w-[1600px] items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="flex shrink-0 items-center gap-2.5 rounded-lg py-1 pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" aria-label="Go to Home dashboard">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                <path d="M4 5.5h2l1.2 8.1a1.5 1.5 0 0 0 1.5 1.3h7.9a1.5 1.5 0 0 0 1.5-1.2L19.5 9H7" />
                <path d="M9 18.5h.01M17 18.5h.01M8 9l2-3 2 3 2-3 2 3" />
              </svg>
            </span>
            <span className="text-base font-bold tracking-tight">Retail POS</span>
          </button>

          <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto xl:flex" aria-label="Main navigation">
            {visibleLinks.map(link => (
              <NavLink
                key={link.path}
                to={link.path}
                end={link.path === '/dashboard'}
                className={({ isActive }) => `inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${isActive ? 'bg-indigo-600 font-semibold text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
              >
                <NavIcon name={link.icon} />
                <span>{link.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span className="hidden max-w-36 truncate text-sm text-gray-400 2xl:inline">{user?.fullName}</span>
            <span className="rounded-full bg-indigo-600/30 px-2 py-1 text-xs capitalize text-indigo-300">{user?.role}</span>
            <button onClick={() => { logout(); navigate('/login'); }} className="hidden rounded-lg px-2.5 py-2 text-sm text-gray-400 transition hover:bg-gray-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 xl:inline-flex">Sign Out</button>
            <button onClick={() => setMenuOpen(open => !open)} className="inline-flex rounded-lg bg-gray-800 p-2 text-gray-200 transition hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 xl:hidden" aria-expanded={menuOpen} aria-controls="mobile-navigation" aria-label="Toggle navigation menu">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav id="mobile-navigation" className="mx-auto grid max-h-[calc(100vh-4rem)] max-w-[1600px] grid-cols-2 gap-1.5 overflow-y-auto border-t border-gray-800 py-3 xl:hidden" aria-label="Mobile navigation">
            {visibleLinks.map(link => {
              const active = link.path === '/dashboard' ? location.pathname === '/dashboard' : location.pathname.startsWith(link.path);
              return <NavLink key={link.path} to={link.path} end={link.path === '/dashboard'} onClick={closeMenu} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${active ? 'bg-indigo-600 font-semibold text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}><NavIcon name={link.icon} /><span>{link.label}</span></NavLink>;
            })}
            <button onClick={() => { closeMenu(); logout(); navigate('/login'); }} className="inline-flex items-center rounded-lg bg-gray-800 px-3 py-2.5 text-left text-sm text-gray-300 transition hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Sign Out</button>
          </nav>
        )}
      </header>
      <Outlet />
      <footer className="app-footer no-print">Retail POS <span className="mx-1">·</span> © 2026</footer>
    </div>
  );
}
