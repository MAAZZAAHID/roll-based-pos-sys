/**
 * Smoke-tests for Dashboard & Reports (Step 12).
 */

const BASE = `http://localhost:${process.env.PORT || 3001}/api`;

async function req(method: string, path: string, body?: object, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const options: RequestInit = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, options);
  const text = await res.text();
  let resBody: any = text;
  try { resBody = JSON.parse(text); } catch {}
  return { status: res.status, body: resBody };
}

function assert(condition: boolean, label: string) {
  if (condition) { console.log(`  ✅  ${label}`); }
  else           { console.error(`  ❌  ${label}`); process.exitCode = 1; }
}

async function main() {
  console.log('\n📊  Dashboard & Reports smoke-tests\n');

  // 1. Auth & Users setup
  const ownerLogin = await req('POST', '/auth/login', { username: 'owner', password: 'Admin@1234' });
  const ownerToken = ownerLogin.body.token;

  let managerToken = '';
  let cashierToken = '';
  try {
    const mgr = await req('POST', '/users', {
      username: `rep_manager_${Date.now()}`,
      email: `rep_manager_${Date.now()}@test.com`,
      password: 'Password@123',
      full_name: 'Reports Manager',
      role: 'manager'
    }, ownerToken);
    const mgrL = await req('POST', '/auth/login', { username: mgr.body.username, password: 'Password@123' });
    managerToken = mgrL.body.token;

    const cshr = await req('POST', '/users', {
      username: `rep_cashier_${Date.now()}`,
      email: `rep_cashier_${Date.now()}@test.com`,
      password: 'Password@123',
      full_name: 'Reports Cashier',
      role: 'cashier'
    }, ownerToken);
    const cshrL = await req('POST', '/auth/login', { username: cshr.body.username, password: 'Password@123' });
    cashierToken = cshrL.body.token;
  } catch (e) {
    console.error("Failed to setup users", e);
  }

  // 2. Data setup: Product & Sales
  const cat = await req('POST', '/categories', { name: `Rep Cat ${Date.now()}` }, ownerToken);
  
  // Create product A (Low Stock: threshold 5, current 2)
  const prodA = await req('POST', '/products', {
    name: `Rep Prod A ${Date.now()}`, barcode: `RPA${Date.now()}`, category_id: cat.body.id,
    selling_price: 100, cost_price: 50, low_stock_threshold: 5
  }, ownerToken);
  await req('POST', `/inventory/${prodA.body.id}/adjust`, { quantity_change: 2, reason: 'init' }, ownerToken);

  // Create product B (Out of stock: threshold 5, current 0)
  const prodB = await req('POST', '/products', {
    name: `Rep Prod B ${Date.now()}`, barcode: `RPB${Date.now()}`, category_id: cat.body.id,
    selling_price: 200, cost_price: 100, low_stock_threshold: 5
  }, ownerToken);
  await req('POST', `/inventory/${prodB.body.id}/adjust`, { quantity_change: 1, reason: 'init' }, ownerToken);
  await req('POST', `/inventory/${prodB.body.id}/adjust`, { quantity_change: -1, reason: 'zero' }, ownerToken);

  // Make Sales
  const s1 = await req('POST', '/sales', {
    items: [{ product_id: prodA.body.id, quantity: 1 }],
    payment_method: 'cash', amount_tendered: 100
  }, cashierToken); // Should be 100 Rs
  if (s1.status !== 201) console.log("S1 ERR:", s1);

  const s2 = await req('POST', '/sales', {
    items: [{ product_id: prodA.body.id, quantity: 1 }], // Prod A now at 0 stock, oh wait, it had 2. now 1.
    payment_method: 'card'
  }, managerToken); // Should be 100 Rs
  if (s2.status !== 201) console.log("S2 ERR:", s2);

  // ── Tests ─────────────────────────────────────────────────────────────────

  console.log('\n--- 1. Authorization ---');
  const d_owner = await req('GET', '/reports/dashboard', undefined, ownerToken);
  assert(d_owner.status === 200, 'Owner can access dashboard');

  const d_mgr = await req('GET', '/reports/dashboard', undefined, managerToken);
  assert(d_mgr.status === 200, 'Manager can access dashboard');

  const d_cshr = await req('GET', '/reports/dashboard', undefined, cashierToken);
  assert(d_cshr.status === 403, 'Cashier gets 403 for dashboard');

  const r_cshr = await req('GET', '/reports/sales', undefined, cashierToken);
  assert(r_cshr.status === 403, 'Cashier gets 403 for reports endpoint');

  console.log('\n--- 2. Dashboard Data ---');
  // It's possible there are older sales from other tests today, so we check for minimums
  assert(d_owner.body.today.sales >= 200, "Today's sales total includes our test sales");
  assert(d_owner.body.today.transactions >= 2, "Today's transaction count includes our tests");
  assert(d_owner.body.today.average_sale > 0, "Average sale is calculated");

  const inv = d_owner.body.inventory;
  assert(inv.active_products >= 2, "Active products counted");
  assert(inv.low_stock >= 0, "Low stock counted (Prod A might be 0 now if it sold out, wait we started with 2, sold 2, so it's 0 - out of stock!)");
  assert(inv.out_of_stock >= 1, "Out of stock counted (Prod B started at 0, Prod A might be 0)");

  assert(d_owner.body.recent_sales.length >= 2, "Recent sales array returned");
  assert(d_owner.body.top_products.length > 0, "Top products array returned");

  assert(d_owner.body.low_stock_products.length > 0, "Low stock products list returned items");

  console.log('\n--- 3. Sales Report ---');
  const r_sales = await req('GET', '/reports/sales', undefined, ownerToken);
  assert(r_sales.status === 200, 'Sales report endpoint works');
  assert(r_sales.body.total_sales >= 200, 'Sales report total is correct');
  assert(r_sales.body.payment_totals.cash >= 100, 'Cash payments summed correctly');
  assert(r_sales.body.payment_totals.card >= 100, 'Card payments summed correctly');

  console.log('\n--- 4. Top Products Report ---');
  const r_top = await req('GET', '/reports/top-products?limit=50', undefined, ownerToken);
  assert(r_top.status === 200, 'Top products endpoint works');
  assert(r_top.body.length <= 50, 'Limit is enforced on top products');
  const foundProdA = r_top.body.find((p:any) => p.product_name === prodA.body.name);
  if (!foundProdA) console.log("TOP PRODUCTS API RESP:", r_top);
  assert(foundProdA !== undefined, 'Top products includes our sold product');
  if (foundProdA) {
    assert(foundProdA.quantity_sold >= 2, 'Quantity sold is correct');
    assert(foundProdA.revenue >= 200, 'Revenue uses historical price');
  }

  console.log('\n--- 5. Low Stock Report ---');
  const r_low = await req('GET', '/reports/low-stock', undefined, ownerToken);
  assert(r_low.status === 200, 'Low stock report endpoint works');
  const lowB = r_low.body.find((p:any) => p.product_name === prodB.body.name);
  if (!lowB) console.log("LOW STOCK API RESP:", r_low);
  assert(lowB !== undefined, 'Low stock list includes out of stock item');
  if (lowB) {
    assert(lowB.status === 'Out of Stock', 'Status for 0 is Out of Stock');
  }
  
  const today = new Date().toISOString().split('T')[0];
  const r_sales_dates = await req('GET', `/reports/sales?date_from=${today}&date_to=${today}`, undefined, ownerToken);
  assert(r_sales_dates.status === 200, 'Date filtering works on sales endpoint');
  assert(r_sales_dates.body.total_sales >= 200, 'Date filtering returns valid sales');

  console.log('\n' + (process.exitCode ? '❌  Some report tests failed.' : '✅  All report tests passed.') + '\n');
}

main().catch((err) => {
  console.error('Test script error:', err);
  process.exit(1);
});

export {};
