// routes/auth.js
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'coreinventory',
  user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD || 'postgres',
});

const sign = (user) => jwt.sign(
  { id: user.id, email: user.email, role: user.role, name: `${user.first_name} ${user.last_name}` },
  process.env.JWT_SECRET || 'dev_secret',
  { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
);

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { first_name, last_name, email, password, role = 'staff' } = req.body;
    if (!first_name || !last_name || !email || !password)
      return res.status(400).json({ error: 'All fields required' });
    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const exists = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (exists.rows.length) return res.status(409).json({ error: 'Email already in use' });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (first_name,last_name,email,password,role)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [first_name, last_name, email, hash, role]
    );
    res.status(201).json({ token: sign(rows[0]), user: { id: rows[0].id, name: `${first_name} ${last_name}`, email, role } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid email or password' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    res.json({ token: sign(user), user: { id: user.id, name: `${user.first_name} ${user.last_name}`, email: user.email, role: user.role } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/auth/forgot-password  (mock OTP — extend with nodemailer)
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const { rows } = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
  // Always respond 200 so we don't reveal whether email exists
  if (rows.length) console.log(`[OTP] Password reset requested for ${email}`);
  res.json({ message: 'If that email exists, a reset link has been sent.' });
});

// GET /api/auth/me
const auth = require('../middleware/auth');
router.get('/me', auth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id,first_name,last_name,email,role,created_at FROM users WHERE id=$1', [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
});

// PUT /api/auth/me
router.put('/me', auth, async (req, res) => {
  const { first_name, last_name, email } = req.body;
  const { rows } = await pool.query(
    `UPDATE users SET first_name=$1, last_name=$2, email=$3, updated_at=NOW()
     WHERE id=$4 RETURNING id,first_name,last_name,email,role`,
    [first_name, last_name, email, req.user.id]
  );
  res.json(rows[0]);
});

// PUT /api/auth/change-password
router.put('/change-password', auth, async (req, res) => {
  const { current_password, new_password } = req.body;
  const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  const match = await bcrypt.compare(current_password, rows[0].password);
  if (!match) return res.status(401).json({ error: 'Current password incorrect' });
  const hash = await bcrypt.hash(new_password, 10);
  await pool.query('UPDATE users SET password=$1, updated_at=NOW() WHERE id=$2', [hash, req.user.id]);
  res.json({ message: 'Password updated' });
});

module.exports = router;
