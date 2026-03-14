// routes/transfers.js
const router = require('express').Router();
const { Pool } = require('pg');
const auth = require('../middleware/auth');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'coreinventory',
  user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD || 'postgres',
});

const withLines = async (t) => {
  const { rows } = await pool.query(
    `SELECT tl.*, p.name AS product_name, p.sku FROM transfer_lines tl
     JOIN products p ON p.id = tl.product_id WHERE tl.transfer_id=$1`, [t.id]
  );
  return { ...t, lines: rows };
};

router.get('/', auth, async (req, res) => {
  const { status } = req.query;
  let q = `SELECT t.*,
           fl.name AS from_loc_name, fl.code AS from_loc_code,
           tl.name AS to_loc_name,   tl.code AS to_loc_code
           FROM transfers t
           LEFT JOIN locations fl ON fl.id = t.from_loc_id
           LEFT JOIN locations tl ON tl.id = t.to_loc_id
           WHERE 1=1`;
  const vals = [];
  if (status && status !== 'all') { vals.push(status); q += ` AND t.status=$${vals.length}`; }
  q += ' ORDER BY t.created_at DESC';
  const { rows } = await pool.query(q, vals);
  res.json(await Promise.all(rows.map(withLines)));
});

router.get('/:id', auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.*, fl.name AS from_loc_name, tl2.name AS to_loc_name
     FROM transfers t
     LEFT JOIN locations fl  ON fl.id = t.from_loc_id
     LEFT JOIN locations tl2 ON tl2.id = t.to_loc_id
     WHERE t.id=$1`, [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(await withLines(rows[0]));
});

router.post('/', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { from_loc_id, to_loc_id, date, responsible, notes, lines = [] } = req.body;
    if (!from_loc_id || !to_loc_id) return res.status(400).json({ error: 'From and To locations required' });
    if (!lines.length) return res.status(400).json({ error: 'Add at least one item' });
    await client.query('BEGIN');
    const ref = `WH/INT/${String(Date.now()).slice(-6)}`;
    const { rows } = await client.query(
      `INSERT INTO transfers (ref,from_loc_id,to_loc_id,date,responsible,status,notes)
       VALUES ($1,$2,$3,$4,$5,'Ready',$6) RETURNING *`,
      [ref, from_loc_id, to_loc_id, date || new Date().toISOString().split('T')[0], responsible, notes]
    );
    for (const l of lines) {
      await client.query(
        `INSERT INTO transfer_lines (transfer_id,product_id,qty) VALUES ($1,$2,$3)`,
        [rows[0].id, l.product_id, l.qty]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(await withLines(rows[0]));
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
  finally { client.release(); }
});

// POST /api/transfers/:id/validate — moves product location
router.post('/:id/validate', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT t.*, fl.name AS from_name, tl.name AS to_name
       FROM transfers t
       LEFT JOIN locations fl ON fl.id=t.from_loc_id
       LEFT JOIN locations tl ON tl.id=t.to_loc_id
       WHERE t.id=$1`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (rows[0].status === 'Done') return res.status(400).json({ error: 'Already done' });

    await client.query('BEGIN');
    const t = rows[0];
    const lines = (await client.query('SELECT * FROM transfer_lines WHERE transfer_id=$1', [t.id])).rows;

    for (const l of lines) {
      // Update product location to destination
      await client.query('UPDATE products SET location_id=$1, updated_at=NOW() WHERE id=$2', [t.to_loc_id, l.product_id]);
      await client.query(
        `INSERT INTO stock_moves (ref,type,product_id,from_loc,to_loc,qty,status)
         VALUES ($1,'INT',$2,$3,$4,$5,'Done')`,
        [t.ref, l.product_id, t.from_name, t.to_name, l.qty]
      );
    }
    const { rows: updated } = await client.query(
      `UPDATE transfers SET status='Done', updated_at=NOW() WHERE id=$1 RETURNING *`, [t.id]
    );
    await client.query('COMMIT');
    res.json(await withLines(updated[0]));
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
  finally { client.release(); }
});

module.exports = router;
