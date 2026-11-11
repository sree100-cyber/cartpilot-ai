/**
 * PayPal REST API v2 helper – Sandbox
 * Supports real PayPal Sandbox REST API and seamless Sandbox Simulation mode
 * when sandbox credentials are not yet configured in .env.
 */

const PAYPAL_BASE = 'https://api-m.sandbox.paypal.com';

function isPayPalConfigured() {
  if (process.env.SIMULATE_PAYPAL === 'true') {
    return false;
  }
  const cid = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  return Boolean(
    cid &&
    !cid.startsWith('your_') &&
    secret &&
    !secret.startsWith('your_')
  );
}

async function getAccessToken() {
  if (!isPayPalConfigured()) {
    throw new Error('PayPal credentials not configured');
  }

  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal auth failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.access_token;
}

/**
 * Create a PayPal order with intent CAPTURE
 */
async function createPayPalOrder(order, baseUrl) {
  if (!isPayPalConfigured()) {
    // Sandbox simulation mode
    console.log(`[PayPal] Using Sandbox Simulation mode for order ${order.id}`);
    const mockId = `SANDBOX_ORDER_${order.id.slice(0, 8)}`;
    return {
      id: mockId,
      status: 'CREATED',
      links: [
        {
          rel: 'approve',
          href: `${baseUrl}/paypal/sandbox-mock?token=${mockId}&orderId=${order.id}`,
        },
      ],
    };
  }

  const token = await getAccessToken();
  const items = JSON.parse(order.items);

  const paypalItems = items.map(i => ({
    name: i.name,
    unit_amount: { currency_code: 'USD', value: Number(i.price).toFixed(2) },
    quantity: String(i.quantity),
  }));

  const body = {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: order.id,
      description: `CartPilot Order ${order.id.slice(0, 8)}`,
      amount: {
        currency_code: 'USD',
        value: Number(order.total).toFixed(2),
        breakdown: {
          item_total: { currency_code: 'USD', value: Number(order.total).toFixed(2) },
        },
      },
      items: paypalItems,
    }],
    application_context: {
      brand_name: 'CartPilot AI',
      landing_page: 'NO_PREFERENCE',
      user_action: 'PAY_NOW',
      return_url: `${baseUrl}/paypal/return`,
      cancel_url: `${baseUrl}/paypal/cancel`,
    },
  };

  const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal create order failed: ${res.status} ${text}`);
  }

  return res.json();
}

/**
 * Capture an approved PayPal order
 */
async function capturePayPalOrder(paypalOrderId) {
  if (paypalOrderId.startsWith('SANDBOX_ORDER_')) {
    console.log(`[PayPal] Simulated capture for ${paypalOrderId}`);
    return {
      status: 'COMPLETED',
      id: paypalOrderId,
      purchase_units: [{
        payments: {
          captures: [{
            id: `SANDBOX_CAP_${paypalOrderId.replace('SANDBOX_ORDER_', '')}`,
            status: 'COMPLETED',
          }],
        },
      }],
    };
  }

  const token = await getAccessToken();

  const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal capture failed: ${res.status} ${text}`);
  }

  return res.json();
}

/**
 * Fetch a PayPal order
 */
async function getPayPalOrder(paypalOrderId) {
  if (paypalOrderId.startsWith('SANDBOX_ORDER_')) {
    return {
      id: paypalOrderId,
      status: 'COMPLETED',
      purchase_units: [{
        payments: {
          captures: [{
            id: `SANDBOX_CAP_${paypalOrderId.replace('SANDBOX_ORDER_', '')}`,
            status: 'COMPLETED',
          }],
        },
      }],
    };
  }

  const token = await getAccessToken();

  const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${paypalOrderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal get order failed: ${res.status} ${text}`);
  }

  return res.json();
}

/**
 * Verify PayPal webhook signature
 */
async function verifyWebhookSignature(headers, body) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId || webhookId.startsWith('your_')) return false;

  const token = await getAccessToken();

  const verifyBody = {
    auth_algo: headers['paypal-auth-algo'],
    cert_url: headers['paypal-cert-url'],
    transmission_id: headers['paypal-transmission-id'],
    transmission_sig: headers['paypal-transmission-sig'],
    transmission_time: headers['paypal-transmission-time'],
    webhook_id: webhookId,
    webhook_event: body,
  };

  const res = await fetch(`${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(verifyBody),
  });

  if (!res.ok) return false;
  const data = await res.json();
  return data.verification_status === 'SUCCESS';
}

/**
 * Refund a captured payment
 */
async function refundCapture(captureId, amount) {
  if (captureId.startsWith('SANDBOX_CAP_')) {
    console.log(`[PayPal] Simulated refund for ${captureId}`);
    return { status: 'COMPLETED', id: `SANDBOX_REF_${Date.now()}` };
  }

  const token = await getAccessToken();

  const body = amount
    ? { amount: { value: Number(amount).toFixed(2), currency_code: 'USD' } }
    : {};

  const res = await fetch(`${PAYPAL_BASE}/v2/payments/captures/${captureId}/refund`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal refund failed: ${res.status} ${text}`);
  }

  return res.json();
}

module.exports = {
  isPayPalConfigured,
  createPayPalOrder,
  capturePayPalOrder,
  getPayPalOrder,
  verifyWebhookSignature,
  refundCapture,
};
