const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

function loadDotEnv() {
  const file = path.join(__dirname, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const pair = line.split("=");
    if (pair.length < 2) continue;
    const key = pair.shift().trim();
    const value = pair.join("=").trim();
    if (/^[A-Z0-9_]+$/.test(key) && !process.env[key]) process.env[key] = value;
  }
}
loadDotEnv();

const ROOT = __dirname;
const DATA_DIR = process.env.RAYCRAFTING_DATA_DIR || path.join(ROOT, "data");
const PORT = Number(process.env.PORT || process.env.RAYCRAFTING_PORT || 4173);
const ADMIN_PIN = process.env.RAYCRAFTING_ADMIN_PIN || "raycrafting";
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "";
const SUPPORT_EMAIL = process.env.RAYCRAFTING_SUPPORT_EMAIL || "hello@raycrafting.co";
const SUPPORT_PHONE = process.env.RAYCRAFTING_SUPPORT_PHONE || "";

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, "raycrafting.sqlite"));
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    original_price REAL DEFAULT 0,
    detail TEXT NOT NULL,
    description TEXT NOT NULL,
    featured INTEGER DEFAULT 1,
    art TEXT,
    image TEXT,
    active INTEGER DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS coupons (
    code TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK(kind IN ('percent', 'fixed')),
    amount REAL NOT NULL,
    minimum_subtotal REAL DEFAULT 0,
    active INTEGER DEFAULT 1,
    expires_at TEXT
  );
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id),
    status TEXT NOT NULL DEFAULT 'pending_payment',
    subtotal REAL NOT NULL,
    discount REAL NOT NULL DEFAULT 0,
    shipping REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    coupon_code TEXT,
    address_json TEXT NOT NULL,
    razorpay_order_id TEXT,
    payment_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    name TEXT NOT NULL,
    unit_price REAL NOT NULL,
    quantity INTEGER NOT NULL,
    line_total REAL NOT NULL
  );
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL REFERENCES orders(id),
    provider TEXT NOT NULL,
    provider_order_id TEXT,
    provider_payment_id TEXT,
    status TEXT NOT NULL,
    raw_json TEXT,
    created_at TEXT NOT NULL
  );
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
ensureColumn("orders", "payment_method", "TEXT NOT NULL DEFAULT 'razorpay'");
ensureColumn("orders", "failure_reason", "TEXT");
ensureColumn("orders", "decision_reason", "TEXT");
ensureColumn("orders", "customer_request_reason", "TEXT");

const defaultProducts = [
  ["sunbeam", "Sunbeam Stem", "Flowers", 18, 0, "one stem", "A happy yellow bloom for the corner of your desk or the friend who always brings the light.", 1, "sunbeam", ""],
  ["coral-bloom", "Coral Bloom", "Flowers", 24, 0, "one stem", "A warm coral flower with a soft green stem, made to brighten a small shelf or bedside table.", 2, "coral", ""],
  ["tiny-daisy", "Tiny Daisy Charm", "Keepsakes", 12, 0, "bag charm", "A pocket-sized daisy for your keys, tote, or the little hook by your front door.", 3, "daisy", ""],
  ["meadow-bundle", "Meadow Bundle", "Bundles", 42, 0, "three stems", "A small mix of sunshine, sage, and soft pink, tied together for a ready-made gift.", 4, "meadow", ""],
  ["lavender-loop", "Lavender Loop", "Keepsakes", 16, 0, "desk charm", "A little lavender loop that sits happily on a pinboard, monitor, or gift wrap.", 5, "lavender", ""],
  ["sunset-trio", "Sunset Trio", "Bundles", 58, 0, "three stems", "Three warm-toned blooms bundled for a full, cheerful arrangement that never needs a vase change.", 6, "sunset", ""]
];
const productInsert = db.prepare(`INSERT OR IGNORE INTO products (id,name,category,price,original_price,detail,description,featured,art,image) VALUES (?,?,?,?,?,?,?,?,?,?)`);
for (const product of defaultProducts) productInsert.run(...product);
const couponInsert = db.prepare(`INSERT OR IGNORE INTO coupons (code,kind,amount,minimum_subtotal,active) VALUES (?,?,?,?,1)`);
couponInsert.run("BRIGHT10", "percent", 10, 0);
couponInsert.run("RAY100", "fixed", 100, 1000);
couponInsert.run("WELCOME15", "percent", 15, 500);

