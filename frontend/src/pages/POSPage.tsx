import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import type { KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: number;
  name: string;
  barcode: string | null;
  category_name: string | null;
  selling_price: string;
  cost_price: string;
  is_active: boolean;
}

interface InventoryItem {
  product_id: number;
  quantity: number;
  status: string;
}

interface CartItem {
  product:  Product;
  quantity: number;
  stockQty: number; // UI hint only — backend enforces stock
}

interface CompletedSale {
  id: number;
  invoice_number: string;
  total_amount: string;
  subtotal: string;
  tax_amount: string;
  status: string;
  created_at: string;
  // Enriched by frontend for receipt
  payment_method: string;
  amount_tendered: number;
  change_given: number;
  cashier_name: string;
  items: CartItem[];
}

type PaymentMethod = 'cash' | 'card' | 'other';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PK', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Receipt Component ────────────────────────────────────────────────────────

function Receipt({ sale }: { sale: CompletedSale }) {
  return (
    <div id="receipt-content" className="font-mono text-sm text-gray-900 bg-white p-4 max-w-xs mx-auto">
      <div className="text-center mb-3">
        <p className="font-bold text-base">Retail POS</p>
        <p className="text-xs">Point of Sale</p>
        <div className="border-t border-dashed border-gray-400 my-2" />
        <p className="text-xs">Invoice: {sale.invoice_number}</p>
        <p className="text-xs">{formatDateTime(sale.created_at)}</p>
        <p className="text-xs">Cashier: {sale.cashier_name}</p>
        <div className="border-t border-dashed border-gray-400 my-2" />
      </div>

      <table className="w-full text-xs mb-2">
        <thead>
          <tr className="border-b border-dashed border-gray-400">
            <th className="text-left pb-1">Product</th>
            <th className="text-center pb-1">Qty</th>
            <th className="text-right pb-1">Price</th>
            <th className="text-right pb-1">Total</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map(item => {
            const unitPrice = parseFloat(item.product.selling_price);
            return (
              <tr key={item.product.id}>
                <td className="py-0.5 pr-1">{item.product.name}</td>
                <td className="text-center py-0.5">{item.quantity}</td>
                <td className="text-right py-0.5">{formatCurrency(unitPrice)}</td>
                <td className="text-right py-0.5">{formatCurrency(unitPrice * item.quantity)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="border-t border-dashed border-gray-400 pt-2 space-y-1">
        <div className="flex justify-between font-bold">
          <span>TOTAL</span>
          <span>Rs. {formatCurrency(parseFloat(sale.total_amount))}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span>Payment</span>
          <span className="capitalize">{sale.payment_method}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span>Paid</span>
          <span>Rs. {formatCurrency(sale.amount_tendered)}</span>
        </div>
        {sale.payment_method === 'cash' && (
          <div className="flex justify-between text-xs">
            <span>Change</span>
            <span>Rs. {formatCurrency(sale.change_given)}</span>
          </div>
        )}
      </div>

      <div className="border-t border-dashed border-gray-400 mt-3 pt-2 text-center text-xs">
        <p>Thank you for your purchase!</p>
      </div>
    </div>
  );
}

// ─── Sale Success Panel ───────────────────────────────────────────────────────

function SaleSuccessPanel({
  sale,
  onNewSale,
}: {
  sale: CompletedSale;
  onNewSale: () => void;
}) {
  const total = parseFloat(sale.total_amount);

  function handlePrint() {
    window.print();
  }

  return (
    <div id="pos-success-panel" className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
      {/* Success Header */}
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
          <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white">Sale Complete</h2>
      </div>

      {/* Sale Details */}
      <div className="w-full max-w-sm bg-gray-800 rounded-xl p-5 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Invoice</span>
          <span id="receipt-invoice" className="text-white font-mono font-semibold">{sale.invoice_number}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Total</span>
          <span id="receipt-total" className="text-white font-bold">Rs. {formatCurrency(total)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Payment</span>
          <span id="receipt-payment-method" className="text-white capitalize">{sale.payment_method}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Amount Paid</span>
          <span id="receipt-amount-paid" className="text-white">Rs. {formatCurrency(sale.amount_tendered)}</span>
        </div>
        {sale.payment_method === 'cash' && (
          <div className="flex justify-between text-sm border-t border-gray-700 pt-3">
            <span className="text-gray-300 font-semibold">Change</span>
            <span id="receipt-change" className="text-green-300 font-bold text-lg">Rs. {formatCurrency(sale.change_given)}</span>
          </div>
        )}
      </div>

      {/* Print Receipt (hidden from screen, visible on print) */}
      <div className="print-only">
        <Receipt sale={sale} />
      </div>

      {/* Actions */}
      <div className="flex gap-3 w-full max-w-sm">
        <button
          id="pos-print-receipt-btn"
          onClick={handlePrint}
          className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition"
        >
          🖨 Print Receipt
        </button>
        <button
          id="pos-new-sale-btn"
          onClick={onNewSale}
          className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold transition"
        >
          NEW SALE
        </button>
      </div>
    </div>
  );
}

// ─── POS Page ─────────────────────────────────────────────────────────────────

export default function POSPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Cart state
  const [cart, setCart]                   = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [amountTendered, setAmountTendered] = useState('');

  // Search state
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError]     = useState('');

  // Barcode input state
  const [barcodeInput, setBarcodeInput]   = useState('');
  const [barcodeError, setBarcodeError]   = useState('');
  const [barcodeSuccess, setBarcodeSuccess] = useState('');

  // Checkout state
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError]     = useState('');
  const [completedSale, setCompletedSale]     = useState<CompletedSale | null>(null);

  // Refs
  const barcodeRef  = useRef<HTMLInputElement>(null);
  const searchRef   = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Focus barcode on mount ────────────────────────────────────────────────
  useEffect(() => {
    barcodeRef.current?.focus();
  }, []);

  // ── Debounced product search ──────────────────────────────────────────────
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearchError('');
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError('');
      try {
        const products = await api.get<Product[]>('/products');
        const q = searchQuery.toLowerCase();
        const filtered = products.filter(
          p =>
            p.is_active &&
            (p.name.toLowerCase().includes(q) ||
              (p.barcode && p.barcode.toLowerCase().includes(q)))
        );
        setSearchResults(filtered.slice(0, 10));
      } catch {
        setSearchError('Failed to search products');
      } finally {
        setSearchLoading(false);
      }
    }, 250);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery]);

  // ── Add product to cart ───────────────────────────────────────────────────
  const addToCart = useCallback(async (product: Product) => {
    if (!product.is_active) {
      setBarcodeError('Product is inactive and cannot be sold');
      return;
    }
    let stockQty = 0;
    try {
      const inv = await api.get<InventoryItem>(`/inventory/${product.id}`);
      stockQty = inv.quantity;
    } catch {
      stockQty = 0;
    }

    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1, stockQty }
            : item
        );
      }
      return [...prev, { product, quantity: 1, stockQty }];
    });

    setBarcodeSuccess(`"${product.name}" added to cart`);
    setTimeout(() => setBarcodeSuccess(''), 2000);
    setSearchQuery('');
    setSearchResults([]);
    barcodeRef.current?.focus();
  }, []);

  // ── Barcode scan (Enter key) ──────────────────────────────────────────────
  const handleBarcodeEnter = useCallback(async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const code = barcodeInput.trim();
    if (!code) return;
    setBarcodeError('');
    setBarcodeSuccess('');
    try {
      const products = await api.get<Product[]>('/products');
      const found = products.find(p => p.barcode === code);
      if (!found) {
        setBarcodeError(`No product found for barcode: ${code}`);
        setBarcodeInput('');
        barcodeRef.current?.select();
        return;
      }
      if (!found.is_active) {
        setBarcodeError(`"${found.name}" is inactive`);
        setBarcodeInput('');
        return;
      }
      await addToCart(found);
      setBarcodeInput('');
    } catch {
      setBarcodeError('Failed to look up barcode');
    }
  }, [barcodeInput, addToCart]);

  // ── Cart operations ───────────────────────────────────────────────────────
  function setQty(productId: number, qty: number) {
    setCart(prev =>
      prev.map(item =>
        item.product.id === productId
          ? { ...item, quantity: Math.max(1, Math.min(qty, item.stockQty || 9999)) }
          : item
      )
    );
  }

  function removeFromCart(productId: number) {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  }

  function clearCart() {
    setCart([]);
    setPaymentMethod('cash');
    setAmountTendered('');
    setCheckoutError('');
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const subtotal = cart.reduce(
    (sum, item) => sum + parseFloat(item.product.selling_price) * item.quantity,
    0
  );

  // For cash: use amount tendered; for card/other: total is tendered
  const tendered = paymentMethod === 'cash'
    ? parseFloat(amountTendered) || 0
    : subtotal;

  const change = Math.max(0, tendered - subtotal);
  const cashShortfall = paymentMethod === 'cash' && tendered < subtotal && amountTendered !== '';

  // ── Complete Sale ─────────────────────────────────────────────────────────
  async function handleCompleteSale() {
    if (cart.length === 0) {
      setCheckoutError('Cart is empty. Add products before checking out.');
      return;
    }
    if (paymentMethod === 'cash') {
      if (!amountTendered || parseFloat(amountTendered) < subtotal) {
        setCheckoutError('Amount paid must be greater than or equal to the total.');
        return;
      }
    }
    setCheckoutError('');
    setCheckoutLoading(true);

    try {
      const finalTendered = paymentMethod === 'cash' ? parseFloat(amountTendered) : subtotal;
      const payload = {
        items: cart.map(item => ({ product_id: item.product.id, quantity: item.quantity })),
        payment_method: paymentMethod,
        amount_tendered: finalTendered,
      };

      const sale = await api.post<any>('/sales', payload);

      // Enrich with frontend info for receipt (sale data from server is authoritative)
      const enriched: CompletedSale = {
        ...sale,
        payment_method: paymentMethod,
        amount_tendered: finalTendered,
        change_given: parseFloat(sale.change_given ?? (finalTendered - parseFloat(sale.total_amount)).toFixed(2)),
        cashier_name: user?.fullName || user?.username || 'Unknown',
        items: [...cart],
      };

      setCompletedSale(enriched);
      // Cart is cleared only via "New Sale" button to keep data available for receipt

    } catch (err: any) {
      setCheckoutError(err.message || 'Failed to complete sale');
      // Keep cart intact on failure
    } finally {
      setCheckoutLoading(false);
    }
  }

  // ── New Sale ──────────────────────────────────────────────────────────────
  function handleNewSale() {
    setCompletedSale(null);
    setCart([]);
    setPaymentMethod('cash');
    setAmountTendered('');
    setCheckoutError('');
    setSearchQuery('');
    setSearchResults([]);
    setBarcodeInput('');
    setTimeout(() => barcodeRef.current?.focus(), 50);
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* ── Top Bar ───────────────────────────────────────────────────────── */}
      <header className="bg-gray-900 border-b border-gray-700 px-4 py-3 flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <span className="font-bold text-lg tracking-tight">Retail POS</span>
          <span className="hidden sm:block text-gray-500 text-sm">Point of Sale</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
            {user?.fullName}
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-indigo-600/30 text-indigo-300 capitalize">
              {user?.role}
            </span>
          </span>
          <button
            id="pos-logout-btn"
            onClick={() => { logout(); navigate('/login'); }}
            className="text-sm text-gray-400 hover:text-white transition"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ── Success Panel (shown after sale) ──────────────────────────────── */}
      {completedSale ? (
        <div className="flex-1 flex flex-col no-print">
          <SaleSuccessPanel sale={completedSale} onNewSale={handleNewSale} />
          {/* Hidden receipt for printing */}
          <div className="print-only">
            <Receipt sale={completedSale} />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden no-print">
          {/* ── Left: Search + Cart ───────────────────────────────────────── */}
          <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">

            {/* Barcode Input */}
            <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
              <label htmlFor="pos-barcode-input" className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Barcode Scan / Enter Code
              </label>
              <input
                id="pos-barcode-input"
                ref={barcodeRef}
                type="text"
                value={barcodeInput}
                onChange={e => { setBarcodeInput(e.target.value); setBarcodeError(''); }}
                onKeyDown={handleBarcodeEnter}
                placeholder="Scan or type barcode, then press Enter…"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2.5 text-white
                           placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                autoComplete="off"
                spellCheck={false}
              />
              {barcodeError   && <p id="pos-barcode-error"   className="mt-2 text-red-400 text-sm">{barcodeError}</p>}
              {barcodeSuccess && <p id="pos-barcode-success" className="mt-2 text-green-400 text-sm">{barcodeSuccess}</p>}
            </div>

            {/* Product Search */}
            <div className="bg-gray-900 rounded-xl border border-gray-700 p-4 relative">
              <label htmlFor="pos-search-input" className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Search Product
              </label>
              <input
                id="pos-search-input"
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Type to search products…"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2.5 text-white
                           placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
              {searchError && <p className="mt-2 text-red-400 text-sm">{searchError}</p>}

              {(searchResults.length > 0 || searchLoading) && (
                <div
                  id="pos-search-results"
                  className="absolute left-4 right-4 top-full mt-1 z-20 bg-gray-800 border border-gray-600 rounded-xl shadow-xl overflow-hidden"
                >
                  {searchLoading ? (
                    <div className="px-4 py-3 text-gray-400 text-sm">Searching…</div>
                  ) : (
                    searchResults.map(product => (
                      <button
                        key={product.id}
                        onClick={() => addToCart(product)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-700 transition text-left"
                      >
                        <div>
                          <p className="text-white text-sm font-medium">{product.name}</p>
                          <p className="text-gray-400 text-xs mt-0.5">
                            {product.barcode || 'No barcode'} · {product.category_name || 'Uncategorized'}
                          </p>
                        </div>
                        <span className="text-indigo-300 font-semibold text-sm ml-4 shrink-0">
                          {formatCurrency(parseFloat(product.selling_price))}
                        </span>
                      </button>
                    ))
                  )}
                  {!searchLoading && searchResults.length === 0 && (
                    <div className="px-4 py-3 text-gray-400 text-sm">No products found</div>
                  )}
                </div>
              )}
            </div>

            {/* Cart Table */}
            <div className="flex-1 bg-gray-900 rounded-xl border border-gray-700 overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                <h2 className="font-semibold text-gray-200 text-sm">Cart</h2>
                {cart.length > 0 && (
                  <button
                    id="pos-clear-cart-btn"
                    onClick={clearCart}
                    className="text-xs text-red-400 hover:text-red-300 transition"
                  >Clear cart</button>
                )}
              </div>

              {cart.length === 0 ? (
                <div id="pos-empty-cart" className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                  No items — scan a barcode or search for a product
                </div>
              ) : (
                <div className="overflow-y-auto flex-1">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-gray-400 uppercase bg-gray-800/50">
                      <tr>
                        <th className="px-4 py-2 text-left">Product</th>
                        <th className="px-4 py-2 text-center">Qty</th>
                        <th className="px-4 py-2 text-right">Price</th>
                        <th className="px-4 py-2 text-right">Total</th>
                        <th className="px-4 py-2 text-center">×</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {cart.map(item => {
                        const unitPrice = parseFloat(item.product.selling_price);
                        const lineTotal = unitPrice * item.quantity;
                        const overStock = item.quantity > item.stockQty && item.stockQty > 0;
                        return (
                          <tr key={item.product.id} className="hover:bg-gray-800/40 transition">
                            <td className="px-4 py-3">
                              <p className="font-medium text-white">{item.product.name}</p>
                              <p className="text-xs text-gray-500">
                                {item.product.barcode || 'No barcode'}
                                {' · '}
                                <span className={overStock ? 'text-amber-400' : 'text-gray-500'}>
                                  Stock: {item.stockQty}{overStock && ' ⚠ exceeds stock'}
                                </span>
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  aria-label="Decrease quantity"
                                  onClick={() =>
                                    item.quantity === 1
                                      ? removeFromCart(item.product.id)
                                      : setQty(item.product.id, item.quantity - 1)
                                  }
                                  className="w-7 h-7 rounded bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-300 transition"
                                >−</button>
                                <input
                                  type="number"
                                  min={1}
                                  max={item.stockQty || 9999}
                                  value={item.quantity}
                                  onChange={e => {
                                    const v = parseInt(e.target.value, 10);
                                    if (!isNaN(v) && v >= 1) setQty(item.product.id, v);
                                  }}
                                  className="w-14 text-center bg-gray-800 border border-gray-600 rounded px-1 py-1
                                             text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                                <button
                                  aria-label="Increase quantity"
                                  onClick={() => setQty(item.product.id, item.quantity + 1)}
                                  className="w-7 h-7 rounded bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-300 transition"
                                >+</button>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right text-gray-300">{formatCurrency(unitPrice)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-white">{formatCurrency(lineTotal)}</td>
                            <td className="px-4 py-3 text-center">
                              <button
                                aria-label="Remove item"
                                onClick={() => removeFromCart(item.product.id)}
                                className="text-red-500 hover:text-red-400 transition text-lg leading-none"
                              >×</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* ── Right: Payment Panel ────────────────────────────────────────── */}
          <div className="w-80 shrink-0 border-l border-gray-700 bg-gray-900 flex flex-col p-4 gap-4">

            {/* Totals */}
            <div className="bg-gray-800 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm text-gray-400">
                <span>Subtotal</span>
                <span id="pos-subtotal" className="text-white">{formatCurrency(subtotal)}</span>
              </div>
              <div className="border-t border-gray-700 pt-2 flex justify-between items-center">
                <span className="text-lg font-bold text-white">TOTAL</span>
                <span id="pos-total" className="text-2xl font-bold text-indigo-300">
                  Rs. {formatCurrency(subtotal)}
                </span>
              </div>
              <div className="text-xs text-gray-500 text-right">
                {cart.length} item{cart.length !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Payment Method */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Payment Method</p>
              <div className="grid grid-cols-3 gap-2">
                {(['cash', 'card', 'other'] as PaymentMethod[]).map(method => (
                  <button
                    key={method}
                    id={`pos-payment-${method}`}
                    onClick={() => { setPaymentMethod(method); setAmountTendered(''); setCheckoutError(''); }}
                    className={`py-2.5 rounded-lg text-sm font-semibold capitalize transition
                      ${paymentMethod === method
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>

            {/* Cash Amount Input */}
            {paymentMethod === 'cash' && (
              <div>
                <label htmlFor="pos-amount-paid" className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Amount Paid (Rs.)
                </label>
                <input
                  id="pos-amount-paid"
                  type="number"
                  min={subtotal}
                  step="0.01"
                  value={amountTendered}
                  onChange={e => { setAmountTendered(e.target.value); setCheckoutError(''); }}
                  placeholder={formatCurrency(subtotal)}
                  className={`w-full px-4 py-2.5 rounded-lg text-white text-sm bg-gray-800 border
                    focus:outline-none focus:ring-2 focus:ring-indigo-500 transition
                    ${cashShortfall ? 'border-red-500' : 'border-gray-600'}`}
                />
                {cashShortfall && (
                  <p id="pos-cash-shortfall" className="mt-1 text-red-400 text-xs">
                    Amount is less than total
                  </p>
                )}
                {/* Change display */}
                {tendered >= subtotal && amountTendered && (
                  <div className="mt-3 bg-gray-700 rounded-lg px-4 py-3 flex justify-between items-center">
                    <span className="text-sm text-gray-300">Change</span>
                    <span id="pos-change-display" className="text-green-300 font-bold text-lg">
                      Rs. {formatCurrency(change)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Error Message */}
            {checkoutError && (
              <div
                id="pos-checkout-error"
                className="px-4 py-3 rounded-lg bg-red-900/40 border border-red-700 text-red-300 text-sm"
              >
                {checkoutError}
              </div>
            )}

            {/* Complete Sale Button */}
            <button
              id="pos-complete-sale-btn"
              onClick={handleCompleteSale}
              disabled={checkoutLoading || cart.length === 0 || cashShortfall}
              className={`mt-auto w-full py-4 rounded-xl font-bold text-lg tracking-wide transition
                ${cart.length > 0 && !cashShortfall && !checkoutLoading
                  ? 'bg-green-600 hover:bg-green-500 text-white'
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}
            >
              {checkoutLoading ? 'Processing…' : 'COMPLETE SALE'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
