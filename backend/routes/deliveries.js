// routes/deliveries.js
const router = require('express').Router();
const { Pool } = require('pg');
const auth = require('../middleware/auth');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'coreinventory',
  user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD || 'postgres',
});

const withLines = async (del) => {
  const { rows } = await pool.query(
    `SELECT dl.*, p.name AS product_name, p.sku, p.on_hand FROM delivery_lines dl
     JOIN products p ON p.id = dl.product_id WHERE dl.delivery_id=$1`, [del.id]
  );
  return { ...del, lines: rows };
};

router.get('/', auth, async (req, res) => {
  const { status, search } = req.query;
  let q = `SELECT d.*, w.name AS warehouse_name FROM deliveries d LEFT JOIN warehouses w ON w.id=d.warehouse_id WHERE 1=1`;
  const vals = [];
  if (status && status !== 'all') { vals.push(status); q += ` AND d.status=$${vals.length}`; }
  if (search) { vals.push(`%${search}%`); q += ` AND (d.ref ILIKE $${vals.length} OR d.customer ILIKE $${vals.length})`; }
  q += ' ORDER BY d.created_at DESC';
  const { rows } = await pool.query(q, vals);
  res.json(await Promise.all(rows.map(withLines)));
});

router.get('/:id', auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT d.*, w.name AS warehouse_name FROM deliveries d LEFT JOIN warehouses w ON w.id=d.warehouse_id WHERE d.id=$1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(await withLines(rows[0]));
});

router.post('/', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { customer, warehouse_id, scheduled, responsible, notes, lines = [] } = req.body;
    if (!customer) return res.status(400).json({ error: 'Customer required' });
    if (!lines.length) return res.status(400).json({ error: 'Add at least one item' });
    await client.query('BEGIN');
    const ref = `WH/OUT/${String(Date.now()).slice(-6)}`;
    const { rows } = await client.query(
      `INSERT INTO deliveries (ref,customer,warehouse_id,scheduled,responsible,status,notes)
       VALUES ($1,$2,$3,$4,$5,'Ready',$6) RETURNING *`,
      [ref, customer, warehouse_id, scheduled || new Date().toISOString().split('T')[0], responsible, notes]
    );
    for (const l of lines) {
      await client.query(
        `INSERT INTO delivery_lines (delivery_id,product_id,qty,done) VALUES ($1,$2,$3,0)`,
        [rows[0].id, l.product_id, l.qty]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(await withLines(rows[0]));
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
  finally { client.release(); }
});

// POST /api/deliveries/:id/validate — decreases stock
router.post('/:id/validate', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT * FROM deliveries WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (rows[0].status === 'Done') return res.status(400).json({ error: 'Already dispatched' });

    await client.query('BEGIN');
    const lines = (await client.query('SELECT * FROM delivery_lines WHERE delivery_id=$1', [rows[0].id])).rows;

    for (const l of lines) {
      // Check stock
      const prod = (await client.query('SELECT on_hand FROM products WHERE id=$1', [l.product_id])).rows[0];
      if (!prod || prod.on_hand < l.qty)
        throw new Error(`Insufficient stock for product ID ${l.product_id}`);

      await client.query('UPDATE products SET on_hand=on_hand-$1, updated_at=NOW() WHERE id=$2', [l.qty, l.product_id]);
      await client.query('UPDATE delivery_lines SET done=$1 WHERE id=$2', [l.qty, l.id]);
      await client.query(
        `INSERT INTO stock_moves (ref,type,product_id,from_loc,to_loc,qty,status)
         VALUES ($1,'OUT',$2,'Warehouse',$3,$4,'Done')`,
        [rows[0].ref, l.product_id, rows[0].customer, -l.qty]
      );
    }
    const { rows: updated } = await client.query(
      `UPDATE deliveries SET status='Done', updated_at=NOW() WHERE id=$1 RETURNING *`, [rows[0].id]
    );
    await client.query('COMMIT');
    res.json(await withLines(updated[0]));
  } catch (err) { await client.query('ROLLBACK'); res.status(400).json({ error: err.message }); }
  finally { client.release(); }
});

router.patch('/:id/cancel', auth, async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE deliveries SET status='Cancelled', updated_at=NOW() WHERE id=$1 AND status != 'Done' RETURNING *`,
    [req.params.id]
  );
  if (!rows.length) return res.status(400).json({ error: 'Cannot cancel' });
  res.json(rows[0]);
});

module.exports = router;
