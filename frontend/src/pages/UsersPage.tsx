import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

interface User {
  id: number;
  username: string;
  email: string | null;
  full_name: string | null;
  role: 'owner' | 'manager' | 'cashier';
  is_active: boolean;
  created_at: string;
}

type ModalMode = 'add' | 'edit' | 'password' | null;

const ROLES = ['cashier', 'manager', 'owner'] as const;

function roleBadge(role: string) {
  const map: Record<string, string> = {
    owner:   'bg-purple-900/40 text-purple-300 border border-purple-700/40',
    manager: 'bg-blue-900/40 text-blue-300 border border-blue-700/40',
    cashier: 'bg-gray-800 text-gray-300 border border-gray-700',
  };
  return map[role] || 'bg-gray-800 text-gray-300';
}

export default function UsersPage() {
  const { user: me, logout } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Add / Edit form state
  const [fUsername, setFUsername] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fFullName, setFFullName] = useState('');
  const [fRole, setFRole] = useState<string>('cashier');
  const [fActive, setFActive] = useState(true);
  const [fPassword, setFPassword] = useState('');
  const [fPasswordConfirm, setFPasswordConfirm] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get<User[]>('/users');
      setUsers(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  function flashSuccess(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3500);
  }

  function openAdd() {
    setFUsername(''); setFEmail(''); setFFullName('');
    setFRole('cashier'); setFActive(true);
    setFPassword(''); setFPasswordConfirm('');
    setFormError('');
    setModalMode('add');
  }

  function openEdit(u: User) {
    setSelectedUser(u);
    setFUsername(u.username);
    setFEmail(u.email || '');
    setFFullName(u.full_name || '');
    setFRole(u.role);
    setFActive(u.is_active);
    setFormError('');
    setModalMode('edit');
  }

  function openPassword(u: User) {
    setSelectedUser(u);
    setFPassword('');
    setFPasswordConfirm('');
    setFormError('');
    setModalMode('password');
  }

  function closeModal() {
    setModalMode(null);
    setSelectedUser(null);
    setFormError('');
  }

  async function handleToggleActive(u: User) {
    try {
      if (u.is_active) {
        await api.delete(`/users/${u.id}`);
        flashSuccess(`${u.username} deactivated.`);
      } else {
        await api.put(`/users/${u.id}`, {
          username: u.username,
          role: u.role,
          is_active: true,
        });
        flashSuccess(`${u.username} reactivated.`);
      }
      loadUsers();
    } catch (err: any) {
      setError(err.message || 'Action failed');
    }
  }

  async function handleSaveAdd() {
    setFormError('');
    if (!fUsername.trim()) { setFormError('Username is required.'); return; }
    if (!fPassword) { setFormError('Password is required.'); return; }
    if (fPassword.length < 6) { setFormError('Password must be at least 6 characters.'); return; }
    if (fPassword !== fPasswordConfirm) { setFormError('Passwords do not match.'); return; }

    setSaving(true);
    try {
      await api.post('/users', {
        username: fUsername.trim(),
        email: fEmail.trim() || undefined,
        full_name: fFullName.trim() || undefined,
        password: fPassword,
        role: fRole,
      });
      flashSuccess(`User "${fUsername}" created.`);
      closeModal();
      loadUsers();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit() {
    if (!selectedUser) return;
    setFormError('');
    if (!fUsername.trim()) { setFormError('Username is required.'); return; }

    setSaving(true);
    try {
      await api.put(`/users/${selectedUser.id}`, {
        username: fUsername.trim(),
        email: fEmail.trim() || null,
        full_name: fFullName.trim() || null,
        role: fRole,
        is_active: fActive,
      });
      flashSuccess(`User "${fUsername}" updated.`);
      closeModal();
      loadUsers();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePassword() {
    if (!selectedUser) return;
    setFormError('');
    if (!fPassword) { setFormError('New password is required.'); return; }
    if (fPassword.length < 6) { setFormError('Password must be at least 6 characters.'); return; }
    if (fPassword !== fPasswordConfirm) { setFormError('Passwords do not match.'); return; }

    setSaving(true);
    try {
      await api.put(`/users/${selectedUser.id}/password`, { password: fPassword });
      flashSuccess(`Password for "${selectedUser.username}" updated.`);
      closeModal();
    } catch (err: any) {
      setFormError(err.message || 'Failed to reset password');
    } finally {
      setSaving(false);
    }
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold text-white tracking-wide">User Management</h1>
          <nav className="hidden md:flex gap-4">
            <button onClick={() => navigate('/dashboard')} className="text-sm font-medium text-gray-400 hover:text-white transition">Dashboard</button>
            <button onClick={() => navigate('/pos')} className="text-sm font-medium text-gray-400 hover:text-white transition">POS</button>
            <button onClick={() => navigate('/reports')} className="text-sm font-medium text-gray-400 hover:text-white transition">Reports</button>
            <button onClick={() => navigate('/sales')} className="text-sm font-medium text-gray-400 hover:text-white transition">Sales History</button>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{me?.fullName}
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-purple-600/30 text-purple-300">{me?.role}</span>
          </span>
          <button onClick={() => { logout(); navigate('/login'); }} className="text-sm text-gray-400 hover:text-white transition">Sign out</button>
        </div>
      </header>

      <div className="flex-1 p-6 max-w-6xl mx-auto w-full space-y-5">
        {/* Flash messages */}
        {success && <div className="p-3 bg-green-900/40 border border-green-700 text-green-300 rounded-xl text-sm">{success}</div>}
        {error && <div className="p-3 bg-red-900/40 border border-red-700 text-red-300 rounded-xl text-sm">{error}</div>}

        {/* Toolbar */}
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-400">{users.length} user{users.length !== 1 ? 's' : ''}</p>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition"
          >
            + Add User
          </button>
        </div>

        {/* Users Table */}
        <div className="bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50 text-gray-400 text-xs uppercase">
              <tr>
                <th className="px-6 py-3 text-left font-medium">Username</th>
                <th className="px-6 py-3 text-left font-medium">Full Name</th>
                <th className="px-6 py-3 text-center font-medium">Role</th>
                <th className="px-6 py-3 text-center font-medium">Status</th>
                <th className="px-6 py-3 text-left font-medium">Created</th>
                <th className="px-6 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-500">Loading users...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-500">No users found.</td></tr>
              ) : (
                users.map(u => (
                  <tr key={u.id} className={`hover:bg-gray-800/40 transition ${!u.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-6 py-4 font-mono text-sm text-white">{u.username}</td>
                    <td className="px-6 py-4 text-gray-300">{u.full_name || <span className="text-gray-600 italic">—</span>}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-semibold capitalize ${roleBadge(u.role)}`}>{u.role}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${u.is_active ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-xs">{fmtDate(u.created_at)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEdit(u)}
                          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-medium transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => openPassword(u)}
                          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-blue-300 rounded-lg text-xs font-medium transition"
                        >
                          Password
                        </button>
                        <button
                          onClick={() => handleToggleActive(u)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                            u.is_active
                              ? 'bg-red-900/30 hover:bg-red-900/50 text-red-400'
                              : 'bg-green-900/30 hover:bg-green-900/50 text-green-400'
                          }`}
                        >
                          {u.is_active ? 'Deactivate' : 'Activate'}
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

      {/* ─── Modals ─── */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md mx-4 shadow-2xl">
            <div className="px-6 py-5 border-b border-gray-700 flex justify-between items-center">
              <h2 className="text-base font-bold text-white">
                {modalMode === 'add' ? 'Add New User' : modalMode === 'edit' ? `Edit: ${selectedUser?.username}` : `Reset Password: ${selectedUser?.username}`}
              </h2>
              <button onClick={closeModal} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
            </div>

            <div className="p-6 space-y-4">
              {formError && <div className="p-3 bg-red-900/40 border border-red-700 text-red-300 rounded-lg text-sm">{formError}</div>}

              {/* Add / Edit fields */}
              {(modalMode === 'add' || modalMode === 'edit') && (
                <>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Username *</label>
                    <input
                      type="text"
                      value={fUsername}
                      onChange={e => setFUsername(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="e.g. john_doe"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Full Name</label>
                    <input
                      type="text"
                      value={fFullName}
                      onChange={e => setFFullName(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Email</label>
                    <input
                      type="email"
                      value={fEmail}
                      onChange={e => setFEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="john@store.local"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Role *</label>
                    <select
                      value={fRole}
                      onChange={e => setFRole(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {ROLES.map(r => <option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                    </select>
                  </div>
                  {modalMode === 'edit' && (
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="f-active"
                        checked={fActive}
                        onChange={e => setFActive(e.target.checked)}
                        className="w-4 h-4 rounded"
                      />
                      <label htmlFor="f-active" className="text-sm text-gray-300">Active</label>
                    </div>
                  )}
                </>
              )}

              {/* Password fields */}
              {(modalMode === 'add' || modalMode === 'password') && (
                <>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      {modalMode === 'add' ? 'Password *' : 'New Password *'}
                    </label>
                    <input
                      type="password"
                      value={fPassword}
                      onChange={e => setFPassword(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Confirm Password *</label>
                    <input
                      type="password"
                      value={fPasswordConfirm}
                      onChange={e => setFPasswordConfirm(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      autoComplete="new-password"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
              <button onClick={closeModal} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition">
                Cancel
              </button>
              <button
                disabled={saving}
                onClick={modalMode === 'add' ? handleSaveAdd : modalMode === 'edit' ? handleSaveEdit : handleSavePassword}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
              >
                {saving ? 'Saving...' : modalMode === 'password' ? 'Update Password' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
