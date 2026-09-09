import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import POSPage   from './pages/POSPage';
import SalesPage from './pages/SalesPage';
import DashboardPage from './pages/DashboardPage';
import ReportsPage from './pages/ReportsPage';
import UsersPage from './pages/UsersPage';
import InventoryPage from './pages/InventoryPage';
import CatalogPage from './pages/CatalogPage';
import AuthenticatedLayout from './components/AuthenticatedLayout';

// ─── Route Guards ─────────────────────────────────────────────────────────────

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400 text-sm">
      Loading…
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
}

function RequireOwner({ children }: { children: React.ReactElement }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400 text-sm">
      Loading…
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'owner') return <Navigate to="/dashboard" replace />;
  return children;
}

function RedirectIfAuthed({ children }: { children: React.ReactElement }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" replace /> : children;
}

// ─── App ──────────────────────────────────────────────────────────────────────

import React from 'react';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={
            <RedirectIfAuthed>
              <LoginPage />
            </RedirectIfAuthed>
          } />
          <Route element={<RequireAuth><AuthenticatedLayout /></RequireAuth>}>
            <Route path="/pos" element={<POSPage />} />
            <Route path="/sales" element={<SalesPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/products" element={<CatalogPage kind="products" />} />
            <Route path="/categories" element={<CatalogPage kind="categories" />} />
            <Route path="/users" element={<RequireOwner><UsersPage /></RequireOwner>} />
          </Route>
          {/* Default redirect */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
