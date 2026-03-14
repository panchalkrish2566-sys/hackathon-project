// routes/dashboard.js
const router = require('express').Router();
const { Pool } = require('pg');
const auth = require('../middleware/auth');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'coreinventory',
  user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD || 'postgres',
});

// GET /api/dashboard  — all KPIs in one call
router.get('/', auth, async (req, res) => {
  try {
    const [
      products, lowStock, outStock,
      pendingReceipts, pendingDeliveries, pendingTransfers,
      recentMoves, recentReceipts, recentDeliveries,
      stockChart
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM products'),
      pool.query('SELECT COUNT(*) FROM products WHERE on_hand < threshold AND on_hand > 0'),
      pool.query('SELECT COUNT(*) FROM products WHERE on_hand = 0'),
      pool.query("SELECT COUNT(*) FROM receipts  WHERE status IN ('Ready','Waiting')"),
      pool.query("SELECT COUNT(*) FROM deliveries WHERE status = 'Ready'"),
      pool.query("SELECT COUNT(*) FROM transfers  WHERE status IN ('Ready','Draft')"),
      pool.query(`SELECT sm.*, p.name AS product_name FROM stock_moves sm
                  LEFT JOIN products p ON p.id=sm.product_id
                  ORDER BY sm.created_at DESC LIMIT 8`),
      pool.query(`SELECT r.*, w.name AS warehouse_name FROM receipts r
                  LEFT JOIN warehouses w ON w.id=r.warehouse_id
                  WHERE r.status IN ('Ready','Waiting') ORDER BY r.date LIMIT 5`),
      pool.query(`SELECT d.*, w.name AS warehouse_name FROM deliveries d
                  LEFT JOIN warehouses w ON w.id=d.warehouse_id
                  WHERE d.status = 'Ready' ORDER BY d.scheduled LIMIT 5`),
      pool.query('SELECT name, sku, on_hand, threshold FROM products ORDER BY on_hand DESC'),
    ]);

    // Low stock alert list
    const lowList = (await pool.query(
      'SELECT name, on_hand FROM products WHERE on_hand < threshold ORDER BY on_hand'
    )).rows;

    res.json({
      kpis: {
        total_products:     parseInt(products.rows[0].count),
        low_stock:          parseInt(lowStock.rows[0].count),
        out_of_stock:       parseInt(outStock.rows[0].count),
        pending_receipts:   parseInt(pendingReceipts.rows[0].count),
        pending_deliveries: parseInt(pendingDeliveries.rows[0].count),
        pending_transfers:  parseInt(pendingTransfers.rows[0].count),
      },
      recent_moves:      recentMoves.rows,
      pending_receipts:  recentReceipts.rows,
      pending_deliveries:recentDeliveries.rows,
      stock_chart:       stockChart.rows,
      low_stock_items:   lowList,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
