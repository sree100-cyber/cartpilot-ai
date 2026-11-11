/**
 * Order management
 */
const { queryAll, queryOne, run } = require('../db/database');
const { v4: uuidv4 } = require('uuid');

function createOrder(items, total) {
  const id = uuidv4();
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  run(
    `INSERT INTO orders (id, items, total, status, created_at, updated_at)
     VALUES (?, ?, ?, 'draft', ?, ?)`,
    [id, JSON.stringify(items), total, now, now]
  );
  return getOrder(id);
}

function getOrder(id) {
  return queryOne('SELECT * FROM orders WHERE id = ?', [id]);
}

function getOrderByPayPalId(paypalOrderId) {
  return queryOne('SELECT * FROM orders WHERE paypal_order_id = ?', [paypalOrderId]);
}

function updateOrderStatus(id, status) {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  run(
    `UPDATE orders SET status = ?, updated_at = ? WHERE id = ?`,
    [status, now, id]
  );
  return getOrder(id);
}

function setPayPalOrderId(id, paypalOrderId) {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  run(
    `UPDATE orders SET paypal_order_id = ?, updated_at = ? WHERE id = ?`,
    [paypalOrderId, now, id]
  );
}

function setCaptureId(id, captureId) {
  run('UPDATE orders SET capture_id = ? WHERE id = ?', [captureId, id]);
}

function getAllOrders() {
  return queryAll('SELECT * FROM orders ORDER BY created_at DESC');
}

function getTodayOrders() {
  return queryAll(
    `SELECT * FROM orders WHERE date(created_at) = date('now') ORDER BY created_at DESC`
  );
}

module.exports = {
  createOrder,
  getOrder,
  getOrderByPayPalId,
  updateOrderStatus,
  setPayPalOrderId,
  setCaptureId,
  getAllOrders,
  getTodayOrders,
};
