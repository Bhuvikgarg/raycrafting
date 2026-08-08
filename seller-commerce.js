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
  function addDiscountField() {
    const price = $("productPrice"); if (!price || $("productOriginalPrice")) return;
    price.closest("label").childNodes[0].textContent = "Final price (₹)";
    price.closest("label").insertAdjacentHTML("afterend", '<label>Regular price (₹)<input id="productOriginalPrice" type="number" min="0" step="0.01" placeholder="Optional"><small class="field-help">Fill this only when the final price is discounted.</small></label>');
  }
  function decorateCatalog() {
    const map = new Map(products().map((product) => [product.id, product]));
    document.querySelectorAll(".catalog-item").forEach((item) => { const edit = item.querySelector("[data-edit]"); const product = edit && map.get(edit.dataset.edit); if (!product) return; const old = Number(product.originalPrice) > Number(product.price) ? `<del>${money(product.originalPrice)}</del> ` : ""; const price = item.querySelector(".catalog-price"); if (price) price.innerHTML = `${old}${money(product.price)}`; });
  }
  function addOrdersPanel() {
    if ($("ordersPanel")) return;
    document.querySelector(".studio-grid").insertAdjacentHTML("afterend", '<section class="catalog-panel orders-panel" id="ordersPanel"><div class="panel-heading"><div><p class="eyebrow">Customer orders</p><h2>Orders</h2></div><button class="icon-text-button" id="refreshOrders" type="button">Refresh ↻</button></div><div id="ordersList"><p class="field-help">Loading orders…</p></div></section>');
    $("refreshOrders").addEventListener("click", loadOrders); loadOrders();
  }
  async function loadOrders() {
    const target = $("ordersList");
    if (!adminToken()) { target.innerHTML = '<p class="field-help">Unlock Seller Studio to view customer orders.</p>'; return; }
    try {
      const response = await fetch("/api/admin/orders", { headers: { "x-admin-token": adminToken() }, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) { expireSellerSession(); throw new Error("Seller session expired. Enter your studio PIN again."); }
      if (!response.ok) throw new Error(data.error || "Could not load orders.");
      target.innerHTML = data.orders.length ? data.orders.map((order) => { const canProcess = order.status === "paid"; const canShip = order.status === "processing"; const canDeliver = order.status === "shipped"; const canCancel = order.status === "cancel_requested"; const canReturn = order.status === "return_requested"; const failure = order.failure_reason ? `<p class="order-alert failed"><strong>Payment failure:</strong> ${esc(order.failure_reason)}</p>` : ""; const request = order.customer_request_reason ? `<p class="order-alert"><strong>Customer request:</strong> ${esc(order.customer_request_reason)}</p>` : ""; const decision = order.decision_reason ? `<p class="order-alert declined"><strong>Seller reason:</strong> ${esc(order.decision_reason)}</p>` : ""; return `<article class="order-card"><div class="order-card-head"><div><strong>${esc(order.id)}</strong><p>${new Date(order.created_at).toLocaleString("en-IN")}</p></div><span class="order-status status-${esc(order.status)}">${esc(order.status.replaceAll("_", " "))}</span><strong>${money(order.total)}</strong></div><p><strong>${esc(order.customer_name)}</strong> · ${esc(order.customer_email)}${order.customer_phone ? ` · ${esc(order.customer_phone)}` : ""}</p><p>${esc(order.address.name)}, ${esc(order.address.line1)}${order.address.line2 ? `, ${esc(order.address.line2)}` : ""}, ${esc(order.address.city)}, ${esc(order.address.state)} – ${esc(order.address.postalCode)}</p><small>${order.items.map((item) => `${item.quantity} × ${esc(item.name)}`).join(" · ")}${order.coupon_code ? ` · Coupon: ${esc(order.coupon_code)}` : ""}</small>${failure}${request}${decision}<div class="order-actions">${canProcess ? `<button type="button" data-order-status="processing" data-order-id="${esc(order.id)}">Accept order</button>` : ""}${canShip ? `<button type="button" data-order-status="shipped" data-order-id="${esc(order.id)}">Mark shipped</button>` : ""}${canDeliver ? `<button type="button" data-order-status="delivered" data-order-id="${esc(order.id)}">Mark delivered</button>` : ""}${canCancel ? `<button type="button" data-order-status="cancelled" data-order-id="${esc(order.id)}">Approve cancellation</button>` : ""}${canReturn ? `<button type="button" data-order-status="returned" data-order-id="${esc(order.id)}">Approve return</button>` : ""}${!["declined","cancelled","returned","delivered"].includes(order.status) ? `<button type="button" class="decline-order" data-order-status="declined" data-order-id="${esc(order.id)}">Decline order</button>` : ""}</div></article>`; }).join("") : '<p class="field-help">No orders yet. Customer orders will appear here after checkout.</p>';
    } catch (error) { target.innerHTML = `<p class="field-help">${esc(error.message)}</p>`; }
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
    document.querySelector("#catalogList").addEventListener("click", (event) => { const edit = event.target.closest("[data-edit]"); const remove = event.target.closest("[data-delete]"); if (edit) setTimeout(() => { const product = products().find((item) => item.id === edit.dataset.edit); if ($("productOriginalPrice")) $("productOriginalPrice").value = product?.originalPrice || ""; }, 0); if (remove) setTimeout(async () => { try { await syncProducts(); $("saveStatus").textContent = "Catalog deletion synced to the public shop."; } catch (error) { $("saveStatus").textContent = error.message; showToast(error.message); } }, 100); });
    $("newProductButton").addEventListener("click", () => { if ($("productOriginalPrice")) $("productOriginalPrice").value = ""; });
    $("resetButton").addEventListener("click", () => setTimeout(async () => { try { await syncProducts(); $("saveStatus").textContent = "Demo catalog synced to the public shop."; } catch (error) { $("saveStatus").textContent = error.message; showToast(error.message); } }, 100));
    setInterval(decorateCatalog, 800);
  }
  function init() {
    const style = document.createElement("style"); style.textContent = `.orders-panel{margin-top:20px}.order-card{border-bottom:1px solid var(--line);padding:16px 0}.order-card:last-child{border-bottom:0}.order-card p{margin:6px 0;color:var(--muted);font-size:11px}.order-card small{color:var(--muted);font-size:10px}.order-card-head{display:grid;grid-template-columns:1fr auto auto;gap:15px;align-items:start}.order-card-head p{margin:4px 0 0}.order-status{padding:4px 7px;font:9px var(--mono);text-transform:uppercase;letter-spacing:.04em;background:#f1eee8}.status-paid,.status-processing,.status-shipped,.status-delivered{background:#dfeada;color:#557351}.status-pending_payment,.status-cancel_requested,.status-return_requested{background:#fff1cf;color:#98721a}.status-failed_payment,.status-declined{background:#fbe0da;color:#a74232}.order-alert{padding:8px 10px;background:#fff1cf;color:#765d20}.order-alert.failed,.order-alert.declined{background:#fbe0da;color:#a74232}.order-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:13px}.order-actions button{border:1px solid var(--line);background:transparent;padding:8px 10px;font-size:10px}.order-actions button:hover{border-color:var(--coral);color:var(--coral-dark)}.order-actions .decline-order{color:var(--coral-dark)}@media(max-width:500px){.order-card-head{grid-template-columns:1fr auto}.order-card-head>strong:last-child{grid-column:2;grid-row:1}}`; document.head.appendChild(style);
    document.querySelector("#accessForm")?.addEventListener("submit", () => sessionStorage.removeItem("raycrafting-admin-pin"));
    addDiscountField(); wireProductDiscount(); addOrdersPanel();
    $("ordersList").addEventListener("click", (event) => { const button = event.target.closest("[data-order-status]"); if (button) updateOrderStatus(button.dataset.orderId, button.dataset.orderStatus); });
  }
  init();
}());
