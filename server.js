const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { OAuth2Client } = require("google-auth-library");

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
const ADMIN_PIN = process.env.RAYCRAFTING_ADMIN_PIN || "";
const ADMIN_SESSIONS = new Map();
const RATE_LIMITS = new Map();
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "";
const SUPPORT_EMAIL = process.env.RAYCRAFTING_SUPPORT_EMAIL || "hello@raycrafting.co";
const SUPPORT_PHONE = process.env.RAYCRAFTING_SUPPORT_PHONE || "";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

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
    avatar_url TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    email TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
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
ensureColumn("customers", "avatar_url", "TEXT");

const defaultProducts = [];
const productInsert = db.prepare(`INSERT OR IGNORE INTO products (id,name,category,price,original_price,detail,description,featured,art,image) VALUES (?,?,?,?,?,?,?,?,?,?)`);
for (const product of defaultProducts) productInsert.run(...product);
const couponInsert = db.prepare(`INSERT OR IGNORE INTO coupons (code,kind,amount,minimum_subtotal,active) VALUES (?,?,?,?,1)`);
couponInsert.run("BRIGHT10", "percent", 10, 0);
couponInsert.run("RAY100", "fixed", 100, 1000);
couponInsert.run("WELCOME15", "percent", 15, 500);

function now() { return new Date().toISOString(); }
function id(prefix) { return `${prefix}_${crypto.randomBytes(8).toString("hex")}`; }
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://accounts.google.com; frame-src https://checkout.razorpay.com https://api.razorpay.com https://accounts.google.com; connect-src 'self' https://api.razorpay.com https://accounts.google.com; form-action 'self'"
};
function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; if (raw.length > 1024 * 1024) reject(new Error("Request too large")); });
    req.on("end", () => { try { req.rawBody = raw; const parsed = raw ? JSON.parse(raw) : {}; resolve(parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}); } catch { reject(new Error("Invalid JSON")); } });
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
function requestIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket.remoteAddress || "unknown";
}
function allowRequest(req, bucket, limit, windowMs = 15 * 60 * 1000) {
  const key = bucket + ":" + requestIp(req);
  const current = RATE_LIMITS.get(key) || { count: 0, resetAt: Date.now() + windowMs };
  if (Date.now() > current.resetAt) { current.count = 0; current.resetAt = Date.now() + windowMs; }
  current.count += 1;
  RATE_LIMITS.set(key, current);
  return current.count <= limit;
}
function issueAdminSession() {
  const token = crypto.randomBytes(32).toString("hex");
  ADMIN_SESSIONS.set(token, Date.now() + 1000 * 60 * 60 * 8);
  return token;
}
function adminTokenFromRequest(req) {
  const token = String(req.headers["x-admin-token"] || "").trim();
  const expiresAt = ADMIN_SESSIONS.get(token);
  if (!token || !expiresAt) return "";
  if (Date.now() > expiresAt) { ADMIN_SESSIONS.delete(token); return ""; }
  return token;
}
function customerFromRequest(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || token.length > 128) return null;
  const row = db.prepare(`SELECT c.id,c.name,c.email,c.phone,c.avatar_url AS avatarUrl FROM sessions s JOIN customers c ON c.id=s.customer_id WHERE s.token=? AND s.expires_at>?`).get(token, now());
  return row ? { ...row, token } : null;
}
function requireAdmin(req) { return Boolean(adminTokenFromRequest(req)); }
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
  if (!response.ok) { const error = new Error(data.error?.description || "Razorpay request failed."); error.status = response.status === 400 || response.status === 404 ? 400 : response.status === 401 ? 401 : 502; throw error; }
  return data;
}
async function verifyCapturedPayment(paymentId, orderId) {
  const payment = await razorpayRequest("/payments/" + encodeURIComponent(paymentId));
  if (payment.order_id !== orderId || payment.status !== "captured") {
    const error = new Error("Razorpay payment was not captured for this order.");
    error.status = 400;
    throw error;
  }
  return payment;
}
function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const file = path.normalize(path.join(ROOT, requested));
  const relative = path.relative(ROOT, file);
  if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return json(res, 404, { error: "Not found" });
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".json": "application/json" };
  res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "public, max-age=300" });
  fs.createReadStream(file).pipe(res);
}

