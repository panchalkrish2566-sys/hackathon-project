// routes/moves.js
const router = require('express').Router();
const { Pool } = require('pg');
const auth = require('../middleware/auth');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'coreinventory',
  user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD || 'postgres',
});

router.get('/', auth, async (req, res) => {
  const { type, status, search, limit = 100 } = req.query;
  let q = `SELECT sm.*, p.name AS product_name, p.sku
           FROM stock_moves sm LEFT JOIN products p ON p.id=sm.product_id WHERE 1=1`;
  const vals = [];
  if (type && type !== 'all')   { vals.push(type);   q += ` AND sm.type=$${vals.length}`; }
  if (status && status !== 'all') { vals.push(status); q += ` AND sm.status=$${vals.length}`; }
  if (search) {
    vals.push(`%${search}%`);
    q += ` AND (sm.ref ILIKE $${vals.length} OR p.name ILIKE $${vals.length} OR sm.from_loc ILIKE $${vals.length})`;
  }
  vals.push(limit);
  q += ` ORDER BY sm.created_at DESC LIMIT $${vals.length}`;
  const { rows } = await pool.query(q, vals);
  res.json(rows);
});

module.exports = router;
