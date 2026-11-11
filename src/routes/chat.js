/**
 * Chat API routes
 */
const express = require('express');
const router = express.Router();
const agent = require('../services/agent');
const orderService = require('../services/orders');

// In-memory session store (fine for demo/hackathon)
const sessions = new Map();

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      history: [],
      data: {
        currentOrderId: null,
        confirmed: false,
        checkoutReady: false,
      }
    });
  }
  return sessions.get(sessionId);
}

/**
 * POST /api/chat – Send a message to the AI agent
 */
router.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId = 'default' } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const session = getSession(sessionId);

    const result = await agent.processMessage(
      message.trim(),
      session.history,
      session.data
    );

    session.history = result.sessionHistory;
    session.data = result.sessionData;

    const response = {
      response: result.response,
      orderId: session.data.currentOrderId,
      checkoutReady: session.data.checkoutReady,
      orderCancelled: Boolean(result.orderCancelled),
    };

    // Include order details whenever an order is active and not cancelled
    if (session.data.currentOrderId && !result.orderCancelled) {
      const order = orderService.getOrder(session.data.currentOrderId);
      if (order) {
        response.order = {
          id: order.id,
          items: JSON.parse(order.items),
          total: order.total,
          status: order.status,
        };
      }
    }

    res.json(response);
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({
      error: 'Something went wrong. Please try again.',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

/**
 * POST /api/chat/confirm – Customer confirms the order
 */
router.post('/api/chat/confirm', async (req, res) => {
  try {
    const { sessionId = 'default' } = req.body;
    const session = getSession(sessionId);

    if (!session.data.currentOrderId) {
      return res.status(400).json({ error: 'No order to confirm' });
    }

    const order = orderService.getOrder(session.data.currentOrderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Set confirmation flag and update order status
    session.data.confirmed = true;
    session.data.checkoutReady = false;
    orderService.updateOrderStatus(order.id, 'awaiting_confirmation');

    // Now let the agent create checkout
    const result = await agent.processMessage(
      'I confirm this order. Please create the checkout.',
      session.history,
      session.data
    );

    session.history = result.sessionHistory;
    session.data = result.sessionData;

    const responseData = {
      response: result.response,
      orderId: session.data.currentOrderId,
      checkoutReady: session.data.checkoutReady,
    };

    if (session.data.currentOrderId) {
      const currentOrder = orderService.getOrder(session.data.currentOrderId);
      if (currentOrder) {
        responseData.order = {
          id: currentOrder.id,
          items: JSON.parse(currentOrder.items),
          total: currentOrder.total,
          status: currentOrder.status,
        };
      }
    }

    res.json(responseData);
  } catch (err) {
    console.error('Confirm error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/chat/reset – Reset the chat session
 */
router.post('/api/chat/reset', (req, res) => {
  const { sessionId = 'default' } = req.body;
  sessions.delete(sessionId);
  res.json({ success: true });
});

/**
 * GET /api/orders – Get all orders (for seller dashboard)
 */
router.get('/api/orders', (req, res) => {
  const orders = orderService.getAllOrders();
  res.json(orders.map(o => ({
    ...o,
    items: JSON.parse(o.items)
  })));
});

/**
 * POST /api/summary – Generate AI summary of orders
 */
router.post('/api/summary', async (req, res) => {
  try {
    const orders = orderService.getAllOrders().map(o => ({
      ...o,
      items: JSON.parse(o.items)
    }));

    const productService = require('../services/products');
    const products = productService.getAllProducts();

    const summary = await agent.generateOrderSummary(orders, products);
    res.json({ summary });
  } catch (err) {
    console.error('Summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
