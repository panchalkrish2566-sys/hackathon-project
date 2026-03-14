// db/seed.js — Run once: node db/seed.js
// Seeds demo data matching the CoreInventory frontend

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'coreinventory',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function init() {
  const client = await pool.connect();
  try {
    console.log('📦 Running schema...');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);

    console.log('🌱 Seeding data...');
    await client.query('BEGIN');

    // Users
    const hash = await bcrypt.hash('password123', 10);
    await client.query(`
      INSERT INTO users (first_name, last_name, email, password, role) VALUES
      ('Arjun',  'Mehta',  'arjun@coreinventory.in',  $1, 'admin'),
      ('Priya',  'Sharma', 'priya@coreinventory.in',  $1, 'staff'),
      ('Raj',    'Kumar',  'raj@coreinventory.in',    $1, 'staff'),
      ('Sanjay', 'Patel',  'sanjay@coreinventory.in', $1, 'viewer')
      ON CONFLICT (email) DO NOTHING`, [hash]);

    // Warehouses
    await client.query(`
      INSERT INTO warehouses (name, code, address, type, capacity) VALUES
      ('Main Warehouse',    'WH-MAIN', 'Plot 12, GIDC Phase II, Vatva, Ahmedabad 382445',          'Main',       5000),
      ('Secondary Storage', 'WH-SEC',  'Survey No. 45, Naroda Industrial Area, Ahmedabad 382330',  'Storage',    2000),
      ('Production Hub',    'WH-PROD', 'Sector 8, GIDC Gandhinagar 382024',                        'Production', 1000)
      ON CONFLICT (code) DO NOTHING`);

    // Locations
    await client.query(`
      INSERT INTO locations (warehouse_id, name, code, type, coords, max_capacity) VALUES
      (1,'Rack A1',          'A1',    'Rack',       'Row 1 / Col 1',     200),
      (1,'Rack A2',          'A2',    'Rack',       'Row 1 / Col 2',     200),
      (1,'Cold Storage',     'CS-01', 'Cold Store', 'Zone C / Bay 1',    100),
      (1,'Ground Floor East','GFE',   'Floor',      'Floor G / East',    500),
      (1,'Mezzanine Store',  'MZ-01', 'Mezzanine',  'Floor 1 / Centre',  150),
      (2,'Bay B1',           'B1',    'Bay',        'Bay 1',             300),
      (2,'Bay B2',           'B2',    'Bay',        'Bay 2',             300),
      (2,'Overflow Zone',    'OV-01', 'Overflow',   'External Annex',    400),
      (3,'Main Floor',       'MF-01', 'Floor',      'Ground Level',      250),
      (3,'Upper Loft',       'UL-01', 'Loft',       'Level 1',           100)
      ON CONFLICT (warehouse_id, code) DO NOTHING`);

    // Categories
    await client.query(`
      INSERT INTO categories (name) VALUES
      ('Fans'),('Coolers'),('Industrial'),('Small Appliances'),('Accessories')
      ON CONFLICT (name) DO NOTHING`);

    // Products (location_id and category_id use subqueries to stay id-safe)
    await client.query(`
      INSERT INTO products (name, sku, category_id, uom, on_hand, reserved, threshold, cost, location_id) VALUES
      ('Anik 18" Stand Fan',    'SKU-001', (SELECT id FROM categories WHERE name='Fans'),             'Nos', 880, 50, 100, 2500, (SELECT id FROM locations WHERE code='A1')),
      ('Yoda Fan 12"',          'SKU-002', (SELECT id FROM categories WHERE name='Fans'),             'Nos',  30,  0,  80, 1800, (SELECT id FROM locations WHERE code='A1')),
      ('Turbo Cooler Pro',      'SKU-003', (SELECT id FROM categories WHERE name='Coolers'),          'Nos', 310, 60,  50, 4200, (SELECT id FROM locations WHERE code='A2')),
      ('Mini Desk Blower',      'SKU-004', (SELECT id FROM categories WHERE name='Small Appliances'), 'Nos',  55, 10,  60,  990, (SELECT id FROM locations WHERE code='GFE')),
      ('Industrial Exhaust Fan','SKU-005', (SELECT id FROM categories WHERE name='Industrial'),       'Nos',  22,  5,  30, 8500, (SELECT id FROM locations WHERE code='CS-01')),
      ('Tower Fan 36"',         'SKU-006', (SELECT id FROM categories WHERE name='Fans'),             'Nos', 140, 20,  40, 3200, (SELECT id FROM locations WHERE code='A2'))
      ON CONFLICT (sku) DO NOTHING`);

    // Receipts
    await client.query(`
      INSERT INTO receipts (ref, supplier, warehouse_id, date, responsible, status) VALUES
      ('WH/IN/0012','ABC Industries', 1,'2026-03-14','Raj Kumar',    'Ready'),
      ('WH/IN/0011','Steel Corp Ltd', 1,'2026-03-13','Priya Sharma', 'Done'),
      ('WH/IN/0010','Fan World',      2,'2026-03-12','Raj Kumar',    'Done'),
      ('WH/IN/0009','Quick Supply',   1,'2026-03-11','Admin',        'Cancelled'),
      ('WH/IN/0008','Industrial Hub', 3,'2026-03-10','Priya Sharma', 'Done'),
      ('WH/IN/0007','ABC Industries', 1,'2026-03-09','Raj Kumar',    'Draft')
      ON CONFLICT (ref) DO NOTHING`);

    // Receipt lines
    await client.query(`
      INSERT INTO receipt_lines (receipt_id, product_id, qty, done)
      SELECT r.id, p.id, 50, 0 FROM receipts r, products p WHERE r.ref='WH/IN/0012' AND p.sku='SKU-001'
      ON CONFLICT DO NOTHING`);
    await client.query(`
      INSERT INTO receipt_lines (receipt_id, product_id, qty, done)
      SELECT r.id, p.id, 20, 0 FROM receipts r, products p WHERE r.ref='WH/IN/0012' AND p.sku='SKU-003'
      ON CONFLICT DO NOTHING`);
    await client.query(`
      INSERT INTO receipt_lines (receipt_id, product_id, qty, done)
      SELECT r.id, p.id, 30, 30 FROM receipts r, products p WHERE r.ref='WH/IN/0011' AND p.sku='SKU-006'
      ON CONFLICT DO NOTHING`);
    await client.query(`
      INSERT INTO receipt_lines (receipt_id, product_id, qty, done)
      SELECT r.id, p.id, 100, 100 FROM receipts r, products p WHERE r.ref='WH/IN/0010' AND p.sku='SKU-002'
      ON CONFLICT DO NOTHING`);

    // Deliveries
    await client.query(`
      INSERT INTO deliveries (ref, customer, warehouse_id, scheduled, responsible, status) VALUES
      ('WH/OUT/0031','Customer A — Mumbai',   1,'2026-03-15','Sanjay Patel', 'Ready'),
      ('WH/OUT/0030','Customer B — Surat',    1,'2026-03-14','Priya Sharma', 'Done'),
      ('WH/OUT/0029','Customer C — Vadodara', 2,'2026-03-14','Raj Kumar',    'Ready'),
      ('WH/OUT/0028','Customer D — Rajkot',   1,'2026-03-13','Sanjay Patel', 'Done'),
      ('WH/OUT/0027','Customer E — Anand',    2,'2026-03-12','Priya Sharma', 'Draft'),
      ('WH/OUT/0026','Customer F — Mehsana',  1,'2026-03-11','Raj Kumar',    'Done')
      ON CONFLICT (ref) DO NOTHING`);

    // Delivery lines
    await client.query(`
      INSERT INTO delivery_lines (delivery_id, product_id, qty, done)
      SELECT d.id, p.id, 20, 0 FROM deliveries d, products p WHERE d.ref='WH/OUT/0031' AND p.sku='SKU-001'
      ON CONFLICT DO NOTHING`);
    await client.query(`
      INSERT INTO delivery_lines (delivery_id, product_id, qty, done)
      SELECT d.id, p.id, 10, 10 FROM deliveries d, products p WHERE d.ref='WH/OUT/0030' AND p.sku='SKU-003'
      ON CONFLICT DO NOTHING`);
    await client.query(`
      INSERT INTO delivery_lines (delivery_id, product_id, qty, done)
      SELECT d.id, p.id, 15, 0 FROM deliveries d, products p WHERE d.ref='WH/OUT/0029' AND p.sku='SKU-006'
      ON CONFLICT DO NOTHING`);

    // Transfers
    await client.query(`
      INSERT INTO transfers (ref, from_loc_id, to_loc_id, date, responsible, status) VALUES
      ('WH/INT/0005',(SELECT id FROM locations WHERE code='A1'),(SELECT id FROM locations WHERE code='MF-01'),'2026-03-14','Raj Kumar',   'Ready'),
      ('WH/INT/0004',(SELECT id FROM locations WHERE code='A2'),(SELECT id FROM locations WHERE code='B1'),   '2026-03-13','Priya Sharma','Done'),
      ('WH/INT/0003',(SELECT id FROM locations WHERE code='A1'),(SELECT id FROM locations WHERE code='GFE'),  '2026-03-12','Raj Kumar',   'Done'),
      ('WH/INT/0002',(SELECT id FROM locations WHERE code='GFE'),(SELECT id FROM locations WHERE code='MF-01'),'2026-03-10','Sanjay Patel','Draft')
      ON CONFLICT (ref) DO NOTHING`);

    // Adjustments
    await client.query(`
      INSERT INTO adjustments (ref, product_id, location_id, counted, system_qty, reason, date, status, adj_by) VALUES
      ('ADJ/0001',(SELECT id FROM products WHERE sku='SKU-002'),(SELECT id FROM locations WHERE code='A1'),  30, 50,'Physical count',    '2026-03-13','Done','Admin'),
      ('ADJ/0002',(SELECT id FROM products WHERE sku='SKU-004'),(SELECT id FROM locations WHERE code='GFE'), 55, 60,'Damage write-off',  '2026-03-11','Done','Raj Kumar'),
      ('ADJ/0003',(SELECT id FROM products WHERE sku='SKU-005'),(SELECT id FROM locations WHERE code='CS-01'),22,25,'Count correction',  '2026-03-09','Done','Admin'),
      ('ADJ/0004',(SELECT id FROM products WHERE sku='SKU-001'),(SELECT id FROM locations WHERE code='A1'), 880,875,'Found extra units', '2026-03-07','Done','Priya Sharma'),
      ('ADJ/0005',(SELECT id FROM products WHERE sku='SKU-003'),(SELECT id FROM locations WHERE code='A2'),   0,  0,'Pending count',     '2026-03-14','Draft','Raj Kumar')
      ON CONFLICT (ref) DO NOTHING`);

    // Stock moves
    await client.query(`
      INSERT INTO stock_moves (ref, type, product_id, from_loc, to_loc, qty, status, created_at) VALUES
      ('WH/IN/0012', 'IN',  (SELECT id FROM products WHERE sku='SKU-001'), 'Supplier',          'Rack A1 (WH-MAIN)',  50, 'Done', '2026-03-14 09:15'),
      ('WH/OUT/0031','OUT', (SELECT id FROM products WHERE sku='SKU-001'), 'Rack A1 (WH-MAIN)', 'Customer A',        -20, 'Ready','2026-03-14 10:30'),
      ('WH/IN/0011', 'IN',  (SELECT id FROM products WHERE sku='SKU-006'), 'Supplier',          'Bay B1 (WH-SEC)',    30, 'Done', '2026-03-13 11:00'),
      ('WH/OUT/0030','OUT', (SELECT id FROM products WHERE sku='SKU-003'), 'Rack A2 (WH-MAIN)', 'Customer B',        -10, 'Done', '2026-03-14 08:45'),
      ('ADJ/0001',   'ADJ', (SELECT id FROM products WHERE sku='SKU-002'), 'Rack A1',           'Rack A1',           -20, 'Done', '2026-03-13 14:00'),
      ('WH/INT/0004','INT', (SELECT id FROM products WHERE sku='SKU-006'), 'Rack A2',           'Bay B1',             10, 'Done', '2026-03-13 12:00'),
      ('WH/IN/0010', 'IN',  (SELECT id FROM products WHERE sku='SKU-002'), 'Supplier',          'Rack A1 (WH-MAIN)', 100, 'Done', '2026-03-12 15:20'),
      ('WH/OUT/0028','OUT', (SELECT id FROM products WHERE sku='SKU-004'), 'Ground Floor East', 'Customer D',        -30, 'Done', '2026-03-13 16:10'),
      ('WH/IN/0008', 'IN',  (SELECT id FROM products WHERE sku='SKU-005'), 'Supplier',          'Cold Storage',       15, 'Done', '2026-03-10 09:00'),
      ('WH/INT/0003','INT', (SELECT id FROM products WHERE sku='SKU-001'), 'Rack A1',           'Ground Floor East',  50, 'Done', '2026-03-12 10:30')
      ON CONFLICT DO NOTHING`);

    await client.query('COMMIT');
    console.log('✅ Seed complete!');
    console.log('\n🔑 Login credentials:');
    console.log('   arjun@coreinventory.in / password123  (admin)');
    console.log('   priya@coreinventory.in / password123  (staff)');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    throw err;
  } finally {
    client.release();
    pool.end();
  }
}

init();
