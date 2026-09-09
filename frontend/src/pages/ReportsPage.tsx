import { useState, useEffect, useCallback } from 'react';
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
      <main className="app-page flex-1 space-y-6">

        <div className="page-header">
          <div>
            <p className="page-kicker">Analytics</p>
            <h1 className="page-title">Reports</h1>
            <p className="page-subtitle">Understand sales performance and inventory risk over time.</p>
          </div>
        </div>
        
        {/* Controls */}
        <div className="form-panel flex flex-wrap items-end gap-4">
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

        {error && <div className="alert alert-error">{error}</div>}
        
        {loading && <div className="skeleton-block h-40" />}

        {!loading && salesReport && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Sales Summary */}
            <div className="space-y-6">
              <div className="panel p-6">
                <h2 className="panel-title mb-4">Sales summary</h2>
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
              <div className="panel p-6">
                <h2 className="panel-title mb-4">By payment method</h2>
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
            <div className="panel overflow-hidden shadow-sm lg:col-span-2">
              <div className="panel-header">
                <h2 className="panel-title">Top selling products</h2>
              </div>
              <table className="data-table w-full text-sm">
                <thead className="bg-gray-800/50 text-gray-400 text-xs uppercase">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium">Product</th>
                    <th className="px-6 py-3 text-center font-medium">Qty Sold</th>
                    <th className="px-6 py-3 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {topProducts.length === 0 ? (
                    <tr><td colSpan={3} className="empty-state"><div className="empty-state-title">No sales yet</div><div className="empty-state-copy">Top-selling products will appear when transactions are completed.</div></td></tr>
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
            <div className="panel overflow-hidden shadow-sm lg:col-span-3 mt-2">
              <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
                <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Low Stock & Out of Stock</h2>
                <span className="text-xs bg-red-900/30 text-red-400 px-3 py-1 rounded-full font-medium">Live Inventory</span>
              </div>
              <table className="data-table w-full text-sm">
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
                    <tr><td colSpan={5} className="empty-state"><div className="empty-state-title">Inventory is healthy</div><div className="empty-state-copy">No products are currently below their stock threshold.</div></td></tr>
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

      </main>
    </div>
  );
}
