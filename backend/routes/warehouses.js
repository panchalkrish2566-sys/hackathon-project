// routes/warehouses.js
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
  const { rows } = await pool.query(`
    SELECT w.*, COUNT(l.id) AS location_count
    FROM warehouses w LEFT JOIN locations l ON l.warehouse_id = w.id
    GROUP BY w.id ORDER BY w.name`);
  res.json(rows);
});

router.get('/:id', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM warehouses WHERE id=$1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.post('/', auth, async (req, res) => {
  const { name, code, address, type, capacity } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'Name and code required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO warehouses (name,code,address,type,capacity) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, code, address, type, capacity]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Code already exists' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  const { name, code, address, type, capacity } = req.body;
  const { rows } = await pool.query(
    `UPDATE warehouses SET name=$1,code=$2,address=$3,type=$4,capacity=$5 WHERE id=$6 RETURNING *`,
    [name, code, address, type, capacity, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.delete('/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM warehouses WHERE id=$1', [req.params.id]);
  res.json({ message: 'Deleted' });
});

module.exports = router;
