import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login, createShop } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [mode, setMode] = useState<'login' | 'create'>('login');
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'create') {
        await createShop({ shopName: shopName.trim(), ownerName: ownerName.trim(), ownerEmail: ownerEmail.trim(), password });
      } else {
        await login(username.trim(), password);
      }
      navigate('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-10 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center justify-center">
      <div className="w-full rounded-2xl border border-gray-700 bg-gray-900 p-8 shadow-2xl sm:p-10">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 mb-4">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Retail POS</h1>
          <p className="text-gray-400 text-sm mt-1">{mode === 'login' ? 'Sign in to continue' : 'Create your shop and owner account'}</p>
        </div>

        {error && (
          <div id="login-error" className="mb-4 px-4 py-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="login-username" className="block text-sm font-medium text-gray-300 mb-1.5">
              {mode === 'login' ? 'Username or email' : 'Shop name'}
            </label>
            <input
              id="login-username"
              type="text"
              autoComplete={mode === 'login' ? 'username' : 'organization'}
              autoFocus
              required
              value={mode === 'login' ? username : shopName}
              onChange={e => mode === 'login' ? setUsername(e.target.value) : setShopName(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              placeholder={mode === 'login' ? 'Enter username or email' : 'Enter shop name'}
            />
          </div>

          {mode === 'create' && <>
            <div>
              <label htmlFor="owner-name" className="block text-sm font-medium text-gray-300 mb-1.5">Owner name</label>
              <input id="owner-name" required value={ownerName} onChange={e => setOwnerName(e.target.value)} className="w-full px-4 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white" placeholder="Your full name" />
            </div>
            <div>
              <label htmlFor="owner-email" className="block text-sm font-medium text-gray-300 mb-1.5">Owner email</label>
              <input id="owner-email" type="email" required value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} className="w-full px-4 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white" placeholder="you@example.com" />
            </div>
          </>}

          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-gray-300 mb-1.5">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              placeholder="Enter password"
            />
          </div>

            <button
            id="login-submit"
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50
                       text-white font-semibold transition focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <button type="button" onClick={() => { setMode(mode === 'login' ? 'create' : 'login'); setError(''); }} className="mt-4 w-full text-sm font-medium text-indigo-300 hover:text-indigo-200">
          {mode === 'login' ? 'Create Shop' : 'Already have a shop? Sign In'}
        </button>
      </div>
      </div>
    </div>
  );
}
