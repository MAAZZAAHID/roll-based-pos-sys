import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import type { FormEvent } from 'react';
import type { ShopSettings } from '../types/shop';

interface DashboardData {
  today: {
    sales: number;
    transactions: number;
    average_sale: number;
  };
  inventory: {
    active_products: number;
    low_stock: number;
    out_of_stock: number;
  };
  recent_sales: {
    id: number;
    invoice_number: string;
    total_amount: string;
    created_at: string;
    cashier_name: string;
    payment_method: string;
  }[];
  top_products: {
    product_name: string;
    quantity_sold: string;
  }[];
  low_stock_products: {
    product_name: string;
    quantity: number;
    low_stock_threshold: number;
  }[];
}

function fmt(n: number | string): string {
  return parseFloat(String(n)).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
}

function MetricIcon({ type }: { type: 'sales' | 'transactions' | 'products' | 'inventory' }) {
  const paths = {
    sales: <path d="M4 19.5V9.5M10 19.5v-6M16 19.5V5.5M22 19.5V2.5" />,
    transactions: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h4" /></>,
    products: <><path d="m4 7 8-4 8 4v10l-8 4-8-4V7Zm0 0 8 4 8-4M12 11v10" /></>,
    inventory: <><path d="M12 3 3.5 7.5 12 12l8.5-4.5L12 3Z" /><path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5" /></>,
  };
  return <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[type]}</svg></span>;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shop, setShop] = useState<ShopSettings | null>(null);
  const [editingShop, setEditingShop] = useState(false);
  const [logoError, setLogoError] = useState('');

  useEffect(() => {
    api.get<DashboardData>('/reports/dashboard')
      .then(setData)
      .catch(err => setError(err.message || 'Failed to load dashboard'))
      .finally(() => setLoading(false));
    api.get<ShopSettings>('/shop')
      .then(setShop)
      .catch(err => setError(err.message || 'Failed to load shop settings'));
  }, []);

  async function saveShop(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!shop) return;
    try {
      const updated = await api.put<ShopSettings>('/shop', shop);
      setShop(updated);
      setEditingShop(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to save shop settings'); }
  }

  function handleLogoFile(file: File | undefined) {
    setLogoError('');
    if (!file || !shop) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      setLogoError('Use a PNG, JPEG, WebP, or GIF image.');
      return;
    }
    if (file.size > 512 * 1024) {
      setLogoError('Logo must be 512 KB or smaller.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setShop({ ...shop, logo_url: reader.result });
    };
    reader.onerror = () => setLogoError('Logo could not be read.');
    reader.readAsDataURL(file);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <main className="app-page flex-1 space-y-6">
        {error && <div className="alert alert-error">{error}</div>}
        
        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4"><div className="skeleton-block h-32" /><div className="skeleton-block h-32" /><div className="skeleton-block h-32" /><div className="skeleton-block h-32" /></div>
        ) : data ? (
          <>
            <div className="page-header">
              <div>
                <p className="page-kicker">Store overview</p>
                <h1 className="page-title mt-1">Good evening, {user?.fullName || 'Owner'}</h1>
                <p className="page-subtitle">Here&apos;s what&apos;s happening with your store today.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {user?.role === 'owner' && <button onClick={() => setEditingShop(true)} className="btn-secondary inline-flex">Shop settings</button>}
                <button onClick={() => navigate('/pos')} className="btn-primary inline-flex"><span aria-hidden="true">+</span> New sale</button>
              </div>
            </div>

            {editingShop && shop && <form onSubmit={saveShop} className="form-panel space-y-4">
              <div className="flex items-center justify-between"><div><h2 className="panel-title">Shop settings</h2><p className="form-help">These branding settings apply to this shop only.</p></div><button type="button" onClick={() => setEditingShop(false)} className="btn-quiet">Close</button></div>
              <p className="form-help">Logo is optional and appears on printed receipts when enabled.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <input value={shop.name} onChange={e => setShop({ ...shop, name: e.target.value })} required className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg" placeholder="Shop name" />
                <input value={shop.phone ?? ''} onChange={e => setShop({ ...shop, phone: e.target.value || null })} className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg" placeholder="Phone" />
                <input value={shop.address ?? ''} onChange={e => setShop({ ...shop, address: e.target.value || null })} className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg" placeholder="Address" />
                <textarea value={shop.receipt_footer ?? ''} onChange={e => setShop({ ...shop, receipt_footer: e.target.value || null })} maxLength={500} className="sm:col-span-2 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg" placeholder="Receipt footer (optional)" rows={2} />
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 cursor-pointer">Upload logo<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => handleLogoFile(e.target.files?.[0])} className="hidden" /></label>
                {shop.logo_url && <button type="button" onClick={() => { setShop({ ...shop, logo_url: null }); setLogoError(''); }} className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-600">Remove logo</button>}
                {shop.logo_url && <img src={shop.logo_url} alt="Shop logo preview" className="h-10 max-w-32 object-contain border border-gray-700 rounded bg-white p-1" onError={e => { e.currentTarget.style.display = 'none'; }} />}
              </div>
              {logoError && <p className="text-sm text-red-400">{logoError}</p>}
              <div className="flex gap-5 text-sm"><label><input type="checkbox" checked={shop.show_logo} onChange={e => setShop({ ...shop, show_logo: e.target.checked })} /> <span className="ml-1">Show logo</span></label><label><input type="checkbox" checked={shop.show_name} onChange={e => setShop({ ...shop, show_name: e.target.checked })} /> <span className="ml-1">Show shop name</span></label></div>
              {(shop.logo_url || shop.name || shop.address || shop.phone || shop.receipt_footer) && <div className="bg-white text-gray-900 rounded-lg p-3 max-w-xs font-mono text-xs"><p className="font-bold text-center">{shop.show_name ? shop.name : 'Retail POS'}</p>{shop.address && <p className="text-center">{shop.address}</p>}{shop.phone && <p className="text-center">{shop.phone}</p>}<div className="border-t border-dashed border-gray-400 my-2" /><p className="text-center text-gray-500">Receipt preview</p>{shop.receipt_footer && <p className="border-t border-dashed border-gray-400 mt-2 pt-2 text-center">{shop.receipt_footer}</p>}</div>}
              <button type="submit" className="btn-primary">Save settings</button>
            </form>}

            {/* Top Cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="metric-card">
                <div className="flex items-center justify-between"><p className="metric-label">Today&apos;s sales</p><MetricIcon type="sales" /></div>
                <p className="metric-value">Rs. {fmt(data.today.sales)}</p>
                <p className="metric-context">Average sale Rs. {fmt(data.today.average_sale)}</p>
              </div>
              <div className="metric-card">
                <div className="flex items-center justify-between"><p className="metric-label">Transactions</p><MetricIcon type="transactions" /></div>
                <p className="metric-value text-indigo-600">{data.today.transactions}</p>
                <p className="metric-context">Completed today</p>
              </div>
              <div className="metric-card">
                <div className="flex items-center justify-between"><p className="metric-label">Active products</p><MetricIcon type="products" /></div>
                <p className="metric-value">{data.inventory.active_products}</p>
                <p className="metric-context">Available in catalog</p>
              </div>
              <div className="metric-card">
                <div className="flex items-center justify-between"><p className="metric-label">Inventory attention</p><MetricIcon type="inventory" /></div>
                <p className="metric-value text-amber-700">{data.inventory.low_stock + data.inventory.out_of_stock}</p>
                <p className="metric-context">{data.inventory.out_of_stock} out of stock</p>
              </div>
            </div>

            {/* Bottom Grids */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Recent Sales */}
              <div className="panel lg:col-span-2 overflow-hidden">
                <div className="panel-header">
                  <div><h2 className="panel-title">Recent sales</h2><p className="form-help">Latest completed transactions</p></div>
                  <button onClick={() => navigate('/sales')} className="text-xs text-indigo-400 hover:text-indigo-300">View All →</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="data-table w-full text-sm">
                    <thead className="bg-gray-800/50 text-gray-400 text-xs">
                      <tr>
                        <th className="px-5 py-3 text-left font-medium">Invoice</th>
                        <th className="px-5 py-3 text-left font-medium">Cashier</th>
                        <th className="px-5 py-3 text-right font-medium">Total</th>
                        <th className="px-5 py-3 text-center font-medium">Payment</th>
                        <th className="px-5 py-3 text-left font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {data.recent_sales.length === 0 ? (
                        <tr><td colSpan={5} className="empty-state"><div className="empty-state-title">No sales yet</div><div className="empty-state-copy">Completed sales will appear here.</div></td></tr>
                      ) : (
                        data.recent_sales.map(s => (
                          <tr key={s.id} className="hover:bg-gray-800/40 transition">
                            <td className="px-5 py-3 font-mono text-indigo-300 text-xs">{s.invoice_number}</td>
                            <td className="px-5 py-3 text-gray-300">{s.cashier_name}</td>
                            <td className="px-5 py-3 text-right font-semibold text-white">Rs. {fmt(s.total_amount)}</td>
                            <td className="px-5 py-3 text-center capitalize text-gray-400 text-xs">{s.payment_method}</td>
                            <td className="px-5 py-3 text-gray-400 text-xs">{fmtDate(s.created_at)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Side Panels */}
              <div className="space-y-6">
                
                {/* Top Products */}
                <div className="panel overflow-hidden">
                  <div className="panel-header"><div><h2 className="panel-title">Top selling</h2><p className="form-help">Today by quantity</p></div>
                  </div>
                  <ul className="divide-y divide-gray-800">
                    {data.top_products.length === 0 ? (
                      <li className="empty-state"><div className="empty-state-title">No sales yet</div><div className="empty-state-copy">Top-selling products will appear here.</div></li>
                    ) : (
                      data.top_products.map((p, i) => (
                        <li key={i} className="px-5 py-3 flex justify-between items-center hover:bg-gray-800/40">
                          <span className="text-sm text-gray-300">{p.product_name}</span>
                          <span className="text-xs font-semibold bg-gray-800 px-2 py-1 rounded text-indigo-300">{p.quantity_sold} sold</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>

                {/* Low Stock */}
                <div className="panel overflow-hidden">
                  <div className="panel-header"><div><h2 className="panel-title">Inventory attention</h2><p className="form-help">Products that need review</p></div>
                  </div>
                  <ul className="divide-y divide-gray-800">
                    {data.low_stock_products.length === 0 ? (
                      <li className="empty-state"><div className="empty-state-title">Inventory is healthy</div><div className="empty-state-copy">No low-stock products need attention.</div></li>
                    ) : (
                      data.low_stock_products.map((p, i) => (
                        <li key={i} className="px-5 py-3 flex justify-between items-center hover:bg-gray-800/40">
                          <span className="text-sm text-gray-300 truncate w-3/5">{p.product_name}</span>
                          <span className={`text-xs font-bold px-2 py-1 rounded ${p.quantity <= 0 ? 'bg-red-900/50 text-red-400' : 'bg-orange-900/50 text-orange-400'}`}>
                            {p.quantity} left
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>

              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
