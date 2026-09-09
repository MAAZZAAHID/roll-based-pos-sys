/**
 * Smoke-test for Catalog (Categories & Products) endpoints.
 */

import { requiredTestCredential, testOwnerUsername } from './test-config';

const BASE = `http://localhost:${process.env.PORT || 3001}/api`;

async function req(method: string, path: string, body?: object, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const options: RequestInit = { method, headers };
  if (body) options.body = JSON.stringify(body);
  
  const res = await fetch(`${BASE}${path}`, options);
  let resBody;
  try {
    resBody = await res.json();
  } catch (e) {
    resBody = await res.text();
  }
  return { status: res.status, body: resBody };
}

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✅  ${label}`);
  } else {
    console.error(`  ❌  ${label}`);
    process.exitCode = 1;
  }
}

async function main() {
  const ownerPassword = requiredTestCredential('TEST_OWNER_PASSWORD');
  const testPassword = requiredTestCredential('TEST_PASSWORD');
  console.log('\n📦  Catalog (Categories & Products) smoke-tests\n');

  // 1. Login as the isolated test owner to perform operations
  const ownerLogin = await req('POST', '/auth/login', { username: testOwnerUsername, password: ownerPassword });
  const ownerToken = ownerLogin.body.token;
  assert(ownerLogin.status === 200, 'Owner logged in');

  // --- CATEGORIES ---
  console.log('\n--- Categories CRUD ---');
  
  // Create category
  const catName = `Test Category ${Date.now()}`;
  const createCat = await req('POST', '/categories', { name: catName, description: 'Test desc' }, ownerToken);
  assert(createCat.status === 201, 'Owner can create category');
  const catId = createCat.body.id;

  // Duplicate category
  const dupCat = await req('POST', '/categories', { name: catName }, ownerToken);
  assert(dupCat.status === 409, 'Duplicate category name is rejected');

  // Invalid category
  const invCat = await req('POST', '/categories', { name: '' }, ownerToken);
  assert(invCat.status === 400, 'Empty category name is rejected');

  // Get categories
  const getCats = await req('GET', '/categories', undefined, ownerToken);
  assert(getCats.status === 200, 'Can list categories');
  assert(getCats.body.some((c: any) => c.id === catId), 'List contains new category');

  // Update category
  const newCatName = `${catName} Updated`;
  const upCat = await req('PUT', `/categories/${catId}`, { name: newCatName }, ownerToken);
  assert(upCat.status === 200, 'Owner can update category');
  assert(upCat.body.name === newCatName, 'Category name updated');

  // --- PRODUCTS ---
  console.log('\n--- Products CRUD ---');

  const barcode = `BAR${Date.now()}`;
  const prodName = `Test Product ${Date.now()}`;

  // Create product
  const createProd = await req('POST', '/products', {
    name: prodName,
    barcode,
    category_id: catId,
    selling_price: 19.99,
    cost_price: 10.00,
    low_stock_threshold: 5
  }, ownerToken);
  assert(createProd.status === 201, 'Owner can create product');
  const prodId = createProd.body.id;

  // Invalid product prices
  const invProd = await req('POST', '/products', {
    name: 'Invalid Price',
    selling_price: -5.00,
    cost_price: 10.00
  }, ownerToken);
  assert(invProd.status === 400, 'Negative selling price is rejected');

  // Duplicate barcode
  const dupProd = await req('POST', '/products', {
    name: 'Dup Barcode',
    barcode,
    selling_price: 10,
    cost_price: 5
  }, ownerToken);
  assert(dupProd.status === 409, 'Duplicate barcode is rejected');

  // Get products
  const getProds = await req('GET', '/products', undefined, ownerToken);
  assert(getProds.status === 200, 'Can list products');
  assert(getProds.body.some((p: any) => p.id === prodId), 'List contains new product');

  // Get single product
  const getProd = await req('GET', `/products/${prodId}`, undefined, ownerToken);
  assert(getProd.status === 200, 'Can get single product');
  assert(getProd.body.category_name === newCatName, 'Product includes joined category name');

  // Update product
  const upProd = await req('PUT', `/products/${prodId}`, {
    name: prodName,
    barcode,
    category_id: catId,
    selling_price: 24.99, // price changed
    cost_price: 10.00
  }, ownerToken);
  assert(upProd.status === 200, 'Owner can update product');
  assert(parseFloat(upProd.body.selling_price) === 24.99, 'Product selling price updated');

  // Cashier role verification
  console.log('\n--- Role Verification ---');
  // First, we need a cashier user to test with. (Using auth endpoints to get a cashier token)
  // Or we can create one quickly. Wait, we created cashier_test in test-users, but let's just make one here to be safe.
  const rand = Math.floor(Math.random() * 10000);
  const cashRes = await req('POST', '/users', {
    username: `cashier_cat_${rand}`,
    email: `cashier_cat_${rand}@test.com`,
    password: testPassword,
    full_name: 'Cat Cashier',
    role: 'cashier'
  }, ownerToken);
  assert(cashRes.status === 201, 'Created test cashier');
  
  const cashLogin = await req('POST', '/auth/login', { username: `cashier_cat_${rand}`, password: testPassword });
  const cashierToken = cashLogin.body.token;

  // Cashier CAN read products/categories
  const cashGetProd = await req('GET', '/products', undefined, cashierToken);
  assert(cashGetProd.status === 200, 'Cashier can read products');
  
  const cashGetCat = await req('GET', '/categories', undefined, cashierToken);
  assert(cashGetCat.status === 200, 'Cashier can read categories');

  // Cashier CANNOT create products/categories
  const cashPostProd = await req('POST', '/products', { name: 'Cashier Prod', selling_price: 1, cost_price: 1 }, cashierToken);
  assert(cashPostProd.status === 403, 'Cashier cannot create products (403)');

  const cashPostCat = await req('POST', '/categories', { name: 'Cashier Cat' }, cashierToken);
  assert(cashPostCat.status === 403, 'Cashier cannot create categories (403)');

  // Deletions
  console.log('\n--- Soft Deletions ---');
  const delProd = await req('DELETE', `/products/${prodId}`, undefined, ownerToken);
  assert(delProd.status === 200, 'Owner can delete (deactivate) product');

  const delCat = await req('DELETE', `/categories/${catId}`, undefined, ownerToken);
  assert(delCat.status === 200, 'Owner can delete (deactivate) category');

  // Validate they are still fetchable but inactive
  const getDelProd = await req('GET', `/products/${prodId}`, undefined, ownerToken);
  assert(getDelProd.body.is_active === false, 'Product is marked inactive rather than hard deleted');

  const getDelCat = await req('GET', `/categories/${catId}`, undefined, ownerToken);
  assert(getDelCat.body.is_active === false, 'Category is marked inactive rather than hard deleted');

  console.log('\n' + (process.exitCode ? '❌  Some catalog tests failed.' : '✅  All catalog tests passed.') + '\n');
}

main().catch((err) => {
  console.error('Test script error:', err);
  process.exit(1);
});

export {};
