// routes/products.js
const router = require('express').Router();
const { Pool } = require('pg');
const auth = require('../middleware/auth');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'coreinventory',
  user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD || 'postgres',
});

// GET /api/products
router.get('/', auth, async (req, res) => {
  try {
    const { search, category, stock_status } = req.query;
    let q = `SELECT p.*, c.name AS category_name, l.name AS location_name, l.code AS location_code, w.name AS warehouse_name
             FROM products p
             LEFT JOIN categories c ON c.id = p.category_id
             LEFT JOIN locations  l ON l.id = p.location_id
             LEFT JOIN warehouses w ON w.id = l.warehouse_id
             WHERE 1=1`;
    const vals = [];
    if (search) { vals.push(`%${search}%`); q += ` AND (p.name ILIKE $${vals.length} OR p.sku ILIKE $${vals.length})`; }
    if (category && category !== 'all') { vals.push(category); q += ` AND c.name = $${vals.length}`; }
    if (stock_status === 'low')  q += ` AND p.on_hand < p.threshold AND p.on_hand > 0`;
    if (stock_status === 'out')  q += ` AND p.on_hand = 0`;
    if (stock_status === 'ok')   q += ` AND p.on_hand >= p.threshold`;
    q += ' ORDER BY p.name';
    const { rows } = await pool.query(q, vals);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/products/:id
router.get('/:id', auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, c.name AS category_name, l.name AS location_name, w.name AS warehouse_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN locations  l ON l.id = p.location_id
     LEFT JOIN warehouses w ON w.id = l.warehouse_id
     WHERE p.id = $1`, [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Product not found' });
  res.json(rows[0]);
});

// POST /api/products
router.post('/', auth, async (req, res) => {
  try {
    const { name, sku, category_id, uom, on_hand = 0, threshold = 10, cost = 0, location_id } = req.body;
    if (!name || !sku) return res.status(400).json({ error: 'Name and SKU required' });
    const { rows } = await pool.query(
      `INSERT INTO products (name,sku,category_id,uom,on_hand,threshold,cost,location_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, sku, category_id, uom, on_hand, threshold, cost, location_id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'SKU already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/products/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, sku, category_id, uom, threshold, cost, location_id } = req.body;
    const { rows } = await pool.query(
      `UPDATE products SET name=$1,sku=$2,category_id=$3,uom=$4,threshold=$5,cost=$6,location_id=$7,updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [name, sku, category_id, uom, threshold, cost, location_id, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/products/:id
router.delete('/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM products WHERE id=$1', [req.params.id]);
  res.json({ message: 'Deleted' });
});

// GET /api/products/meta/categories
router.get('/meta/categories', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM categories ORDER BY name');
  res.json(rows);
});

module.exports = router;
