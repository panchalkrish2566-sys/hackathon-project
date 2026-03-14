// routes/adjustments.js
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
  const { status } = req.query;
  let q = `SELECT a.*, p.name AS product_name, p.sku, l.name AS location_name
           FROM adjustments a
           LEFT JOIN products  p ON p.id = a.product_id
           LEFT JOIN locations l ON l.id = a.location_id
           WHERE 1=1`;
  const vals = [];
  if (status && status !== 'all') { vals.push(status); q += ` AND a.status=$${vals.length}`; }
  q += ' ORDER BY a.created_at DESC';
  const { rows } = await pool.query(q, vals);
  res.json(rows);
});

router.get('/:id', auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.*, p.name AS product_name, p.sku, l.name AS location_name
     FROM adjustments a
     LEFT JOIN products  p ON p.id = a.product_id
     LEFT JOIN locations l ON l.id = a.location_id
     WHERE a.id=$1`, [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.post('/', auth, async (req, res) => {
  try {
    const { product_id, location_id, counted, reason, adj_by } = req.body;
    if (product_id == null || counted == null) return res.status(400).json({ error: 'product_id and counted required' });
    // Get current system qty
    const prod = (await pool.query('SELECT on_hand FROM products WHERE id=$1', [product_id])).rows[0];
    if (!prod) return res.status(404).json({ error: 'Product not found' });

    const ref = `ADJ/${String(Date.now()).slice(-6)}`;
    const { rows } = await pool.query(
      `INSERT INTO adjustments (ref,product_id,location_id,counted,system_qty,reason,status,adj_by)
       VALUES ($1,$2,$3,$4,$5,$6,'Draft',$7) RETURNING *`,
      [ref, product_id, location_id, counted, prod.on_hand, reason, adj_by || 'Admin']
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/adjustments/:id/validate — applies difference to stock
router.post('/:id/validate', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const adj = (await client.query('SELECT * FROM adjustments WHERE id=$1', [req.params.id])).rows[0];
    if (!adj) return res.status(404).json({ error: 'Not found' });
    if (adj.status === 'Done') return res.status(400).json({ error: 'Already validated' });

    // Allow updating counted qty before validation
    const counted = req.body.counted != null ? req.body.counted : adj.counted;
    const diff = counted - adj.system_qty;

    await client.query('BEGIN');
    // Update stock
    await client.query('UPDATE products SET on_hand=GREATEST(0, on_hand+$1), updated_at=NOW() WHERE id=$2', [diff, adj.product_id]);
    // Log move
    const loc = adj.location_id ? (await client.query('SELECT name FROM locations WHERE id=$1', [adj.location_id])).rows[0]?.name : 'Warehouse';
    await client.query(
      `INSERT INTO stock_moves (ref,type,product_id,from_loc,to_loc,qty,status)
       VALUES ($1,'ADJ',$2,$3,$3,$4,'Done')`,
      [adj.ref, adj.product_id, loc, diff]
    );
    const { rows } = await client.query(
      `UPDATE adjustments SET status='Done', counted=$1, system_qty=$2, date=CURRENT_DATE WHERE id=$3 RETURNING *`,
      [counted, adj.system_qty, adj.id]
    );
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
  finally { client.release(); }
});

module.exports = router;
