(function () {
  "use strict";
  const key = window.RAYCRAFTING_STORAGE_KEY;
  const $ = (id) => document.getElementById(id);
  const products = () => JSON.parse(localStorage.getItem(key) || "null") || (window.RAYCRAFTING_DEFAULT_PRODUCTS || []).map((product) => ({ ...product }));
  const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value) || 0);
  const esc = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));

  function adminToken() {
    return sessionStorage.getItem("raycrafting-admin-token") || localStorage.getItem("raycrafting-admin-token") || "";
  }

  function expireSellerSession() {
    sessionStorage.removeItem("raycrafting-admin-token");
    localStorage.removeItem("raycrafting-admin-token");
    sessionStorage.removeItem("raycrafting-studio-unlocked");
    const modal = $("accessModal");
    if (modal) modal.classList.remove("unlocked");
    const error = $("accessError");
    if (error) error.textContent = "Your seller session expired. Enter your studio PIN again.";
  }

  async function syncProducts() {
    const response = await fetch("/api/admin/products/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": adminToken() },
      body: JSON.stringify({ products: products() })
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { expireSellerSession(); throw new Error("Seller session expired. Enter your studio PIN again."); }
    if (!response.ok) throw new Error(data.error || "Could not update the public catalog.");
    return data;
  }
  window.raycraftingSyncProducts = syncProducts;

  function addDiscountField() {
    const price = $("productPrice"); if (!price || $("productOriginalPrice")) return;
    price.closest("label").childNodes[0].textContent = "Final price (₹)";
    price.closest("label").insertAdjacentHTML("afterend", '<label>Regular price (₹)<input id="productOriginalPrice" type="number" min="0" step="0.01" placeholder="Optional"><small class="field-help">Fill this only when the final price is discounted.</small></label>');
  }

  function decorateCatalog() {
    const map = new Map(products().map((product) => [product.id, product]));
    document.querySelectorAll(".catalog-item").forEach((item) => {
      const edit = item.querySelector("[data-edit]");
      const product = edit && map.get(edit.dataset.edit);
      if (!product) return;
      const old = Number(product.originalPrice) > Number(product.price) ? `<del>${money(product.originalPrice)}</del> ` : "";
      const price = item.querySelector(".catalog-price");
      if (price) price.innerHTML = `${old}${money(product.price)}`;
    });
  }

  let currentOrdersView = localStorage.getItem("raycrafting_orders_tab") || "all";
  let inMemoryOrders = [];

  function hydrateSettingsFromCache() {
    try {
      const cached = JSON.parse(localStorage.getItem("raycrafting_admin_settings_cache") || "null");
      if (cached) {
        if (cached.supportPhone && $("supportPhoneInput") && !$("supportPhoneInput").value) $("supportPhoneInput").value = cached.supportPhone;
        if (cached.instagramHandle && $("instagramHandleInput") && !$("instagramHandleInput").value) $("instagramHandleInput").value = cached.instagramHandle;
        if (cached.bannerQuote && $("bannerQuoteInput") && !$("bannerQuoteInput").value) $("bannerQuoteInput").value = cached.bannerQuote;
      }
    } catch {}
  }

  async function loadSettings() {
    hydrateSettingsFromCache();
    if (!adminToken()) return;
    try {
      const res = await fetch("/api/admin/settings", { headers: { "x-admin-token": adminToken() } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.supportPhone !== undefined && $("supportPhoneInput")) $("supportPhoneInput").value = data.supportPhone || "";
        if (data.instagramHandle !== undefined && $("instagramHandleInput")) $("instagramHandleInput").value = data.instagramHandle || "";
        if (data.bannerQuote !== undefined && $("bannerQuoteInput")) $("bannerQuoteInput").value = data.bannerQuote || "";
        try {
          localStorage.setItem("raycrafting_admin_settings_cache", JSON.stringify({
            supportPhone: data.supportPhone || "",
            instagramHandle: data.instagramHandle || "",
            bannerQuote: data.bannerQuote || ""
          }));
        } catch {}
      }
    } catch {}
  }

  async function saveSettings() {
    const phoneInput = $("supportPhoneInput");
    const instaInput = $("instagramHandleInput");
    const quoteInput = $("bannerQuoteInput");
    const status = $("settingsStatus");
    if (!status) return;
    status.textContent = "Saving…";
    try {
      const phone = phoneInput ? phoneInput.value.trim() : "";
      const insta = instaInput ? instaInput.value.trim().replace(/^@/, "") : "";
      const quote = quoteInput ? quoteInput.value.trim() : "";
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": adminToken() },
        body: JSON.stringify({ supportPhone: phone, instagramHandle: insta, bannerQuote: quote })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save settings.");
      try {
        localStorage.setItem("raycrafting_admin_settings_cache", JSON.stringify({
          supportPhone: phone,
          instagramHandle: insta,
          bannerQuote: quote
        }));
      } catch {}
      status.textContent = "✓ Settings saved! Top quote banner, WhatsApp, and Instagram links updated.";
      setTimeout(() => { status.textContent = ""; }, 4000);
    } catch (err) {
      status.textContent = err.message;
    }
  }

  function updateMetricsUI(orders = [], serverMetrics = null) {
    if (serverMetrics) {
      if ($("metricTotalOrders")) $("metricTotalOrders").textContent = serverMetrics.totalOrders || 0;
      if ($("metricTotalRevenue")) $("metricTotalRevenue").textContent = money(serverMetrics.totalRevenue || 0);
      if ($("metricActiveCrafting")) $("metricActiveCrafting").textContent = serverMetrics.activeCrafting || 0;
      if ($("metricDelivered")) $("metricDelivered").textContent = serverMetrics.delivered || 0;
      return;
    }
    if (!Array.isArray(orders)) return;
    const totalCount = orders.length;
    const confirmedOrders = orders.filter((o) => (o.status !== "pending_payment" && o.status !== "failed_payment") || o.payment_method === "cod");
    const revenue = confirmedOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const activeCrafting = orders.filter((o) => ["paid", "processing", "shipped", "out_for_delivery"].includes(o.status)).length;
    const delivered = orders.filter((o) => o.status === "delivered").length;

    if ($("metricTotalOrders")) $("metricTotalOrders").textContent = totalCount;
    if ($("metricTotalRevenue")) $("metricTotalRevenue").textContent = money(revenue);
    if ($("metricActiveCrafting")) $("metricActiveCrafting").textContent = activeCrafting;
    if ($("metricDelivered")) $("metricDelivered").textContent = delivered;
  }

  function buildCsvFromOrders(orders) {
    const headers = [
      "Order ID",
      "Date & Time (IST)",
      "Customer Name",
      "Customer Phone",
      "Customer Email",
      "Delivery Address",
      "City",
      "State",
      "PIN Code",
      "Fulfillment Method",
      "Items Summary",
      "Total Quantity",
      "Subtotal (₹)",
      "Discount (₹)",
      "Coupon Code",
      "Shipping Fee (₹)",
      "Total Order Amount (₹)",
      "Payment Method",
      "Order Status",
      "Payment ID / Ref",
      "Tracking AWB",
      "Gift Message",
      "Customer Request Reason",
      "Seller Reason / Decision"
    ];

    const rows = (orders || []).map((order) => {
      const addr = order.address || {};
      const items = Array.isArray(order.items) ? order.items : [];
      const itemsSummary = items.map((i) => `${i.quantity}x ${i.name} (₹${i.unit_price})`).join("; ");
      const totalQty = items.reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);
      const street = [addr.line1, addr.line2].filter(Boolean).join(", ");
      const paymentMode = order.payment_method === "cod" ? "Pay on Delivery (COD)" : "Online UPI / Cards";
      const istTime = order.created_at ? new Date(order.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST" : "";

      const values = [
        order.id,
        istTime,
        order.customer_name || addr.name || "",
        order.customer_phone || addr.phone || "",
        order.customer_email || addr.email || "",
        street,
        addr.city || "",
        addr.state || "",
        addr.postalCode || "",
        order.fulfillment_method || "manual",
        itemsSummary,
        totalQty,
        order.subtotal || 0,
        order.discount || 0,
        order.coupon_code || "",
        order.shipping || 0,
        order.total || 0,
        paymentMode,
        order.status || "processing",
        order.payment_id || order.razorpay_order_id || "",
        order.shiprocket_awb || "",
        order.gift_message || "",
        order.customer_request_reason || "",
        order.decision_reason || ""
      ];

      return values.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");
    });

    return "\uFEFF" + headers.map((h) => `"${h}"`).join(",") + "\n" + rows.join("\n") + "\n";
  }

  function downloadBlob(filename, content, type = "text/csv;charset=utf-8") {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadExcelLedger() {
    const token = adminToken();
    const filename = `Raycrafting_Orders_Ledger_${new Date().toISOString().slice(0, 10)}.csv`;
    if (token) {
      try {
        const res = await fetch(`/api/admin/orders/export-excel?token=${encodeURIComponent(token)}`, {
          headers: { "x-admin-token": token }
        });
        if (res.ok) {
          const csvText = await res.text();
          downloadBlob(filename, csvText);
          return;
        }
      } catch (err) {
        console.warn("Direct server CSV download failed, generating client fallback:", err);
      }
    }
    // Fallback: build from inMemoryOrders or localStorage cache
    const cachedStr = localStorage.getItem("raycrafting_orders_cache");
    const ordersToExport = (inMemoryOrders && inMemoryOrders.length) ? inMemoryOrders : (cachedStr ? JSON.parse(cachedStr) : []);
    const csv = buildCsvFromOrders(ordersToExport);
    downloadBlob(filename, csv);
  }

  async function downloadActionAuditLog() {
    const token = adminToken();
    const filename = `Raycrafting_Order_Audit_Actions_${new Date().toISOString().slice(0, 10)}.csv`;
    if (token) {
      try {
        const res = await fetch(`/api/admin/orders/export-actions?token=${encodeURIComponent(token)}`, {
          headers: { "x-admin-token": token }
        });
        if (res.ok) {
          const csvText = await res.text();
          downloadBlob(filename, csvText);
          return;
        }
      } catch (err) {
        console.warn("Action audit log download failed:", err);
      }
    }
    window.alert("Audit action log is kept on the server. Please unlock your studio session or connect to server.");
  }

  function renderOrdersList(orders, view) {
    const target = $("ordersList");
    if (!target) return;

    if (!orders || !orders.length) {
      if (view === "confirmed") {
        target.innerHTML = '<div class="orders-empty-state"><p class="field-help">No confirmed orders yet. When customers complete payment or choose Pay on Delivery, orders will appear here!</p></div>';
      } else if (view === "unpaid") {
        target.innerHTML = '<div class="orders-empty-state"><p class="field-help">No incomplete or unpaid checkout sessions.</p></div>';
      } else {
        target.innerHTML = '<div class="orders-empty-state"><p class="field-help">No customer orders recorded yet. As soon as a customer orders, it will appear here permanently.</p></div>';
      }
      return;
    }

    target.innerHTML = orders.map((order) => {
      const isCod = order.payment_method === "cod";
      const canProcess = order.status === "paid" || (isCod && order.status === "processing");
      const canShip = order.status === "processing";
      const canOutForDelivery = order.status === "shipped";
      const canDeliver = order.status === "out_for_delivery";
      const canCancel = order.status === "cancel_requested";
      const canReturn = order.status === "return_requested";

      let paymentPill = `<span class="payment-badge-online">✓ Paid Online</span>`;
      if (isCod) paymentPill = `<span class="payment-badge-cod">📦 Pay on Delivery (COD)</span>`;
      else if (order.status === "pending_payment") paymentPill = `<span class="payment-badge-unpaid">⏳ Awaiting Payment / Draft</span>`;
      else if (order.status === "failed_payment") paymentPill = `<span class="payment-badge-failed">❌ Payment Failed</span>`;

      const failure = order.failure_reason ? '<p class="order-alert failed"><strong>Payment issue:</strong> ' + esc(order.failure_reason) + '</p>' : "";
      const gift = order.gift_message ? '<p class="order-alert" style="background:#fff2f6;border-color:var(--coral);color:#8a3b53;"><strong>💌 Gift note:</strong> "' + esc(order.gift_message) + '"</p>' : "";
      const request = order.customer_request_reason ? '<p class="order-alert"><strong>Customer request:</strong> ' + esc(order.customer_request_reason) + '</p>' : "";
      const decision = order.decision_reason ? '<p class="order-alert declined"><strong>Seller reason:</strong> ' + esc(order.decision_reason) + '</p>' : "";
      const shippingAwb = order["shiprocket_awb"]; const shippingCourier = order["shiprocket_courier"]; const shipping = shippingAwb ? '<p class="shipping-meta"><strong>Tracking reference:</strong> ' + esc(shippingAwb) + (shippingCourier ? " · " + esc(shippingCourier) : "") + '</p>' : "";
      const fulfillment = '<div class="fulfillment-meta"><strong>' + esc(fulfillmentLabel(order)) + '</strong>' + (order.fulfillment_method !== "self_pickup" ? " · " + esc(order.shipping_status || "Standard dispatch") : "") + '</div>';

      const cleanPhone = String(order.customer_phone || order.address?.phone || "").replace(/\D/g, "");
      const waLink = cleanPhone ? `<a class="whatsapp-customer-btn" target="_blank" rel="noopener noreferrer" href="https://wa.me/${cleanPhone.startsWith("91") ? cleanPhone : "91" + cleanPhone}?text=${encodeURIComponent(`Hi ${order.customer_name || ""}, this is Raycrafting regarding your order ${order.id}!`)}">💬 Chat on WhatsApp</a>` : "";

      const actions = (order.status === "processing" ? '<button type="button" data-order-status="shipped" data-order-id="' + esc(order.id) + '">Mark shipped</button>' : "") +
        (canProcess && order.status === "paid" ? '<button type="button" data-order-status="processing" data-order-id="' + esc(order.id) + '">Accept &amp; Craft</button>' : "") +
        (canOutForDelivery ? '<button type="button" data-order-status="out_for_delivery" data-order-id="' + esc(order.id) + '">Out for delivery</button>' : "") +
        (canDeliver ? '<button type="button" data-order-status="delivered" data-order-id="' + esc(order.id) + '">Mark delivered</button>' : "") +
        (canCancel ? '<button type="button" data-order-status="cancelled" data-order-id="' + esc(order.id) + '">Approve cancellation</button>' : "") +
        (canReturn ? '<button type="button" data-order-status="returned" data-order-id="' + esc(order.id) + '">Approve return</button>' : "") +
        (!["declined", "cancelled", "returned", "delivered"].includes(order.status) ? '<button type="button" class="decline-order" data-order-status="declined" data-order-id="' + esc(order.id) + '">Decline order</button>' : "");

      const formattedDate = order.created_at ? new Date(order.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST" : "";
      const itemsList = (order.items || []).map((item) => `${item.quantity} × ${esc(item.name)} (₹${item.unit_price})`).join(" · ");

      return `
        <article class="order-card" data-order-card-id="${esc(order.id)}">
          <div class="order-card-head">
            <div>
              <strong>${esc(order.id)}</strong>
              <p>${formattedDate}</p>
            </div>
            <div class="order-badges">
              ${paymentPill}
              <span class="order-status status-${esc(order.status)}">${esc(order.status.replaceAll("_", " "))}</span>
            </div>
            <strong>${money(order.total)}</strong>
          </div>
          <p class="customer-row">
            <strong>${esc(order.customer_name || "Customer")}</strong> · ${esc(order.customer_email || "No email")} ${order.customer_phone ? " · " + esc(order.customer_phone) : ""} ${waLink}
          </p>
          ${fulfillment}
          <p class="order-address-line">${esc(orderAddress(order))}</p>
          <div class="order-items-summary">
            <small>${itemsList || "1 × Handcrafted Piece"}${order.coupon_code ? " · Coupon: " + esc(order.coupon_code) : ""}</small>
          </div>
          ${shipping}
          ${failure}
          ${gift}
          ${request}
          ${decision}
          <div class="order-actions">
            ${actions}
            <button type="button" class="copy-order-btn" data-copy-order="${esc(order.id)}" title="Copy customer delivery details & items">📋 Copy Details</button>
          </div>
        </article>
      `;
    }).join("");
  }

  function copyOrderDetails(orderId) {
    const cachedStr = localStorage.getItem("raycrafting_orders_cache");
    const all = (inMemoryOrders && inMemoryOrders.length) ? inMemoryOrders : (cachedStr ? JSON.parse(cachedStr) : []);
    const order = all.find((o) => o.id === orderId);
    if (!order) return;
    const addr = order.address || {};
    const street = [addr.line1, addr.line2].filter(Boolean).join(", ");
    const items = (order.items || []).map((i) => `• ${i.quantity}x ${i.name} (₹${i.unit_price})`).join("\n");
    const text = [
      `RAYCRAFTING ORDER: ${order.id}`,
      `Date: ${order.created_at ? new Date(order.created_at).toLocaleString("en-IN") : ""}`,
      `Customer: ${order.customer_name || addr.name || ""}`,
      `Phone: ${order.customer_phone || addr.phone || ""}`,
      `Address: ${street}, ${addr.city || ""}, ${addr.state || ""} - ${addr.postalCode || ""}`,
      `Fulfillment: ${order.fulfillment_method || "manual"}`,
      `Payment: ${order.payment_method === "cod" ? "Pay on Delivery (COD)" : "Online Paid"} (Status: ${order.status})`,
      `Items:\n${items}`,
      `Total: ₹${order.total}`
    ].join("\n");

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        window.alert(`✓ Order details for ${order.id} copied to clipboard! You can paste it into courier apps or notes.`);
      }).catch(() => {
        window.prompt("Copy order details:", text);
      });
    } else {
      window.prompt("Copy order details:", text);
    }
  }

  function hydrateOrdersFromCache(view = currentOrdersView) {
    try {
      const cachedStr = localStorage.getItem("raycrafting_orders_cache");
      if (!cachedStr) return false;
      const cachedOrders = JSON.parse(cachedStr);
      if (!Array.isArray(cachedOrders) || !cachedOrders.length) return false;

      inMemoryOrders = cachedOrders;
      updateMetricsUI(cachedOrders);

      let displayList = cachedOrders;
      if (view === "confirmed") {
        displayList = cachedOrders.filter((o) => (o.status !== "pending_payment" && o.status !== "failed_payment") || o.payment_method === "cod");
      } else if (view === "unpaid") {
        displayList = cachedOrders.filter((o) => (o.status === "pending_payment" || o.status === "failed_payment") && o.payment_method !== "cod");
      }

      const confirmedCount = cachedOrders.filter((o) => (o.status !== "pending_payment" && o.status !== "failed_payment") || o.payment_method === "cod").length;
      const unpaidCount = cachedOrders.filter((o) => (o.status === "pending_payment" || o.status === "failed_payment") && o.payment_method !== "cod").length;

      if ($("allCountPill")) $("allCountPill").textContent = `(${cachedOrders.length})`;
      if ($("confirmedCountPill")) $("confirmedCountPill").textContent = `(${confirmedCount})`;
      if ($("unpaidCountPill")) $("unpaidCountPill").textContent = `(${unpaidCount})`;

      renderOrdersList(displayList, view);
      return true;
    } catch {
      return false;
    }
  }

  function addOrdersPanel() {
    if ($("ordersPanel")) return;
    document.querySelector(".studio-grid").insertAdjacentHTML("afterend", `
      <section class="catalog-panel orders-panel" id="ordersPanel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Customer orders &amp; Live Audit Ledger</p>
            <h2>Orders &amp; Ledger</h2>
          </div>
          <div class="header-action-buttons">
            <button class="icon-text-button" id="refreshOrders" type="button" title="Fetch fresh updates">Refresh ↻</button>
          </div>
        </div>

        <!-- Credibility & Overview Metrics -->
        <div class="orders-credibility-bar" id="ordersMetricsBar">
          <div class="metric-card">
            <span class="metric-icon">📦</span>
            <div>
              <strong id="metricTotalOrders">0</strong>
              <label>Total Orders</label>
            </div>
          </div>
          <div class="metric-card highlight-revenue">
            <span class="metric-icon">💰</span>
            <div>
              <strong id="metricTotalRevenue">₹0</strong>
              <label>Confirmed Revenue</label>
            </div>
          </div>
          <div class="metric-card">
            <span class="metric-icon">🎨</span>
            <div>
              <strong id="metricActiveCrafting">0</strong>
              <label>Active in Crafting</label>
            </div>
          </div>
          <div class="metric-card">
            <span class="metric-icon">🚚</span>
            <div>
              <strong id="metricDelivered">0</strong>
              <label>Delivered / Completed</label>
            </div>
          </div>
        </div>

        <!-- Excel Ledger & Audit Log Toolbar -->
        <div class="orders-export-toolbar">
          <div class="export-actions-group">
            <button type="button" class="excel-download-button" id="downloadExcelOrdersBtn" title="Download all orders in Microsoft Excel / Google Sheets format (.csv)">
              <span class="excel-badge">XLS</span>
              <span>📊 Download Excel Ledger (.csv)</span>
            </button>
            <button type="button" class="excel-download-button secondary-ledger-btn" id="downloadActionLogBtn" title="Download chronological audit log of all order actions taken">
              <span>📜 Download Audit Action Log</span>
            </button>
          </div>
          <div class="ledger-credibility-note">
            <span>🛡️ Auto-updated on every customer order &amp; action</span>
          </div>
        </div>

        <!-- Order View Tab Strip -->
        <div class="orders-tab-strip">
          <button type="button" class="order-filter-tab ${currentOrdersView === "all" ? "active" : ""}" data-orders-view="all">
            🌟 All orders <span id="allCountPill"></span>
          </button>
          <button type="button" class="order-filter-tab ${currentOrdersView === "confirmed" ? "active" : ""}" data-orders-view="confirmed">
            ✓ Confirmed &amp; In Progress <span id="confirmedCountPill"></span>
          </button>
          <button type="button" class="order-filter-tab ${currentOrdersView === "unpaid" ? "active" : ""}" data-orders-view="unpaid">
            ⏳ Unpaid Drafts <span id="unpaidCountPill"></span>
          </button>
        </div>

        <!-- Orders Cards Container -->
        <div id="ordersList"><p class="field-help">Loading customer orders…</p></div>

        <!-- Studio Settings & Channels Box -->
        <div class="studio-settings-box">
          <div class="settings-title">
            <span>🌸</span>
            <div>
              <strong>Studio Settings &amp; Contact Channels</strong>
              <p>Customize your top inspiring quote banner, WhatsApp number, and Instagram Direct link.</p>
            </div>
          </div>
          <div class="settings-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
            <div>
              <label style="display:block;font-size:11px;font-weight:600;margin-bottom:4px;">WhatsApp Number</label>
              <input id="supportPhoneInput" placeholder="e.g. 919041915832" style="width:100%;margin:0;padding:9px 12px;">
              <small class="field-help">With country code (91...)</small>
            </div>
            <div>
              <label style="display:block;font-size:11px;font-weight:600;margin-bottom:4px;">Instagram Username / Link</label>
              <input id="instagramHandleInput" placeholder="e.g. raycrafting or @raycrafting" style="width:100%;margin:0;padding:9px 12px;">
              <small class="field-help">Direct DM chat opens on ig.me/m/username</small>
            </div>
          </div>
          <div style="margin-bottom:14px;padding-top:10px;border-top:1px dashed var(--line);">
            <label style="display:block;font-size:11px;font-weight:600;margin-bottom:4px;">Top Banner Inspiring Quote (Keep Spreading Good Quotes)</label>
            <input id="bannerQuoteInput" placeholder="e.g. “Where flowers bloom, so does hope.” — Handcrafted with love" style="width:100%;margin:0;padding:9px 12px;">
            <small class="field-help">Appears across the top ribbon of the store for every buyer to see.</small>
          </div>
          <button type="button" class="primary-button" id="saveSettingsBtn">Save Studio Settings &amp; Channels <span>→</span></button>
          <small id="settingsStatus" class="field-help" style="margin-top:8px;display:block;"></small>
        </div>
      </section>
    `);

    $("refreshOrders").addEventListener("click", () => loadOrders(currentOrdersView));

    $("downloadExcelOrdersBtn")?.addEventListener("click", downloadExcelLedger);
    $("downloadActionLogBtn")?.addEventListener("click", downloadActionAuditLog);

    $("ordersPanel").addEventListener("click", (e) => {
      const tab = e.target.closest("[data-orders-view]");
      if (tab) {
        currentOrdersView = tab.dataset.ordersView;
        localStorage.setItem("raycrafting_orders_tab", currentOrdersView);
        document.querySelectorAll(".order-filter-tab").forEach((t) => t.classList.toggle("active", t === tab));
        loadOrders(currentOrdersView);
      }
      if (e.target.closest("#saveSettingsBtn")) {
        saveSettings();
      }
      const copyBtn = e.target.closest("[data-copy-order]");
      if (copyBtn) {
        copyOrderDetails(copyBtn.dataset.copyOrder);
      }
    });

    const directSaveBtn = $("saveSettingsBtn");
    if (directSaveBtn) directSaveBtn.addEventListener("click", saveSettings);

    // Instant hydration from cache so orders NEVER disappear on refresh!
    hydrateOrdersFromCache(currentOrdersView);
    loadOrders(currentOrdersView);
    loadSettings();
  }

  function fulfillmentLabel(order) {
    if (order.fulfillment_method === "self_pickup") return "Self pickup";
    if (order.fulfillment_method === "manual") return "Manual delivery";
    return "Manual delivery";
  }

  function orderAddress(order) {
    if (order.fulfillment_method === "self_pickup") return "Self pickup — collection instructions will be shared after acceptance.";
    const address = order.address || {};
    return [address.name, address.line1, address.line2, address.city, address.state, address.postalCode].filter(Boolean).join(", ");
  }

  async function loadOrders(view = currentOrdersView) {
    const target = $("ordersList");
    if (!adminToken()) {
      // If we have cached orders, render them anyway, but remind user
      if (!hydrateOrdersFromCache(view)) {
        if (target) target.innerHTML = '<p class="field-help">Unlock Seller Studio with your PIN to view live customer orders.</p>';
      }
      return;
    }

    try {
      const response = await fetch(`/api/admin/orders?view=${encodeURIComponent(view)}`, {
        headers: { "x-admin-token": adminToken() },
        cache: "no-store"
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        expireSellerSession();
        throw new Error("Seller session expired. Enter your studio PIN again.");
      }
      if (!response.ok) throw new Error(data.error || "Could not load orders.");

      if (data.counts) {
        if ($("allCountPill")) $("allCountPill").textContent = `(${data.counts.all || 0})`;
        if ($("confirmedCountPill")) $("confirmedCountPill").textContent = `(${data.counts.confirmed || 0})`;
        if ($("unpaidCountPill")) $("unpaidCountPill").textContent = `(${data.counts.unpaid || 0})`;
      }

      if (data.metrics) {
        updateMetricsUI([], data.metrics);
      }

      const orders = Array.isArray(data.orders) ? data.orders : [];
      renderOrdersList(orders, view);

      // If view is 'all', save directly to cache
      if (view === "all") {
        inMemoryOrders = orders;
        try { localStorage.setItem("raycrafting_orders_cache", JSON.stringify(orders)); } catch {}
      } else {
        // Fetch all in background to keep cache complete
        fetch(`/api/admin/orders?view=all`, {
          headers: { "x-admin-token": adminToken() },
          cache: "no-store"
        }).then((res) => res.json()).then((allData) => {
          if (Array.isArray(allData.orders)) {
            inMemoryOrders = allData.orders;
            try { localStorage.setItem("raycrafting_orders_cache", JSON.stringify(allData.orders)); } catch {}
            if (allData.metrics) updateMetricsUI([], allData.metrics);
          }
        }).catch(() => {});
      }
    } catch (error) {
      if (!hydrateOrdersFromCache(view)) {
        if (target) target.innerHTML = '<p class="field-help">' + esc(error.message) + '</p>';
      }
    }
  }

  async function updateFulfillment(orderId, fulfillmentMethod) {
    const response = await fetch("/api/admin/orders/fulfillment", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": adminToken() },
      body: JSON.stringify({ orderId, fulfillmentMethod })
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { expireSellerSession(); window.alert("Your seller session expired. Enter your studio PIN again."); return; }
    if (!response.ok) { window.alert(data.error || "Could not update the delivery method."); return; }
    loadOrders(currentOrdersView);
  }

  async function updateOrderStatus(orderId, status) {
    let reason = "";
    if (status === "declined") {
      reason = window.prompt("Why are you declining this order? This reason will be shown to the customer:") || "";
      if (!reason.trim()) return;
    }
    if (["cancelled", "returned"].includes(status) && !window.confirm(`Confirm ${status === "cancelled" ? "cancellation" : "return"} for this order?`)) return;
    const response = await fetch("/api/admin/orders/status", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": adminToken() },
      body: JSON.stringify({ orderId, status, reason: reason.trim() })
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { expireSellerSession(); window.alert("Your seller session expired. Enter your studio PIN again."); return; }
    if (!response.ok) { window.alert(data.error || "Could not update order."); return; }
    loadOrders(currentOrdersView);
  }

  function wireProductDiscount() {
    addDiscountField();
    const form = $("productForm"); if (!form) return;
    document.querySelector("#catalogList").addEventListener("click", (event) => {
      const edit = event.target.closest("[data-edit]");
      if (edit) setTimeout(() => {
        const product = products().find((item) => item.id === edit.dataset.edit);
        if ($("productOriginalPrice")) $("productOriginalPrice").value = product?.originalPrice || product?.original_price || "";
      }, 0);
    });
    $("newProductButton").addEventListener("click", () => { if ($("productOriginalPrice")) $("productOriginalPrice").value = ""; });
    setInterval(decorateCatalog, 800);
  }

  function init() {
    const style = document.createElement("style");
    style.textContent = `
      .orders-panel { margin-top: 24px; }
      .header-action-buttons { display: flex; gap: 8px; align-items: center; }
      .orders-credibility-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 18px 0; }
      .metric-card { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: #fffcf7; border: 1px solid rgba(196, 95, 124, 0.18); border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.03); }
      .metric-card.highlight-revenue { background: linear-gradient(135deg, #fdf6ec, #fefbf7); border-color: rgba(212, 137, 24, 0.35); }
      .metric-icon { font-size: 24px; line-height: 1; }
      .metric-card strong { display: block; font: 700 18px var(--serif, serif); color: var(--ink); line-height: 1.2; }
      .metric-card label { display: block; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-top: 2px; }
      .orders-export-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; background: #fdfbf7; border: 1px solid var(--line); border-radius: 10px; margin-bottom: 16px; }
      .export-actions-group { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
      .excel-download-button { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; background: #107c41; color: #fff !important; font: 600 11.5px var(--sans); border-radius: 8px; border: none; cursor: pointer; text-decoration: none; box-shadow: 0 2px 6px rgba(16, 124, 65, 0.2); transition: all 0.2s ease; }
      .excel-download-button:hover { background: #0b5c30; transform: translateY(-1px); box-shadow: 0 4px 10px rgba(16, 124, 65, 0.28); }
      .excel-badge { display: inline-block; padding: 2px 4px; background: rgba(255,255,255,0.22); border-radius: 4px; font: 700 9px var(--mono); letter-spacing: 0.04em; }
      .excel-download-button.secondary-ledger-btn { background: #4a5568; box-shadow: 0 2px 6px rgba(74, 85, 104, 0.2); }
      .excel-download-button.secondary-ledger-btn:hover { background: #2d3748; }
      .ledger-credibility-note { font-size: 11px; color: var(--muted); font-weight: 500; }
      .orders-tab-strip { display: flex; gap: 8px; margin: 0 0 16px; border-bottom: 1px solid var(--line); padding-bottom: 10px; flex-wrap: wrap; }
      .order-filter-tab { border: 1px solid var(--line); background: transparent; padding: 7px 14px; font: 600 11.5px var(--sans); border-radius: 999px; cursor: pointer; color: var(--muted); transition: all 0.15s ease; }
      .order-filter-tab:hover { color: var(--ink); border-color: var(--ink); }
      .order-filter-tab.active { background: var(--ink); color: #fff; border-color: var(--ink); }
      .order-badges { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .payment-badge-online { padding: 3px 7px; background: #dfeada; color: #356230; font: 600 9px var(--mono); text-transform: uppercase; border-radius: 4px; }
      .payment-badge-cod { padding: 3px 7px; background: #fff1cf; color: #825f0e; font: 600 9px var(--mono); text-transform: uppercase; border-radius: 4px; }
      .payment-badge-unpaid { padding: 3px 7px; background: #f0eeea; color: #7a7670; font: 600 9px var(--mono); text-transform: uppercase; border-radius: 4px; }
      .payment-badge-failed { padding: 3px 7px; background: #fbe0da; color: #a74232; font: 600 9px var(--mono); text-transform: uppercase; border-radius: 4px; }
      .whatsapp-customer-btn { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: #25d366; color: #fff !important; border-radius: 999px; font-size: 10.5px; font-weight: 600; text-decoration: none; margin-left: 6px; }
      .whatsapp-customer-btn:hover { background: #20ba5a; }
      .customer-row { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin: 6px 0; color: var(--muted); font-size: 11.5px; }
      .order-address-line { margin: 6px 0; color: var(--ink); font-size: 11.5px; line-height: 1.4; }
      .order-items-summary { margin: 6px 0; padding: 6px 8px; background: #fcf9f5; border-radius: 6px; }
      .copy-order-btn { border: 1px dashed var(--line); background: #fff; padding: 6px 10px; font-size: 10.5px; font-weight: 600; border-radius: 6px; cursor: pointer; color: var(--ink); }
      .copy-order-btn:hover { border-color: var(--ink); background: #faf8f5; }
      .studio-settings-box { margin-top: 32px; padding: 22px; background: #fffdf9; border: 1px solid rgba(196, 95, 124, 0.22); border-radius: 14px; }
      .settings-title { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 14px; }
      .settings-title span { font-size: 22px; line-height: 1; }
      .settings-title strong { font-size: 13px; display: block; }
      .settings-title p { margin: 3px 0 0; color: var(--muted); font-size: 11px; }
      .order-card { border-bottom: 1px solid var(--line); padding: 18px 0; }
      .order-card:last-child { border-bottom: 0; }
      .fulfillment-meta { display: inline-block; margin: 9px 0 2px; padding: 5px 8px; background: #f1eee8; color: var(--ink); font: 9px var(--mono); text-transform: uppercase; letter-spacing: .04em; border-radius: 4px; }
      .shipping-meta { padding: 8px 10px; background: #e8f0e5; color: #557351; font-size: 10.5px; border-radius: 6px; }
      .order-card-head { display: grid; grid-template-columns: 1fr auto auto; gap: 15px; align-items: start; }
      .order-card-head p { margin: 4px 0 0; font-size: 11px; color: var(--muted); }
      .order-status { padding: 4px 7px; font: 9px var(--mono); text-transform: uppercase; letter-spacing: .04em; background: #f1eee8; border-radius: 4px; }
      .status-paid, .status-processing, .status-shipped, .status-out_for_delivery, .status-delivered { background: #dfeada; color: #557351; }
      .status-pending_payment, .status-cancel_requested, .status-return_requested { background: #fff1cf; color: #98721a; }
      .status-failed_payment, .status-declined { background: #fbe0da; color: #a74232; }
      .order-alert { padding: 8px 10px; background: #fff1cf; color: #765d20; border-radius: 6px; margin: 6px 0; }
      .order-alert.failed, .order-alert.declined { background: #fbe0da; color: #a74232; }
      .order-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 13px; align-items: center; }
      .order-actions button { border: 1px solid var(--line); background: transparent; padding: 7px 11px; font-size: 10.5px; font-weight: 600; border-radius: 6px; cursor: pointer; }
      .order-actions button:hover { border-color: var(--coral); color: var(--coral-dark); }
      .order-actions .decline-order { color: var(--coral-dark); }
      .orders-empty-state { padding: 24px 16px; text-align: center; background: #fffcf7; border: 1px dashed var(--line); border-radius: 12px; margin: 12px 0; }
      @media(max-width:600px) {
        .order-card-head { grid-template-columns: 1fr auto; }
        .order-card-head > strong:last-child { grid-column: 2; grid-row: 1; }
        .orders-export-toolbar { flex-direction: column; align-items: flex-start; }
      }
    `;
    document.head.appendChild(style);
    document.querySelector("#accessForm")?.addEventListener("submit", () => sessionStorage.removeItem("raycrafting-admin-pin"));
    addDiscountField();
    wireProductDiscount();
    addOrdersPanel();
    $("ordersList").addEventListener("click", (event) => {
      const statusButton = event.target.closest("[data-order-status]");
      if (statusButton) updateOrderStatus(statusButton.dataset.orderId, statusButton.dataset.orderStatus);
      const fulfillmentButton = event.target.closest("[data-fulfillment]");
      if (fulfillmentButton) updateFulfillment(fulfillmentButton.dataset.orderId, fulfillmentButton.dataset.fulfillment);
    });
    window.addEventListener("raycrafting-admin-unlocked", () => {
      loadSettings();
      loadOrders(currentOrdersView);
    });
  }
  init();
}());
