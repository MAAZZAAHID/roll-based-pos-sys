import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import type { ShopSettings } from '../types/shop';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SaleRow {
  id: number;
  invoice_number: string;
  cashier_name: string;
  cashier_username: string;
  total_amount: string;
  payment_method: string;
  amount_tendered: string;
  change_given: string;
  created_at: string;
  item_count: string;
  status: string;
}

interface SaleDetail extends SaleRow {
  subtotal: string;
  tax_amount: string;
  cashier_id: number;
  notes: string | null;
  items: SaleItem[];
}

interface SaleItem {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: string;
  line_total: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

interface SalesResponse {
  sales: SaleRow[];
  pagination: Pagination;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(n: string | number): string {
  return parseFloat(String(n)).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-PK', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Receipt Print ────────────────────────────────────────────────────────────
function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char);
}

const defaultLogoSvg = '<svg viewBox="0 0 40 40" width="28" height="28" aria-label="Retail POS"><circle cx="20" cy="20" r="18" fill="#4f46e5"/><path d="M11 19.5 20 11l9 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 11 28.5v-9Z" fill="white"/><path d="M16 30v-6h8v6" fill="#4f46e5"/></svg>';

function printSaleDetail(sale: SaleDetail, shop: ShopSettings | null) {
  const w = window.open('', '_blank', 'width=400,height=600');
  if (!w) return;
  const total = fmt(sale.total_amount);
  const itemRows = sale.items.map(it =>
    `<tr>
      <td>${escapeHtml(it.product_name)}</td>
      <td style="text-align:center">${escapeHtml(it.quantity)}</td>
      <td style="text-align:right">Rs. ${escapeHtml(fmt(it.unit_price))}</td>
      <td style="text-align:right">Rs. ${escapeHtml(fmt(it.line_total))}</td>
    </tr>`
  ).join('');
  const shopName = shop?.show_name !== false ? (shop?.name || 'Retail POS') : 'Retail POS';
  const logoHtml = shop?.show_logo !== false
    ? (shop?.logo_url
      ? `<img src="${escapeHtml(shop.logo_url)}" alt="Shop logo" style="display:block;margin:0 auto 4px;max-height:48px;max-width:128px;object-fit:contain" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" /><span style="display:none">${defaultLogoSvg}</span>`
      : defaultLogoSvg)
    : '';

  w.document.write(`<!DOCTYPE html><html><head>
    <title>Receipt ${escapeHtml(sale.invoice_number)}</title>
    <style>
      body { font-family: monospace; font-size: 12px; padding: 8px; max-width: 300px; }
      h2 { text-align:center; margin-bottom:4px; }
      p { margin:2px 0; }
      table { width:100%; border-collapse:collapse; margin:8px 0; }
      th,td { padding:2px 4px; }
      thead { border-bottom: 1px dashed #000; }
      .divider { border-top: 1px dashed #000; margin: 6px 0; }
      .total { font-weight:bold; }
    </style>
  </head><body>
    <div style="text-align:center">${logoHtml}<h2>${escapeHtml(shopName)}</h2>${shop?.address ? `<p>${escapeHtml(shop.address)}</p>` : ''}${shop?.phone ? `<p>${escapeHtml(shop.phone)}</p>` : ''}</div>
    <div class="divider"></div>
    <p>Invoice: ${escapeHtml(sale.invoice_number)}</p>
    <p>Date: ${escapeHtml(fmtDate(sale.created_at))}</p>
    <p>Cashier: ${escapeHtml(sale.cashier_name)}</p>
    <div class="divider"></div>
    <table>
      <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="divider"></div>
    <p class="total">TOTAL: Rs. ${total}</p>
    <p>Payment: ${escapeHtml(sale.payment_method)}</p>
    <p>Paid: Rs. ${escapeHtml(fmt(sale.amount_tendered))}</p>
    ${sale.payment_method === 'cash' ? `<p>Change: Rs. ${escapeHtml(fmt(sale.change_given))}</p>` : ''}
    <div class="divider"></div>
    <p style="text-align:center">${escapeHtml(shop?.receipt_footer?.trim() || 'Thank you!')}</p>
  </body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

// ─── Sale Detail Modal ────────────────────────────────────────────────────────
function SaleDetailModal({ saleId, onClose, shop }: { saleId: number; onClose: () => void; shop: ShopSettings | null }) {
  const [sale, setSale]     = useState<SaleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [refundMethod, setRefundMethod] = useState('cash');
  const [refundQuantities, setRefundQuantities] = useState<Record<number, number>>({});
  const [refundSaving, setRefundSaving] = useState(false);

  async function submitRefund() {
    if (!sale || !refundReason.trim()) { setError('Refund reason is required.'); return; }
    const items = sale.items.filter(item => (refundQuantities[item.id] || 0) > 0).map(item => ({ sale_item_id: item.id, quantity: refundQuantities[item.id] }));
    if (items.length === 0) { setError('Select at least one item quantity to refund.'); return; }
    setRefundSaving(true);
    try {
      await api.post(`/sales/${sale.id}/refund`, { items, reason: refundReason.trim(), method: refundMethod });
      setRefundOpen(false);
      setRefundReason('');
      setRefundQuantities({});
      onClose();
    } catch (err: any) { setError(err.message || 'Refund failed'); }
    finally { setRefundSaving(false); }
  }

  useEffect(() => {
    api.get<SaleDetail>(`/sales/${saleId}`)
      .then(setSale)
      .catch(err => setError(err.message || 'Failed to load sale'))
      .finally(() => setLoading(false));
  }, [saleId]);

  return (
    <div
      id="sale-detail-modal"
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Sale Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none transition">×</button>
        </div>

        {loading && (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        )}
        {error && (
          <div className="p-6 text-red-400">{error}</div>
        )}

        {sale && !loading && (
          <div className="p-6 space-y-6">
            {/* Sale Meta */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-400 text-xs mb-1">Invoice</p>
                <p id="detail-invoice" className="font-mono font-semibold text-white">{sale.invoice_number}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-1">Status</p>
                <span className="px-2 py-0.5 rounded-full text-xs bg-green-600/20 text-green-400 capitalize">{sale.status}</span>
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-1">Cashier</p>
                <p id="detail-cashier" className="text-white">{sale.cashier_name}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-1">Date/Time</p>
                <p id="detail-date" className="text-white">{fmtDate(sale.created_at)}</p>
              </div>
            </div>

            {/* Items Table */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Items</p>
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-400 uppercase bg-gray-800">
                  <tr>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-center">Qty</th>
                    <th className="px-3 py-2 text-right">Unit Price</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody id="detail-items" className="divide-y divide-gray-800">
                  {sale.items.map(item => (
                    <tr key={item.id} className="hover:bg-gray-800/40">
                      <td className="px-3 py-2 text-white">{item.product_name}</td>
                      <td className="px-3 py-2 text-center text-gray-300">{item.quantity}</td>
                      <td className="px-3 py-2 text-right text-gray-300">Rs. {fmt(item.unit_price)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-white">Rs. {fmt(item.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals + Payment */}
            <div className="bg-gray-800 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between text-gray-400">
                <span>Subtotal</span>
                <span className="text-white">Rs. {fmt(sale.subtotal)}</span>
              </div>
              <div className="flex justify-between font-bold border-t border-gray-700 pt-2">
                <span className="text-white text-base">TOTAL</span>
                <span id="detail-total" className="text-indigo-300 text-base">Rs. {fmt(sale.total_amount)}</span>
              </div>
              <div className="border-t border-gray-700 pt-2 space-y-1.5">
                <div className="flex justify-between text-gray-400">
                  <span>Payment Method</span>
                  <span id="detail-payment-method" className="text-white capitalize">{sale.payment_method}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Amount Paid</span>
                  <span id="detail-amount-paid" className="text-white">Rs. {fmt(sale.amount_tendered)}</span>
                </div>
                {sale.payment_method === 'cash' && (
                  <div className="flex justify-between text-gray-400">
                    <span>Change Given</span>
                    <span id="detail-change" className="text-green-300 font-semibold">Rs. {fmt(sale.change_given)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold text-sm transition"
              >
                ← Back
              </button>
              <button
                id="detail-print-btn"
                onClick={() => printSaleDetail(sale, shop)}
                className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-2 align-[-4px]" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v7H6zM18 12h.01" /></svg>Print Receipt
              </button>
              {sale.status === 'completed' && (
                <button onClick={() => setRefundOpen(true)} className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-sm transition">Refund</button>
              )}
            </div>
            {refundOpen && (
              <div className="mt-4 border-t border-gray-700 pt-4 space-y-3">
                <p className="text-sm font-semibold">Refund items</p>
                {sale.items.map(item => (
                  <label key={item.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{item.product_name} <span className="text-gray-500">(sold {item.quantity})</span></span>
                    <input type="number" min="0" max={item.quantity} value={refundQuantities[item.id] || ''} onChange={e => setRefundQuantities({ ...refundQuantities, [item.id]: Math.min(item.quantity, Math.max(0, Number(e.target.value))) })} className="w-20 px-2 py-1" placeholder="Qty" />
                  </label>
                ))}
                <input value={refundReason} onChange={e => setRefundReason(e.target.value)} placeholder="Refund reason *" className="w-full px-3 py-2" />
                <select value={refundMethod} onChange={e => setRefundMethod(e.target.value)} className="w-full px-3 py-2"><option value="cash">Cash</option><option value="card">Card</option><option value="other">Other</option></select>
                <div className="flex justify-end gap-2"><button onClick={() => setRefundOpen(false)} className="px-3 py-2 bg-gray-800 rounded-lg text-sm">Cancel</button><button onClick={submitRefund} disabled={refundSaving} className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm">{refundSaving ? 'Processing...' : 'Confirm refund'}</button></div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sales Page ───────────────────────────────────────────────────────────────
export default function SalesPage() {

  // Data
  const [sales, setSales]           = useState<SaleRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, total_pages: 0 });
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  // Filters
  const [invoiceFilter, setInvoiceFilter]   = useState('');
  const [dateFrom, setDateFrom]             = useState('');
  const [dateTo, setDateTo]                 = useState('');
  const [methodFilter, setMethodFilter]     = useState('');
  const [page, setPage]                     = useState(1);

  // Detail modal
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);
  const [shop, setShop] = useState<ShopSettings | null>(null);

  // ── Fetch sales ────────────────────────────────────────────────────────────
  const fetchSales = useCallback(async (currentPage: number) => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(currentPage), limit: '20' });
    if (invoiceFilter) params.set('invoice_number', invoiceFilter);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (methodFilter) params.set('payment_method', methodFilter);

    try {
      const data = await api.get<SalesResponse>(`/sales?${params.toString()}`);
      setSales(data.sales);
      setPagination(data.pagination);
    } catch (err: any) {
      setError(err.message || 'Failed to load sales');
    } finally {
      setLoading(false);
    }
  }, [invoiceFilter, dateFrom, dateTo, methodFilter]);

  useEffect(() => {
    api.get<ShopSettings>('/shop').then(setShop).catch(() => undefined);
    fetchSales(page);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch() {
    setPage(1);
    fetchSales(1);
  }

  function handleClear() {
    setInvoiceFilter('');
    setDateFrom('');
    setDateTo('');
    setMethodFilter('');
    setPage(1);
    // fetch with cleared values manually
    setLoading(true);
    api.get<SalesResponse>('/sales?page=1&limit=20')
      .then(d => { setSales(d.sales); setPagination(d.pagination); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <main className="app-page flex-1 space-y-5">

        <div className="page-header">
          <div>
            <p className="page-kicker">Transactions</p>
            <h1 className="page-title">Sales</h1>
            <p className="page-subtitle">Search, review, and manage completed transactions.</p>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="form-panel flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Invoice</label>
            <input
              id="filter-invoice"
              type="text"
              value={invoiceFilter}
              onChange={e => setInvoiceFilter(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="INV-..."
              className="w-36 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">From</label>
            <input
              id="filter-date-from"
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">To</label>
            <input
              id="filter-date-to"
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Payment</label>
            <select
              id="filter-payment"
              value={methodFilter}
              onChange={e => setMethodFilter(e.target.value)}
              className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </select>
          </div>
          <button
            id="filter-search-btn"
            onClick={handleSearch}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition"
          >Search</button>
          <button
            id="filter-clear-btn"
            onClick={handleClear}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition"
          >Clear</button>
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-3 bg-red-900/40 border border-red-700 text-red-300 rounded-lg text-sm">{error}</div>
        )}

        {/* Summary */}
        <div className="text-sm text-gray-400">
          {loading ? 'Loading…' : `${pagination.total} sale${pagination.total !== 1 ? 's' : ''} found`}
        </div>

        {/* Sales Table */}
        <div className="panel overflow-x-auto">
          <table className="data-table w-full text-sm">
            <thead className="text-xs text-gray-400 uppercase bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left">Invoice</th>
                <th className="px-4 py-3 text-left">Cashier</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-center">Payment</th>
                <th className="px-4 py-3 text-center">Items</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-center">View</th>
              </tr>
            </thead>
            <tbody id="sales-table-body" className="divide-y divide-gray-800">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Loading…</td></tr>
              ) : sales.length === 0 ? (
                <tr><td colSpan={7} className="empty-state"><div className="empty-state-title">No sales found</div><div className="empty-state-copy">Try adjusting your search or date filters.</div></td></tr>
              ) : (
                sales.map(sale => (
                  <tr key={sale.id} className="hover:bg-gray-800/40 transition">
                    <td className="px-4 py-3 font-mono text-indigo-300 text-xs">{sale.invoice_number}</td>
                    <td className="px-4 py-3 text-gray-300">{sale.cashier_name}</td>
                    <td className="px-4 py-3 text-right font-semibold text-white">Rs. {fmt(sale.total_amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs capitalize font-medium
                        ${sale.payment_method === 'cash' ? 'bg-green-600/20 text-green-400' :
                          sale.payment_method === 'card' ? 'bg-blue-600/20 text-blue-400' :
                          'bg-gray-600/20 text-gray-400'}`}
                      >
                        {sale.payment_method}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-400">{sale.item_count}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(sale.created_at)}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setSelectedSaleId(sale.id)}
                        className="px-3 py-1 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs transition"
                      >View</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.total_pages > 1 && (
          <div id="sales-pagination" className="flex items-center justify-center gap-4">
            <button
              id="pagination-prev"
              onClick={() => setPage(p => p - 1)}
              disabled={page <= 1}
              className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-sm disabled:opacity-40 hover:bg-gray-700 transition"
            >← Previous</button>
            <span id="pagination-info" className="text-sm text-gray-400">
              Page {pagination.page} of {pagination.total_pages}
            </span>
            <button
              id="pagination-next"
              onClick={() => setPage(p => p + 1)}
              disabled={page >= pagination.total_pages}
              className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-sm disabled:opacity-40 hover:bg-gray-700 transition"
            >Next →</button>
          </div>
        )}
      </main>

      {/* Sale Detail Modal */}
      {selectedSaleId !== null && (
        <SaleDetailModal
          saleId={selectedSaleId}
          shop={shop}
          onClose={() => setSelectedSaleId(null)}
        />
      )}
    </div>
  );
}