function now() { return new Date().toISOString(); }
function id(prefix) { return `${prefix}_${crypto.randomBytes(8).toString("hex")}`; }
function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; if (raw.length > 1024 * 1024) reject(new Error("Request too large")); });
    req.on("end", () => { try { req.rawBody = raw; resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("Invalid JSON")); } });
    req.on("error", reject);
  });
}
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString("hex") };
}
function validPassword(password, salt, expected) {
  const actual = crypto.scryptSync(password, salt, 64);
  const wanted = Buffer.from(expected, "hex");
  return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted);
}
function issueSession(customerId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  db.prepare("INSERT INTO sessions (token,customer_id,expires_at) VALUES (?,?,?)").run(token, customerId, expires);
  return token;
}
function customerFromRequest(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const row = db.prepare(`SELECT c.id,c.name,c.email,c.phone FROM sessions s JOIN customers c ON c.id=s.customer_id WHERE s.token=? AND s.expires_at>?`).get(token, now());
  return row ? { ...row, token } : null;
}
function requireAdmin(req) { return req.headers["x-admin-pin"] === ADMIN_PIN; }
function calculateCoupon(code, subtotal) {
  if (!code) return { code: "", discount: 0 };
  const coupon = db.prepare("SELECT * FROM coupons WHERE code=? AND active=1").get(String(code).trim().toUpperCase());
  if (!coupon) throw new Error("That coupon code is not valid.");
  if (subtotal < coupon.minimum_subtotal) throw new Error(`This coupon needs a subtotal of ${coupon.minimum_subtotal} or more.`);
  const discount = coupon.kind === "percent" ? subtotal * coupon.amount / 100 : coupon.amount;
  return { code: coupon.code, discount: Math.min(subtotal, Math.round(discount * 100) / 100), description: coupon.kind === "percent" ? `${coupon.amount}% off` : `₹${coupon.amount} off` };
}
function orderRows() {
  const orders = db.prepare(`SELECT o.*, c.name customer_name, c.email customer_email, c.phone customer_phone FROM orders o JOIN customers c ON c.id=o.customer_id ORDER BY o.created_at DESC`).all();
  const items = db.prepare("SELECT * FROM order_items WHERE order_id=?");
  const latestPayment = db.prepare("SELECT * FROM payments WHERE order_id=? ORDER BY created_at DESC, id DESC LIMIT 1");
  return orders.map((order) => ({ ...order, address: JSON.parse(order.address_json), items: items.all(order.id), latest_payment: latestPayment.get(order.id) || null }));
}
function customerOrderRows(customerId) {
  return orderRows().filter((order) => order.customer_id === customerId).map((order) => {
    const { customer_name, customer_email, customer_phone, ...safeOrder } = order;
    return safeOrder;
  });
}
function safeEqual(a, b) {
  const left = Buffer.from(a || "", "utf8"); const right = Buffer.from(b || "", "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
async function razorpayRequest(url, options = {}) {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) throw new Error("Razorpay is not configured. Add test keys to .env first.");
  const response = await fetch(`https://api.razorpay.com/v1${url}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64")}`, ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error?.description || "Razorpay request failed."); error.status = response.status === 401 ? 401 : 500; throw error; }
  return data;
}
function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const file = path.normalize(path.join(ROOT, requested));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return json(res, 404, { error: "Not found" });
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".json": "application/json" };
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

