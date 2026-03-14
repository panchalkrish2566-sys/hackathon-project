// api.js — Drop this file alongside index.html
// Replace in-memory DB calls with real API calls

const API_BASE = 'http://localhost:5000/api';

// ─── Token helpers ───────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem('ci_token'); }
function setToken(t) { localStorage.setItem('ci_token', t); }
function clearToken() { localStorage.removeItem('ci_token'); }

// ─── Base fetch wrapper ──────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) { clearToken(); window.location.reload(); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const api = {
  // Auth
  login:          (body) => apiFetch('/auth/login',           { method: 'POST', body }),
  signup:         (body) => apiFetch('/auth/signup',          { method: 'POST', body }),
  forgotPassword: (body) => apiFetch('/auth/forgot-password', { method: 'POST', body }),
  getMe:          ()     => apiFetch('/auth/me'),
  updateMe:       (body) => apiFetch('/auth/me',              { method: 'PUT',  body }),
  changePassword: (body) => apiFetch('/auth/change-password', { method: 'PUT',  body }),

  // Dashboard
  getDashboard: () => apiFetch('/dashboard'),

  // Products
  getProducts:  (params = {}) => apiFetch('/products?'     + new URLSearchParams(params)),
  getProduct:   (id)          => apiFetch(`/products/${id}`),
  createProduct:(body)        => apiFetch('/products',       { method: 'POST', body }),
  updateProduct:(id, body)    => apiFetch(`/products/${id}`, { method: 'PUT',  body }),
  deleteProduct:(id)          => apiFetch(`/products/${id}`, { method: 'DELETE' }),
  getCategories:()            => apiFetch('/products/meta/categories'),

  // Warehouses
  getWarehouses:  (params = {}) => apiFetch('/warehouses?' + new URLSearchParams(params)),
  createWarehouse:(body)        => apiFetch('/warehouses',       { method: 'POST', body }),
  updateWarehouse:(id, body)    => apiFetch(`/warehouses/${id}`, { method: 'PUT',  body }),
  deleteWarehouse:(id)          => apiFetch(`/warehouses/${id}`, { method: 'DELETE' }),

  // Locations
  getLocations:  (params = {}) => apiFetch('/locations?' + new URLSearchParams(params)),
  getLocation:   (id)          => apiFetch(`/locations/${id}`),
  createLocation:(body)        => apiFetch('/locations',       { method: 'POST', body }),
  updateLocation:(id, body)    => apiFetch(`/locations/${id}`, { method: 'PUT',  body }),
  deleteLocation:(id)          => apiFetch(`/locations/${id}`, { method: 'DELETE' }),

  // Receipts
  getReceipts:      (params = {}) => apiFetch('/receipts?' + new URLSearchParams(params)),
  getReceipt:       (id)          => apiFetch(`/receipts/${id}`),
  createReceipt:    (body)        => apiFetch('/receipts',             { method: 'POST', body }),
  validateReceipt:  (id)          => apiFetch(`/receipts/${id}/validate`, { method: 'POST' }),
  cancelReceipt:    (id)          => apiFetch(`/receipts/${id}/cancel`,   { method: 'PATCH' }),

  // Deliveries
  getDeliveries:    (params = {}) => apiFetch('/deliveries?' + new URLSearchParams(params)),
  getDelivery:      (id)          => apiFetch(`/deliveries/${id}`),
  createDelivery:   (body)        => apiFetch('/deliveries',               { method: 'POST', body }),
  validateDelivery: (id)          => apiFetch(`/deliveries/${id}/validate`, { method: 'POST' }),
  cancelDelivery:   (id)          => apiFetch(`/deliveries/${id}/cancel`,   { method: 'PATCH' }),

  // Transfers
  getTransfers:    (params = {}) => apiFetch('/transfers?' + new URLSearchParams(params)),
  getTransfer:     (id)          => apiFetch(`/transfers/${id}`),
  createTransfer:  (body)        => apiFetch('/transfers',              { method: 'POST', body }),
  validateTransfer:(id)          => apiFetch(`/transfers/${id}/validate`, { method: 'POST' }),

  // Adjustments
  getAdjustments:    (params = {}) => apiFetch('/adjustments?' + new URLSearchParams(params)),
  getAdjustment:     (id)          => apiFetch(`/adjustments/${id}`),
  createAdjustment:  (body)        => apiFetch('/adjustments',               { method: 'POST', body }),
  validateAdjustment:(id, body)    => apiFetch(`/adjustments/${id}/validate`, { method: 'POST', body }),

  // Stock Moves
  getMoves: (params = {}) => apiFetch('/moves?' + new URLSearchParams(params)),
};

// ─── Integration helpers (wire into existing frontend functions) ──────────────
// Call these from your HTML page to replace the in-memory DB with real API data.

async function loadDashboardData() {
  const data = await api.getDashboard();
  // Map to the same shape the frontend render functions expect
  window.DB.products   = data.stock_chart;   // for chart
  window.DB.moves      = data.recent_moves;
  window.DB.receipts   = data.pending_receipts;
  window.DB.deliveries = data.pending_deliveries;
  return data;
}

// Export for use in index.html via <script src="api.js">
window.API = api;
window.getToken = getToken;
window.setToken = setToken;
window.clearToken = clearToken;
