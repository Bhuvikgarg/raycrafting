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
const SUPPORT_EMAIL = process.env.RAYCRAFTING_SUPPORT_EMAIL || "raywithcharm@gmail.com";
const SUPPORT_PHONE = process.env.RAYCRAFTING_SUPPORT_PHONE || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.RAYCRAFTING_EMAIL_FROM || "";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID || "";
const PHONE_OTP_ENABLED = Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_VERIFY_SERVICE_SID);
let shiprocketToken = process.env.SHIPROCKET_API_TOKEN || "";
const SHIPROCKET_API_EMAIL = process.env.SHIPROCKET_API_EMAIL || "";
const SHIPROCKET_API_PASSWORD = process.env.SHIPROCKET_API_PASSWORD || "";
const SHIPROCKET_PICKUP_POSTCODE = String(process.env.SHIPROCKET_PICKUP_POSTCODE || "").trim();
const SHIPROCKET_DEFAULT_PACKAGE = {
  weight: Number(process.env.SHIPROCKET_DEFAULT_WEIGHT_KG || 0.5),
  length: Number(process.env.SHIPROCKET_DEFAULT_LENGTH_CM || 20),
  breadth: Number(process.env.SHIPROCKET_DEFAULT_BREADTH_CM || 15),
  height: Number(process.env.SHIPROCKET_DEFAULT_HEIGHT_CM || 10)
};
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
  CREATE TABLE IF NOT EXISTS custom_orders (
    id TEXT PRIMARY KEY,
    customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    city TEXT,
    state TEXT,
    description TEXT NOT NULL,
    reference_image TEXT,
    status TEXT NOT NULL DEFAULT "new",
    seller_note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS note_requests (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    language TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT "new",
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
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
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
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
ensureColumn("orders", "delivered_at", "TEXT");
ensureColumn("orders", "fulfillment_method", "TEXT NOT NULL DEFAULT 'shiprocket'");
ensureColumn("orders", "shiprocket_order_id", "TEXT");
ensureColumn("orders", "shiprocket_shipment_id", "TEXT");
ensureColumn("orders", "shiprocket_awb", "TEXT");
ensureColumn("orders", "shiprocket_courier", "TEXT");
ensureColumn("orders", "shipping_status", "TEXT");
ensureColumn("customers", "avatar_url", "TEXT");
ensureColumn("products", "active", "INTEGER DEFAULT 1");
ensureColumn("products", "badge", "TEXT");
ensureColumn("products", "dimensions", "TEXT");
ensureColumn("products", "materials", "TEXT");
ensureColumn("products", "care", "TEXT");
ensureColumn("products", "images_json", "TEXT");
ensureColumn("orders", "gift_message", "TEXT");
ensureColumn("custom_orders", "quoted_price", "REAL");
ensureColumn("custom_orders", "buyer_price_request", "INTEGER DEFAULT 0");
ensureColumn("custom_orders", "budget_hint", "TEXT");

function parseInstagramUsername(val) {
  if (!val) return "";
  let clean = String(val).trim();
  clean = clean.replace(/^https?:\/\//i, "");
  clean = clean.replace(/^(www\.)?instagram\.com\//i, "");
  clean = clean.replace(/^(www\.)?ig\.me\/m\//i, "");
  clean = clean.replace(/^@+/, "");
  clean = clean.replace(/[\/\?#].*$/, "").trim();
  return clean;
}

function getSetting(key, fallback = "") {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key=?").get(key);
    if (!row || row.value === undefined || row.value === null) return fallback;
    let val = String(row.value).trim();
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      val = val.slice(1, -1).trim();
    }
    return val || fallback;
  } catch {
    return fallback;
  }
}
function setSetting(key, value) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, String(value));
}

const seedPath = path.join(ROOT, "products-seed.json");
if (fs.existsSync(seedPath)) {
  try {
    const existingCount = Number(db.prepare("SELECT count(*) as count FROM products").get()?.count || 0);
    // ONLY seed initial products if the products table is completely empty!
    // Never overwrite customized prices, names, positions, or active statuses on server restart.
    if (existingCount === 0) {
      const seedProducts = JSON.parse(fs.readFileSync(seedPath, "utf8"));
      const productInsert = db.prepare(`INSERT INTO products (id,name,category,price,original_price,detail,description,featured,art,image,images_json,active,badge,dimensions,materials,care) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const p of seedProducts) {
        const imgs = Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []);
        productInsert.run(String(p.id), String(p.name), String(p.category), Number(p.price) || 0, Number(p.original_price || p.originalPrice) || 0, String(p.detail || ""), String(p.description || ""), Number(p.featured) || 1, String(p.art || "custom"), String(p.image || imgs[0] || ""), JSON.stringify(imgs), p.active === 0 ? 0 : 1, String(p.badge || ""), String(p.dimensions || ""), String(p.materials || ""), String(p.care || ""));
      }
    }
  } catch (err) {
    console.error("Failed to seed products:", err.message);
  }
}
const couponInsert = db.prepare(`INSERT OR IGNORE INTO coupons (code,kind,amount,minimum_subtotal,active) VALUES (?,?,?,?,1)`);
couponInsert.run("WELCOME10", "percent", 10, 0);
couponInsert.run("BRIGHT10", "percent", 10, 0);
couponInsert.run("RAY100", "fixed", 100, 1000);
couponInsert.run("WELCOME15", "percent", 15, 500);

function now() { return new Date().toISOString(); }
function id(prefix) { return `${prefix}_${crypto.randomBytes(8).toString("hex")}`; }
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://accounts.google.com; frame-src https://checkout.razorpay.com https://api.razorpay.com https://accounts.google.com; connect-src 'self' https://api.razorpay.com https://accounts.google.com https://api.postalpincode.in; form-action 'self'"
};
function htmlEscape(value = "") { return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character])); }

async function notifyCustomerOrderStatus(order, status, reason = "") {
  const apiKey = getSetting("resend_api_key", RESEND_API_KEY || "");
  const emailFrom = getSetting("email_from", EMAIL_FROM || "Raycrafting <orders@raycrafting.store>");
  const supportEmail = getSetting("support_email", SUPPORT_EMAIL || "raywithcharm@gmail.com");
  const supportPhone = getSetting("support_phone", SUPPORT_PHONE || "");

  let recipientEmail = String(order.customer_email || order.email || "").trim().toLowerCase();
  let recipientName = String(order.customer_name || order.name || "").trim();

  let orderData = order;
  if (!orderData.items || !orderData.total || !orderData.address_json) {
    try {
      const fullOrder = db.prepare("SELECT o.*, c.name customer_name, c.email customer_email, c.phone customer_phone FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=?").get(order.id);
      if (fullOrder) {
        const items = db.prepare("SELECT * FROM order_items WHERE order_id=?").all(order.id);
        orderData = { ...fullOrder, items };
        if (!recipientEmail || recipientEmail.endsWith("@accounts.raycrafting.local")) {
          recipientEmail = String(fullOrder.customer_email || "").trim().toLowerCase();
        }
        if (!recipientName) recipientName = String(fullOrder.customer_name || "").trim();
      }
    } catch (e) {
      console.error("Error loading order for email:", e.message);
    }
  }

  let address = orderData.address;
  if (!address && orderData.address_json) {
    try { address = JSON.parse(orderData.address_json); } catch {}
  }
  address = address || {};

  if ((!recipientEmail || recipientEmail.endsWith("@accounts.raycrafting.local")) && address.email && !address.email.endsWith("@accounts.raycrafting.local")) {
    recipientEmail = address.email.trim().toLowerCase();
  }
  if (!recipientName && address.name) recipientName = address.name;
  if (!recipientName) recipientName = "Friend";

  const isRealEmail = recipientEmail && !recipientEmail.endsWith("@accounts.raycrafting.local") && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail);

  const statusConfig = {
    paid: {
      headline: "🌸 Order Confirmed & Paid",
      badge: "Paid Online",
      badgeBg: "#dfeada",
      badgeColor: "#557351",
      intro: "Thank you for your order! Your payment was received and Himanshi is carefully handcrafting your pieces."
    },
    processing: {
      headline: "🌸 Order Confirmed & Crafting",
      badge: orderData.payment_method === "cod" ? "Pay on Delivery" : "Confirmed",
      badgeBg: "#dfeada",
      badgeColor: "#557351",
      intro: orderData.payment_method === "cod"
        ? "Thank you for your order! Your Pay on Delivery order is confirmed and Himanshi has begun handcrafting your pieces."
        : "The studio has accepted your order and Himanshi is handcrafting your pieces."
    },
    shipped: {
      headline: "📦 Your Order Has Shipped!",
      badge: "Dispatched",
      badgeBg: "#e3effa",
      badgeColor: "#1d6fb8",
      intro: "Exciting news! Your handcrafted order is on its way to your doorstep."
    },
    out_for_delivery: {
      headline: "🚚 Out for Delivery Today",
      badge: "Out for Delivery",
      badgeBg: "#e3effa",
      badgeColor: "#1d6fb8",
      intro: "Your package is with the delivery partner and should reach you today!"
    },
    delivered: {
      headline: "✨ Order Delivered",
      badge: "Delivered",
      badgeBg: "#dfeada",
      badgeColor: "#557351",
      intro: "Your order has been delivered! We hope your handmade pieces bring warm sunshine to your day."
    },
    cancel_requested: {
      headline: "Notice: Cancellation Requested",
      badge: "Cancellation Requested",
      badgeBg: "#fff1cf",
      badgeColor: "#98721a",
      intro: "We received your request to cancel this order. Himanshi is reviewing it."
    },
    cancelled: {
      headline: "Order Cancelled",
      badge: "Cancelled",
      badgeBg: "#fbe0da",
      badgeColor: "#a74232",
      intro: "Your order has been cancelled. If any online payment was captured, a full refund will be processed to your source account."
    },
    return_requested: {
      headline: "Return Request Received",
      badge: "Return Requested",
      badgeBg: "#fff1cf",
      badgeColor: "#98721a",
      intro: "We received your return request under our 3-day handcrafted studio policy. Himanshi will review the details within 24 hours."
    },
    returned: {
      headline: "Return Completed",
      badge: "Returned",
      badgeBg: "#dfeada",
      badgeColor: "#557351",
      intro: "Your return has been processed. Thank you for your patience."
    },
    declined: {
      headline: "Order Declined",
      badge: "Declined",
      badgeBg: "#fbe0da",
      badgeColor: "#a74232",
      intro: "The studio could not fulfill this order."
    },
    failed_payment: {
      headline: "Payment Incomplete",
      badge: "Payment Incomplete",
      badgeBg: "#fbe0da",
      badgeColor: "#a74232",
      intro: "Your online payment could not be completed. You can retry payment anytime from 'My orders' or select Pay on Delivery."
    }
  };

  const currentCfg = statusConfig[status] || {
    headline: "Order Update: " + status.replaceAll("_", " "),
    badge: status.replaceAll("_", " "),
    badgeBg: "#f1eee8",
    badgeColor: "#555",
    intro: "There is an update on your Raycrafting order."
  };

  const subject = `Raycrafting: ${currentCfg.headline} — #${orderData.id}`;
  const safeName = htmlEscape(recipientName);
  const items = Array.isArray(orderData.items) ? orderData.items : [];

  const itemRowsHtml = items.map((it) => {
    const unitPrice = Number(it.unit_price) || 0;
    const qty = Number(it.quantity) || 1;
    const lineTotal = Number(it.line_total) || (unitPrice * qty);
    return `
      <tr style="border-bottom:1px solid #eee8e0;">
        <td style="padding:10px 0;font-size:13px;color:#252629;">
          <strong>${htmlEscape(it.name || "Handcrafted Piece")}</strong>
          <div style="font-size:11px;color:#7e8087;">₹${unitPrice.toFixed(0)} × ${qty}</div>
        </td>
        <td style="padding:10px 0;text-align:right;font-size:13px;font-weight:600;color:#252629;">
          ₹${lineTotal.toFixed(0)}
        </td>
      </tr>
    `;
  }).join("");

  const subtotal = Number(orderData.subtotal) || items.reduce((s, i) => s + (Number(i.line_total) || 0), 0);
  const discount = Number(orderData.discount) || 0;
  const shipping = Number(orderData.shipping) || 0;
  const total = Number(orderData.total) || (subtotal - discount + shipping);

  const addressText = orderData.fulfillment_method === "self_pickup" || address.fulfillmentMethod === "self_pickup"
    ? "Studio Self-Pickup"
    : [address.line1, address.line2, address.city, address.state && address.postalCode ? `${address.state} - ${address.postalCode}` : (address.state || address.postalCode)].filter(Boolean).map(htmlEscape).join(", ");

  const cleanSupportPhone = String(supportPhone || "").replace(/\D/g, "");
  const whatsappUrl = cleanSupportPhone
    ? `https://wa.me/${cleanSupportPhone.startsWith("91") ? cleanSupportPhone : "91" + cleanSupportPhone}?text=${encodeURIComponent(`Hi Himanshi, I have a question regarding order #${orderData.id}`)}`
    : "";

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin:0;padding:24px 12px;background:#f7f4ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#252629;line-height:1.5;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #ebd9cc;border-radius:6px;overflow:hidden;box-shadow:0 8px 30px rgba(75,55,64,0.06);">
        <div style="background:#4b3740;padding:22px 24px;text-align:center;">
          <h1 style="margin:0;font-size:24px;color:#fff;letter-spacing:-0.02em;font-family:Georgia,serif;">Raycrafting</h1>
          <p style="margin:4px 0 0;font-size:11px;color:#e8d4cf;text-transform:uppercase;letter-spacing:0.08em;">Flowers That Keep Their Sunshine</p>
        </div>
        <div style="padding:28px 24px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
            <span style="font-size:12px;color:#7e8087;font-family:monospace;">ORDER #${htmlEscape(orderData.id)}</span>
            <span style="background:${currentCfg.badgeBg};color:${currentCfg.badgeColor};padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">${htmlEscape(currentCfg.badge)}</span>
          </div>
          <h2 style="margin:0 0 10px;font-size:20px;color:#252629;font-family:Georgia,serif;">${currentCfg.headline}</h2>
          <p style="margin:0 0 16px;font-size:13px;color:#494b50;">Hi ${safeName},</p>
          <p style="margin:0 0 18px;font-size:13px;color:#494b50;line-height:1.6;">${currentCfg.intro}</p>
          ${reason ? `<div style="background:#fff6ee;border-left:3px solid #e76e59;padding:10px 14px;margin-bottom:20px;border-radius:3px;font-size:12px;color:#6b443c;"><strong>Note:</strong> ${htmlEscape(reason)}</div>` : ""}

          <div style="border-top:1.5px solid #eee8e0;border-bottom:1.5px solid #eee8e0;padding:14px 0;margin:20px 0;">
            <h3 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#7e8087;">Order Summary</h3>
            <table style="width:100%;border-collapse:collapse;">
              ${itemRowsHtml || `<tr><td style="padding:6px 0;font-size:12px;color:#7e8087;">Handcrafted piece</td><td style="text-align:right;font-weight:600;">₹${total.toFixed(0)}</td></tr>`}
            </table>
            <div style="margin-top:14px;padding-top:12px;border-top:1px dashed #eee8e0;font-size:12px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;color:#666;">
                <span>Subtotal</span>
                <span>₹${subtotal.toFixed(0)}</span>
              </div>
              ${discount > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px;color:#557351;font-weight:600;"><span>Discount (${htmlEscape(orderData.coupon_code || "Coupon")})</span><span>-₹${discount.toFixed(0)}</span></div>` : ""}
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;color:#666;">
                <span>Delivery</span>
                <span>${shipping === 0 ? "FREE" : `₹${shipping.toFixed(0)}`}</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid #eee8e0;font-size:15px;font-weight:700;color:#252629;">
                <span>Total</span>
                <span>₹${total.toFixed(0)}</span>
              </div>
            </div>
          </div>

          <div style="background:#fbfbf9;border:1px solid #eee8e0;border-radius:4px;padding:14px 16px;margin-bottom:22px;font-size:12px;">
            <div style="color:#7e8087;text-transform:uppercase;font-size:10px;font-weight:700;letter-spacing:0.05em;margin-bottom:6px;">Delivery Details</div>
            <div style="font-weight:600;color:#252629;margin-bottom:2px;">${safeName} ${address.phone ? `· ${htmlEscape(address.phone)}` : ""}</div>
            <div style="color:#5f6368;line-height:1.45;">${addressText || "Delivery address registered"}</div>
            <div style="margin-top:6px;color:#7e8087;font-size:11px;">Payment: <strong>${orderData.payment_method === "cod" ? "Pay on Delivery (Doorstep Cash / UPI)" : "Paid Online via Razorpay"}</strong></div>
          </div>

          ${whatsappUrl ? `<div style="text-align:center;margin:22px 0 12px;"><a href="${whatsappUrl}" target="_blank" style="display:inline-block;background:#25d366;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:4px;font-size:12px;font-weight:600;">💬 Chat with Himanshi on WhatsApp</a></div>` : ""}
          <div style="text-align:center;font-size:11px;color:#9aa0a6;margin-top:18px;">
            Questions or custom inquiries? Reply to this email or contact <a href="mailto:${htmlEscape(supportEmail)}" style="color:#e76e59;text-decoration:none;">${htmlEscape(supportEmail)}</a>.
          </div>
        </div>
        <div style="background:#faf8f5;border-top:1px solid #eee8e0;padding:14px;text-align:center;font-size:11px;color:#9aa0a6;">
          Handcrafted in small batches with love · Raycrafting Studio
        </div>
      </div>
    </body>
    </html>
  `;

  if (isRealEmail && apiKey) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          from: emailFrom,
          reply_to: supportEmail,
          to: [recipientEmail],
          subject,
          html
        })
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Resend Error] Customer status email failed (${response.status}):`, errText);
      } else {
        console.log(`[Order Email] Dispatched live email to ${recipientEmail} for Order #${orderData.id} (${status})`);
      }
    } catch (error) {
      console.error("[Resend Error] Network failure sending email:", error.message);
    }
  } else {
    console.log(`[Order Email] ${apiKey ? "Skipped (no real customer email)" : "Simulated (No RESEND_API_KEY in .env/Settings)"} -> To: ${recipientEmail || "none"}, Order: #${orderData.id}, Status: ${status}, Items: ${items.length}, Total: ₹${total}`);
  }

  // Also notify studio owner on order placement, cancellation, or return
  if (apiKey && supportEmail && ["processing", "paid", "cancel_requested", "cancelled", "return_requested"].includes(status)) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          from: emailFrom,
          reply_to: isRealEmail ? recipientEmail : supportEmail,
          to: [supportEmail],
          subject: `[Studio Alert] Order #${orderData.id}: ${currentCfg.headline}`,
          html: `<div style="font-family:sans-serif;padding:16px;"><h3>Studio Alert: ${currentCfg.headline}</h3><p><strong>Order:</strong> #${orderData.id}</p><p><strong>Customer:</strong> ${safeName} (${recipientEmail || "no email"}, ${address.phone || "no phone"})</p><p><strong>Status:</strong> ${status}</p><p><strong>Total:</strong> ₹${total}</p><p><strong>Items:</strong> ${items.map(i => `${i.name} (x${i.quantity})`).join(", ")}</p>${reason ? `<p><strong>Reason:</strong> ${htmlEscape(reason)}</p>` : ""}<hr><p>Log into your studio admin to manage this order.</p></div>`
        })
      });
    } catch (e) {
      console.error("[Resend Error] Studio owner alert failed:", e.message);
    }
  }
}
function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; if (raw.length > 50 * 1024 * 1024) reject(new Error("Request too large")); });
    req.on("end", () => { try { req.rawBody = raw; const parsed = raw ? JSON.parse(raw) : {}; resolve(parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}); } catch { reject(new Error("Invalid JSON")); } });
    req.on("error", reject);
  });
}
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString("hex") };
}
function saveBase64Image(dataUrl, prefix = "piece") {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return dataUrl;
  try {
    const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (!match) return dataUrl;
    const rawExt = match[1].toLowerCase();
    const ext = rawExt === "jpeg" || rawExt === "jpg" ? "jpg" : (rawExt === "png" ? "png" : "webp");
    const buffer = Buffer.from(match[2], "base64");
    const hash = crypto.createHash("md5").update(buffer).digest("hex").slice(0, 12);
    const cleanPrefix = String(prefix).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30) || "piece";
    const fileName = `${cleanPrefix}-${hash}.${ext}`;
    const uploadsDir = path.join(ROOT, "assets", "uploads");
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, buffer);
    return `assets/uploads/${fileName}`;
  } catch (err) {
    console.error("Error saving base64 image to disk:", err);
    return dataUrl;
  }
}
function phoneCustomerEmail(phone) { return "phone_" + phone + "@accounts.raycrafting.local"; }
function maskedPhone(phone) { return "+91 " + phone.slice(0, 2) + "******" + phone.slice(-2); }
async function twilioVerifyRequest(pathname, params) {
  const auth = Buffer.from(TWILIO_ACCOUNT_SID + ":" + TWILIO_AUTH_TOKEN).toString("base64");
  return fetch("https://verify.twilio.com/v2/Services/" + encodeURIComponent(TWILIO_VERIFY_SERVICE_SID) + "/" + pathname, { method: "POST", headers: { Authorization: "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams(params) });
}
function validPassword(password, salt, expected) {
  const actual = crypto.scryptSync(password, salt, 64);
  const wanted = Buffer.from(expected, "hex");
  return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted);
}
function issueSession(customerId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString();
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
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 30; // 30 days
  try {
    db.prepare("INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?) ON CONFLICT(token) DO UPDATE SET expires_at=excluded.expires_at").run(token, expiresAt);
  } catch {}
  ADMIN_SESSIONS.set(token, expiresAt);
  return token;
}
function adminTokenFromRequest(req) {
  const token = String(req.headers["x-admin-token"] || "").trim();
  if (!token) return "";
  let expiresAt = ADMIN_SESSIONS.get(token);
  if (!expiresAt) {
    try {
      const row = db.prepare("SELECT expires_at FROM admin_sessions WHERE token=?").get(token);
      if (row) expiresAt = row.expires_at;
    } catch {}
  }
  if (!expiresAt) return "";
  if (Date.now() > expiresAt) {
    try { db.prepare("DELETE FROM admin_sessions WHERE token=?").run(token); } catch {}
    ADMIN_SESSIONS.delete(token);
    return "";
  }
  ADMIN_SESSIONS.set(token, expiresAt);
  return token;
}
function customerFromRequest(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || token.length > 128) return null;
  const row = db.prepare(`SELECT c.id,c.name,c.email,c.phone,c.avatar_url AS avatarUrl FROM sessions s JOIN customers c ON c.id=s.customer_id WHERE s.token=? AND s.expires_at>?`).get(token, now());
  if (row) {
    const extended = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString();
    try { db.prepare("UPDATE sessions SET expires_at=? WHERE token=?").run(extended, token); } catch {}
  }
  return row ? { ...row, token } : null;
}
function normalizeIndianPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}
function validIndianPhone(value) { return /^[6-9]\d{9}$/.test(normalizeIndianPhone(value)); }
function validIndianPincode(value) { return /^[1-8]\d{5}$/.test(String(value || "").trim()); }
function cleanAddress(input, fulfillmentMethod = "shiprocket") {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Enter a valid delivery address.");
  const field = (name, max, required = true) => {
    const value = String(input[name] || "").trim();
    if (required && !value) throw new Error("Complete the delivery address before continuing.");
    if (value.length > max) throw new Error("One of the address fields is too long.");
    if (/[\u0000-\u001f\u007f]/.test(value)) throw new Error("The delivery address contains invalid characters.");
    return value;
  };
  const name = field("name", 120);
  const phone = normalizeIndianPhone(input.phone);
  const rawEmail = String(input.email || "").trim().toLowerCase().slice(0, 254);
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : "";
  if (name.length < 2) throw new Error("Enter your full name.");
  if (!validIndianPhone(input.phone)) throw new Error("Enter a valid 10-digit Indian mobile number starting with 6–9.");
  if (fulfillmentMethod === "self_pickup") return { name, phone, email, line1: "", line2: "", city: "", state: "", postalCode: "" };
  const line1 = field("line1", 200);
  const line2 = field("line2", 200, false);
  const city = field("city", 80);
  const state = field("state", 80);
  const postalCode = String(input.postalCode || "").trim();
  if (name.length < 2 || line1.length < 5 || city.length < 2 || state.length < 2) throw new Error("Enter a complete delivery address.");
  if (!validIndianPhone(input.phone)) throw new Error("Enter a valid 10-digit Indian mobile number starting with 6–9.");
  if (!validIndianPincode(postalCode)) throw new Error("Enter a valid 6-digit Indian PIN code starting with 1–8.");
  return { name, phone, email, line1, line2, city, state, postalCode };
}
function shiprocketConfigError() {
  const error = new Error("Shiprocket delivery is not configured yet. Add Shiprocket API credentials and the seller pickup PIN.");
  error.status = 503;
  return error;
}
async function shiprocketLogin() {
  if (!SHIPROCKET_API_EMAIL || !SHIPROCKET_API_PASSWORD) throw shiprocketConfigError();
  const response = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ email: SHIPROCKET_API_EMAIL, password: SHIPROCKET_API_PASSWORD }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.token) {
    const message = response.status === 403 ? "Shiprocket rejected API access from this server (HTTP 403). Check API-user modules/access restrictions or contact Shiprocket integration support." : "Shiprocket authentication failed. Check the API-user email and password in Railway.";
    const error = new Error(message);
    error.status = response.status === 401 || response.status === 422 ? 503 : 502;
    throw error;
  }
  shiprocketToken = String(data.token);
  return shiprocketToken;
}
async function shiprocketAccessToken(forceLogin = false) {
  if (!forceLogin && shiprocketToken) return shiprocketToken;
  return shiprocketLogin();
}
function shiprocketPackage(body = {}) {
  const source = body.package && typeof body.package === "object" ? body.package : {};
  const value = (name, fallback) => {
    const candidate = Number(source[name]);
    return Number.isFinite(candidate) && candidate > 0 ? candidate : fallback;
  };
  return {
    weight: value("weight", SHIPROCKET_DEFAULT_PACKAGE.weight),
    length: value("length", SHIPROCKET_DEFAULT_PACKAGE.length),
    breadth: value("breadth", SHIPROCKET_DEFAULT_PACKAGE.breadth),
    height: value("height", SHIPROCKET_DEFAULT_PACKAGE.height)
  };
}
async function shiprocketServiceability({ deliveryPostcode, cod = false, declaredValue = 0, packageDetails = SHIPROCKET_DEFAULT_PACKAGE }) {
  if ((!shiprocketToken && (!SHIPROCKET_API_EMAIL || !SHIPROCKET_API_PASSWORD)) || !SHIPROCKET_PICKUP_POSTCODE) throw shiprocketConfigError();
  const params = new URLSearchParams({ pickup_postcode: SHIPROCKET_PICKUP_POSTCODE, delivery_postcode: String(deliveryPostcode), cod: cod ? "1" : "0", weight: String(packageDetails.weight), length: String(packageDetails.length), breadth: String(packageDetails.breadth), height: String(packageDetails.height), declared_value: String(Math.max(0, Number(declaredValue) || 0)) });
  async function request(token) {
    return fetch("https://apiv2.shiprocket.in/v1/external/courier/serviceability/?" + params.toString(), { headers: { Accept: "application/json", Authorization: "Bearer " + token } });
  }
  let response = await request(await shiprocketAccessToken());
  if ((response.status === 401 || response.status === 403) && SHIPROCKET_API_EMAIL && SHIPROCKET_API_PASSWORD) {
    response = await request(await shiprocketAccessToken(true));
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(response.status === 401 || response.status === 403 ? "Shiprocket authentication failed. The API user credentials need attention." : (data.message || data.error || "Shiprocket could not check this PIN code."));
    error.status = response.status === 401 || response.status === 403 ? 503 : response.status >= 400 && response.status < 500 ? 400 : 502;
    throw error;
  }
  const couriers = Array.isArray(data.data?.available_courier_companies) ? data.data.available_courier_companies : [];
  return { serviceable: couriers.length > 0, source: "shiprocket", pickupPostcode: SHIPROCKET_PICKUP_POSTCODE, deliveryPostcode: String(deliveryPostcode), couriers: couriers.slice(0, 8).map((courier) => ({ id: courier.id || null, name: courier.courier_name || courier.name || "Courier", rate: Number(courier.freight_charge || courier.rate || 0), etd: courier.etd || courier.etd_hours || null, cod: Boolean(courier.cod) })) };
}
async function reverseGeocode(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    const error = new Error("The location coordinates are invalid."); error.status = 400; throw error;
  }
  const params = new URLSearchParams({ format: "jsonv2", lat: String(latitude), lon: String(longitude), zoom: "18", addressdetails: "1" });
  const response = await fetch("https://nominatim.openstreetmap.org/reverse?" + params.toString(), { headers: { Accept: "application/json", "Accept-Language": "en-IN", "User-Agent": "Raycrafting/1.0 (raywithcharm@gmail.com)" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.address) { const error = new Error("Could not turn your location into an address. Enter it manually."); error.status = 502; throw error; }
  const address = data.address;
  const road = [address.house_number, address.road].filter(Boolean).join(" ").trim();
  const area = address.neighbourhood || address.suburb || address.village || "";
  return { line1: road || area, line2: road && area ? area : "", city: address.city || address.town || address.municipality || address.village || "", state: address.state || "", postalCode: String(address.postcode || "").trim(), displayName: String(data.display_name || "") };
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
function orderRows(filter = "confirmed") {
  let where = "WHERE (o.status NOT IN ('pending_payment', 'failed_payment') OR o.payment_method = 'cod')";
  if (filter === "unpaid") where = "WHERE o.status IN ('pending_payment', 'failed_payment') AND (o.payment_method IS NULL OR o.payment_method != 'cod')";
  else if (filter === "all") where = "";
  const orders = db.prepare(`SELECT o.*, c.name customer_name, c.email customer_email, c.phone customer_phone FROM orders o JOIN customers c ON c.id=o.customer_id ${where} ORDER BY o.created_at DESC`).all();
  const items = db.prepare("SELECT * FROM order_items WHERE order_id=?");
  const latestPayment = db.prepare("SELECT * FROM payments WHERE order_id=? ORDER BY created_at DESC, id DESC LIMIT 1");
  return orders.map((order) => ({ ...order, address: JSON.parse(order.address_json), items: items.all(order.id), latest_payment: latestPayment.get(order.id) || null }));
}
function customerOrderRows(customerId) {
  return orderRows("all").filter((order) => order.customer_id === customerId).map((order) => {
    const { customer_name, customer_email, customer_phone, ...safeOrder } = order;
    return safeOrder;
  });
}
function customOrderRows() {
  return db.prepare("SELECT * FROM custom_orders ORDER BY created_at DESC").all();
}
function noteRequestRows() {
  return db.prepare("SELECT * FROM note_requests ORDER BY created_at DESC").all();
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
  let requested = pathname === "/" ? "/index.html" : pathname;
  let file = path.normalize(path.join(ROOT, requested));

  // Clean URL support (e.g. /privacy -> /privacy.html)
  if (!fs.existsSync(file) && fs.existsSync(file + ".html")) {
    file = file + ".html";
  }

  const relative = path.relative(ROOT, file);
  if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const errorPage = path.join(ROOT, "404.html");
    const acceptsHtml = !req.headers.accept || req.headers.accept.includes("text/html") || req.headers.accept.includes("*/*");
    if (fs.existsSync(errorPage) && acceptsHtml) {
      res.writeHead(404, { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" });
      return fs.createReadStream(errorPage).pipe(res);
    }
    return json(res, 404, { error: "Not found" });
  }

  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".json": "application/json",
    ".xml": "application/xml; charset=utf-8",
    ".txt": "text/plain; charset=utf-8"
  };
  const isAsset = requested.startsWith("/assets/") || [".webp", ".png", ".jpg", ".jpeg", ".svg", ".ico", ".woff2"].includes(path.extname(file));
  const cacheControl = isAsset ? "public, max-age=31536000, immutable" : "public, max-age=300";
  res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": cacheControl });
  fs.createReadStream(file).pipe(res);
}

async function api(req, res, pathname, body, url) {
  try {
    const requestUrl = url || new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && pathname === "/api/health") return json(res, 200, { ok: true, service: "raycrafting", time: now() });
    if (req.method === "POST" && pathname === "/api/newsletter") {
      if (!allowRequest(req, "newsletter", 10)) return json(res, 429, { error: "Too many requests. Try again later." });
      const contact = String(body.email || body.contact || "").trim();
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
      const isPhone = validIndianPhone(contact);
      if (!isEmail && !isPhone) return json(res, 400, { error: "Enter a valid email address or 10-digit mobile number." });
      try { db.prepare("INSERT OR IGNORE INTO newsletter_subscribers (email,created_at) VALUES (?,?)").run(contact.toLowerCase(), now()); } catch {}
      return json(res, 200, {
        ok: true,
        couponCode: "WELCOME10",
        discountPercent: 10,
        message: "🎉 Welcome! Use code WELCOME10 at checkout for 10% off your handcrafted blooms."
      });
    }
    if (req.method === "POST" && pathname === "/api/custom-orders") {
      if (!allowRequest(req, "custom-order", 6, 15 * 60 * 1000)) return json(res, 429, { error: "Too many requests. Please try again later." });
      const name = String(body.name || "").trim().slice(0, 120);
      const email = String(body.email || "").trim().toLowerCase().slice(0, 254);
      const suppliedPhone = String(body.phone || "").trim();
      const phone = suppliedPhone ? normalizeIndianPhone(suppliedPhone) : "";
      const city = String(body.city || "").trim().slice(0, 100);
      const state = String(body.state || "").trim().slice(0, 100);
      const description = String(body.description || "").trim().slice(0, 3000);
      const referenceImage = String(body.referenceImage || "");
      const askPrice = Boolean(body.askPrice);
      const budgetHint = String(body.budgetHint || "").trim().slice(0, 50);
      if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (phone && !validIndianPhone(phone))) return json(res, 400, { error: "Enter your name, a valid email, and a valid Indian phone number if provided." });
      if (!description && !referenceImage) return json(res, 400, { error: "Please add a short description or a reference image." });
      if (referenceImage && (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(referenceImage) || referenceImage.length > 900000)) return json(res, 400, { error: "That image is too large. Please choose a smaller JPG, PNG, or WebP image." });
      const customer = customerFromRequest(req);
      const orderId = id("custom");
      db.prepare("INSERT INTO custom_orders (id,customer_id,name,email,phone,city,state,description,reference_image,status,buyer_price_request,budget_hint,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(orderId, customer ? customer.id : null, name, email, phone, city, state, description || "Reference image supplied.", referenceImage || null, "new", askPrice ? 1 : 0, budgetHint || null, now(), now());
      return json(res, 201, { ok: true, customOrderId: orderId, message: askPrice ? "Your price quote request is with the studio! Himanshi will review and send you a custom price quote shortly." : "Your custom idea is with the studio. We’ll review it and contact you within 1 hour." });
    }
    if (req.method === "POST" && pathname === "/api/note-requests") {
      if (!allowRequest(req, "note-request", 8, 15 * 60 * 1000)) return json(res, 429, { error: "Too many requests. Please try again later." });
      const name = String(body.name || "").trim().slice(0, 120);
      const email = String(body.email || "").trim().toLowerCase().slice(0, 254);
      const message = String(body.message || "").trim().slice(0, 2500);
      const language = String(body.language || "").trim().slice(0, 80);
      const city = String(body.city || "").trim().slice(0, 100);
      const state = String(body.state || "").trim().slice(0, 100);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 2 || !language || !city || !state) return json(res, 400, { error: "Please add your email, note, preferred language, city, and state." });
      const noteId = id("note");
      db.prepare("INSERT INTO note_requests (id,name,email,message,language,city,state,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(noteId, name, email, message, language, city, state, "new", now(), now());
      return json(res, 201, { ok: true, noteId, message: "Your note has been sent to the studio. Thank you for sharing something heartfelt." });
    }
    if (req.method === "GET" && pathname === "/api/config") {
      const supportPhone = getSetting("support_phone", SUPPORT_PHONE || "");
      const supportEmail = getSetting("support_email", SUPPORT_EMAIL || "raywithcharm@gmail.com");
      const cleanInsta = parseInstagramUsername(getSetting("instagram_handle", process.env.INSTAGRAM_HANDLE || ""));
      const instagramUrl = cleanInsta ? `https://ig.me/m/${cleanInsta}` : "";
      const bannerQuote = getSetting("banner_quote", "“Where flowers bloom, so does hope.” — Handcrafted with love");
      return json(res, 200, {
        currency: "INR",
        razorpayEnabled: Boolean(RAZORPAY_KEY_ID),
        phoneOtpEnabled: PHONE_OTP_ENABLED,
        razorpayKeyId: RAZORPAY_KEY_ID || null,
        supportEmail,
        supportPhone,
        instagramHandle: cleanInsta ? `@${cleanInsta}` : "",
        instagramUrl,
        bannerQuote,
        googleEnabled: Boolean(GOOGLE_CLIENT_ID),
        googleClientId: GOOGLE_CLIENT_ID || null,
        selfPickupEnabled: true,
        codEnabled: true
      });
    }
    if (req.method === "GET" && pathname === "/api/products") {
      const products = db.prepare("SELECT id,name,category,price,original_price,detail,description,featured,art,image,images_json,badge,dimensions,materials,care FROM products WHERE active=1 ORDER BY featured ASC, name ASC").all();
      return json(res, 200, {
        products: products.map((product) => {
          let images = [];
          try { images = product.images_json ? JSON.parse(product.images_json) : []; } catch {}
          if (!images.length && product.image) images = [product.image];
          return { ...product, images, originalPrice: product.original_price || 0 };
        })
      });
    }
    if (req.method === "GET" && pathname === "/api/admin/products") {
      if (!requireAdmin(req)) return json(res, 401, { error: "Seller access required." });
      const products = db.prepare("SELECT id,name,category,price,original_price,detail,description,featured,art,image,images_json,badge,dimensions,materials,care,active FROM products ORDER BY featured ASC, name ASC").all();
      return json(res, 200, {
        products: products.map((product) => {
          let images = [];
          try { images = product.images_json ? JSON.parse(product.images_json) : []; } catch {}
          if (!images.length && product.image) images = [product.image];
          return { ...product, images, originalPrice: product.original_price || 0, active: product.active !== 0 };
        })
      });
    }
    if (req.method === "POST" && pathname === "/api/admin/auth") {
      if (!allowRequest(req, "admin-auth", 8)) return json(res, 429, { error: "Too many attempts. Try again later." });
      if (!ADMIN_PIN) return json(res, 503, { error: "Seller access is not configured." });
      if (!safeEqual(String(body.pin || ""), ADMIN_PIN)) return json(res, 401, { error: "That PIN is not correct." });
      return json(res, 200, { token: issueAdminSession(), expiresIn: 8 * 60 * 60 });
    }
    if (req.method === "POST" && pathname === "/api/admin/logout") {
      const token = adminTokenFromRequest(req);
      if (token) {
        ADMIN_SESSIONS.delete(token);
        try { db.prepare("DELETE FROM admin_sessions WHERE token=?").run(token); } catch {}
      }
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && pathname === "/api/auth/register") {
      if (!allowRequest(req, "register", 10)) return json(res, 429, { error: "Too many registration attempts. Try again later." });
      const name = String(body.name || "").trim(); const email = String(body.email || "").trim().toLowerCase(); const password = String(body.password || ""); const suppliedPhone = String(body.phone || "").trim();
      if (!name || name.length < 2 || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 8 || password.length > 256 || (suppliedPhone && !validIndianPhone(suppliedPhone))) return json(res, 400, { error: "Enter a valid name, email, password, and 10-digit Indian phone number." });
      const phone = suppliedPhone ? normalizeIndianPhone(suppliedPhone) : "";
      if (db.prepare("SELECT id FROM customers WHERE email=?").get(email)) return json(res, 409, { error: "An account with that email already exists." });
      const customerId = id("cus"); const secret = hashPassword(password); db.prepare("INSERT INTO customers (id,name,email,phone,password_hash,password_salt,created_at) VALUES (?,?,?,?,?,?,?)").run(customerId, name, email, phone, secret.hash, secret.salt, now());
      return json(res, 201, { token: issueSession(customerId), customer: { id: customerId, name, email, phone, avatarUrl: "" } });
    }
    if (req.method === "POST" && pathname === "/api/auth/login") {
      if (!allowRequest(req, "login", 12)) return json(res, 429, { error: "Too many login attempts. Try again later." });
      const email = String(body.email || "").trim().toLowerCase(); const row = db.prepare("SELECT * FROM customers WHERE email=?").get(email);
      if (!row || !validPassword(String(body.password || ""), row.password_salt, row.password_hash)) return json(res, 401, { error: "Email or password is incorrect." });
      return json(res, 200, { token: issueSession(row.id), customer: { id: row.id, name: row.name, email: row.email, phone: row.phone, avatarUrl: row.avatar_url || "" } });
    }
    if (req.method === "POST" && pathname === "/api/auth/phone/request") {
      if (!PHONE_OTP_ENABLED) return json(res, 503, { error: "Phone OTP sign-in is not configured yet. Please use Google or email sign-in." });
      if (!allowRequest(req, "phone-otp-request", 5, 15 * 60 * 1000)) return json(res, 429, { error: "Too many OTP requests. Try again later." });
      const phone = normalizeIndianPhone(body.phone);
      if (!validIndianPhone(phone)) return json(res, 400, { error: "Enter a valid 10-digit Indian mobile number starting with 6–9." });
      let response;
      try { response = await twilioVerifyRequest("Verifications", { To: "+91" + phone, Channel: "sms" }); } catch { return json(res, 502, { error: "The OTP service is temporarily unavailable. Try again later." }); }
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.status !== "pending") return json(res, response.status === 429 ? 429 : 502, { error: "We could not send the OTP. Check the number and try again." });
      return json(res, 200, { ok: true, phone: maskedPhone(phone), message: "OTP sent to " + maskedPhone(phone) + "." });
    }
    if (req.method === "POST" && pathname === "/api/auth/phone/verify") {
      if (!PHONE_OTP_ENABLED) return json(res, 503, { error: "Phone OTP sign-in is not configured yet. Please use Google or email sign-in." });
      if (!allowRequest(req, "phone-otp-verify", 10, 15 * 60 * 1000)) return json(res, 429, { error: "Too many OTP attempts. Try again later." });
      const phone = normalizeIndianPhone(body.phone);
      const code = String(body.code || "").replace(/\D/g, "");
      const suppliedName = String(body.name || "").trim();
      if (!validIndianPhone(phone) || !/^\d{6}$/.test(code)) return json(res, 400, { error: "Enter the 6-digit OTP and a valid mobile number." });
      let response;
      try { response = await twilioVerifyRequest("VerificationCheck", { To: "+91" + phone, Code: code }); } catch { return json(res, 502, { error: "The OTP service is temporarily unavailable. Try again later." }); }
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.status !== "approved") return json(res, 401, { error: "That OTP is incorrect or expired. Request a new one." });
      let row = db.prepare("SELECT * FROM customers WHERE phone=? ORDER BY created_at ASC LIMIT 1").get(phone);
      if (!row) {
        const customerId = id("cus"); const name = suppliedName.length >= 2 && suppliedName.length <= 120 ? suppliedName : "Raycrafting customer"; const secret = hashPassword(crypto.randomBytes(32).toString("hex"));
        db.prepare("INSERT INTO customers (id,name,email,phone,password_hash,password_salt,created_at) VALUES (?,?,?,?,?,?,?)").run(customerId, name, phoneCustomerEmail(phone), phone, secret.hash, secret.salt, now());
        row = db.prepare("SELECT * FROM customers WHERE id=?").get(customerId);
      } else if (suppliedName.length >= 2 && row.name === "Raycrafting customer") {
        db.prepare("UPDATE customers SET name=? WHERE id=?").run(suppliedName.slice(0, 120), row.id); row.name = suppliedName.slice(0, 120);
      }
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
      const orders = customerOrderRows(customer.id);
      const customOrders = db.prepare("SELECT * FROM custom_orders WHERE customer_id=? OR (phone IS NOT NULL AND phone != '' AND phone=?) OR (email IS NOT NULL AND email != '' AND email=?) ORDER BY created_at DESC").all(customer.id, customer.phone || "", customer.email || "");
      return json(res, 200, { orders, customOrders });
    }
    if (req.method === "POST" && pathname === "/api/custom-orders/action") {
      const orderId = String(body.orderId || "");
      const action = String(body.action || "");
      const reason = String(body.reason || "").trim().slice(0, 500);
      const order = db.prepare("SELECT * FROM custom_orders WHERE id=?").get(orderId);
      if (!order) return json(res, 404, { error: "Custom request not found." });
      if (action === "accept") {
        db.prepare("UPDATE custom_orders SET status='accepted',updated_at=? WHERE id=?").run(now(), orderId);
        return json(res, 200, { ok: true, orderId, status: "accepted", message: "Price quote accepted! Himanshi will begin handcrafting your piece." });
      } else if (action === "decline" || action === "reject") {
        const note = reason ? `Buyer declined quote: ${reason}` : "Buyer declined quote.";
        db.prepare("UPDATE custom_orders SET status='declined',seller_note=COALESCE(seller_note || ' · ', '') || ?,updated_at=? WHERE id=?").run(note, now(), orderId);
        return json(res, 200, { ok: true, orderId, status: "declined", message: "Quote declined." });
      } else {
        return json(res, 400, { error: "Action must be accept or decline." });
      }
    }
    if (req.method === "POST" && pathname === "/api/coupons/validate") {
      const subtotal = Number(body.subtotal || 0); const result = calculateCoupon(body.code, subtotal); return json(res, 200, result);
    }
    if (req.method === "POST" && pathname === "/api/location/reverse-geocode") {
      const customer = customerFromRequest(req); if (!customer) return json(res, 401, { error: "Sign in before using your location." });
      if (!allowRequest(req, "reverse-geocode", 12, 60 * 60 * 1000)) return json(res, 429, { error: "Too many location requests. Enter the address manually." });
      const latitude = Number(body.latitude); const longitude = Number(body.longitude);
      const address = await reverseGeocode(latitude, longitude);
      return json(res, 200, { address, location: { latitude, longitude } });
    }
    if (req.method === "POST" && pathname === "/api/shipping/serviceability") {
      const customer = customerFromRequest(req); if (!customer) return json(res, 401, { error: "Sign in before checking delivery." });
      const fulfillmentMethod = String(body.fulfillmentMethod || "shiprocket");
      if (fulfillmentMethod === "self_pickup") return json(res, 200, { serviceable: true, source: "self_pickup", fulfillmentMethod });
      if (fulfillmentMethod !== "shiprocket") return json(res, 400, { error: "Customer delivery must be checked by Shiprocket." });
      const postalCode = String(body.postalCode || "").trim();
      if (!validIndianPincode(postalCode)) return json(res, 400, { error: "Enter a valid 6-digit Indian PIN code starting with 1–8." });
      const result = await shiprocketServiceability({ deliveryPostcode: postalCode, cod: Boolean(body.cod), declaredValue: Number(body.declaredValue || 0), packageDetails: shiprocketPackage(body) });
      return json(res, 200, { ...result, fulfillmentMethod });
    }
    if (req.method === "POST" && pathname === "/api/orders") {
      let customer = customerFromRequest(req);
      const suppliedEmail = String(body.email || body.address?.email || "").trim().toLowerCase();
      const isRealEmail = suppliedEmail && !suppliedEmail.endsWith("@accounts.raycrafting.local") && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(suppliedEmail);

      if (!customer) {
        const phone = normalizeIndianPhone(body.phone || body.address?.phone);
        const name = String(body.name || body.address?.name || "Raycrafting Customer").trim();
        const email = isRealEmail ? suppliedEmail : (phone ? phoneCustomerEmail(phone) : "");
        if (phone && validIndianPhone(phone)) {
          let row = db.prepare("SELECT id, name, email, phone FROM customers WHERE phone=? ORDER BY created_at ASC LIMIT 1").get(phone);
          if (!row) {
            const customerId = id("cus");
            const secret = hashPassword(crypto.randomBytes(32).toString("hex"));
            db.prepare("INSERT INTO customers (id,name,email,phone,password_hash,password_salt,created_at) VALUES (?,?,?,?,?,?,?)").run(customerId, name, email, phone, secret.hash, secret.salt, now());
            row = { id: customerId, name, email, phone };
          } else if (isRealEmail && row.email.endsWith("@accounts.raycrafting.local")) {
            try {
              db.prepare("UPDATE customers SET email=? WHERE id=?").run(suppliedEmail, row.id);
              row.email = suppliedEmail;
            } catch {}
          }
          const token = issueSession(row.id);
          customer = { ...row, token };
        }
      } else if (customer && isRealEmail && customer.email.endsWith("@accounts.raycrafting.local")) {
        try {
          db.prepare("UPDATE customers SET email=? WHERE id=?").run(suppliedEmail, customer.id);
          customer.email = suppliedEmail;
        } catch {}
      }

      if (!customer) return json(res, 401, { error: "Please enter your mobile number and address." });
      const items = Array.isArray(body.items) ? body.items : [];
      const requestedFulfillment = String(body.fulfillmentMethod || "manual");
      const fulfillmentMethod = requestedFulfillment === "self_pickup" ? "self_pickup" : "manual";
      const paymentMethod = body.paymentMethod === "cod" ? "cod" : "razorpay";
      let address;
      try { address = cleanAddress(body.address, fulfillmentMethod); } catch (error) { return json(res, 400, { error: error.message }); }

      if (isRealEmail && !address.email) address.email = suppliedEmail;

      if (!items.length) return json(res, 400, { error: "Your bag is empty." });
      const getProduct = db.prepare("SELECT * FROM products WHERE id=? AND active=1"); const verified = []; let subtotal = 0;
      for (const item of items) { const product = getProduct.get(String(item.id)); const quantity = Math.max(1, Math.min(99, Number(item.quantity) || 1)); if (!product) return json(res, 400, { error: "One of the products is no longer available." }); const lineTotal = Math.round(product.price * quantity * 100) / 100; subtotal += lineTotal; verified.push({ product, quantity, lineTotal }); }
      const coupon = calculateCoupon(body.couponCode, subtotal); const shipping = fulfillmentMethod === "self_pickup" ? 0 : (subtotal - coupon.discount >= 499 ? 0 : 60); const total = Math.round((subtotal - coupon.discount + shipping) * 100) / 100; const orderId = id("ord"); const timestamp = now(); const giftMessage = String(body.giftMessage || "").trim().slice(0, 500);

      const initialStatus = paymentMethod === "cod" ? "processing" : "pending_payment";

      db.exec("BEGIN"); try {
        db.prepare("INSERT INTO orders (id,customer_id,status,subtotal,discount,shipping,total,currency,coupon_code,address_json,fulfillment_method,gift_message,payment_method,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(orderId, customer.id, initialStatus, subtotal, coupon.discount, shipping, total, "INR", coupon.code || null, JSON.stringify(address), fulfillmentMethod, giftMessage || null, paymentMethod, timestamp, timestamp);
        const insert = db.prepare("INSERT INTO order_items (order_id,product_id,name,unit_price,quantity,line_total) VALUES (?,?,?,?,?,?)");
        for (const item of verified) insert.run(orderId, item.product.id, item.product.name, item.product.price, item.quantity, item.lineTotal);
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }

      if (paymentMethod === "cod") {
        void notifyCustomerOrderStatus({
          id: orderId,
          total,
          subtotal,
          discount: coupon.discount,
          shipping,
          coupon_code: coupon.code,
          items: verified.map(v => ({ name: v.product.name, unit_price: v.product.price, quantity: v.quantity, line_total: v.lineTotal })),
          customer_name: customer.name || address.name,
          customer_email: isRealEmail ? suppliedEmail : (customer.email && !customer.email.endsWith("@accounts.raycrafting.local") ? customer.email : address.email),
          payment_method: "cod",
          fulfillment_method: fulfillmentMethod,
          address
        }, "processing", "Pay on Delivery confirmed");
      }

      return json(res, 201, { orderId, token: customer.token, subtotal, discount: coupon.discount, shipping, total, currency: "INR", status: initialStatus, paymentMethod, fulfillmentMethod });
    }
    if (req.method === "POST" && pathname === "/api/orders/action") {
      const customer = customerFromRequest(req); if (!customer) return json(res, 401, { error: "Sign in to manage your orders." });
      const order = db.prepare("SELECT * FROM orders WHERE id=? AND customer_id=?").get(String(body.orderId || ""), customer.id);
      const action = String(body.action || ""); const reason = String(body.reason || "").trim().slice(0, 500);
      if (!order) return json(res, 404, { error: "Order not found." });
      if (!reason) return json(res, 400, { error: "Please provide a reason." });
      if (action === "cancel") {
        if (!["pending_payment", "paid", "processing"].includes(order.status)) return json(res, 400, { error: "This order cannot be cancelled in its current status." });
        db.prepare("UPDATE orders SET status='cancel_requested',customer_request_reason=?,updated_at=? WHERE id=?").run(reason, now(), order.id);
        void notifyCustomerOrderStatus({ ...order, customer_name: customer.name, customer_email: customer.email }, "cancel_requested", reason);
      } else if (action === "return") {
        if (order.status !== "delivered") {
          return json(res, 400, { error: "Returns are only available after your order has been delivered." });
        }
        const deliveryTimestamp = new Date(order.delivered_at || order.updated_at || order.created_at).getTime();
        const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
        if (Date.now() - deliveryTimestamp > THREE_DAYS_MS) {
          return json(res, 400, { error: "The 3-day return window has closed. Handcrafted pieces can only be returned within 3 days of delivery for genuine defects." });
        }
        db.prepare("UPDATE orders SET status='return_requested',customer_request_reason=?,updated_at=? WHERE id=?").run(reason, now(), order.id);
        void notifyCustomerOrderStatus({ ...order, customer_name: customer.name, customer_email: customer.email }, "return_requested", reason);
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
      if (["paid", "processing", "shipped", "out_for_delivery", "delivered", "cancelled", "returned", "declined"].includes(internalOrder.status)) return json(res, 400, { success: false, error: "This order is no longer awaiting payment." });
      await verifyCapturedPayment(paymentId, orderId);
      db.prepare("UPDATE orders SET status='paid',payment_id=?,failure_reason=NULL,updated_at=? WHERE id=?").run(paymentId, now(), internalOrder.id);
      void notifyCustomerOrderStatus({ ...internalOrder, customer_name: customer.name, customer_email: customer.email }, "paid", "");
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
    if (req.method === "POST" && pathname === "/api/window/order") {
      const amount = Math.round(Number(body.amount || 0));
      if (!amount || amount < 100) return json(res, 400, { error: "Invalid amount. Must be at least 100 paise (₹1)." });
      const receipt = `win_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const orderData = {
        amount,
        currency: "INR",
        receipt,
        notes: {
          app: "window",
          item: String(body.description || "Window In-app Purchase").slice(0, 100),
          userId: String(body.userId || "").slice(0, 50),
        },
      };
      const paymentOrder = await razorpayRequest("/orders", {
        method: "POST",
        body: JSON.stringify(orderData),
      });
      return json(res, 200, {
        keyId: RAZORPAY_KEY_ID,
        orderId: paymentOrder.id,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency,
      });
    }
    if (req.method === "GET" && pathname === "/api/window/debug-orders") {
      const orders = await razorpayRequest("/orders?count=10");
      const payments = await razorpayRequest("/payments?count=10");
      return json(res, 200, { orders, payments });
    }
    if (req.method === "POST" && pathname === "/api/payments/razorpay/failed") {
      const customer = customerFromRequest(req); if (!customer) return json(res, 401, { error: "Sign in required." });
      const order = db.prepare("SELECT * FROM orders WHERE id=? AND customer_id=?").get(String(body.orderId || ""), customer.id);
      if (!order) return json(res, 404, { error: "Order not found." });
      if (["paid", "processing", "shipped", "out_for_delivery", "delivered", "cancelled", "returned", "declined"].includes(order.status)) return json(res, 400, { error: "This order is no longer awaiting payment." });
      const reason = String(body.reason || "Payment was not completed.").slice(0, 500);
      db.prepare("UPDATE orders SET status='failed_payment',failure_reason=?,updated_at=? WHERE id=?").run(reason, now(), order.id);
      void notifyCustomerOrderStatus({ ...order, customer_name: customer.name, customer_email: customer.email }, "failed_payment", reason);
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
    if (req.method === "GET" && pathname === "/api/admin/custom-orders") {
      if (!requireAdmin(req)) return json(res, 401, { error: "Seller access required." });
      return json(res, 200, { customOrders: customOrderRows() });
    }
    if (req.method === "POST" && pathname === "/api/admin/custom-orders/status") {
      if (!requireAdmin(req)) return json(res, 401, { error: "Seller access required." });
      const orderId = String(body.orderId || "");
      const status = String(body.status || "");
      const sellerNote = String(body.sellerNote || "").trim().slice(0, 1000);
      const quotedPrice = body.quotedPrice !== undefined && body.quotedPrice !== "" ? Math.max(0, Number(body.quotedPrice) || 0) : null;
      const statuses = ["new", "reviewing", "price_quoted", "contacted", "accepted", "in_progress", "ready", "completed", "declined"];
      const order = db.prepare("SELECT * FROM custom_orders WHERE id=?").get(orderId);
      if (!order) return json(res, 404, { error: "Custom order not found." });
      if (!statuses.includes(status)) return json(res, 400, { error: "Unsupported custom order status." });
      db.prepare("UPDATE custom_orders SET status=?,quoted_price=COALESCE(?, quoted_price),seller_note=?,updated_at=? WHERE id=?").run(status, quotedPrice, sellerNote || null, now(), orderId);
      return json(res, 200, { ok: true, customOrderId: orderId, status, quotedPrice, sellerNote: sellerNote || null });
    }
    if (req.method === "GET" && pathname === "/api/admin/note-requests") {
      if (!requireAdmin(req)) return json(res, 401, { error: "Seller access required." });
      return json(res, 200, { noteRequests: noteRequestRows() });
    }
    if (req.method === "POST" && pathname === "/api/admin/note-requests/status") {
      if (!requireAdmin(req)) return json(res, 401, { error: "Seller access required." });
      const noteId = String(body.noteId || "");
      const status = String(body.status || "");
      if (!["new", "read", "replied", "archived"].includes(status)) return json(res, 400, { error: "Unsupported note status." });
      const note = db.prepare("SELECT id FROM note_requests WHERE id=?").get(noteId);
      if (!note) return json(res, 404, { error: "Note not found." });
      db.prepare("UPDATE note_requests SET status=?,updated_at=? WHERE id=?").run(status, now(), noteId);
      return json(res, 200, { ok: true, noteId, status });
    }
    if (req.method === "GET" && pathname === "/api/admin/orders") {
      if (!requireAdmin(req)) return json(res, 401, { error: "Seller access required." });
      const view = requestUrl.searchParams.get("view") || "confirmed";
      const confirmedCount = db.prepare("SELECT COUNT(*) as count FROM orders WHERE (status NOT IN ('pending_payment', 'failed_payment') OR payment_method = 'cod')").get().count;
      const unpaidCount = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status IN ('pending_payment', 'failed_payment') AND (payment_method IS NULL OR payment_method != 'cod')").get().count;
      return json(res, 200, {
        orders: orderRows(view),
        counts: { confirmed: confirmedCount, unpaid: unpaidCount, all: confirmedCount + unpaidCount }
      });
    }
    if (req.method === "GET" && pathname === "/api/admin/settings") {
      if (!requireAdmin(req)) return json(res, 401, { error: "Seller access required." });
      const currentApiKey = getSetting("resend_api_key", RESEND_API_KEY || "");
      const cleanInsta = parseInstagramUsername(getSetting("instagram_handle", process.env.INSTAGRAM_HANDLE || ""));
      return json(res, 200, {
        supportPhone: getSetting("support_phone", SUPPORT_PHONE || ""),
        supportEmail: getSetting("support_email", SUPPORT_EMAIL || "raywithcharm@gmail.com"),
        instagramHandle: cleanInsta,
        instagramUrl: cleanInsta ? `https://ig.me/m/${cleanInsta}` : "",
        bannerQuote: getSetting("banner_quote", "“Where flowers bloom, so does hope.” — Handcrafted with love"),
        emailFrom: getSetting("email_from", EMAIL_FROM || "Raycrafting <orders@raycrafting.store>"),
        resendConfigured: Boolean(currentApiKey),
        resendApiKeyMasked: currentApiKey ? (currentApiKey.slice(0, 5) + "..." + currentApiKey.slice(-4)) : ""
      });
    }
    if (req.method === "POST" && pathname === "/api/admin/settings") {
      if (!requireAdmin(req)) return json(res, 401, { error: "Seller access required." });
      if (typeof body.supportPhone === "string") setSetting("support_phone", body.supportPhone.trim());
      if (typeof body.supportEmail === "string") setSetting("support_email", body.supportEmail.trim());
      if (typeof body.instagramHandle === "string") setSetting("instagram_handle", parseInstagramUsername(body.instagramHandle));
      if (typeof body.bannerQuote === "string" && body.bannerQuote.trim()) setSetting("banner_quote", body.bannerQuote.trim());
      if (typeof body.emailFrom === "string" && body.emailFrom.trim()) setSetting("email_from", body.emailFrom.trim());
      if (typeof body.resendApiKey === "string" && body.resendApiKey.trim()) setSetting("resend_api_key", body.resendApiKey.trim());
      const currentApiKey = getSetting("resend_api_key", RESEND_API_KEY || "");
      const cleanInsta = parseInstagramUsername(getSetting("instagram_handle", process.env.INSTAGRAM_HANDLE || ""));
      return json(res, 200, {
        ok: true,
        supportPhone: getSetting("support_phone", SUPPORT_PHONE || ""),
        supportEmail: getSetting("support_email", SUPPORT_EMAIL || "raywithcharm@gmail.com"),
        instagramHandle: cleanInsta,
        instagramUrl: cleanInsta ? `https://ig.me/m/${cleanInsta}` : "",
        bannerQuote: getSetting("banner_quote", "“Where flowers bloom, so does hope.” — Handcrafted with love"),
        emailFrom: getSetting("email_from", EMAIL_FROM || "Raycrafting <orders@raycrafting.store>"),
        resendConfigured: Boolean(currentApiKey)
      });
    }
    if (req.method === "POST" && pathname === "/api/admin/orders/fulfillment") {
      if (!requireAdmin(req)) return json(res, 401, { error: "Seller access required." });
      const orderId = String(body.orderId || ""); const fulfillmentMethod = String(body.fulfillmentMethod || "");
      const order = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
      if (!order) return json(res, 404, { error: "Order not found." });
      if (!["shiprocket", "manual"].includes(fulfillmentMethod)) return json(res, 400, { error: "Choose Shiprocket delivery or manual delivery." });
      if (fulfillmentMethod === "shiprocket" && ((!shiprocketToken && (!SHIPROCKET_API_EMAIL || !SHIPROCKET_API_PASSWORD)) || !SHIPROCKET_PICKUP_POSTCODE)) return json(res, 503, { error: "Shiprocket is not configured. Add API credentials and the seller pickup PIN first." });
      db.prepare("UPDATE orders SET fulfillment_method=?,updated_at=? WHERE id=?").run(fulfillmentMethod, now(), order.id);
      return json(res, 200, { ok: true, orderId: order.id, fulfillmentMethod });
    }
    if (req.method === "POST" && pathname === "/api/admin/orders/status") {
      if (!requireAdmin(req)) return json(res, 401, { error: "Seller access required." });
      const order = db.prepare("SELECT o.*, c.name customer_name, c.email customer_email FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=?").get(String(body.orderId || "")); const status = String(body.status || ""); const reason = String(body.reason || "").trim().slice(0, 500);
      const statuses = ["processing", "shipped", "out_for_delivery", "delivered", "declined", "cancelled", "returned"];
      if (!order) return json(res, 404, { error: "Order not found." });
      if (!statuses.includes(status)) return json(res, 400, { error: "Unsupported order status." });
      if (status === "declined" && !reason) return json(res, 400, { error: "A decline reason is required." });
      const changed = order.status !== status;
      const deliveredAt = status === "delivered" ? (order.delivered_at || now()) : order.delivered_at;
      db.prepare("UPDATE orders SET status=?,decision_reason=?,delivered_at=?,updated_at=? WHERE id=?").run(status, reason || null, deliveredAt || null, now(), order.id);
      if (changed) void notifyCustomerOrderStatus(order, status, reason);
      const currentApiKey = getSetting("resend_api_key", RESEND_API_KEY || "");
      return json(res, 200, { ok: true, orderId: order.id, status, decisionReason: reason || null, emailNotificationConfigured: Boolean(currentApiKey) });
    }
    if (req.method === "POST" && pathname === "/api/admin/products/sync") {
      if (!requireAdmin(req)) return json(res, 401, { error: "Seller access required." });
      const products = Array.isArray(body.products) ? body.products : [];
      const upsert = db.prepare(`INSERT INTO products (id,name,category,price,original_price,detail,description,featured,art,image,images_json,badge,dimensions,materials,care,active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,price=excluded.price,original_price=excluded.original_price,detail=excluded.detail,description=excluded.description,featured=excluded.featured,art=excluded.art,image=excluded.image,images_json=excluded.images_json,badge=COALESCE(excluded.badge, products.badge),dimensions=COALESCE(excluded.dimensions, products.dimensions),materials=COALESCE(excluded.materials, products.materials),care=COALESCE(excluded.care, products.care),active=excluded.active`);
      db.exec("BEGIN");
      try {
        if (body.pruneOthers === true && Array.isArray(body.products)) {
          const ids = products.map((product) => String(product.id || "")).filter(Boolean);
          if (ids.length) db.prepare(`UPDATE products SET active=0 WHERE id NOT IN (${ids.map(() => "?").join(",")})`).run(...ids);
        }
        for (const product of products) {
          const rawImgs = Array.isArray(product.images) && product.images.length ? product.images : (product.image ? [product.image] : []);
          const cleanName = String(product.name || "piece");
          const savedImgs = rawImgs.map(img => saveBase64Image(img, cleanName));
          const primaryImg = savedImgs[0] || saveBase64Image(product.image, cleanName) || "";
          upsert.run(
            String(product.id),
            cleanName,
            String(product.category || "Other"),
            Number(product.price) || 0,
            Number(product.originalPrice || product.original_price) || 0,
            String(product.detail || ""),
            String(product.description || ""),
            Number(product.featured) || 1,
            String(product.art || "custom"),
            primaryImg,
            JSON.stringify(savedImgs),
            product.badge || null,
            product.dimensions || null,
            product.materials || null,
            product.care || null,
            product.active === false || product.active === 0 ? 0 : 1
          );
        }
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
      return json(res, 200, { ok: true, count: products.length });
    }
    if (req.method === "POST" && pathname === "/api/admin/products/delete") {
      if (!requireAdmin(req)) return json(res, 401, { error: "Seller access required." });
      const productId = String(body.id || "");
      if (!productId) return json(res, 400, { error: "Product ID required." });
      db.prepare("UPDATE products SET active=0 WHERE id=?").run(productId);
      return json(res, 200, { ok: true, id: productId, active: 0 });
    }
    return json(res, 404, { error: "API route not found." });
  } catch (error) { console.error(error); return json(res, error.status || 400, { error: error.message || "Request failed." }); }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    });
    return res.end();
  }
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`); const body = req.method === "POST" ? await readBody(req).catch((error) => ({ __error: error.message })) : {};
  if (body.__error) return json(res, 400, { error: body.__error });
  if (url.pathname.startsWith("/api/")) return api(req, res, url.pathname, body, url);
  return serveStatic(req, res, url.pathname);
});
server.listen(PORT, () => console.log(`Raycrafting server running at http://127.0.0.1:${PORT}`));
