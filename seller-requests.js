(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var token = function () { return sessionStorage.getItem("raycrafting-admin-token") || ""; };
  var esc = function (value) { return String(value || "").replace(/[&<>\"]/g, function (character) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[character]; }); };
  var date = function (value) { try { return new Date(value).toLocaleString("en-IN"); } catch (error) { return value || ""; } };
  var statuses = ["new", "reviewing", "price_quoted", "contacted", "accepted", "in_progress", "ready", "completed", "declined"];
  var noteStatuses = ["new", "read", "replied", "archived"];
  function selectMarkup(values, current, attribute, id) { return "<select " + attribute + "=\"" + esc(id) + "\">" + values.map(function (value) { return "<option value=\"" + esc(value) + "\"" + (value === current ? " selected" : "") + ">" + esc(value.replaceAll("_", " ")) + "</option>"; }).join("") + "</select>"; }
  function addPanel() {
    if ($("requestsPanel")) return;
    var anchor = $("ordersPanel") || document.querySelector(".studio-grid");
    if (!anchor) return;
    anchor.insertAdjacentHTML("afterend", "<section class=\"catalog-panel requests-panel\" id=\"requestsPanel\"><div class=\"panel-heading\"><div><p class=\"eyebrow\">Made-to-order inbox</p><h2>Custom requests</h2></div><button class=\"icon-text-button\" id=\"refreshRequests\" type=\"button\">Refresh ↻</button></div><div class=\"request-block\"><h3>Custom orders</h3><div id=\"customOrdersList\"><p class=\"field-help\">Loading custom orders…</p></div></div><div class=\"request-block\"><h3>Notes for you</h3><div id=\"noteRequestsList\"><p class=\"field-help\">Loading notes…</p></div></div></section>");
    $("refreshRequests").addEventListener("click", loadAll);
    loadAll();
  }
  async function loadAll() { await Promise.all([loadCustomOrders(), loadNotes()]); }
  async function loadCustomOrders() {
    var target = $("customOrdersList"); if (!target) return;
    if (!token()) { target.innerHTML = "<p class=\"field-help\">Unlock Seller Studio to view custom orders.</p>"; return; }
    try { var response = await fetch("/api/admin/custom-orders", { headers: { "x-admin-token": token() }, cache: "no-store" }); var data = await response.json().catch(function () { return {}; }); if (!response.ok) throw new Error(data.error || "Could not load custom orders."); target.innerHTML = data.customOrders && data.customOrders.length ? data.customOrders.map(customMarkup).join("") : "<p class=\"field-help\">No custom ideas yet. New requests will appear here.</p>"; } catch (error) { target.innerHTML = "<p class=\"field-help\">" + esc(error.message) + "</p>"; }
  }
  function customMarkup(order) {
    var image = order.reference_image ? "<img class=\"request-image\" src=\"" + esc(order.reference_image) + "\" alt=\"Customer reference image\">" : "";
    var cleanPhone = String(order.phone || "").replace(/\D/g, "");
    var waPhone = cleanPhone.startsWith("91") ? cleanPhone : (cleanPhone ? "91" + cleanPhone : "");
    var waLink = waPhone ? "<a class=\"custom-wa-link\" target=\"_blank\" rel=\"noopener\" href=\"https://wa.me/" + waPhone + "?text=" + encodeURIComponent("Hi " + order.name + "! I saw your custom request #" + order.id + " on Raycrafting.") + "\">💬 WhatsApp</a>" : "";
    var priceBadge = order.buyer_price_request ? "<span class=\"custom-tag-quote\">🏷️ Buyer Requested Price Quote</span>" : "";
    var budgetInfo = order.budget_hint ? "<p class=\"custom-meta-pill\"><strong>Buyer expected budget:</strong> ₹" + esc(order.budget_hint) + "</p>" : "";
    var statusClass = "status-" + esc(order.status);
    return "<article class=\"request-card\" data-order-id=\"" + esc(order.id) + "\">" +
      "<div class=\"request-head\">" +
        "<div><strong>" + esc(order.id) + "</strong> <span class=\"order-status " + statusClass + "\">" + esc(order.status.replaceAll("_", " ")) + "</span>" + (order.quoted_price ? " <strong style=\"color:#557351\">₹" + esc(order.quoted_price) + "</strong>" : "") + "<p>" + esc(date(order.created_at)) + "</p></div>" +
        selectMarkup(statuses, order.status, "data-custom-status", order.id) +
      "</div>" +
      (priceBadge ? "<div style=\"margin:6px 0;\">" + priceBadge + "</div>" : "") +
      image +
      "<p><strong>" + esc(order.name) + "</strong> · <a href=\"mailto:" + esc(order.email) + "\">" + esc(order.email) + "</a>" + (order.phone ? " · " + esc(order.phone) + " " + waLink : "") + "</p>" +
      "<p>" + esc([order.city, order.state].filter(Boolean).join(", ")) + "</p>" +
      budgetInfo +
      "<p class=\"request-message\">" + esc(order.description) + "</p>" +
      "<div class=\"custom-price-edit-row\">" +
        "<label><strong>Quoted Price (₹)</strong><input type=\"number\" min=\"0\" step=\"1\" data-custom-price=\"" + esc(order.id) + "\" value=\"" + (order.quoted_price ? esc(order.quoted_price) : "") + "\" placeholder=\"e.g. 450\"></label>" +
      "</div>" +
      "<label>Seller note / message to buyer<textarea data-custom-note=\"" + esc(order.id) + "\" rows=\"2\" placeholder=\"e.g. Can craft with blush pink petals in 2 days. Delivery ₹60...\">" + esc(order.seller_note || "") + "</textarea></label>" +
      "<div class=\"custom-decision-bar\">" +
        "<button class=\"custom-btn-accept\" type=\"button\" data-custom-quick=\"accepted\" data-id=\"" + esc(order.id) + "\">✓ Accept Request</button>" +
        "<button class=\"custom-btn-decline\" type=\"button\" data-custom-quick=\"declined\" data-id=\"" + esc(order.id) + "\">✗ Reject Request</button>" +
        "<button class=\"custom-btn-quote\" type=\"button\" data-custom-quick=\"price_quoted\" data-id=\"" + esc(order.id) + "\">🏷️ Send Price Quote</button>" +
        "<button class=\"primary-button request-save\" type=\"button\" data-custom-save=\"" + esc(order.id) + "\">Save changes <span>→</span></button>" +
      "</div>" +
    "</article>";
  }
  async function saveCustom(orderId, button, overrideStatus) {
    var card = button.closest(".request-card");
    var statusSelect = card.querySelector("[data-custom-status]");
    var status = overrideStatus || (statusSelect ? statusSelect.value : "new");
    var noteInput = card.querySelector("[data-custom-note]");
    var priceInput = card.querySelector("[data-custom-price]");
    var sellerNote = noteInput ? noteInput.value.trim() : "";
    var quotedPrice = priceInput && priceInput.value.trim() !== "" ? Number(priceInput.value) : null;
    var originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      var response = await fetch("/api/admin/custom-orders/status", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": token() },
        body: JSON.stringify({ orderId: orderId, status: status, sellerNote: sellerNote, quotedPrice: quotedPrice })
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(data.error || "Could not save custom order.");
      button.textContent = "Saved ✓";
      setTimeout(loadCustomOrders, 600);
    } catch (err) {
      window.alert(err.message);
      button.textContent = originalText;
    } finally {
      button.disabled = false;
    }
  }
  async function loadNotes() { var target = $("noteRequestsList"); if (!target) return; if (!token()) { target.innerHTML = "<p class=\"field-help\">Unlock Seller Studio to view notes.</p>"; return; } try { var response = await fetch("/api/admin/note-requests", { headers: { "x-admin-token": token() }, cache: "no-store" }); var data = await response.json().catch(function () { return {}; }); if (!response.ok) throw new Error(data.error || "Could not load notes."); target.innerHTML = data.noteRequests && data.noteRequests.length ? data.noteRequests.map(noteMarkup).join("") : "<p class=\"field-help\">No notes yet.</p>"; } catch (error) { target.innerHTML = "<p class=\"field-help\">" + esc(error.message) + "</p>"; } }
  function noteMarkup(note) { return "<article class=\"request-card note-card\"><div class=\"request-head\"><div><strong>" + esc(note.name || "Anonymous note") + "</strong><p>" + esc(date(note.created_at)) + "</p></div>" + selectMarkup(noteStatuses, note.status, "data-note-status", note.id) + "</div><p><a href=\"mailto:" + esc(note.email) + "\">" + esc(note.email) + "</a> · " + esc(note.language) + " · " + esc(note.city) + ", " + esc(note.state) + "</p><p class=\"request-message\">" + esc(note.message) + "</p><button class=\"primary-button request-save\" type=\"button\" data-note-save=\"" + esc(note.id) + "\">Save note status <span>→</span></button></article>"; }
  async function saveNote(noteId, button) { var card = button.closest(".request-card"); var response = await fetch("/api/admin/note-requests/status", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": token() }, body: JSON.stringify({ noteId: noteId, status: card.querySelector("[data-note-status]").value }) }); var data = await response.json().catch(function () { return {}; }); if (!response.ok) throw new Error(data.error || "Could not save note status."); button.textContent = "Saved ✓"; setTimeout(loadNotes, 500); }
  function init() {
    var style = document.createElement("style");
    style.textContent = `
      .requests-panel{margin-top:20px}
      .request-block+ .request-block{margin-top:34px;padding-top:24px;border-top:1px solid var(--line)}
      .request-block h3{margin:0 0 10px;font:600 20px var(--display)}
      .request-card{padding:18px 0;border-bottom:1px solid var(--line)}
      .request-card:last-child{border-bottom:0}
      .request-head{display:flex;justify-content:space-between;gap:12px;align-items:start}
      .request-head p,.request-card>p{margin:5px 0;color:var(--muted);font-size:11px}
      .request-head select{width:auto;margin:0;padding:6px 8px;font:10px var(--mono);text-transform:uppercase}
      .request-card label{display:block;margin:12px 0 6px;font-size:11px;font-weight:600}
      .request-card textarea{min-height:58px;width:100%;border:1px solid var(--line);background:#fbf8f3;padding:8px 10px;font:12px var(--sans);margin-top:4px}
      .request-message{white-space:pre-wrap;padding:11px 12px;border-radius:10px;background:#fff0f4;color:var(--ink)!important;line-height:1.6}
      .request-image{display:block;width:min(280px,100%);max-height:230px;object-fit:cover;margin:12px 0;border-radius:12px}
      .request-save{padding:9px 12px}
      .custom-tag-quote{display:inline-block;padding:3px 9px;background:#fff1cf;color:#825f0e;font:600 10px var(--mono);border-radius:999px;text-transform:uppercase}
      .custom-meta-pill{font-size:11px;color:var(--ink);background:#f1eee8;padding:4px 8px;border-radius:4px;display:inline-block}
      .custom-wa-link{display:inline-flex;align-items:center;padding:2px 7px;background:#25d366;color:#fff!important;border-radius:999px;font-size:10px;font-weight:600;text-decoration:none;margin-left:6px}
      .custom-price-edit-row{margin:12px 0}
      .custom-price-edit-row input{width:min(200px,100%);border:1.5px solid var(--line);padding:7px 10px;font:13px var(--mono);background:#fff;border-radius:3px}
      .custom-price-edit-row input:focus{border-color:var(--coral)}
      .custom-decision-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}
      .custom-btn-accept{border:1px solid #557351;background:#dfeada;color:#2f532a;padding:8px 12px;font:600 11px var(--mono);border-radius:3px;cursor:pointer}
      .custom-btn-accept:hover{background:#557351;color:#fff}
      .custom-btn-decline{border:1px solid #a74232;background:#fbe0da;color:#8c2919;padding:8px 12px;font:600 11px var(--mono);border-radius:3px;cursor:pointer}
      .custom-btn-decline:hover{background:#a74232;color:#fff}
      .custom-btn-quote{border:1px solid #c99321;background:#fff5db;color:#7a580d;padding:8px 12px;font:600 11px var(--mono);border-radius:3px;cursor:pointer}
      .custom-btn-quote:hover{background:#c99321;color:#fff}
      .order-status.status-price_quoted{background:#fff1cf;color:#825f0e}
      @media(max-width:500px){.request-head{display:block}.request-head select{margin-top:10px;width:100%}}
    `;
    document.head.appendChild(style);
    addPanel();
    $("requestsPanel").addEventListener("click", function (event) {
      var customSave = event.target.closest("[data-custom-save]");
      var customQuick = event.target.closest("[data-custom-quick]");
      var note = event.target.closest("[data-note-save]");
      if (customSave) saveCustom(customSave.dataset.customSave, customSave);
      if (customQuick) saveCustom(customQuick.dataset.id, customQuick, customQuick.dataset.customQuick);
      if (note) saveNote(note.dataset.noteSave, note).catch(function (error) { window.alert(error.message); });
    });
    window.addEventListener("raycrafting-admin-unlocked", loadAll);
  }
  init();
}());
