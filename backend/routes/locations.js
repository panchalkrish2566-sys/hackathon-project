// routes/locations.js
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
  const { warehouse_id } = req.query;
  let q = `SELECT l.*, w.name AS warehouse_name, w.code AS warehouse_code,
           COUNT(p.id) AS product_count
           FROM locations l
           LEFT JOIN warehouses w ON w.id = l.warehouse_id
           LEFT JOIN products p  ON p.location_id = l.id
           WHERE 1=1`;
  const vals = [];
  if (warehouse_id) { vals.push(warehouse_id); q += ` AND l.warehouse_id = $${vals.length}`; }
  q += ' GROUP BY l.id, w.name, w.code ORDER BY l.name';
  const { rows } = await pool.query(q, vals);
  res.json(rows);
});

router.get('/:id', auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT l.*, w.name AS warehouse_name FROM locations l
     LEFT JOIN warehouses w ON w.id = l.warehouse_id WHERE l.id=$1`, [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });

  // Also return products at this location
  const prods = await pool.query(
    `SELECT p.*, c.name AS category_name FROM products p
     LEFT JOIN categories c ON c.id = p.category_id WHERE p.location_id=$1`, [req.params.id]
  );
  res.json({ ...rows[0], products: prods.rows });
});

router.post('/', auth, async (req, res) => {
  const { warehouse_id, name, code, type, coords, max_capacity } = req.body;
  if (!warehouse_id || !name || !code) return res.status(400).json({ error: 'Warehouse, name and code required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO locations (warehouse_id,name,code,type,coords,max_capacity) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [warehouse_id, name, code, type, coords, max_capacity]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Location code already exists in this warehouse' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  const { name, code, type, coords, max_capacity } = req.body;
  const { rows } = await pool.query(
    `UPDATE locations SET name=$1,code=$2,type=$3,coords=$4,max_capacity=$5 WHERE id=$6 RETURNING *`,
    [name, code, type, coords, max_capacity, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.delete('/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM locations WHERE id=$1', [req.params.id]);
  res.json({ message: 'Deleted' });
});

module.exports = router;