async function api(req, res, pathname, body) {
  try {
    if (req.method === "GET" && pathname === "/api/config") return json(res, 200, { currency: "INR", razorpayEnabled: Boolean(RAZORPAY_KEY_ID), razorpayKeyId: RAZORPAY_KEY_ID || null, supportEmail: SUPPORT_EMAIL, supportPhone: SUPPORT_PHONE });
    if (req.method === "GET" && pathname === "/api/products") {
      const products = db.prepare("SELECT id,name,category,price,original_price,detail,description,featured,art,image FROM products WHERE active=1 ORDER BY featured ASC, name ASC").all();
      return json(res, 200, { products: products.map((product) => ({ ...product, originalPrice: product.original_price || 0 })) });
    }
    if (req.method === "POST" && pathname === "/api/auth/register") {
      const name = String(body.name || "").trim(); const email = String(body.email || "").trim().toLowerCase(); const password = String(body.password || "");
      if (!name || !email || password.length < 8) return json(res, 400, { error: "Name, email, and an 8-character password are required." });
      if (db.prepare("SELECT id FROM customers WHERE email=?").get(email)) return json(res, 409, { error: "An account with that email already exists." });
      const customerId = id("cus"); const secret = hashPassword(password); db.prepare("INSERT INTO customers (id,name,email,phone,password_hash,password_salt,created_at) VALUES (?,?,?,?,?,?,?)").run(customerId, name, email, String(body.phone || "").trim(), secret.hash, secret.salt, now());
      return json(res, 201, { token: issueSession(customerId), customer: { id: customerId, name, email, phone: String(body.phone || "").trim() } });
    }
    if (req.method === "POST" && pathname === "/api/auth/login") {
      const email = String(body.email || "").trim().toLowerCase(); const row = db.prepare("SELECT * FROM customers WHERE email=?").get(email);
      if (!row || !validPassword(String(body.password || ""), row.password_salt, row.password_hash)) return json(res, 401, { error: "Email or password is incorrect." });
      return json(res, 200, { token: issueSession(row.id), customer: { id: row.id, name: row.name, email: row.email, phone: row.phone } });
    }
    if (req.method === "GET" && pathname === "/api/me") { const customer = customerFromRequest(req); return customer ? json(res, 200, { customer }) : json(res, 401, { error: "Sign in required." }); }
    if (req.method === "POST" && pathname === "/api/auth/logout") { const customer = customerFromRequest(req); if (customer) db.prepare("DELETE FROM sessions WHERE token=?").run(customer.token); return json(res, 200, { ok: true }); }
    if (req.method === "GET" && pathname === "/api/orders") {
      const customer = customerFromRequest(req); if (!customer) return json(res, 401, { error: "Sign in to view your orders." });
      return json(res, 200, { orders: customerOrderRows(customer.id) });
    }
    if (req.method === "POST" && pathname === "/api/coupons/validate") {
      const subtotal = Number(body.subtotal || 0); const result = calculateCoupon(body.code, subtotal); return json(res, 200, result);
    }
    if (req.method === "POST" && pathname === "/api/orders") {
      const customer = customerFromRequest(req); if (!customer) return json(res, 401, { error: "Sign in before placing an order." });
      const items = Array.isArray(body.items) ? body.items : []; const address = body.address || {};
      if (!items.length || !address.name || !address.line1 || !address.city || !address.state || !address.postalCode || !address.phone) return json(res, 400, { error: "Complete the delivery address before continuing." });
      const getProduct = db.prepare("SELECT * FROM products WHERE id=? AND active=1"); const verified = []; let subtotal = 0;
      for (const item of items) { const product = getProduct.get(String(item.id)); const quantity = Math.max(1, Math.min(99, Number(item.quantity) || 1)); if (!product) return json(res, 400, { error: "One of the products is no longer available." }); const lineTotal = Math.round(product.price * quantity * 100) / 100; subtotal += lineTotal; verified.push({ product, quantity, lineTotal }); }
      const coupon = calculateCoupon(body.couponCode, subtotal); const shipping = subtotal - coupon.discount >= 4000 ? 0 : 80; const total = Math.round((subtotal - coupon.discount + shipping) * 100) / 100; const orderId = id("ord"); const timestamp = now();
      db.exec("BEGIN"); try { db.prepare("INSERT INTO orders (id,customer_id,status,subtotal,discount,shipping,total,currency,coupon_code,address_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(orderId, customer.id, "pending_payment", subtotal, coupon.discount, shipping, total, "INR", coupon.code || null, JSON.stringify(address), timestamp, timestamp); const insert = db.prepare("INSERT INTO order_items (order_id,product_id,name,unit_price,quantity,line_total) VALUES (?,?,?,?,?,?)"); for (const item of verified) insert.run(orderId, item.product.id, item.product.name, item.product.price, item.quantity, item.lineTotal); db.exec("COMMIT"); } catch (error) { db.exec("ROLLBACK"); throw error; }
      return json(res, 201, { orderId, subtotal, discount: coupon.discount, shipping, total, currency: "INR", status: "pending_payment" });
    }
    if (req.method === "POST" && pathname === "/api/orders/action") {
      const customer = customerFromRequest(req); if (!customer) return json(res, 401, { error: "Sign in to manage your orders." });
      const order = db.prepare("SELECT * FROM orders WHERE id=? AND customer_id=?").get(String(body.orderId || ""), customer.id);
      const action = String(body.action || ""); const reason = String(body.reason || "").trim().slice(0, 500);
      if (!order) return json(res, 404, { error: "Order not found." });
      if (!reason) return json(res, 400, { error: "Please provide a reason." });
      if (action === "cancel") {
        if (!["pending_payment", "paid", "processing", "shipped"].includes(order.status)) return json(res, 400, { error: "This order cannot be cancelled in its current status." });
        db.prepare("UPDATE orders SET status='cancel_requested',customer_request_reason=?,updated_at=? WHERE id=?").run(reason, now(), order.id);
      } else if (action === "return") {
        if (!["paid", "processing", "shipped", "delivered"].includes(order.status)) return json(res, 400, { error: "A return request is not available for this order yet." });
        db.prepare("UPDATE orders SET status='return_requested',customer_request_reason=?,updated_at=? WHERE id=?").run(reason, now(), order.id);
      } else return json(res, 400, { error: "Unsupported order action." });
      return json(res, 200, { ok: true, orderId: order.id, status: action === "cancel" ? "cancel_requested" : "return_requested" });
    }
    if (req.method === "POST" && pathname === "/api/create-order") {
      const amount = Number(body.amount);
      if (!Number.isInteger(amount) || amount < 100) return json(res, 400, { error: "Amount must be an integer of at least 100 paise." });
      const currency = String(body.currency || "INR").toUpperCase();
      const receipt = String(body.receipt || ("raycrafting_" + Date.now()));
      const paymentOrder = await razorpayRequest("/orders", { method: "POST", body: JSON.stringify({ amount, currency, receipt }) });
      return json(res, 200, { order_id: paymentOrder.id, amount: paymentOrder.amount, currency: paymentOrder.currency });
    }
    if (req.method === "POST" && pathname === "/api/verify-payment") {
      const customer = customerFromRequest(req); if (!customer) return json(res, 401, { error: "Sign in required." });
      const paymentId = String(body.razorpay_payment_id || "");
      const orderId = String(body.razorpay_order_id || "");
      const receivedSignature = String(body.razorpay_signature || "");
      if (!paymentId || !orderId || !receivedSignature) return json(res, 400, { error: "razorpay_payment_id, razorpay_order_id, and razorpay_signature are required." });
      if (!RAZORPAY_KEY_SECRET) return json(res, 500, { error: "Razorpay secret is not configured on the server." });
      const expectedSignature = crypto.createHmac("sha256", RAZORPAY_KEY_SECRET).update(orderId + "|" + paymentId).digest("hex");
      if (!safeEqual(expectedSignature, receivedSignature)) return json(res, 400, { success: false, error: "Payment signature mismatch." });
      const internalOrder = db.prepare("SELECT * FROM orders WHERE razorpay_order_id=? AND customer_id=?").get(orderId, customer.id);
      if (!internalOrder) return json(res, 404, { success: false, error: "Payment order not found." });
      db.prepare("UPDATE orders SET status='paid',payment_id=?,failure_reason=NULL,updated_at=? WHERE id=?").run(paymentId, now(), internalOrder.id);
      db.prepare("INSERT INTO payments (order_id,provider,provider_order_id,provider_payment_id,status,raw_json,created_at) VALUES (?,?,?,?,?,?,?)").run(internalOrder.id, "razorpay", orderId, paymentId, "captured", JSON.stringify(body), now());
      return json(res, 200, { success: true, orderId: internalOrder.id, status: "paid" });
    }
    if (req.method === "POST" && pathname === "/api/payments/razorpay/order") {
      const customer = customerFromRequest(req); if (!customer) return json(res, 401, { error: "Sign in required." }); const order = db.prepare("SELECT * FROM orders WHERE id=? AND customer_id=?").get(body.orderId, customer.id); if (!order) return json(res, 404, { error: "Order not found." });
      if (["paid", "processing", "shipped", "delivered", "cancel_requested", "return_requested", "cancelled", "returned", "declined"].includes(order.status)) return json(res, 400, { error: "This order is no longer awaiting payment." });
      const paymentOrder = await razorpayRequest("/orders", { method: "POST", body: JSON.stringify({ amount: Math.round(order.total * 100), currency: "INR", receipt: order.id, notes: { raycrafting_order_id: order.id } }) }); db.prepare("UPDATE orders SET razorpay_order_id=?,updated_at=? WHERE id=?").run(paymentOrder.id, now(), order.id); return json(res, 200, { keyId: RAZORPAY_KEY_ID, orderId: paymentOrder.id, amount: paymentOrder.amount, currency: paymentOrder.currency });
    }
    if (req.method === "POST" && pathname === "/api/payments/razorpay/failed") {
      const customer = customerFromRequest(req); if (!customer) return json(res, 401, { error: "Sign in required." });
      const order = db.prepare("SELECT * FROM orders WHERE id=? AND customer_id=?").get(String(body.orderId || ""), customer.id);
      if (!order) return json(res, 404, { error: "Order not found." });
      const reason = String(body.reason || "Payment was not completed.").slice(0, 500);
      db.prepare("UPDATE orders SET status='failed_payment',failure_reason=?,updated_at=? WHERE id=?").run(reason, now(), order.id);
      db.prepare("INSERT INTO payments (order_id,provider,provider_order_id,provider_payment_id,status,raw_json,created_at) VALUES (?,?,?,?,?,?,?)").run(order.id, "razorpay", order.razorpay_order_id || null, body.paymentId || null, "failed", JSON.stringify(body), now());
      return json(res, 200, { ok: true, orderId: order.id, status: "failed_payment" });
    }
    if (req.method === "POST" && pathname === "/api/payments/razorpay/verify") {
      const customer = customerFromRequest(req); if (!customer) return json(res, 401, { error: "Sign in required." }); const order = db.prepare("SELECT * FROM orders WHERE id=? AND customer_id=?").get(body.orderId, customer.id); if (!order || !order.razorpay_order_id) return json(res, 400, { error: "Payment order is not ready." }); const signature = crypto.createHmac("sha256", RAZORPAY_KEY_SECRET).update(`${order.razorpay_order_id}|${body.paymentId}`).digest("hex"); if (!safeEqual(signature, body.signature)) return json(res, 400, { error: "Payment verification failed." }); db.prepare("UPDATE orders SET status='paid',payment_id=?,failure_reason=NULL,updated_at=? WHERE id=?").run(body.paymentId, now(), order.id); db.prepare("INSERT INTO payments (order_id,provider,provider_order_id,provider_payment_id,status,raw_json,created_at) VALUES (?,?,?,?,?,?,?)").run(order.id, "razorpay", order.razorpay_order_id, body.paymentId, "captured", JSON.stringify(body), now()); return json(res, 200, { ok: true, orderId: order.id, status: "paid" });
    }
    if (req.method === "POST" && pathname === "/api/webhooks/razorpay") {
      if (!RAZORPAY_WEBHOOK_SECRET || !safeEqual(crypto.createHmac("sha256", RAZORPAY_WEBHOOK_SECRET).update(req.rawBody || JSON.stringify(body)).digest("hex"), req.headers["x-razorpay-signature"])) return json(res, 400, { error: "Invalid webhook signature." }); const entity = body.payload?.payment?.entity; if (entity?.order_id) db.prepare("UPDATE orders SET status=?,payment_id=?,updated_at=? WHERE razorpay_order_id=?").run(["payment.captured", "order.paid"].includes(body.event) ? "paid" : body.event, entity.id, now(), entity.order_id); return json(res, 200, { ok: true });
    }
    if (req.method === "GET" && pathname === "/api/admin/orders") { if (!requireAdmin(req)) return json(res, 401, { error: "Seller access required." }); return json(res, 200, { orders: orderRows() }); }
    if (req.method === "POST" && pathname === "/api/admin/orders/status") {
      if (!requireAdmin(req)) return json(res, 401, { error: "Seller access required." });
      const order = db.prepare("SELECT * FROM orders WHERE id=?").get(String(body.orderId || "")); const status = String(body.status || ""); const reason = String(body.reason || "").trim().slice(0, 500);
      const statuses = ["processing", "shipped", "delivered", "declined", "cancelled", "returned"];
      if (!order) return json(res, 404, { error: "Order not found." });
      if (!statuses.includes(status)) return json(res, 400, { error: "Unsupported order status." });
      if (status === "declined" && !reason) return json(res, 400, { error: "A decline reason is required." });
      db.prepare("UPDATE orders SET status=?,decision_reason=?,updated_at=? WHERE id=?").run(status, reason || null, now(), order.id);
      return json(res, 200, { ok: true, orderId: order.id, status, decisionReason: reason || null });
    }
    if (req.method === "POST" && pathname === "/api/admin/products/sync") { if (!requireAdmin(req)) return json(res, 401, { error: "Seller access required." }); const products = Array.isArray(body.products) ? body.products : []; const upsert = db.prepare(`INSERT INTO products (id,name,category,price,original_price,detail,description,featured,art,image,active) VALUES (?,?,?,?,?,?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,price=excluded.price,original_price=excluded.original_price,detail=excluded.detail,description=excluded.description,featured=excluded.featured,art=excluded.art,image=excluded.image,active=1`); for (const product of products) upsert.run(String(product.id), String(product.name), String(product.category || "Other"), Number(product.price) || 0, Number(product.originalPrice) || 0, String(product.detail || ""), String(product.description || ""), Number(product.featured) || 1, String(product.art || "custom"), String(product.image || "")); return json(res, 200, { ok: true, count: products.length }); }
    return json(res, 404, { error: "API route not found." });
  } catch (error) { console.error(error); return json(res, error.status || 400, { error: error.message || "Request failed." }); }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`); const body = req.method === "POST" ? await readBody(req).catch((error) => ({ __error: error.message })) : {};
  if (body.__error) return json(res, 400, { error: body.__error });
  if (url.pathname.startsWith("/api/")) return api(req, res, url.pathname, body);
  return serveStatic(req, res, url.pathname);
});
server.listen(PORT, () => console.log(`Raycrafting server running at http://127.0.0.1:${PORT}`));
