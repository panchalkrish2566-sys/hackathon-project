-- CoreInventory — PostgreSQL Schema
-- Run: psql -U postgres -d coreinventory -f schema.sql

-- ── Extensions ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  first_name VARCHAR(80)  NOT NULL,
  last_name  VARCHAR(80)  NOT NULL,
  email      VARCHAR(200) NOT NULL UNIQUE,
  password   TEXT         NOT NULL,
  role       VARCHAR(20)  NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff','viewer')),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Warehouses ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouses (
  id       SERIAL PRIMARY KEY,
  name     VARCHAR(120) NOT NULL,
  code     VARCHAR(30)  NOT NULL UNIQUE,
  address  TEXT,
  type     VARCHAR(30)  DEFAULT 'Main' CHECK (type IN ('Main','Storage','Production','Transit')),
  capacity INTEGER      DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Locations ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS locations (
  id           SERIAL PRIMARY KEY,
  warehouse_id INTEGER      NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  name         VARCHAR(120) NOT NULL,
  code         VARCHAR(30)  NOT NULL,
  type         VARCHAR(30)  DEFAULT 'Rack',
  coords       VARCHAR(80),
  max_capacity INTEGER      DEFAULT 200,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(warehouse_id, code)
);

-- ── Categories ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE
);

-- ── Products ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  sku         VARCHAR(80)  NOT NULL UNIQUE,
  category_id INTEGER      REFERENCES categories(id),
  uom         VARCHAR(20)  DEFAULT 'Nos',
  on_hand     INTEGER      NOT NULL DEFAULT 0,
  reserved    INTEGER      NOT NULL DEFAULT 0,
  threshold   INTEGER      NOT NULL DEFAULT 10,
  cost        NUMERIC(12,2) DEFAULT 0,
  location_id INTEGER      REFERENCES locations(id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Receipts ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipts (
  id           SERIAL PRIMARY KEY,
  ref          VARCHAR(40)  NOT NULL UNIQUE,
  supplier     VARCHAR(150) NOT NULL,
  warehouse_id INTEGER      REFERENCES warehouses(id),
  date         DATE         NOT NULL DEFAULT CURRENT_DATE,
  responsible  VARCHAR(120),
  status       VARCHAR(20)  NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Waiting','Ready','Done','Cancelled')),
  notes        TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS receipt_lines (
  id         SERIAL PRIMARY KEY,
  receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty        INTEGER NOT NULL DEFAULT 0,
  done       INTEGER NOT NULL DEFAULT 0
);

-- ── Deliveries ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deliveries (
  id           SERIAL PRIMARY KEY,
  ref          VARCHAR(40)  NOT NULL UNIQUE,
  customer     VARCHAR(200) NOT NULL,
  warehouse_id INTEGER      REFERENCES warehouses(id),
  scheduled    DATE         NOT NULL DEFAULT CURRENT_DATE,
  responsible  VARCHAR(120),
  status       VARCHAR(20)  NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Ready','Done','Cancelled')),
  notes        TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery_lines (
  id          SERIAL PRIMARY KEY,
  delivery_id INTEGER NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  qty         INTEGER NOT NULL DEFAULT 0,
  done        INTEGER NOT NULL DEFAULT 0
);

-- ── Transfers ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transfers (
  id           SERIAL PRIMARY KEY,
  ref          VARCHAR(40)  NOT NULL UNIQUE,
  from_loc_id  INTEGER      REFERENCES locations(id),
  to_loc_id    INTEGER      REFERENCES locations(id),
  date         DATE         NOT NULL DEFAULT CURRENT_DATE,
  responsible  VARCHAR(120),
  status       VARCHAR(20)  NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Ready','Done')),
  notes        TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transfer_lines (
  id          SERIAL PRIMARY KEY,
  transfer_id INTEGER NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  qty         INTEGER NOT NULL DEFAULT 0
);

-- ── Adjustments ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS adjustments (
  id          SERIAL PRIMARY KEY,
  ref         VARCHAR(40)  NOT NULL UNIQUE,
  product_id  INTEGER      REFERENCES products(id),
  location_id INTEGER      REFERENCES locations(id),
  counted     INTEGER      NOT NULL DEFAULT 0,
  system_qty  INTEGER      NOT NULL DEFAULT 0,
  reason      TEXT,
  date        DATE         NOT NULL DEFAULT CURRENT_DATE,
  status      VARCHAR(20)  NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Done')),
  adj_by      VARCHAR(120),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Stock Moves (Ledger) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_moves (
  id         SERIAL PRIMARY KEY,
  ref        VARCHAR(40),
  type       VARCHAR(10)  NOT NULL CHECK (type IN ('IN','OUT','INT','ADJ')),
  product_id INTEGER      REFERENCES products(id),
  from_loc   VARCHAR(120),
  to_loc     VARCHAR(120),
  qty        INTEGER      NOT NULL DEFAULT 0,
  status     VARCHAR(20)  NOT NULL DEFAULT 'Done',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_sku         ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category    ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_stock_moves_product  ON stock_moves(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_moves_type     ON stock_moves(type);
CREATE INDEX IF NOT EXISTS idx_receipts_status      ON receipts(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_status    ON deliveries(status);
