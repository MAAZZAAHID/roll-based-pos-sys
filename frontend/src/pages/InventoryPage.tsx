import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

interface InventoryItem {
  product_id: number;
  product_name: string;
  barcode: string | null;
  category_name: string | null;
  quantity: number;
  low_stock_threshold: number;
  status: string;
  product_active: boolean;
}

interface Movement {
  id: number;
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  reason: string;
  reference_type: string | null;
  created_at: string;
  adjusted_by_name: string;
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export default function InventoryPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [quantityChange, setQuantityChange] = useState('');
  const [saving, setSaving] = useState(false);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [historyProduct, setHistoryProduct] = useState<InventoryItem | null>(null);

  const loadInventory = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.get<InventoryItem[]>('/inventory'));
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadInventory(); }, [loadInventory]);

  async function adjustStock() {
    const parsedQuantity = Number(quantityChange);
    if (selectedId === null || !quantityChange || !Number.isSafeInteger(parsedQuantity) || parsedQuantity === 0) {
      setError('Enter a non-zero whole-number quantity change.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post(`/inventory/${selectedId}/adjust`, {
        quantity_change: parsedQuantity,
      });
      setSuccess('Inventory updated successfully.');
      setSelectedId(null);
      setQuantityChange('');
      await loadInventory();
      setTimeout(() => setSuccess(''), 3500);
    } catch (err: any) {
      setError(err.message || 'Failed to update inventory');
    } finally {
      setSaving(false);
    }
  }

  async function showHistory(item: InventoryItem) {
    try {
      setMovements(await api.get<Movement[]>(`/inventory/${item.product_id}/movements`));
      setHistoryProduct(item);
    } catch (err: any) { setError(err.message || 'Failed to load movement history'); }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <main className="app-page space-y-5">
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <div className="page-header">
          <div>
            <p className="page-kicker">Operations</p>
            <h1 className="page-title">Inventory</h1>
            <p className="page-subtitle">Monitor stock levels, movement, and replenishment needs.</p>
          </div>
          <button onClick={loadInventory} className="btn-secondary">Refresh</button>
        </div>

        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table w-full text-sm">
              <thead className="bg-gray-800/60 text-gray-400 text-xs uppercase">
                <tr>
                  <th className="px-5 py-3 text-left">Product</th>
                  <th className="px-5 py-3 text-left">Category</th>
                  <th className="px-5 py-3 text-center">Quantity</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {loading ? (
                  <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-500">Loading inventory...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={5} className="empty-state"><div className="empty-state-title">No active products found</div><div className="empty-state-copy">Add or activate products to start tracking stock.</div></td></tr>
                ) : items.map(item => (
                  <tr key={item.product_id} className="hover:bg-gray-800/40">
                    <td className="px-5 py-4">
                      <p className="text-white font-medium">{item.product_name}</p>
                      <p className="text-xs text-gray-500">{item.barcode || 'No barcode'}</p>
                    </td>
                    <td className="px-5 py-4 text-gray-400">{item.category_name || 'Uncategorized'}</td>
                    <td className="px-5 py-4 text-center text-white font-semibold">{item.quantity}</td>
                    <td className="px-5 py-4 text-center">
                      <span className={`px-2 py-1 rounded text-xs ${item.status === 'In Stock' ? 'bg-green-900/40 text-green-400' : item.status === 'Low Stock' ? 'bg-yellow-900/40 text-yellow-400' : 'bg-red-900/40 text-red-400'}`}>{item.status}</span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      {(user?.role === 'owner' || user?.role === 'manager') && (
                        <>
                          <button onClick={() => setSelectedId(item.product_id)} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs">Adjust stock</button>
                        </>
                      )}
                      <button onClick={() => showHistory(item)} className="ml-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs">History</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selectedId !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="adjust-stock-title">
            <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-5 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 id="adjust-stock-title" className="font-semibold text-lg">Adjust Stock</h2>
                <button onClick={() => setSelectedId(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white" aria-label="Close adjustment dialog"><CloseIcon /></button>
              </div>
              <div className="space-y-3">
                <label htmlFor="quantity-change" className="block text-sm font-medium text-gray-300">Quantity change</label>
                <input id="quantity-change" type="number" step="1" value={quantityChange} onChange={e => setQuantityChange(e.target.value)} placeholder="Enter a positive or negative whole number" className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm" autoFocus />
                <p className="text-xs text-gray-500">Use a positive number to add stock or a negative number to reduce it.</p>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setSelectedId(null)} className="px-3 py-2 bg-gray-800 rounded-lg text-sm">Cancel</button>
                  <button onClick={adjustStock} disabled={saving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm">{saving ? 'Saving...' : 'Save adjustment'}</button>
                </div>
              </div>
            </div>
          </div>
        )}
        {historyProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-2xl rounded-2xl border border-gray-700 bg-gray-900 p-5 shadow-2xl">
              <div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-semibold">Movement History</h2><p className="text-sm text-gray-500">{historyProduct.product_name}</p></div><button onClick={() => setHistoryProduct(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white" aria-label="Close movement history"><CloseIcon /></button></div>
              <div className="max-h-80 overflow-auto"><table className="w-full text-sm"><thead className="text-xs uppercase text-gray-500"><tr><th className="px-2 py-2 text-left">Date</th><th className="px-2 py-2 text-right">Change</th><th className="px-2 py-2 text-right">After</th><th className="px-2 py-2 text-left">Reason</th><th className="px-2 py-2 text-left">By</th></tr></thead><tbody className="divide-y divide-gray-800">{movements.map(movement => <tr key={movement.id}><td className="px-2 py-2 text-gray-400">{new Date(movement.created_at).toLocaleString()}</td><td className={`px-2 py-2 text-right ${movement.quantity_change > 0 ? 'text-green-400' : 'text-red-400'}`}>{movement.quantity_change > 0 ? '+' : ''}{movement.quantity_change}</td><td className="px-2 py-2 text-right">{movement.quantity_after}</td><td className="px-2 py-2 text-gray-400">{movement.reason}</td><td className="px-2 py-2 text-gray-400">{movement.adjusted_by_name}</td></tr>)}</tbody></table></div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
