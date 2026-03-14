// routes/receipts.js
const router = require('express').Router();
const { Pool } = require('pg');
const auth = require('../middleware/auth');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'coreinventory',
  user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD || 'postgres',
});

const withLines = async (receipt) => {
  const { rows } = await pool.query(
    `SELECT rl.*, p.name AS product_name, p.sku FROM receipt_lines rl
     JOIN products p ON p.id = rl.product_id WHERE rl.receipt_id=$1`, [receipt.id]
  );
  return { ...receipt, lines: rows };
};

// GET /api/receipts
router.get('/', auth, async (req, res) => {
  try {
    const { status, search } = req.query;
    let q = `SELECT r.*, w.name AS warehouse_name FROM receipts r LEFT JOIN warehouses w ON w.id=r.warehouse_id WHERE 1=1`;
    const vals = [];
    if (status && status !== 'all') { vals.push(status); q += ` AND r.status=$${vals.length}`; }
    if (search) { vals.push(`%${search}%`); q += ` AND (r.ref ILIKE $${vals.length} OR r.supplier ILIKE $${vals.length})`; }
    q += ' ORDER BY r.created_at DESC';
    const { rows } = await pool.query(q, vals);
    const result = await Promise.all(rows.map(withLines));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/receipts/:id
router.get('/:id', auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.*, w.name AS warehouse_name FROM receipts r LEFT JOIN warehouses w ON w.id=r.warehouse_id WHERE r.id=$1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(await withLines(rows[0]));
});

// POST /api/receipts
router.post('/', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { supplier, warehouse_id, date, responsible, notes, lines = [] } = req.body;
    if (!supplier) return res.status(400).json({ error: 'Supplier required' });
    if (!lines.length) return res.status(400).json({ error: 'At least one product line required' });
    await client.query('BEGIN');
    const ref = `WH/IN/${String(Date.now()).slice(-6)}`;
    const { rows } = await client.query(
      `INSERT INTO receipts (ref,supplier,warehouse_id,date,responsible,status,notes)
       VALUES ($1,$2,$3,$4,$5,'Ready',$6) RETURNING *`,
      [ref, supplier, warehouse_id, date || new Date().toISOString().split('T')[0], responsible, notes]
    );
    for (const l of lines) {
      await client.query(
        `INSERT INTO receipt_lines (receipt_id,product_id,qty,done) VALUES ($1,$2,$3,0)`,
        [rows[0].id, l.product_id, l.qty]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(await withLines(rows[0]));
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
  finally { client.release(); }
});

// POST /api/receipts/:id/validate  — increases stock
router.post('/:id/validate', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT * FROM receipts WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (rows[0].status === 'Done') return res.status(400).json({ error: 'Already validated' });

    await client.query('BEGIN');

    const lines = (await client.query(
      'SELECT * FROM receipt_lines WHERE receipt_id=$1', [rows[0].id]
    )).rows;

    for (const l of lines) {
      // Increase stock
      await client.query('UPDATE products SET on_hand=on_hand+$1, updated_at=NOW() WHERE id=$2', [l.qty, l.product_id]);
      // Mark line done
      await client.query('UPDATE receipt_lines SET done=$1 WHERE id=$2', [l.qty, l.id]);
      // Log stock move
      await client.query(
        `INSERT INTO stock_moves (ref,type,product_id,from_loc,to_loc,qty,status)
         VALUES ($1,'IN',$2,'Supplier','Warehouse',$3,'Done')`,
        [rows[0].ref, l.product_id, l.qty]
      );
    }

    const { rows: updated } = await client.query(
      `UPDATE receipts SET status='Done', updated_at=NOW() WHERE id=$1 RETURNING *`, [rows[0].id]
    );
    await client.query('COMMIT');
    res.json(await withLines(updated[0]));
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
  finally { client.release(); }
});

// PATCH /api/receipts/:id/cancel
router.patch('/:id/cancel', auth, async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE receipts SET status='Cancelled', updated_at=NOW() WHERE id=$1 AND status != 'Done' RETURNING *`,
    [req.params.id]
  );
  if (!rows.length) return res.status(400).json({ error: 'Cannot cancel — not found or already done' });
  res.json(rows[0]);
});

module.exports = router;
