/**
 * PayPal routes – checkout, return, cancel, webhooks
 */
const express = require('express');
const router = express.Router();
const paypal = require('../services/paypal');
const orderService = require('../services/orders');
const productService = require('../services/products');

/**
 * POST /api/checkout/:orderId – Create PayPal checkout
 */
router.post('/api/checkout/:orderId', async (req, res) => {
  try {
    const order = orderService.getOrder(req.params.orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // GUARDRAIL: Only allow checkout for confirmed orders
    if (order.status !== 'awaiting_confirmation') {
      return res.status(400).json({
        error: `Order must be confirmed before checkout. Current status: ${order.status}`
      });
    }

    const baseUrl = process.env.BASE_URL
      || process.env.RENDER_EXTERNAL_URL
      || `${req.protocol}://${req.get('host')}`;
    const ppOrder = await paypal.createPayPalOrder(order, baseUrl);

    // Store PayPal order ID and update status
    orderService.setPayPalOrderId(order.id, ppOrder.id);
    orderService.updateOrderStatus(order.id, 'pending_payment');

    // Find approval URL
    const approvalLink = ppOrder.links.find(l => l.rel === 'approve');
    if (!approvalLink) {
      throw new Error('No approval link in PayPal response');
    }

    res.json({
      paypalOrderId: ppOrder.id,
      approvalUrl: approvalLink.href,
    });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /paypal/sandbox-mock – Realistic Sandbox page when PayPal keys are not configured yet
 */
router.get('/paypal/sandbox-mock', (req, res) => {
  const { token, orderId } = req.query;
  const order = orderId ? orderService.getOrder(orderId) : null;
  const total = order ? order.total.toFixed(2) : '0.00';
  const items = order ? JSON.parse(order.items) : [];

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PayPal Sandbox Checkout Simulator</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f5f7fa; margin: 0; padding: 24px; color: #2c2e2f; }
    .container { max-width: 480px; margin: 40px auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); overflow: hidden; }
    .banner { background: #003087; color: #fff; padding: 18px 24px; display: flex; align-items: center; justify-content: space-between; }
    .banner h1 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.5px; }
    .badge-env { background: #ffc439; color: #111; font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 4px; text-transform: uppercase; }
    .content { padding: 24px; }
    .notice { background: #e8f4fd; border-left: 4px solid #0070ba; padding: 12px 14px; font-size: 13px; line-height: 1.5; color: #00457c; margin-bottom: 20px; border-radius: 0 4px 4px 0; }
    .order-box { border: 1px solid #e1e7ec; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
    .order-line { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
    .order-line:last-child { margin-bottom: 0; }
    .total-line { display: flex; justify-content: space-between; border-top: 1px solid #e1e7ec; padding-top: 10px; margin-top: 10px; font-weight: 700; font-size: 16px; color: #003087; }
    .btn-approve { display: block; width: 100%; background: #0070ba; color: white; border: none; padding: 14px; border-radius: 24px; font-size: 15px; font-weight: 600; cursor: pointer; text-align: center; text-decoration: none; margin-bottom: 12px; box-sizing: border-box; }
    .btn-approve:hover { background: #003087; }
    .btn-cancel { display: block; width: 100%; background: transparent; color: #515354; border: 1px solid #d3d9de; padding: 12px; border-radius: 24px; font-size: 14px; cursor: pointer; text-align: center; text-decoration: none; box-sizing: border-box; }
    .btn-cancel:hover { background: #f2f4f7; }
  </style>
</head>
<body>
  <div class="container">
    <div class="banner">
      <h1>PayPal Sandbox</h1>
      <span class="badge-env">Test Simulation</span>
    </div>
    <div class="content">
      <div class="notice">
        <strong>Demo Sandbox Environment</strong><br>
        This test checkout simulates the PayPal buyer approval flow. To connect your live PayPal developer credentials, set <code>PAYPAL_CLIENT_ID</code> and <code>PAYPAL_CLIENT_SECRET</code> in your <code>.env</code> file.
      </div>

      <div class="order-box">
        <div style="font-size: 12px; color: #6c7378; margin-bottom: 8px; text-transform: uppercase;">Purchase Details</div>
        ${items.map(it => `
          <div class="order-line">
            <span>${it.name} (×${it.quantity})</span>
            <span>$${(it.price * it.quantity).toFixed(2)}</span>
          </div>
        `).join('')}
        <div class="total-line">
          <span>Total to Pay</span>
          <span>$${total} USD</span>
        </div>
      </div>

      <a href="/paypal/return?token=${token}" class="btn-approve">Approve & Complete Payment</a>
      <a href="/paypal/cancel?token=${token}" class="btn-cancel">Cancel and return to store</a>
    </div>
  </div>
</body>
</html>`);
});

/**
 * GET /paypal/return – Capture payment after customer approves
 */
router.get('/paypal/return', async (req, res) => {
  const paypalOrderId = req.query.token; // PayPal sends token=<order-id>
  try {
    if (!paypalOrderId) {
      return res.status(400).send('Missing PayPal order token');
    }

    // Capture the payment
    const captureResult = await paypal.capturePayPalOrder(paypalOrderId);
    const captureStatus = captureResult.status;

    const order = orderService.getOrderByPayPalId(paypalOrderId);
    if (!order) {
      return res.status(404).send('Order not found');
    }

    if (captureStatus === 'COMPLETED') {
      // Only update if not already paid (idempotent)
      if (order.status !== 'paid') {
        orderService.updateOrderStatus(order.id, 'paid');

        // Store capture ID for refunds
        const captureId = captureResult.purchase_units?.[0]?.payments?.captures?.[0]?.id;
        if (captureId) {
          orderService.setCaptureId(order.id, captureId);
        }

        // Decrement stock
        const items = JSON.parse(order.items);
        for (const item of items) {
          productService.decrementStock(item.productId, item.quantity);
        }
      }

      // Show success page
      res.send(successPage(order));
    } else {
      orderService.updateOrderStatus(order.id, 'failed');
      res.send(failurePage(order, 'Payment was not completed.'));
    }
  } catch (err) {
    console.error('Return capture error:', err);
    // Try to find the order and mark it
    try {
      const order = orderService.getOrderByPayPalId(paypalOrderId);
      if (order && order.status === 'pending_payment') {
        orderService.updateOrderStatus(order.id, 'failed');
      }
    } catch (_) {}
    res.status(500).send(failurePage(null, err.message));
  }
});

/**
 * GET /paypal/cancel – Customer cancelled checkout
 */
router.get('/paypal/cancel', (req, res) => {
  const paypalOrderId = req.query.token;
  if (paypalOrderId) {
    const order = orderService.getOrderByPayPalId(paypalOrderId);
    if (order && order.status === 'pending_payment') {
      orderService.updateOrderStatus(order.id, 'pending_payment'); // keep as pending, they can retry
    }
  }
  res.send(cancelPage());
});

/**
 * POST /webhooks/paypal – Handle PayPal webhook events
 */
router.post('/webhooks/paypal', async (req, res) => {
  try {
    const event = req.body;
    console.log('Webhook event:', event.event_type);

    // Verify signature if webhook ID is configured
    if (process.env.PAYPAL_WEBHOOK_ID) {
      const isValid = await paypal.verifyWebhookSignature(req.headers, event);
      if (!isValid) {
        console.warn('Webhook signature verification failed, falling back to order fetch');
      }
    }

    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const capture = event.resource;
      // The capture's supplementary_data or custom_id might reference our order
      // But safer: look up by the PayPal order ID from the capture's links
      // For sandbox, we'll use the order ID from the up link
      let paypalOrderId = null;

      if (capture.supplementary_data?.related_ids?.order_id) {
        paypalOrderId = capture.supplementary_data.related_ids.order_id;
      }

      if (paypalOrderId) {
        // Validate by re-fetching from PayPal
        const ppOrder = await paypal.getPayPalOrder(paypalOrderId);
        if (ppOrder.status === 'COMPLETED') {
          const order = orderService.getOrderByPayPalId(paypalOrderId);
          if (order && order.status !== 'paid') {
            orderService.updateOrderStatus(order.id, 'paid');
            const items = JSON.parse(order.items);
            for (const item of items) {
              productService.decrementStock(item.productId, item.quantity);
            }
            console.log(`Webhook: Order ${order.id} marked paid`);
          }
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(200).json({ received: true }); // Always 200 to prevent retries
  }
});

/**
 * POST /api/refund/:orderId – Refund a paid order
 */
router.post('/api/refund/:orderId', async (req, res) => {
  try {
    const order = orderService.getOrder(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'paid') {
      return res.status(400).json({ error: 'Only paid orders can be refunded' });
    }

    // Get the capture ID (stored locally or fetch from PayPal)
    let captureId = order.capture_id;
    if (!captureId) {
      const ppOrder = await paypal.getPayPalOrder(order.paypal_order_id);
      const capture = ppOrder.purchase_units?.[0]?.payments?.captures?.[0];
      if (!capture) {
        return res.status(400).json({ error: 'No capture found for this order' });
      }
      captureId = capture.id;
    }

    await paypal.refundCapture(captureId);
    orderService.updateOrderStatus(order.id, 'refunded');

    // Restore stock
    const items = JSON.parse(order.items);
    for (const item of items) {
      productService.restoreStock(item.productId, item.quantity);
    }

    res.json({ success: true, status: 'refunded' });
  } catch (err) {
    console.error('Refund error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---- HTML pages for PayPal redirects ----

function successPage(order) {
  const items = JSON.parse(order.items);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payment Successful – CartPilot AI</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:system-ui,-apple-system,sans-serif;background:#f0fdf4;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
  .card{background:#fff;border-radius:16px;padding:40px;max-width:480px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .icon{font-size:64px;margin-bottom:16px}
  h1{color:#166534;margin-bottom:8px;font-size:24px}
  .subtitle{color:#4b5563;margin-bottom:24px}
  .order-id{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;font-family:monospace;font-size:13px;margin-bottom:24px;word-break:break-all}
  .items{text-align:left;margin-bottom:24px}
  .item{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6}
  .total{display:flex;justify-content:space-between;padding:12px 0;font-weight:700;font-size:18px;color:#166534}
  .btn{display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;transition:background .2s}
  .btn:hover{background:#1d4ed8}
</style></head><body>
<div class="card">
  <div class="icon">✅</div>
  <h1>Payment Successful!</h1>
  <p class="subtitle">Thank you for your order</p>
  <div class="order-id">Order ID: ${order.id}</div>
  <div class="items">
    ${items.map(i => `<div class="item"><span>${i.name} × ${i.quantity}</span><span>$${(i.price * i.quantity).toFixed(2)}</span></div>`).join('')}
    <div class="total"><span>Total</span><span>$${order.total.toFixed(2)}</span></div>
  </div>
  <a href="/" class="btn">← Back to Chat</a>
</div></body></html>`;
}

function failurePage(order, message) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payment Failed – CartPilot AI</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:system-ui,-apple-system,sans-serif;background:#fef2f2;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
  .card{background:#fff;border-radius:16px;padding:40px;max-width:480px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .icon{font-size:64px;margin-bottom:16px}
  h1{color:#991b1b;margin-bottom:8px;font-size:24px}
  .msg{color:#4b5563;margin-bottom:24px}
  .btn{display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600}
</style></head><body>
<div class="card">
  <div class="icon">❌</div>
  <h1>Payment Failed</h1>
  <p class="msg">${message}</p>
  <a href="/" class="btn">← Back to Chat</a>
</div></body></html>`;
}

function cancelPage() {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payment Cancelled – CartPilot AI</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:system-ui,-apple-system,sans-serif;background:#fffbeb;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
  .card{background:#fff;border-radius:16px;padding:40px;max-width:480px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .icon{font-size:64px;margin-bottom:16px}
  h1{color:#92400e;margin-bottom:8px;font-size:24px}
  .msg{color:#4b5563;margin-bottom:24px}
  .btn{display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600}
</style></head><body>
<div class="card">
  <div class="icon">🔙</div>
  <h1>Checkout Cancelled</h1>
  <p class="msg">No worries! Your order is still saved. Come back anytime to complete your purchase.</p>
  <a href="/" class="btn">← Back to Chat</a>
</div></body></html>`;
}

module.exports = router;
