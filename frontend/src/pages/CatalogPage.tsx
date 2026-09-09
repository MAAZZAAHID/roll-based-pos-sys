import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

type CatalogKind = 'products' | 'categories';

interface Product {
  id: number;
  name: string;
  barcode: string | null;
  category_name: string | null;
  selling_price: string;
  cost_price: string;
  is_active: boolean;
  category_id: number | null;
  low_stock_threshold: number;
}

interface Category {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
}

export default function CatalogPage({ kind }: { kind: CatalogKind }) {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', barcode: '', category_id: '', selling_price: '', cost_price: '', low_stock_threshold: '10' });
  const [editing, setEditing] = useState<Product | Category | null>(null);
  const isProducts = kind === 'products';

  useEffect(() => {
    setLoading(true);
    setError('');
    const request = isProducts
      ? Promise.all([
          api.get<Product[]>('/products').then(setProducts),
          api.get<Category[]>('/categories').then(setCategories),
        ])
      : api.get<Category[]>('/categories').then(setCategories);
    request.catch(err => setError(err.message || `Failed to load ${kind}`))
      .finally(() => setLoading(false));
  }, [isProducts, kind]);

  async function addProduct() {
    setError('');
    if (!form.name.trim() || !form.selling_price || !form.cost_price) {
      setError('Name, selling price, and cost price are required.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/products', {
        name: form.name.trim(),
        barcode: form.barcode.trim() || undefined,
        category_id: form.category_id ? Number(form.category_id) : undefined,
        selling_price: Number(form.selling_price),
        cost_price: Number(form.cost_price),
        low_stock_threshold: Number(form.low_stock_threshold),
      });
      setForm({ name: '', barcode: '', category_id: '', selling_price: '', cost_price: '', low_stock_threshold: '10' });
      setShowAdd(false);
      setLoading(true);
      setProducts(await api.get<Product[]>('/products'));
    } catch (err: any) {
      setError(err.message || 'Failed to add product');
    } finally {
      setSaving(false);
      setLoading(false);
    }
  }

  function openEdit(item: Product | Category) {
    setEditing(item);
    if (isProducts) {
      const product = item as Product;
      setForm({ name: product.name, barcode: product.barcode || '', category_id: product.category_id ? String(product.category_id) : '', selling_price: product.selling_price, cost_price: product.cost_price, low_stock_threshold: String(product.low_stock_threshold) });
    }
  }

  async function saveEdit() {
    if (!editing || !form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (isProducts) {
        await api.put(`/products/${editing.id}`, { name: form.name.trim(), barcode: form.barcode.trim() || null, category_id: form.category_id ? Number(form.category_id) : null, selling_price: Number(form.selling_price), cost_price: Number(form.cost_price), low_stock_threshold: Number(form.low_stock_threshold), is_active: (editing as Product).is_active });
      } else {
        await api.put(`/categories/${editing.id}`, { name: form.name.trim(), description: (editing as Category).description || null, is_active: (editing as Category).is_active });
      }
      setEditing(null);
      setShowAdd(false);
      setLoading(true);
      if (isProducts) setProducts(await api.get<Product[]>('/products'));
      else setCategories(await api.get<Category[]>('/categories'));
    } catch (err: any) {
      setError(err.message || 'Failed to update item');
    } finally {
      setSaving(false);
      setLoading(false);
    }
  }

  async function toggleActive(item: Product | Category) {
    if (!window.confirm(`Are you sure you want to ${item.is_active ? 'deactivate' : 'reactivate'} this ${isProducts ? 'product' : 'category'}?`)) return;
    try {
      if (isProducts) {
        const product = item as Product;
        await api.put(`/products/${product.id}`, { name: product.name, barcode: product.barcode, category_id: product.category_id, selling_price: Number(product.selling_price), cost_price: Number(product.cost_price), low_stock_threshold: product.low_stock_threshold, is_active: !product.is_active });
        setProducts(await api.get<Product[]>('/products'));
      } else {
        const category = item as Category;
        await api.put(`/categories/${category.id}`, { name: category.name, description: category.description, is_active: !category.is_active });
        setCategories(await api.get<Category[]>('/categories'));
      }
    } catch (err: any) { setError(err.message || 'Failed to update status'); }
  }

  async function addCategory() {
    if (!form.name.trim()) { setError('Category name is required.'); return; }
    setSaving(true);
    try {
      await api.post('/categories', { name: form.name.trim(), description: form.barcode.trim() || undefined });
      setForm({ ...form, name: '', barcode: '' });
      setShowAdd(false);
      setCategories(await api.get<Category[]>('/categories'));
    } catch (err: any) { setError(err.message || 'Failed to add category'); }
    finally { setSaving(false); }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <main className="app-page space-y-5">
        {error && <div className="alert alert-error">{error}</div>}
        <div className="page-header">
          <div>
            <p className="page-kicker">Management</p>
            <h1 className="page-title">{isProducts ? 'Products' : 'Categories'}</h1>
            <p className="page-subtitle">{isProducts ? `${products.length} products in your catalog` : `${categories.length} categories in your catalog`}</p>
          </div>
          {(user?.role === 'owner' || user?.role === 'manager') && <button onClick={() => { setEditing(null); setForm({ name: '', barcode: '', category_id: '', selling_price: '', cost_price: '', low_stock_threshold: '10' }); setShowAdd(open => !open); }} className="btn-primary">{showAdd ? 'Close' : <><span aria-hidden="true">+</span> {isProducts ? 'Add product' : 'Add category'}</>}</button>}
        </div>
        {showAdd && isProducts && !editing && (
          <div className="form-panel grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Product name *" />
            <input value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} placeholder="Barcode (optional)" />
            <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}><option value="">No category</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
            <input type="number" min="0" step="0.01" value={form.selling_price} onChange={e => setForm({ ...form, selling_price: e.target.value })} placeholder="Selling price *" />
            <input type="number" min="0" step="0.01" value={form.cost_price} onChange={e => setForm({ ...form, cost_price: e.target.value })} placeholder="Cost price *" />
            <input type="number" min="0" value={form.low_stock_threshold} onChange={e => setForm({ ...form, low_stock_threshold: e.target.value })} placeholder="Low stock threshold" />
            <button onClick={addProduct} disabled={saving} className="sm:col-span-2 lg:col-span-3 justify-self-end px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold">{saving ? 'Saving...' : 'Save Product'}</button>
          </div>
        )}
        {showAdd && !isProducts && !editing && (
          <div className="form-panel grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Category name *" />
            <input value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} placeholder="Description (optional)" />
            <button onClick={addCategory} disabled={saving} className="sm:col-span-2 justify-self-end px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold">{saving ? 'Saving...' : 'Save Category'}</button>
          </div>
        )}
        {editing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-catalog-title">
            <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900 p-5 shadow-2xl">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 id="edit-catalog-title" className="text-lg font-semibold">Edit {isProducts ? 'Product' : 'Category'}</h2>
                  <p className="text-sm text-gray-500">Update details and save your changes.</p>
                </div>
                <button onClick={() => { setEditing(null); setShowAdd(false); }} className="rounded-lg px-2 py-1 text-gray-400 hover:bg-gray-800 hover:text-white" aria-label="Close edit dialog">×</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={isProducts ? 'Product name *' : 'Category name *'} autoFocus />
                {isProducts ? <>
                  <input value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} placeholder="Barcode (optional)" />
                  <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}><option value="">No category</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
                  <input type="number" min="0" step="0.01" value={form.selling_price} onChange={e => setForm({ ...form, selling_price: e.target.value })} placeholder="Selling price *" />
                  <input type="number" min="0" step="0.01" value={form.cost_price} onChange={e => setForm({ ...form, cost_price: e.target.value })} placeholder="Cost price *" />
                  <input type="number" min="0" value={form.low_stock_threshold} onChange={e => setForm({ ...form, low_stock_threshold: e.target.value })} placeholder="Low stock threshold" />
                </> : <input value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} placeholder="Description (optional)" />}
              </div>
              <div className="mt-6 flex justify-end gap-2"><button onClick={() => { setEditing(null); setShowAdd(false); }} className="px-4 py-2 bg-gray-800 rounded-lg text-sm">Cancel</button><button onClick={saveEdit} disabled={saving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold">{saving ? 'Saving...' : 'Save changes'}</button></div>
            </div>
          </div>
        )}
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            {loading ? (
              <p className="px-5 py-10 text-center text-gray-500">Loading {kind}...</p>
            ) : isProducts ? (
              <table className="data-table w-full text-sm">
                <thead className="bg-gray-800/60 text-gray-400 text-xs uppercase"><tr><th className="px-5 py-3 text-left">Product</th><th className="px-5 py-3 text-left">Category</th><th className="px-5 py-3 text-right">Price</th><th className="px-5 py-3 text-center">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead>
                <tbody className="divide-y divide-gray-800">{products.map(product => <tr key={product.id} className="hover:bg-gray-800/40"><td className="px-5 py-4"><p className="font-medium">{product.name}</p><p className="text-xs text-gray-500">{product.barcode || 'No barcode'}</p></td><td className="px-5 py-4 text-gray-400">{product.category_name || 'Uncategorized'}</td><td className="px-5 py-4 text-right">Rs. {parseFloat(product.selling_price).toFixed(2)}</td><td className="px-5 py-4 text-center"><span className={`status-badge ${product.is_active ? 'status-success' : 'status-neutral'}`}>{product.is_active ? 'Active' : 'Inactive'}</span></td><td className="px-5 py-4 text-right">{(user?.role === 'owner' || user?.role === 'manager') && <><button onClick={() => { openEdit(product); setShowAdd(true); }} className="mr-2 text-indigo-400">Edit</button><button onClick={() => toggleActive(product)} className="text-red-400">{product.is_active ? 'Deactivate' : 'Activate'}</button></>}</td></tr>)}</tbody>
              </table>
            ) : (
              <table className="data-table w-full text-sm">
                <thead className="bg-gray-800/60 text-gray-400 text-xs uppercase"><tr><th className="px-5 py-3 text-left">Category</th><th className="px-5 py-3 text-left">Description</th><th className="px-5 py-3 text-center">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead>
                <tbody className="divide-y divide-gray-800">{categories.map(category => <tr key={category.id} className="hover:bg-gray-800/40"><td className="px-5 py-4 font-medium">{category.name}</td><td className="px-5 py-4 text-gray-400">{category.description || 'No description'}</td><td className="px-5 py-4 text-center"><span className={`status-badge ${category.is_active ? 'status-success' : 'status-neutral'}`}>{category.is_active ? 'Active' : 'Inactive'}</span></td><td className="px-5 py-4 text-right">{(user?.role === 'owner' || user?.role === 'manager') && <><button onClick={() => { openEdit(category); setShowAdd(true); }} className="mr-2 text-indigo-400">Edit</button><button onClick={() => toggleActive(category)} className="text-red-400">{category.is_active ? 'Deactivate' : 'Activate'}</button></>}</td></tr>)}</tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
