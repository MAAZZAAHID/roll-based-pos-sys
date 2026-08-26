import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import POSPage   from './pages/POSPage';
import SalesPage from './pages/SalesPage';
import DashboardPage from './pages/DashboardPage';
import ReportsPage from './pages/ReportsPage';
import UsersPage from './pages/UsersPage';

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
  return user ? <Navigate to="/pos" replace /> : children;
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
          <Route path="/pos" element={
            <RequireAuth>
              <POSPage />
            </RequireAuth>
          } />
          <Route path="/sales" element={
            <RequireAuth>
              <SalesPage />
            </RequireAuth>
          } />
          <Route path="/dashboard" element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          } />
          <Route path="/reports" element={
            <RequireAuth>
              <ReportsPage />
            </RequireAuth>
          } />
          <Route path="/users" element={
            <RequireOwner>
              <UsersPage />
            </RequireOwner>
          } />
          {/* Default redirect */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
