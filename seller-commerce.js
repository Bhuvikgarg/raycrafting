(function () {
  "use strict";
  const key = window.RAYCRAFTING_STORAGE_KEY;
  const $ = (id) => document.getElementById(id);
  const products = () => JSON.parse(localStorage.getItem(key) || "null") || (window.RAYCRAFTING_DEFAULT_PRODUCTS || []).map((product) => ({ ...product }));
  const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value) || 0);
  const esc = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  function adminToken() { return sessionStorage.getItem("raycrafting-admin-token") || ""; }
  function expireSellerSession() {
    sessionStorage.removeItem("raycrafting-admin-token");
    sessionStorage.removeItem("raycrafting-studio-unlocked");
    const modal = $("accessModal");
    if (modal) modal.classList.remove("unlocked");
    const error = $("accessError");
    if (error) error.textContent = "Your seller session expired. Enter your studio PIN again.";
  }
  async function syncProducts() {
    const response = await fetch("/api/admin/products/sync", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": adminToken() }, body: JSON.stringify({ products: products() }) });
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
    document.querySelectorAll(".catalog-item").forEach((item) => { const edit = item.querySelector("[data-edit]"); const product = edit && map.get(edit.dataset.edit); if (!product) return; const old = Number(product.originalPrice) > Number(product.price) ? `<del>${money(product.originalPrice)}</del> ` : ""; const price = item.querySelector(".catalog-price"); if (price) price.innerHTML = `${old}${money(product.price)}`; });
  }
  let currentOrdersView = "confirmed";

  async function loadSettings() {
    if (!adminToken()) return;
    try {
      const res = await fetch("/api/admin/settings", { headers: { "x-admin-token": adminToken() } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.supportPhone && $("supportPhoneInput")) $("supportPhoneInput").value = data.supportPhone;
        if (data.instagramHandle && $("instagramHandleInput")) $("instagramHandleInput").value = data.instagramHandle;
      }
    } catch {}
  }

  async function saveSettings() {
    const phoneInput = $("supportPhoneInput");
    const instaInput = $("instagramHandleInput");
    const status = $("settingsStatus");
    if (!status) return;
    status.textContent = "Saving…";
    try {
      const phone = phoneInput ? phoneInput.value.trim() : "";
      const insta = instaInput ? instaInput.value.trim().replace(/^@/, "") : "";
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": adminToken() },
        body: JSON.stringify({ supportPhone: phone, instagramHandle: insta })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save settings.");
      status.textContent = "✓ Channels saved! WhatsApp and Instagram Direct chat links updated.";
      setTimeout(() => { status.textContent = ""; }, 4000);
    } catch (err) {
      status.textContent = err.message;
    }
  }

  function addOrdersPanel() {
    if ($("ordersPanel")) return;
    document.querySelector(".studio-grid").insertAdjacentHTML("afterend", `
      <section class="catalog-panel orders-panel" id="ordersPanel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Customer orders</p>
            <h2>Orders</h2>
          </div>
          <button class="icon-text-button" id="refreshOrders" type="button">Refresh ↻</button>
        </div>

        <div class="orders-tab-strip">
          <button type="button" class="order-filter-tab active" data-orders-view="confirmed">✓ Confirmed orders <span id="confirmedCountPill"></span></button>
          <button type="button" class="order-filter-tab" data-orders-view="unpaid">⏳ Unpaid / Incomplete <span id="unpaidCountPill"></span></button>
        </div>

        <div id="ordersList"><p class="field-help">Loading orders…</p></div>

        <div class="studio-settings-box">
          <div class="settings-title">
            <span>📱</span>
            <div>
              <strong>WhatsApp & Instagram Channels</strong>
              <p>Direct chat links for buyers to reach you on WhatsApp and Instagram Direct.</p>
            </div>
          </div>
          <div class="settings-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
            <div>
              <label style="display:block;font-size:11px;font-weight:600;margin-bottom:4px;">WhatsApp Number</label>
              <input id="supportPhoneInput" placeholder="e.g. 919041915832" style="width:100%;margin:0;padding:9px 12px;">
              <small class="field-help">With country code (91...)</small>
            </div>
            <div>
              <label style="display:block;font-size:11px;font-weight:600;margin-bottom:4px;">Instagram Username</label>
              <input id="instagramHandleInput" placeholder="e.g. raycrafting or @raycrafting" style="width:100%;margin:0;padding:9px 12px;">
              <small class="field-help">Direct DM chat opens on ig.me</small>
            </div>
          </div>
          <button type="button" class="primary-button" id="saveSettingsBtn">Save Contact Channels <span>→</span></button>
          <small id="settingsStatus" class="field-help" style="margin-top:8px;display:block;"></small>
        </div>
      </section>
    `);

    $("refreshOrders").addEventListener("click", () => loadOrders(currentOrdersView));
    $("ordersPanel").addEventListener("click", (e) => {
      const tab = e.target.closest("[data-orders-view]");
      if (tab) {
        currentOrdersView = tab.dataset.ordersView;
        document.querySelectorAll(".order-filter-tab").forEach((t) => t.classList.toggle("active", t === tab));
        loadOrders(currentOrdersView);
      }
      if (e.target.id === "saveSettingsBtn") {
        saveSettings();
      }
    });

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
    if (!adminToken()) { target.innerHTML = '<p class="field-help">Unlock Seller Studio to view customer orders.</p>'; return; }
    try {
      const response = await fetch(`/api/admin/orders?view=${encodeURIComponent(view)}`, { headers: { "x-admin-token": adminToken() }, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) { expireSellerSession(); throw new Error("Seller session expired. Enter your studio PIN again."); }
      if (!response.ok) throw new Error(data.error || "Could not load orders.");

      if (data.counts) {
        if ($("confirmedCountPill")) $("confirmedCountPill").textContent = `(${data.counts.confirmed || 0})`;
        if ($("unpaidCountPill")) $("unpaidCountPill").textContent = `(${data.counts.unpaid || 0})`;
      }

      target.innerHTML = data.orders.length ? data.orders.map((order) => {
        const isCod = order.payment_method === "cod";
        const canProcess = order.status === "paid" || (isCod && order.status === "processing");
        const canShip = order.status === "processing";
        const canOutForDelivery = order.status === "shipped";
        const canDeliver = order.status === "out_for_delivery";
        const canCancel = order.status === "cancel_requested";
        const canReturn = order.status === "return_requested";

        let paymentPill = `<span class="payment-badge-online">✓ Paid Online</span>`;
        if (isCod) paymentPill = `<span class="payment-badge-cod">📦 Pay on Delivery (COD)</span>`;
        else if (order.status === "pending_payment") paymentPill = `<span class="payment-badge-unpaid">⏳ Unpaid Draft</span>`;
        else if (order.status === "failed_payment") paymentPill = `<span class="payment-badge-failed">❌ Payment Failed</span>`;

        const failure = order.failure_reason ? '<p class="order-alert failed"><strong>Payment issue:</strong> ' + esc(order.failure_reason) + '</p>' : "";
        const gift = order.gift_message ? '<p class="order-alert" style="background:#fff2f6;border-color:var(--coral);color:#8a3b53;"><strong>💌 Gift note:</strong> "' + esc(order.gift_message) + '"</p>' : "";
        const request = order.customer_request_reason ? '<p class="order-alert"><strong>Customer request:</strong> ' + esc(order.customer_request_reason) + '</p>' : "";
        const decision = order.decision_reason ? '<p class="order-alert declined"><strong>Seller reason:</strong> ' + esc(order.decision_reason) + '</p>' : "";
        const shippingAwb = order["shiprocket_awb"]; const shippingCourier = order["shiprocket_courier"]; const shipping = shippingAwb ? '<p class="shipping-meta"><strong>Tracking reference:</strong> ' + esc(shippingAwb) + (shippingCourier ? " · " + esc(shippingCourier) : "") + '</p>' : "";
        const fulfillment = '<div class="fulfillment-meta"><strong>' + esc(fulfillmentLabel(order)) + '</strong>' + (order.fulfillment_method !== "self_pickup" ? " · " + esc(order.shipping_status || "Standard dispatch") : "") + '</div>';

        const cleanPhone = String(order.customer_phone || order.address?.phone || "").replace(/\D/g, "");
        const waLink = cleanPhone ? `<a class="whatsapp-customer-btn" target="_blank" rel="noopener noreferrer" href="https://wa.me/${cleanPhone.startsWith("91") ? cleanPhone : "91" + cleanPhone}?text=${encodeURIComponent(`Hi ${order.customer_name || ""}, this is Raycrafting regarding your order ${order.id}!`)}">💬 Chat on WhatsApp</a>` : "";

        const actions = (order.status === "processing" ? '<button type="button" data-order-status="shipped" data-order-id="' + esc(order.id) + '">Mark shipped</button>' : "") + (canProcess && order.status === "paid" ? '<button type="button" data-order-status="processing" data-order-id="' + esc(order.id) + '">Accept &amp; Craft</button>' : "") + (canOutForDelivery ? '<button type="button" data-order-status="out_for_delivery" data-order-id="' + esc(order.id) + '">Out for delivery</button>' : "") + (canDeliver ? '<button type="button" data-order-status="delivered" data-order-id="' + esc(order.id) + '">Mark delivered</button>' : "") + (canCancel ? '<button type="button" data-order-status="cancelled" data-order-id="' + esc(order.id) + '">Approve cancellation</button>' : "") + (canReturn ? '<button type="button" data-order-status="returned" data-order-id="' + esc(order.id) + '">Approve return</button>' : "") + (!["declined", "cancelled", "returned", "delivered"].includes(order.status) ? '<button type="button" class="decline-order" data-order-status="declined" data-order-id="' + esc(order.id) + '">Decline order</button>' : "");

        return '<article class="order-card"><div class="order-card-head"><div><strong>' + esc(order.id) + '</strong><p>' + new Date(order.created_at).toLocaleString("en-IN") + '</p></div><div class="order-badges">' + paymentPill + '<span class="order-status status-' + esc(order.status) + '">' + esc(order.status.replaceAll("_", " ")) + '</span></div><strong>' + money(order.total) + '</strong></div><p class="customer-row"><strong>' + esc(order.customer_name) + '</strong> · ' + esc(order.customer_email) + (order.customer_phone ? " · " + esc(order.customer_phone) : "") + ' ' + waLink + '</p>' + fulfillment + '<p>' + esc(orderAddress(order)) + '</p><small>' + order.items.map((item) => item.quantity + " × " + esc(item.name)).join(" · ") + (order.coupon_code ? " · Coupon: " + esc(order.coupon_code) : "") + '</small>' + shipping + failure + gift + request + decision + '<div class="order-actions">' + actions + '</div></article>';
      }).join("") : (view === "confirmed" ? '<p class="field-help">No confirmed orders yet. When customers complete payment or choose Pay on Delivery, orders will appear here!</p>' : '<p class="field-help">No incomplete or unpaid checkout sessions.</p>');
    } catch (error) { target.innerHTML = '<p class="field-help">' + esc(error.message) + '</p>'; }
  }

  async function updateFulfillment(orderId, fulfillmentMethod) {
    const response = await fetch("/api/admin/orders/fulfillment", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": adminToken() }, body: JSON.stringify({ orderId, fulfillmentMethod }) });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { expireSellerSession(); window.alert("Your seller session expired. Enter your studio PIN again."); return; }
    if (!response.ok) { window.alert(data.error || "Could not update the delivery method."); return; }
    loadOrders();
  }

  async function updateOrderStatus(orderId, status) {
    let reason = "";
    if (status === "declined") { reason = window.prompt("Why are you declining this order? This reason will be shown to the customer:") || ""; if (!reason.trim()) return; }
    if (["cancelled", "returned"].includes(status) && !window.confirm(`Confirm ${status === "cancelled" ? "cancellation" : "return"} for this order?`)) return;
    const response = await fetch("/api/admin/orders/status", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": adminToken() }, body: JSON.stringify({ orderId, status, reason: reason.trim() }) });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { expireSellerSession(); window.alert("Your seller session expired. Enter your studio PIN again."); return; }
    if (!response.ok) { window.alert(data.error || "Could not update order."); return; }
    loadOrders();
  }

  function wireProductDiscount() {
    addDiscountField();
    const form = $("productForm"); if (!form) return;
    form.addEventListener("submit", () => { const name = $("productName").value.trim(); const editingId = $("productId").value; const original = Number($("productOriginalPrice").value) || 0; setTimeout(async () => { const current = products(); const product = current.find((item) => item.id === editingId) || current.find((item) => item.name === name); if (!product) return; product.originalPrice = original > Number(product.price) ? original : 0; localStorage.setItem(key, JSON.stringify(current)); try { await syncProducts(); $("saveStatus").textContent = "Saved to the public shop."; } catch (error) { $("saveStatus").textContent = error.message; showToast(error.message); } decorateCatalog(); }, 80); });
    document.querySelector("#catalogList").addEventListener("click", (event) => { const edit = event.target.closest("[data-edit]"); const remove = event.target.closest("[data-delete]"); const toggle = event.target.closest("[data-toggle-active]"); if (edit) setTimeout(() => { const product = products().find((item) => item.id === edit.dataset.edit); if ($("productOriginalPrice")) $("productOriginalPrice").value = product?.originalPrice || ""; }, 0); if (remove || toggle) setTimeout(async () => { try { await syncProducts(); $("saveStatus").textContent = toggle ? "Product visibility synced to the public shop." : "Catalog deletion synced to the public shop."; } catch (error) { $("saveStatus").textContent = error.message; showToast(error.message); } }, 100); });
    $("newProductButton").addEventListener("click", () => { if ($("productOriginalPrice")) $("productOriginalPrice").value = ""; });
    $("resetButton").addEventListener("click", () => setTimeout(async () => { try { await syncProducts(); $("saveStatus").textContent = "Demo catalog synced to the public shop."; } catch (error) { $("saveStatus").textContent = error.message; showToast(error.message); } }, 100));
    setInterval(decorateCatalog, 800);
  }

  function init() {
    const style = document.createElement("style");
    style.textContent = `
      .orders-panel { margin-top: 20px; }
      .orders-tab-strip { display: flex; gap: 8px; margin: 0 0 16px; border-bottom: 1px solid var(--line); padding-bottom: 10px; }
      .order-filter-tab { border: 1px solid var(--line); background: transparent; padding: 7px 12px; font: 600 11px var(--sans); border-radius: 999px; cursor: pointer; color: var(--muted); }
      .order-filter-tab:hover { color: var(--ink); border-color: var(--ink); }
      .order-filter-tab.active { background: var(--ink); color: #fff; border-color: var(--ink); }
      .order-badges { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .payment-badge-online { padding: 3px 7px; background: #dfeada; color: #356230; font: 600 9px var(--mono); text-transform: uppercase; border-radius: 4px; }
      .payment-badge-cod { padding: 3px 7px; background: #fff1cf; color: #825f0e; font: 600 9px var(--mono); text-transform: uppercase; border-radius: 4px; }
      .payment-badge-unpaid { padding: 3px 7px; background: #f0eeea; color: #7a7670; font: 600 9px var(--mono); text-transform: uppercase; border-radius: 4px; }
      .payment-badge-failed { padding: 3px 7px; background: #fbe0da; color: #a74232; font: 600 9px var(--mono); text-transform: uppercase; border-radius: 4px; }
      .whatsapp-customer-btn { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: #25d366; color: #fff !important; border-radius: 999px; font-size: 10.5px; font-weight: 600; text-decoration: none; margin-left: 6px; }
      .whatsapp-customer-btn:hover { background: #20ba5a; }
      .customer-row { display: flex; align-items: center; flex-wrap: wrap; }
      .studio-settings-box { margin-top: 32px; padding: 22px; background: #fffdf9; border: 1px solid rgba(196, 95, 124, 0.22); border-radius: 14px; }
      .settings-title { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 14px; }
      .settings-title span { font-size: 22px; line-height: 1; }
      .settings-title strong { font-size: 13px; display: block; }
      .settings-title p { margin: 3px 0 0; color: var(--muted); font-size: 11px; }
      .settings-inline-row { display: flex; gap: 10px; align-items: stretch; }
      .settings-inline-row input { max-width: 320px; margin: 0; padding: 9px 12px; }
      .settings-inline-row button { margin: 0; white-space: nowrap; padding: 9px 16px; }
      .order-card { border-bottom: 1px solid var(--line); padding: 16px 0; }
      .order-card:last-child { border-bottom: 0; }
      .order-card p { margin: 6px 0; color: var(--muted); font-size: 11px; }
      .order-card small { color: var(--muted); font-size: 10px; }
      .fulfillment-meta { display: inline-block; margin: 9px 0 2px; padding: 5px 8px; background: #f1eee8; color: var(--ink); font: 9px var(--mono); text-transform: uppercase; letter-spacing: .04em; }
      .shipping-meta { padding: 8px 10px; background: #e8f0e5; color: #557351; font-size: 10px; }
      .order-card-head { display: grid; grid-template-columns: 1fr auto auto; gap: 15px; align-items: start; }
      .order-card-head p { margin: 4px 0 0; }
      .order-status { padding: 4px 7px; font: 9px var(--mono); text-transform: uppercase; letter-spacing: .04em; background: #f1eee8; }
      .status-paid, .status-processing, .status-shipped, .status-out_for_delivery, .status-delivered { background: #dfeada; color: #557351; }
      .status-pending_payment, .status-cancel_requested, .status-return_requested { background: #fff1cf; color: #98721a; }
      .status-failed_payment, .status-declined { background: #fbe0da; color: #a74232; }
      .order-alert { padding: 8px 10px; background: #fff1cf; color: #765d20; }
      .order-alert.failed, .order-alert.declined { background: #fbe0da; color: #a74232; }
      .order-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 13px; }
      .order-actions button { border: 1px solid var(--line); background: transparent; padding: 8px 10px; font-size: 10px; }
      .order-actions button:hover { border-color: var(--coral); color: var(--coral-dark); }
      .order-actions .decline-order { color: var(--coral-dark); }
      @media(max-width:500px) {
        .order-card-head { grid-template-columns: 1fr auto; }
        .order-card-head > strong:last-child { grid-column: 2; grid-row: 1; }
        .settings-inline-row { flex-direction: column; }
      }
    `;
    document.head.appendChild(style);
    document.querySelector("#accessForm")?.addEventListener("submit", () => sessionStorage.removeItem("raycrafting-admin-pin"));
    addDiscountField(); wireProductDiscount(); addOrdersPanel();
    $("ordersList").addEventListener("click", (event) => {
      const statusButton = event.target.closest("[data-order-status]");
      if (statusButton) updateOrderStatus(statusButton.dataset.orderId, statusButton.dataset.orderStatus);
      const fulfillmentButton = event.target.closest("[data-fulfillment]");
      if (fulfillmentButton) updateFulfillment(fulfillmentButton.dataset.orderId, fulfillmentButton.dataset.fulfillment);
    });
  }
  init();
}());
