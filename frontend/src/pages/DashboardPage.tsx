import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

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

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<DashboardData>('/reports/dashboard')
      .then(setData)
      .catch(err => setError(err.message || 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold text-white tracking-wide">Dashboard</h1>
          <nav className="hidden md:flex gap-4">
            <button onClick={() => navigate('/pos')} className="text-sm font-medium text-gray-400 hover:text-white transition">POS</button>
            <button onClick={() => navigate('/reports')} className="text-sm font-medium text-gray-400 hover:text-white transition">Reports</button>
            <button onClick={() => navigate('/sales')} className="text-sm font-medium text-gray-400 hover:text-white transition">Sales History</button>
            {user?.role === 'owner' && (
              <button onClick={() => navigate('/users')} className="text-sm font-medium text-gray-400 hover:text-white transition">Users</button>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400 capitalize">{user?.fullName}
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-indigo-600/30 text-indigo-300">{user?.role}</span>
          </span>
          <button onClick={() => { logout(); navigate('/login'); }} className="text-sm text-gray-400 hover:text-white transition">
            Sign out
          </button>
        </div>
      </header>

      <div className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
        {error && <div className="p-4 bg-red-900/40 border border-red-700 text-red-300 rounded-xl">{error}</div>}
        
        {loading ? (
          <div className="text-center py-20 text-gray-500">Loading dashboard...</div>
        ) : data ? (
          <>
            {/* Top Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 shadow-sm">
                <p className="text-sm text-gray-400 mb-1">Today's Sales</p>
                <p className="text-2xl font-bold text-white">Rs. {fmt(data.today.sales)}</p>
                <p className="text-xs text-gray-500 mt-2">Avg Rs. {fmt(data.today.average_sale)}</p>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 shadow-sm">
                <p className="text-sm text-gray-400 mb-1">Transactions</p>
                <p className="text-2xl font-bold text-indigo-400">{data.today.transactions}</p>
                <p className="text-xs text-gray-500 mt-2">Today</p>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 shadow-sm">
                <p className="text-sm text-gray-400 mb-1">Active Products</p>
                <p className="text-2xl font-bold text-white">{data.inventory.active_products}</p>
                <p className="text-xs text-gray-500 mt-2">In Catalog</p>
              </div>
              <div className="bg-gray-900 border border-red-900/50 rounded-2xl p-5 shadow-sm">
                <p className="text-sm text-gray-400 mb-1">Low Stock Alerts</p>
                <p className="text-2xl font-bold text-red-400">{data.inventory.low_stock + data.inventory.out_of_stock}</p>
                <p className="text-xs text-red-400/60 mt-2">{data.inventory.out_of_stock} Out of Stock</p>
              </div>
            </div>

            {/* Bottom Grids */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Recent Sales */}
              <div className="lg:col-span-2 bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-700 flex justify-between items-center">
                  <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Recent Sales</h2>
                  <button onClick={() => navigate('/sales')} className="text-xs text-indigo-400 hover:text-indigo-300">View All →</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
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
                        <tr><td colSpan={5} className="px-5 py-6 text-center text-gray-500">No sales yet today.</td></tr>
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
                <div className="bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-700">
                    <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Top Selling (Today)</h2>
                  </div>
                  <ul className="divide-y divide-gray-800">
                    {data.top_products.length === 0 ? (
                      <li className="px-5 py-6 text-center text-gray-500 text-sm">No items sold today.</li>
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
                <div className="bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-700">
                    <h2 className="text-sm font-bold text-red-400 uppercase tracking-wider">Needs Restock</h2>
                  </div>
                  <ul className="divide-y divide-gray-800">
                    {data.low_stock_products.length === 0 ? (
                      <li className="px-5 py-6 text-center text-gray-500 text-sm">Inventory looks good!</li>
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
      </div>
    </div>
  );
}