async function api(req, res, pathname, body) {
  try {
    if (req.method === "GET" && pathname === "/api/health") return json(res, 200, { ok: true, service: "raycrafting", time: now() });
    if (req.method === "POST" && pathname === "/api/newsletter") {
      if (!allowRequest(req, "newsletter", 5)) return json(res, 429, { error: "Too many requests. Try again later." });
      const email = String(body.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(res, 400, { error: "Enter a valid email address." });
      db.prepare("INSERT OR IGNORE INTO newsletter_subscribers (email,created_at) VALUES (?,?)").run(email, now());
      return json(res, 200, { ok: true, message: "You’re on the list. A little brightness is on its way." });
    }
    if (req.method === "GET" && pathname === "/api/config") return json(res, 200, { currency: "INR", razorpayEnabled: Boolean(RAZORPAY_KEY_ID), razorpayKeyId: RAZORPAY_KEY_ID || null, supportEmail: SUPPORT_EMAIL, supportPhone: SUPPORT_PHONE, googleEnabled: Boolean(GOOGLE_CLIENT_ID), googleClientId: GOOGLE_CLIENT_ID || null });
    if (req.method === "GET" && pathname === "/api/products") {
      const products = db.prepare("SELECT id,name,category,price,original_price,detail,description,featured,art,image FROM products WHERE active=1 ORDER BY featured ASC, name ASC").all();
      return json(res, 200, { products: products.map((product) => ({ ...product, originalPrice: product.original_price || 0 })) });
    }
    if (req.method === "POST" && pathname === "/api/admin/auth") {
      if (!allowRequest(req, "admin-auth", 8)) return json(res, 429, { error: "Too many attempts. Try again later." });
      if (!ADMIN_PIN) return json(res, 503, { error: "Seller access is not configured." });
      if (!safeEqual(String(body.pin || ""), ADMIN_PIN)) return json(res, 401, { error: "That PIN is not correct." });
      return json(res, 200, { token: issueAdminSession(), expiresIn: 8 * 60 * 60 });
    }
    if (req.method === "POST" && pathname === "/api/admin/logout") {
      const token = adminTokenFromRequest(req); if (token) ADMIN_SESSIONS.delete(token);
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && pathname === "/api/auth/register") {
      if (!allowRequest(req, "register", 10)) return json(res, 429, { error: "Too many registration attempts. Try again later." });
      const name = String(body.name || "").trim(); const email = String(body.email || "").trim().toLowerCase(); const password = String(body.password || "");
      if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 8 || password.length > 256) return json(res, 400, { error: "Enter a valid name, email, and password between 8 and 256 characters." });
      if (db.prepare("SELECT id FROM customers WHERE email=?").get(email)) return json(res, 409, { error: "An account with that email already exists." });
      const customerId = id("cus"); const secret = hashPassword(password); db.prepare("INSERT INTO customers (id,name,email,phone,password_hash,password_salt,created_at) VALUES (?,?,?,?,?,?,?)").run(customerId, name, email, String(body.phone || "").trim(), secret.hash, secret.salt, now());
      return json(res, 201, { token: issueSession(customerId), customer: { id: customerId, name, email, phone: String(body.phone || "").trim(), avatarUrl: "" } });
    }
    if (req.method === "POST" && pathname === "/api/auth/login") {
      if (!allowRequest(req, "login", 12)) return json(res, 429, { error: "Too many login attempts. Try again later." });
      const email = String(body.email || "").trim().toLowerCase(); const row = db.prepare("SELECT * FROM customers WHERE email=?").get(email);
      if (!row || !validPassword(String(body.password || ""), row.password_salt, row.password_hash)) return json(res, 401, { error: "Email or password is incorrect." });
      return json(res, 200, { token: issueSession(row.id), customer: { id: row.id, name: row.name, email: row.email, phone: row.phone, avatarUrl: row.avatar_url || "" } });
    }
    if (req.method === "POST" && pathname === "/api/auth/google") {
      if (!allowRequest(req, "google-login", 12)) return json(res, 429, { error: "Too many sign-in attempts. Try again later." });
      if (!googleClient) return json(res, 503, { error: "Google sign-in is not configured yet." });
      const credential = String(body.credential || "");
      if (!credential || credential.length > 20000) return json(res, 400, { error: "The Google sign-in response is invalid." });
      let payload;
      try { payload = (await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID })).getPayload() || {}; } catch { return json(res, 401, { error: "Google sign-in could not be verified." }); }
      if (!payload.email || payload.email_verified !== true) return json(res, 401, { error: "Google could not verify this email address." });
      const email = String(payload.email).trim().toLowerCase();
      let row = db.prepare("SELECT * FROM customers WHERE email=?").get(email);
      if (!row) {
        const customerId = id("cus");
        const secret = hashPassword(crypto.randomBytes(32).toString("hex"));
        const name = String(payload.name || email.split("@")[0]).trim().slice(0, 120) || "Raycrafting customer";
        const avatarUrl = String(payload.picture || "").slice(0, 1000);
        db.prepare("INSERT INTO customers (id,name,email,phone,password_hash,password_salt,avatar_url,created_at) VALUES (?,?,?,?,?,?,?,?)").run(customerId, name, email, "", secret.hash, secret.salt, avatarUrl, now());
        row = db.prepare("SELECT * FROM customers WHERE id=?").get(customerId);
      } else if (!row.avatar_url && payload.picture) {
        db.prepare("UPDATE customers SET avatar_url=? WHERE id=?").run(String(payload.picture).slice(0, 1000), row.id);
        row.avatar_url = String(payload.picture).slice(0, 1000);
      }
      return json(res, 200, { token: issueSession(row.id), customer: { id: row.id, name: row.name, email: row.email, phone: row.phone, avatarUrl: row.avatar_url || "" } });
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
      if (!customerFromRequest(req)) return json(res, 401, { error: "Sign in required." });
      if (!allowRequest(req, "create-order", 20, 60 * 60 * 1000)) return json(res, 429, { error: "Too many payment-order attempts. Try again later." });
      const amount = Number(body.amount);
      if (!Number.isInteger(amount) || amount < 100 || amount > 10000000) return json(res, 400, { error: "Amount must be an integer between 100 and 10000000 paise." });
      const currency = String(body.currency || "INR").toUpperCase();
      if (currency !== "INR") return json(res, 400, { error: "Only INR payments are supported." });
      const receipt = String(body.receipt || ("raycrafting_" + Date.now())).slice(0, 40);
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
      if (["paid", "processing", "shipped", "delivered", "cancelled", "returned", "declined"].includes(internalOrder.status)) return json(res, 400, { success: false, error: "This order is no longer awaiting payment." });
      await verifyCapturedPayment(paymentId, orderId);
      db.prepare("UPDATE orders SET status='paid',payment_id=?,failure_reason=NULL,updated_at=? WHERE id=?").run(paymentId, now(), internalOrder.id);
      db.prepare("INSERT INTO payments (order_id,provider,provider_order_id,provider_payment_id,status,raw_json,created_at) VALUES (?,?,?,?,?,?,?)").run(internalOrder.id, "razorpay", orderId, paymentId, "captured", JSON.stringify(body), now());
      return json(res, 200, { success: true, orderId: internalOrder.id, status: "paid" });
    }
    if (req.method === "POST" && pathname === "/api/payments/razorpay/order") {
      const customer = customerFromRequest(req); if (!customer) return json(res, 401, { error: "Sign in required." });
      if (!allowRequest(req, "razorpay-order", 20, 60 * 60 * 1000)) return json(res, 429, { error: "Too many payment-order attempts. Try again later." });
      const order = db.prepare("SELECT * FROM orders WHERE id=? AND customer_id=?").get(String(body.orderId || ""), customer.id); if (!order) return json(res, 404, { error: "Order not found." });
      if (["paid", "processing", "shipped", "delivered", "cancel_requested", "return_requested", "cancelled", "returned", "declined"].includes(order.status)) return json(res, 400, { error: "This order is no longer awaiting payment." });
      const paymentOrder = await razorpayRequest("/orders", { method: "POST", body: JSON.stringify({ amount: Math.round(order.total * 100), currency: "INR", receipt: order.id, notes: { raycrafting_order_id: order.id } }) }); db.prepare("UPDATE orders SET razorpay_order_id=?,updated_at=? WHERE id=?").run(paymentOrder.id, now(), order.id); return json(res, 200, { keyId: RAZORPAY_KEY_ID, orderId: paymentOrder.id, amount: paymentOrder.amount, currency: paymentOrder.currency });
    }
    if (req.method === "POST" && pathname === "/api/payments/razorpay/failed") {
      const customer = customerFromRequest(req); if (!customer) return json(res, 401, { error: "Sign in required." });
      const order = db.prepare("SELECT * FROM orders WHERE id=? AND customer_id=?").get(String(body.orderId || ""), customer.id);
      if (!order) return json(res, 404, { error: "Order not found." });
      if (["paid", "processing", "shipped", "delivered", "cancelled", "returned", "declined"].includes(order.status)) return json(res, 400, { error: "This order is no longer awaiting payment." });
      const reason = String(body.reason || "Payment was not completed.").slice(0, 500);
      db.prepare("UPDATE orders SET status='failed_payment',failure_reason=?,updated_at=? WHERE id=?").run(reason, now(), order.id);
      db.prepare("INSERT INTO payments (order_id,provider,provider_order_id,provider_payment_id,status,raw_json,created_at) VALUES (?,?,?,?,?,?,?)").run(order.id, "razorpay", order.razorpay_order_id || null, body.paymentId || null, "failed", JSON.stringify(body), now());
      return json(res, 200, { ok: true, orderId: order.id, status: "failed_payment" });
    }
    if (req.method === "POST" && pathname === "/api/payments/razorpay/verify") {
      const customer = customerFromRequest(req); if (!customer) return json(res, 401, { error: "Sign in required." });
      const order = db.prepare("SELECT * FROM orders WHERE id=? AND customer_id=?").get(String(body.orderId || ""), customer.id);
      if (!order || !order.razorpay_order_id) return json(res, 400, { error: "Payment order is not ready." });
      if (["paid", "processing", "shipped", "delivered", "cancelled", "returned", "declined"].includes(order.status)) return json(res, 400, { error: "This order is no longer awaiting payment." });
      const paymentId = String(body.paymentId || ""); const signature = crypto.createHmac("sha256", RAZORPAY_KEY_SECRET).update(order.razorpay_order_id + "|" + paymentId).digest("hex");
      if (!paymentId || !safeEqual(signature, body.signature)) return json(res, 400, { error: "Payment verification failed." });
      await verifyCapturedPayment(paymentId, order.razorpay_order_id);
      db.prepare("UPDATE orders SET status='paid',payment_id=?,failure_reason=NULL,updated_at=? WHERE id=?").run(paymentId, now(), order.id); db.prepare("INSERT INTO payments (order_id,provider,provider_order_id,provider_payment_id,status,raw_json,created_at) VALUES (?,?,?,?,?,?,?)").run(order.id, "razorpay", order.razorpay_order_id, paymentId, "captured", JSON.stringify(body), now()); return json(res, 200, { ok: true, orderId: order.id, status: "paid" });
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
    if (req.method === "POST" && pathname === "/api/admin/products/sync") {
      if (!requireAdmin(req)) return json(res, 401, { error: "Seller access required." });
      const products = Array.isArray(body.products) ? body.products : [];
      const ids = products.map((product) => String(product.id || "")).filter(Boolean);
      const upsert = db.prepare(`INSERT INTO products (id,name,category,price,original_price,detail,description,featured,art,image,active) VALUES (?,?,?,?,?,?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,price=excluded.price,original_price=excluded.original_price,detail=excluded.detail,description=excluded.description,featured=excluded.featured,art=excluded.art,image=excluded.image,active=1`);
      db.exec("BEGIN");
      try {
        if (ids.length) db.prepare(`UPDATE products SET active=0 WHERE id NOT IN (${ids.map(() => "?").join(",")})`).run(...ids);
        else db.prepare("UPDATE products SET active=0").run();
        for (const product of products) upsert.run(String(product.id), String(product.name || "Untitled product"), String(product.category || "Other"), Number(product.price) || 0, Number(product.originalPrice) || 0, String(product.detail || ""), String(product.description || ""), Number(product.featured) || 1, String(product.art || "custom"), String(product.image || ""));
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
      return json(res, 200, { ok: true, count: products.length });
    }
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
