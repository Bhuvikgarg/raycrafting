PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL
  , avatar_url TEXT);
INSERT INTO customers VALUES('cus_ed16d2a127f607f0','Bhuvik','bhuvikgarg@gmail.com','9041915832','cddf75f2c280b7b133790e9bebc836c469d2e5846068408cfb9d3f00b2802e6cdd13f41660053b669c07ea9aa7e151c6cab4d3de6f1284125653ba2007dcb71c','e90ddad424a63471e44b50052121828a','2026-08-08T12:24:50.199Z',NULL);
CREATE TABLE sessions (
    token TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
INSERT INTO sessions VALUES('20b254cda55072c55f770b595f73ae0d14c76977fc4adff1aaf7b86f72846a43','cus_6b3919f89cc4bd5a','2026-09-07T12:13:15.528Z');
INSERT INTO sessions VALUES('8c436cb9ccda74a08e77721c3133656abde002147790e42d96d906e52a8743bb','cus_ed16d2a127f607f0','2026-09-07T12:24:50.200Z');
CREATE TABLE products (
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
INSERT INTO products VALUES('sunbeam','Sunbeam Single Stem','Flowers',149.0,180.0,'Standalone stem · ~20cm tall','A standalone happy yellow bloom for your favorite pen stand, bud vase, or as an add-on stem to surprise a friend.',14,'sunbeam','assets/sunflower.webp',1);
INSERT INTO products VALUES('coral-bloom','Coral Bloom Stem','Flowers',149.0,180.0,'Standalone stem · ~20cm tall','A warm coral flower with a soft green bendable stem, made to brighten up any small bottle, pencil jar, or gift box.',15,'coral','assets/pink-rose-pot.webp',1);
INSERT INTO products VALUES('tiny-daisy','Tiny Daisy Charm','Keepsakes',120.0,150.0,'Pocket daisy charm · ~6cm','A pocket-sized cheerful daisy for your keys, tote bag, or study pinboard. A little daily reminder of sunshine wherever you go.',12,'daisy','assets/sunflower.webp',1);
INSERT INTO products VALUES('meadow-bundle','Meadow Bloom Bundle','Bundles',399.0,480.0,'Curated 3-bloom set · Gift-ready','A curated mix of sunshine yellow, sage green, and soft pink blooms tied together in a ready-to-gift bundle. A complete bouquet that never wilts.',5,'meadow','assets/raycrafting-collection.webp',1);
INSERT INTO products VALUES('lavender-loop','Lavender Loop Charm','Keepsakes',120.0,150.0,'Desk or bag charm · ~7cm','A soothing lavender loop that hangs happily on a bag, car mirror, or desk monitor. Brings a touch of pastel calm to your everyday essentials.',13,'lavender','assets/pink-lily-pot.webp',1);
INSERT INTO products VALUES('sunset-trio','Sunset Trio Arrangement','Bundles',499.0,580.0,'Warm sunset blooms · Gift box','Three warm-toned flowers bundled for a cheerful, full arrangement. Made to bring cozy golden-hour warmth to any corner, no vase change ever needed.',6,'sunset','assets/raycrafting-collection.webp',1);
INSERT INTO products VALUES('sunflower-pot','Sunflower Pot','Flowers',250.0,299.0,'Handmade pot · ~15cm tall','A cheerful sunflower arrangement shaped by hand with bright fuzzy petals and a sturdy pot. Made to bring year-round sunshine to a desk, shelf, or bedside table.',1,'sunflower','assets/sunflower.webp',1);
INSERT INTO products VALUES('rose-pot','Pink Rose Pot','Flowers',220.0,260.0,'Handcrafted rose · ~14cm tall','A romantic handmade rose pot with delicate spiraled petals and a soft blush finish. A timeless, everlasting floral gift for someone special or yourself.',2,'rose','assets/pink-rose-pot.webp',1);
INSERT INTO products VALUES('lily-pot','Pink Lily Pot','Flowers',250.0,299.0,'Graceful petals · ~16cm tall','An elegant lily-inspired flower pot with gracefully curved petals and pastel accents. Brings a serene, aesthetic floral touch to your workspace.',3,'lily','assets/pink-lily-pot.webp',1);
INSERT INTO products VALUES('rabbit-pot','Rabbit Flower Pot','Flowers',350.0,399.0,'Cute bunny & bloom · ~16cm tall','A playful handcrafted rabbit companion nestled with bright flowers. Perfect as a desk accent or a sweet, thoughtful gift that sparks an instant smile.',4,'custom','assets/sunflower.webp',1);
INSERT INTO products VALUES('tulip-flower-pot','Pastel Tulip Pot','Flowers',250.0,280.0,'Cheerful spring tulip · ~15cm tall','A colorful handmade flower pot inspired by fresh spring tulips. Designed to brighten your windowsill, study table, or office desk all year round.',7,'custom','assets/pink-lily-pot.webp',1);
INSERT INTO products VALUES('cupcakes','Sweet Cupcake Charm','Keepsakes',99.0,120.0,'Fuzzy mini treat · ~5cm','A miniature handmade cupcake keepsake full of vibrant colors and sweet details. Perfect as a pocket-sized gift or party favor.',11,'custom','assets/sunflower.webp',1);
INSERT INTO products VALUES('pink-flowers','Blush Bloom Pot','Flowers',150.0,180.0,'Gentle pop of pink · ~12cm tall','A soft pink flower arrangement handmade to add a gentle, calming pop of pastel color to your study space, desk, or gifting package.',8,'custom','assets/pink-rose-pot.webp',1);
INSERT INTO products VALUES('rabbit','Fluffy Bunny Keepsake','Keepsakes',199.0,240.0,'Handmade desk buddy · ~10cm','A cute handmade rabbit keepsake with an adorable face and soft feel. A comforting little desk buddy ready to keep you company during study or work.',10,'custom','assets/sunflower.webp',1);
INSERT INTO products VALUES('strawberry-keychain','Strawberry Charm Keychain','Keepsakes',120.0,150.0,'Handmade bag charm · ~6cm','A playful strawberry keychain with a textured handmade finish. Adds a cheerful, handmade charm to your backpack, keys, or tote bag.',9,'custom','assets/sunflower.webp',1);
CREATE TABLE coupons (
    code TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK(kind IN ('percent', 'fixed')),
    amount REAL NOT NULL,
    minimum_subtotal REAL DEFAULT 0,
    active INTEGER DEFAULT 1,
    expires_at TEXT
  );
INSERT INTO coupons VALUES('BRIGHT10','percent',10.0,0.0,1,NULL);
INSERT INTO coupons VALUES('RAY100','fixed',100.0,1000.0,1,NULL);
INSERT INTO coupons VALUES('WELCOME15','percent',15.0,500.0,1,NULL);
INSERT INTO coupons VALUES('WELCOME10','percent',10.0,0.0,1,NULL);
CREATE TABLE orders (
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
  , payment_method TEXT NOT NULL DEFAULT 'razorpay', failure_reason TEXT, decision_reason TEXT, customer_request_reason TEXT, fulfillment_method TEXT NOT NULL DEFAULT 'shiprocket', shiprocket_order_id TEXT, shiprocket_shipment_id TEXT, shiprocket_awb TEXT, shiprocket_courier TEXT, shipping_status TEXT, gift_message TEXT);
INSERT INTO orders VALUES('ord_a7e0b285b7c0658c','cus_ed16d2a127f607f0','declined',250.0,25.0,80.0,305.0,'INR','BRIGHT10','{"name":"Bhuvik","phone":"9041915832","line1":"#12,ward no. 7,old sbi street","line2":"","city":"maur","state":"punjab","postalCode":"151509"}',NULL,NULL,'2026-08-08T12:25:31.292Z','2026-08-08T13:29:20.103Z','razorpay',NULL,'failed payment',NULL,'shiprocket',NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO orders VALUES('ord_b64cc7b63fe7c268','cus_ed16d2a127f607f0','pending_payment',250.0,25.0,80.0,305.0,'INR','BRIGHT10','{"name":"Bhuvik","phone":"9041915832","line1":"#12,ward no. 7,old sbi street","line2":"","city":"maur","state":"punjab","postalCode":"151509"}',NULL,NULL,'2026-08-08T12:25:35.015Z','2026-08-08T12:25:35.015Z','razorpay',NULL,NULL,NULL,'shiprocket',NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO orders VALUES('ord_58903111da69ae73','cus_ed16d2a127f607f0','pending_payment',250.0,25.0,80.0,305.0,'INR','BRIGHT10','{"name":"Bhuvik","phone":"9041915832","line1":"#12,ward no. 7,old sbi street","line2":"","city":"maur","state":"punjab","postalCode":"151509"}','order_TNHOKESbUlMMLd',NULL,'2026-08-08T12:43:01.137Z','2026-08-08T12:43:01.467Z','razorpay',NULL,NULL,NULL,'shiprocket',NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO orders VALUES('ord_9a1d7dac4cfdee23','cus_ed16d2a127f607f0','pending_payment',250.0,25.0,80.0,305.0,'INR','BRIGHT10','{"name":"Bhuvik","phone":"9041915832","line1":"#12,ward no. 7,old sbi street","line2":"","city":"MAUR","state":"PUNJAB","postalCode":"151509"}','order_TNHT5F0ZDl0nLc',NULL,'2026-08-08T12:47:31.459Z','2026-08-08T12:47:31.729Z','razorpay',NULL,NULL,NULL,'shiprocket',NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO orders VALUES('ord_a5cda7204f0626db','cus_ed16d2a127f607f0','pending_payment',250.0,25.0,80.0,305.0,'INR','BRIGHT10','{"name":"Bhuvik","phone":"9041915832","line1":"#12,ward no. 7,old sbi street","line2":"","city":"MAUR","state":"PUNJAB","postalCode":"1151509"}','order_TNHUznPGxAeSd3',NULL,'2026-08-08T12:49:20.063Z','2026-08-08T12:49:20.348Z','razorpay',NULL,NULL,NULL,'shiprocket',NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO orders VALUES('ord_9eb61e713bb2dce2','cus_ed16d2a127f607f0','processing',250.0,25.0,80.0,305.0,'INR','BRIGHT10','{"name":"Bhuvik","phone":"9041915832","line1":"#12,ward no. 7,old sbi street","line2":"","city":"MAUR","state":"PUNJAB","postalCode":"151509"}','order_TNHdb55Uy5htuq','pay_TNHsiNlURmJAVR','2026-08-08T12:57:28.662Z','2026-08-08T13:29:29.338Z','razorpay',NULL,NULL,NULL,'shiprocket',NULL,NULL,NULL,NULL,NULL,NULL);
CREATE TABLE order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    name TEXT NOT NULL,
    unit_price REAL NOT NULL,
    quantity INTEGER NOT NULL,
    line_total REAL NOT NULL
  );
INSERT INTO order_items VALUES(1,'ord_251da0202613e6aa','sunbeam','Sunbeam Stem',18.0,2,36.0);
INSERT INTO order_items VALUES(2,'ord_a7e0b285b7c0658c','sunflower-pot','sunflower pot',250.0,1,250.0);
INSERT INTO order_items VALUES(3,'ord_b64cc7b63fe7c268','sunflower-pot','sunflower pot',250.0,1,250.0);
INSERT INTO order_items VALUES(4,'ord_58903111da69ae73','sunflower-pot','sunflower pot',250.0,1,250.0);
INSERT INTO order_items VALUES(5,'ord_9a1d7dac4cfdee23','sunflower-pot','sunflower pot',250.0,1,250.0);
INSERT INTO order_items VALUES(6,'ord_a5cda7204f0626db','sunflower-pot','sunflower pot',250.0,1,250.0);
INSERT INTO order_items VALUES(7,'ord_9eb61e713bb2dce2','sunflower-pot','sunflower pot',250.0,1,250.0);
CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL REFERENCES orders(id),
    provider TEXT NOT NULL,
    provider_order_id TEXT,
    provider_payment_id TEXT,
    status TEXT NOT NULL,
    raw_json TEXT,
    created_at TEXT NOT NULL
  );
CREATE TABLE newsletter_subscribers (
    email TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
  );
CREATE TABLE custom_orders (
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
CREATE TABLE note_requests (
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
PRAGMA writable_schema=ON;
CREATE TABLE IF NOT EXISTS sqlite_sequence(name,seq);
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence VALUES('order_items',7);
PRAGMA writable_schema=OFF;
COMMIT;
