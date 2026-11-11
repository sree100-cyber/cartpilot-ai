/**
 * Phase 1 Test: PayPal Sandbox checkout on its own with a hardcoded order
 * Run with: node test-paypal.js
 */
require('dotenv').config();
const { initDb } = require('./src/db/database');
const orderService = require('./src/services/orders');
const paypalService = require('./src/services/paypal');

async function testPayPal() {
  console.log('--- Testing PayPal Sandbox Connection ---');
  await initDb();

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  console.log(`PAYPAL_CLIENT_ID: ${clientId ? (clientId.startsWith('your_') ? 'Placeholder' : 'Set (' + clientId.slice(0, 8) + '...)') : 'Missing'}`);
  console.log(`PAYPAL_CLIENT_SECRET: ${clientSecret ? (clientSecret.startsWith('your_') ? 'Placeholder' : 'Set (***)') : 'Missing'}`);

  // Create a hardcoded test order
  const testItems = [
    { productId: 1, name: 'Lavender Dream Candle', price: 14.99, quantity: 2, subtotal: 29.98 }
  ];
  const order = orderService.createOrder(testItems, 29.98);
  orderService.updateOrderStatus(order.id, 'awaiting_confirmation');
  console.log(`\nCreated test order in DB: ${order.id} ($${order.total})`);

  if (!clientId || clientId.startsWith('your_') || !clientSecret || clientSecret.startsWith('your_')) {
    console.log('\n⚠️  PayPal credentials not configured in .env (still using placeholders).');
    console.log('To test real sandbox checkout:');
    console.log('1. Go to https://developer.paypal.com/dashboard/applications/sandbox');
    console.log('2. Copy Client ID and Secret to .env');
    console.log('3. Re-run: node test-paypal.js');
    console.log('\n✅ Local DB, order creation, and status validation work correctly.');
    return;
  }

  try {
    console.log('\nCalling PayPal Sandbox Orders v2 API...');
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const ppOrder = await paypalService.createPayPalOrder(order, baseUrl);
    console.log(`✅ PayPal Order Created! ID: ${ppOrder.id}`);
    console.log(`Status: ${ppOrder.status}`);

    const approveLink = ppOrder.links.find(l => l.rel === 'approve');
    console.log(`Approval URL: ${approveLink ? approveLink.href : 'None'}`);

    orderService.setPayPalOrderId(order.id, ppOrder.id);
    orderService.updateOrderStatus(order.id, 'pending_payment');
    console.log('✅ Order updated to pending_payment in database.');
  } catch (err) {
    console.error('❌ PayPal Error:', err.message);
  }
}

testPayPal().catch(console.error);
