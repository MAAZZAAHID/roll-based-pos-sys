import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

interface SalesReport {
  total_sales: number;
  transactions: number;
  average_sale: number;
  payment_totals: {
    cash: number;
    card: number;
    other: number;
  };
}

interface TopProduct {
  product_name: string;
  quantity_sold: number;
  revenue: number;
}

interface LowStockProduct {
  product_id: number;
  product_name: string;
  barcode: string;
  current_quantity: number;
  low_stock_threshold: number;
  status: string;
}

function fmt(n: number | string): string {
  return parseFloat(String(n)).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ReportsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  const [salesReport, setSalesReport] = useState<SalesReport | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [lowStock, setLowStock] = useState<LowStockProduct[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError('');
    
    const params = new URLSearchParams();
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    
    try {
      const [sRes, tpRes, lsRes] = await Promise.all([
        api.get<SalesReport>(`/reports/sales?${params.toString()}`),
        api.get<TopProduct[]>(`/reports/top-products?${params.toString()}&limit=10`),
        api.get<LowStockProduct[]>('/reports/low-stock') // Inventory is current, not date-bound
      ]);
      
      setSalesReport(sRes);
      setTopProducts(tpRes);
      setLowStock(lsRes);
    } catch (err: any) {
      setError(err.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  // Initial load
  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold text-white tracking-wide">Reports</h1>
          <nav className="hidden md:flex gap-4">
            <button onClick={() => navigate('/dashboard')} className="text-sm font-medium text-gray-400 hover:text-white transition">Dashboard</button>
            <button onClick={() => navigate('/pos')} className="text-sm font-medium text-gray-400 hover:text-white transition">POS</button>
            <button onClick={() => navigate('/sales')} className="text-sm font-medium text-gray-400 hover:text-white transition">Sales History</button>
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
        
        {/* Controls */}
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-400 mb-1">From Date</label>
            <input 
              type="date" 
              value={dateFrom} 
              onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">To Date</label>
            <input 
              type="date" 
              value={dateTo} 
              onChange={e => setDateTo(e.target.value)}
              className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button 
            onClick={() => { setDateFrom(''); setDateTo(''); }}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition"
          >
            Clear Dates
          </button>
        </div>

        {error && <div className="p-4 bg-red-900/40 border border-red-700 text-red-300 rounded-xl">{error}</div>}
        
        {loading && <div className="text-center py-10 text-gray-500">Loading reports...</div>}

        {!loading && salesReport && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Sales Summary */}
            <div className="space-y-6">
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 shadow-sm">
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Sales Summary</h2>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-400">Total Sales</p>
                    <p className="text-3xl font-bold text-white">Rs. {fmt(salesReport.total_sales)}</p>
                  </div>
                  <div className="flex justify-between border-t border-gray-800 pt-3">
                    <span className="text-sm text-gray-400">Transactions</span>
                    <span className="font-semibold text-white">{salesReport.transactions}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-800 pt-3">
                    <span className="text-sm text-gray-400">Average Sale</span>
                    <span className="font-semibold text-white">Rs. {fmt(salesReport.average_sale)}</span>
                  </div>
                </div>
              </div>

              {/* Payment Methods */}
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 shadow-sm">
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">By Payment Method</h2>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-300 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span> Cash
                    </span>
                    <span className="font-medium text-white">Rs. {fmt(salesReport.payment_totals.cash)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-300 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span> Card
                    </span>
                    <span className="font-medium text-white">Rs. {fmt(salesReport.payment_totals.card)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-300 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-gray-500"></span> Other
                    </span>
                    <span className="font-medium text-white">Rs. {fmt(salesReport.payment_totals.other)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Top Products */}
            <div className="bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden shadow-sm lg:col-span-2">
              <div className="px-6 py-4 border-b border-gray-700">
                <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Top Selling Products</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-800/50 text-gray-400 text-xs uppercase">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium">Product</th>
                    <th className="px-6 py-3 text-center font-medium">Qty Sold</th>
                    <th className="px-6 py-3 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {topProducts.length === 0 ? (
                    <tr><td colSpan={3} className="px-6 py-8 text-center text-gray-500">No products sold in this period.</td></tr>
                  ) : (
                    topProducts.map((p, i) => (
                      <tr key={i} className="hover:bg-gray-800/40 transition">
                        <td className="px-6 py-4 text-gray-200">{p.product_name}</td>
                        <td className="px-6 py-4 text-center font-medium text-indigo-300">{p.quantity_sold}</td>
                        <td className="px-6 py-4 text-right font-semibold text-white">Rs. {fmt(p.revenue)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Low Stock Report */}
            <div className="bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden shadow-sm lg:col-span-3 mt-2">
              <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
                <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Low Stock & Out of Stock</h2>
                <span className="text-xs bg-red-900/30 text-red-400 px-3 py-1 rounded-full font-medium">Live Inventory</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-800/50 text-gray-400 text-xs uppercase">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium">Barcode</th>
                    <th className="px-6 py-3 text-left font-medium">Product</th>
                    <th className="px-6 py-3 text-center font-medium">Quantity</th>
                    <th className="px-6 py-3 text-center font-medium">Threshold</th>
                    <th className="px-6 py-3 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {lowStock.length === 0 ? (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">All products are well stocked.</td></tr>
                  ) : (
                    lowStock.map(p => (
                      <tr key={p.product_id} className="hover:bg-gray-800/40 transition">
                        <td className="px-6 py-3 font-mono text-xs text-gray-400">{p.barcode}</td>
                        <td className="px-6 py-3 text-gray-200">{p.product_name}</td>
                        <td className="px-6 py-3 text-center font-bold text-white">{p.current_quantity}</td>
                        <td className="px-6 py-3 text-center text-gray-500">{p.low_stock_threshold}</td>
                        <td className="px-6 py-3 text-right">
                          <span className={`px-2 py-1 rounded text-xs font-semibold
                            ${p.status === 'Out of Stock' ? 'bg-red-900/50 text-red-400' : 'bg-orange-900/50 text-orange-400'}`}
                          >
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
