/**
 * Smoke-tests for Sales Transaction (Step 9).
 */

import { requiredTestCredential, testOwnerUsername } from './test-config';

const BASE = `http://localhost:${process.env.PORT || 3001}/api`;

async function req(method: string, path: string, body?: object, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const options: RequestInit = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, options);
  let resBody: any;
  try { resBody = await res.json(); } catch { resBody = await res.text(); }
  return { status: res.status, body: resBody };
}

function assert(condition: boolean, label: string) {
  if (condition) { console.log(`  ✅  ${label}`); }
  else           { console.error(`  ❌  ${label}`); process.exitCode = 1; }
}

async function main() {
  const ownerPassword = requiredTestCredential('TEST_OWNER_PASSWORD');
  console.log('\n💳  Sales Checkout smoke-tests\n');

  // ── Setup: login as owner ─────────────────────────────────────────────────
  const ownerLogin = await req('POST', '/auth/login', { username: testOwnerUsername, password: ownerPassword });
  assert(ownerLogin.status === 200, 'Owner login');
  const ownerToken: string = ownerLogin.body.token;

  // Create a product with stock
  const catRes = await req('POST', '/categories', { name: `Sale Cat ${Date.now()}` }, ownerToken);
  const catId = catRes.body.id;
  
  const prodRes = await req('POST', '/products', {
    name: `Sale Prod ${Date.now()}`,
    barcode: `SALEBAR${Date.now()}`,
    category_id: catId,
    selling_price: 15.00,
    cost_price: 5.00
  }, ownerToken);
  assert(prodRes.status === 201, 'Test product created');
  const productId = prodRes.body.id;

  // Add stock to product
  const addStock = await req('POST', `/inventory/${productId}/adjust`, {
    quantity_change: 20,
    reason: 'Initial stock'
  }, ownerToken);
  assert(addStock.status === 200, 'Test product stock set to 20');

  // Create another product (inactive)
  const inactiveProd = await req('POST', '/products', {
    name: `Inactive Sale Prod`,
    barcode: `INACTBAR${Date.now()}`,
    category_id: catId,
    selling_price: 10.00,
    cost_price: 5.00,
    is_active: false
  }, ownerToken);
  const inactiveId = inactiveProd.body.id;
  
  await req('POST', `/inventory/${inactiveId}/adjust`, { quantity_change: 10, reason: 'Initial stock' }, ownerToken);


  // ── Test 1: Successful checkout ──────────────────────────────────────────
  console.log('\n--- 1. Successful Sale ---');
  const sale1 = await req('POST', '/sales', {
    items: [{ product_id: productId, quantity: 3 }],
    payment_method: 'cash'
  }, ownerToken);
  
  assert(sale1.status === 201, 'Sale created successfully');
  assert(sale1.body.total_amount === '45.00', 'Total amount calculated correctly by backend (3 * 15)');
  assert(sale1.body.invoice_number?.startsWith('INV-'), 'Invoice number generated');

  // Verify stock deduction
  const invAfter = await req('GET', `/inventory/${productId}`, undefined, ownerToken);
  assert(invAfter.body.quantity === 17, 'Inventory decreased correctly (20 - 3 = 17)');

  // Verify movement log
  const mov = await req('GET', `/inventory/${productId}/movements`, undefined, ownerToken);
  const saleMov = mov.body[0];
  assert(saleMov.quantity_change === -3, 'Movement log recorded -3');
  assert(saleMov.reference_type === 'sale', 'Movement log reference type is sale');
  assert(saleMov.reason === `Sale ${sale1.body.invoice_number}`, 'Movement log reason matches invoice');

  // ── Test 2: Validation ───────────────────────────────────────────────────
  console.log('\n--- 2. Validation & Stock Rejection ---');
  
  // Empty cart
  const emptyCart = await req('POST', '/sales', { items: [], payment_method: 'cash' }, ownerToken);
  assert(emptyCart.status === 400, 'Empty cart rejected');

  // Invalid payment
  const invPay = await req('POST', '/sales', {
    items: [{ product_id: productId, quantity: 1 }],
    payment_method: 'bitcoin'
  }, ownerToken);
  assert(invPay.status === 400, 'Invalid payment method rejected');

  // Insufficient stock
  const overStock = await req('POST', '/sales', {
    items: [{ product_id: productId, quantity: 999 }],
    payment_method: 'cash'
  }, ownerToken);
  assert(overStock.status === 400, 'Insufficient stock rejected (transaction rollback)');
  
  const invCheck2 = await req('GET', `/inventory/${productId}`, undefined, ownerToken);
  assert(invCheck2.body.quantity === 17, 'Stock remained unchanged after failed sale');

  // Inactive product
  const inactSale = await req('POST', '/sales', {
    items: [{ product_id: inactiveId, quantity: 1 }],
    payment_method: 'cash'
  }, ownerToken);
  assert(inactSale.status === 400, 'Sale of inactive product rejected');

  // ── Test 3: Multiple Items ───────────────────────────────────────────────
  console.log('\n--- 3. Multi-item Sale ---');
  const prodRes2 = await req('POST', '/products', {
    name: `Sale Prod 2`,
    selling_price: 20.00,
    cost_price: 10.00
  }, ownerToken);
  const prod2Id = prodRes2.body.id;
  await req('POST', `/inventory/${prod2Id}/adjust`, { quantity_change: 50, reason: 'Initial stock' }, ownerToken);

  const saleMulti = await req('POST', '/sales', {
    items: [
      { product_id: productId, quantity: 2 },
      { product_id: prod2Id, quantity: 1 }
    ],
    payment_method: 'card'
  }, ownerToken);

  assert(saleMulti.status === 201, 'Multi-item sale created');
  assert(saleMulti.body.total_amount === '50.00', 'Total amount correct (2*15 + 1*20)');
  
  const invP1 = await req('GET', `/inventory/${productId}`, undefined, ownerToken);
  const invP2 = await req('GET', `/inventory/${prod2Id}`, undefined, ownerToken);
  assert(invP1.body.quantity === 15, 'Product 1 stock decreased (17 - 2 = 15)');
  assert(invP2.body.quantity === 49, 'Product 2 stock decreased (50 - 1 = 49)');


  console.log('\n' + (process.exitCode ? '❌  Some sales tests failed.' : '✅  All sales tests passed.') + '\n');
}

main().catch((err) => {
  console.error('Test script error:', err);
  process.exit(1);
});

export {};
