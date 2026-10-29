(function () {
  "use strict";

  const API = "/api";
  const TOKEN_KEY = "raycrafting-customer-token";

  function getStoredToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || "";
    } catch {
      return "";
    }
  }

  function setStoredToken(val) {
    token = val || "";
    try {
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
        sessionStorage.setItem(TOKEN_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
      }
    } catch {}
  }

  let token = getStoredToken();
  let customer = null;
  let coupon = { code: "", discount: 0, description: "" };
  let razorpayConfig = null;
  let supportConfig = { supportEmail: "raywithcharm@gmail.com", supportPhone: "", instagramHandle: "", instagramUrl: "" };
  let detectedLocation = null;
  let phoneAuthPending = "";
  let isEditingAddress = false;

  const $ = (selector) => document.querySelector(selector);
  const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value) || 0);
  const esc = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  const products = () => {
    if (Array.isArray(window.RAYCRAFTING_PRODUCTS) && window.RAYCRAFTING_PRODUCTS.length) return window.RAYCRAFTING_PRODUCTS;
    const saved = localStorage.getItem(window.RAYCRAFTING_STORAGE_KEY);
    return saved ? JSON.parse(saved) : (window.RAYCRAFTING_DEFAULT_PRODUCTS || []).map((product) => ({ ...product }));
  };
  const cart = () => JSON.parse(localStorage.getItem("raycrafting-cart") || "[]");
  const priceInfo = (product) => {
    const sale = Number(product.price) || 0;
    const origVal = Number(product.originalPrice || product.original_price || 0);
    const original = origVal > sale ? origVal : 0;
    return { sale, original, percent: original ? Math.round((1 - sale / original) * 100) : 0 };
  };

  async function request(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(API + path, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  function showMessage(message, kind = "") {
    const node = $("#commerceFlow") && !$("#commerceFlow").hidden ? $("#paymentMessage") : $("#commerceMessage");
    if (node) { node.textContent = message; node.className = `commerce-message ${kind}`; }
  }

  function toast(message) {
    if (typeof window.showToast === "function") {
      window.showToast(message);
    } else {
      const node = $("#toast");
      if (node) {
        node.textContent = message;
        node.classList.add("show");
        setTimeout(() => node.classList.remove("show"), 2800);
      }
    }
  }

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .commerce-modal{position:fixed;inset:0;z-index:1400;display:grid;place-items:center;padding:20px;background:rgba(37,38,41,.56);overflow:auto}.commerce-modal[hidden]{display:none}.commerce-panel{width:min(780px,100%);max-height:calc(100vh - 40px);overflow:auto;background:var(--white,#fffdf9);padding:30px;box-shadow:0 25px 80px rgba(37,38,41,.22);border-radius:4px}.commerce-head{display:flex;justify-content:space-between;gap:20px;align-items:start;border-bottom:1px solid var(--line);padding-bottom:20px;margin-bottom:20px}.commerce-head h2{margin:0;font:600 32px/1.1 var(--display,"Playfair Display",serif);letter-spacing:-.03em}.commerce-head p{margin:6px 0 0;color:var(--muted);font-size:12px}.commerce-close{border:0;background:none;font-size:28px;color:var(--muted);cursor:pointer;padding:0;line-height:1}.commerce-close:hover{color:var(--ink)}.commerce-tabs{display:flex;gap:18px;border-bottom:1px solid var(--line);margin-bottom:22px}.commerce-tab{border:0;border-bottom:2px solid transparent;background:none;padding:0 0 10px;color:var(--muted);font:11px var(--mono);text-transform:uppercase;letter-spacing:.05em;cursor:pointer}.commerce-tab.active{border-color:var(--coral);color:var(--ink)}.commerce-form{display:grid;gap:14px}.commerce-form label{display:block;margin:0;font-size:11px;font-weight:600}.commerce-form input,.commerce-form select,.commerce-form textarea{width:100%;border:1px solid var(--line);background:#fbf8f3;color:var(--ink);padding:11px 12px;margin-top:6px;font:13px var(--sans);outline:0;border-radius:3px;box-sizing:border-box}.commerce-form input:focus,.commerce-form textarea:focus{border-color:var(--coral);background:#fff}.commerce-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.commerce-action{border:0;background:var(--ink);color:var(--white);padding:13px 18px;font-size:12px;font-weight:600;cursor:pointer;border-radius:2px;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:background .15s ease}.commerce-action:hover{background:var(--coral-dark)}.commerce-action:disabled{opacity:.55;cursor:wait}.commerce-message{min-height:18px;margin:8px 0 0;color:var(--coral-dark);font-size:12px}.field-help{display:block;margin-top:5px;color:var(--muted);font-size:10px;font-weight:400;line-height:1.4}.commerce-message.success{color:#557351}.commerce-note{margin:12px 0 0;color:var(--muted);font-size:11px;line-height:1.5}.checkout-layout{display:grid;grid-template-columns:1.15fr .85fr;gap:26px}.checkout-section{border-bottom:1px solid var(--line);padding-bottom:20px;margin-bottom:20px}.checkout-section:last-child{border-bottom:0;margin-bottom:0}.checkout-section h3{margin:0 0 14px;font:600 19px var(--display);letter-spacing:-.02em}.checkout-lines{display:grid;gap:11px}.checkout-line{display:grid;grid-template-columns:48px 1fr auto;gap:11px;align-items:center}.checkout-line img{width:48px;height:48px;object-fit:cover;background:var(--sage);border-radius:3px}.checkout-line h4{margin:0;font-size:12px;font-weight:600}.checkout-line p{margin:3px 0 0;color:var(--muted);font-size:10.5px}.checkout-totals{padding:16px 0;border-top:1px solid var(--line);display:grid;gap:8px;font-size:12px}.checkout-total-row{display:flex;justify-content:space-between;gap:20px}.checkout-total-row.discount{color:#557351;font-weight:600}.checkout-total-row.total{padding-top:11px;border-top:1px solid var(--line);font-weight:700;font-size:15px}.coupon-row{display:flex;gap:8px}.coupon-row input{margin:0}.coupon-row button{white-space:nowrap;padding:10px 14px}.coupon-help{margin:7px 0 0;color:var(--muted);font-size:10.5px}.discount-display{display:flex;align-items:center;gap:7px;margin-top:4px}.discount-display .current-price{font-weight:700}.discount-display .old-price{text-decoration:line-through;color:var(--muted);font-size:11px}.discount-display .sale-badge{color:var(--coral-dark);font:10px var(--mono);text-transform:uppercase}.product-price .discount-display{justify-content:flex-end;flex-wrap:wrap}.fulfillment-options{display:grid;gap:8px;margin:0 0 14px}.fulfillment-option{display:flex!important;gap:10px;align-items:start;padding:11px 13px;border:1px solid var(--line);background:#fbf8f3;cursor:pointer;border-radius:3px}.fulfillment-option:has(input:checked){border-color:var(--coral);background:#fff4ee}.fulfillment-option input{width:auto!important;margin:2px 0 0!important;padding:0!important;accent-color:var(--coral)}.fulfillment-option strong{display:block;font-size:12px}.fulfillment-option small{display:block;margin-top:3px;color:var(--muted);font-size:10px;font-weight:400}.location-row{display:flex;align-items:center;gap:10px;margin:0 0 16px}.location-row button{border:1px solid var(--line);background:transparent;padding:7px 11px;font-size:10.5px;cursor:pointer;border-radius:2px}.location-row button:hover{border-color:var(--coral);color:var(--coral-dark)}.location-row small{color:var(--muted);font-size:10.5px}.customer-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:9px 13px;background:#f3eee8;font-size:11.5px;border-radius:3px;margin-bottom:18px}.customer-bar button{border:0;background:none;text-decoration:underline;color:var(--coral-dark);cursor:pointer;font-size:11px;font-weight:600}
      .payment-method-options{display:grid;gap:10px;margin-top:10px}
      .payment-method-card{display:block!important;border:1.5px solid var(--line);background:#fbf8f3;padding:12px 14px;cursor:pointer;transition:border-color .15s,background .15s,box-shadow .15s;border-radius:4px}
      .payment-method-card:hover{border-color:var(--coral);background:#fffdf9}
      .payment-method-card.active,.payment-method-card:has(input:checked){border-color:var(--coral);background:#fff7f4;box-shadow:0 4px 14px rgba(231,110,89,0.12)}
      .pm-radio-row{display:flex;gap:11px;align-items:flex-start}
      .pm-radio-row input{width:auto!important;margin:2px 0 0!important;padding:0!important;accent-color:var(--coral)}
      .pm-text{flex:1}
      .pm-title-row{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
      .pm-title-row strong{font-size:12.5px;color:var(--ink)}
      .pm-badge-rec{background:#557351;color:#fff;font:9px var(--mono);text-transform:uppercase;padding:2px 7px;border-radius:999px;letter-spacing:.04em}
      .pm-desc{margin:3px 0 0;font-size:10.5px;color:var(--muted);line-height:1.4}
      .pm-chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}
      .pm-chip{display:inline-block;padding:2px 6px;background:#fff;border:1px solid var(--line);border-radius:3px;font:9px var(--mono);color:var(--ink)}
      .pincode-status{font-size:10.5px;margin-top:4px;display:block;min-height:15px}
      .pincode-status.detected{color:#557351;font-weight:600}
      .pincode-status.loading{color:var(--coral-dark)}

      /* Blinkit / Zepto Saved Address Card */
      .zepto-address-card{padding:13px 15px;background:#fbfbf9;border:1.5px solid #d4e5ce;border-radius:4px;margin-bottom:14px;transition:border-color .15s}
      .zepto-address-card:hover{border-color:#557351}
      .zepto-address-header{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:7px}
      .zepto-address-badge{display:inline-flex;align-items:center;gap:4px;font:10px var(--mono);color:#557351;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
      .zepto-change-btn{border:0;background:none;color:var(--coral-dark);font-size:11px;font-weight:600;cursor:pointer;text-decoration:underline;padding:0}
      .zepto-address-details strong{display:block;font-size:13px;color:var(--ink);margin-bottom:3px}
      .zepto-address-details p{margin:0;color:var(--muted);font-size:11.5px;line-height:1.45}

      /* 1-Tap Coupon Chip */
      .coupon-chip{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;background:#fff4ee;border:1px dashed var(--coral);border-radius:999px;font-size:11px;font-weight:600;color:var(--coral-dark);cursor:pointer;transition:all .15s ease;margin-bottom:10px;text-align:left}
      .coupon-chip:hover{background:#ffe9e2;transform:translateY(-1px)}
      .coupon-chip.applied{background:#dfeada;border:1px solid #557351;color:#557351}

      /* Visual order review reassurance */
      .checkout-maker-reassurance{display:flex;align-items:center;gap:8px;padding:9px 12px;background:#fbf8f3;border-radius:3px;border:1px solid var(--line);font-size:11px;color:var(--muted);margin:12px 0}
      .checkout-trust-badge{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#fbf8f3;border-radius:3px;border:1px solid var(--line);margin-top:14px;font-size:11px}
      .checkout-trust-badge .trust-shield{font-size:18px}
      .checkout-trust-badge strong{display:block;font-size:11.5px;color:var(--ink)}
      .checkout-trust-badge p{margin:2px 0 0;font-size:10px;color:var(--muted)}

      /* Sticky bottom bar on mobile / CTA styling */
      #payButton{width:100%;padding:14px 18px;font-size:13px;letter-spacing:.02em;margin-top:6px}

      /* Confirmation Modal */
      .confirm-panel{text-align:center;max-width:540px;padding:36px 30px}
      .confirm-celebration{margin-bottom:20px}
      .confirm-flower-icon{font-size:48px;line-height:1;margin-bottom:12px;animation:confirmDaisy 2s infinite ease-in-out}
      @keyframes confirmDaisy{0%,100%{transform:scale(1) rotate(0deg)}50%{transform:scale(1.12) rotate(12deg)}}
      .confirm-celebration h2{margin:0;font:600 32px/1.1 var(--display);letter-spacing:-.03em}
      .confirm-celebration p{margin:8px 0 0;color:var(--muted);font-size:12px}
      .confirm-summary-box{background:#fbf8f3;border:1px solid var(--line);padding:16px 18px;margin:20px 0;border-radius:4px;text-align:left;display:grid;gap:10px;font-size:12px}
      .confirm-summary-row{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
      .confirm-summary-row span{color:var(--muted);font-size:11px}
      .confirm-badge{background:#dfeada;color:#557351;font:9px var(--mono);text-transform:uppercase;padding:3px 7px;border-radius:3px;font-weight:600}
      .confirm-actions{display:grid;gap:9px}
      .confirm-whatsapp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;background:#25d366;color:#fff!important;padding:12px 16px;font-size:12px;font-weight:600;border-radius:2px;text-decoration:none}
      .confirm-whatsapp-btn:hover{background:#20ba5a}

      @media(max-width:680px){
        .commerce-panel{padding:20px}
        .checkout-layout,.commerce-grid{grid-template-columns:1fr}
        .commerce-head h2{font-size:26px}
      }
    `;
    document.head.appendChild(style);

    const ordersStyle = document.createElement("style");
    ordersStyle.textContent = `
      .orders-button{border:1px solid var(--line);background:transparent;padding:8px 12px;font:10px var(--mono);text-transform:uppercase;letter-spacing:.04em;cursor:pointer}.orders-button:hover{border-color:var(--coral);color:var(--coral-dark)}.orders-list{display:grid;gap:14px}.order-history-card{border:1px solid var(--line);padding:17px;background:#fffdf9;border-radius:3px}.order-history-head{display:flex;justify-content:space-between;gap:12px;align-items:start}.order-history-head h3{margin:0;font:600 18px var(--display);letter-spacing:-.02em}.order-history-meta{margin:4px 0 0;color:var(--muted);font-size:10.5px}.order-history-status{display:inline-block;padding:4px 8px;background:#f1eee8;font:9px var(--mono);text-transform:uppercase;letter-spacing:.04em;border-radius:2px}.order-history-status.paid,.order-history-status.processing,.order-history-status.delivered,.order-history-status.accepted{background:#dfeada;color:#557351}.order-history-status.failed_payment,.order-history-status.declined{background:#fbe0da;color:#a74232}.order-history-status.pending_payment,.order-history-status.cancel_requested,.order-history-status.return_requested,.order-history-status.pending{background:#fff1cf;color:#98721a}.order-history-status.price_quoted{background:#fbe8e4;color:var(--coral-dark);font-weight:700;border:1px solid var(--coral)}.order-history-items{margin:12px 0;padding-top:12px;border-top:1px solid var(--line);color:var(--ink);font-size:11.5px;line-height:1.5}.order-history-reason{margin:10px 0 0;padding:9px 11px;background:#fff1cf;color:#765d20;font-size:11px;border-radius:2px}.order-history-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:13px}.order-history-actions button,.support-links a{border:1px solid var(--line);background:transparent;padding:7px 11px;font-size:10.5px;border-radius:2px;text-decoration:none;cursor:pointer}.order-history-actions button:hover,.support-links a:hover{border-color:var(--coral);color:var(--coral-dark)}.support-box{display:flex;justify-content:space-between;align-items:center;gap:15px;margin-top:20px;padding-top:18px;border-top:1px solid var(--line)}.support-box strong{font-size:12px}.support-box p{margin:3px 0 0;color:var(--muted);font-size:10px}.support-links{display:flex;gap:8px;flex-wrap:wrap}.support-links a[hidden]{display:none}

      /* Empty / Auth state in Orders Modal */
      .orders-empty-auth{text-align:center;padding:34px 20px;background:#fbf8f3;border:1.5px dashed var(--line);border-radius:4px;margin:10px 0}
      .orders-auth-flower{font-size:42px;line-height:1;margin-bottom:12px}
      .orders-empty-auth h3{margin:0 0 8px;font:600 22px var(--display);letter-spacing:-.02em}
      .orders-empty-auth p{margin:0 auto 16px;color:var(--muted);font-size:12px;max-width:360px;line-height:1.5}

      /* Custom Orders in Orders Modal */
      .orders-section-heading{margin:22px 0 12px;font:600 18px var(--display);letter-spacing:-.02em;padding-bottom:7px;border-bottom:1px solid var(--line);color:var(--ink)}
      .custom-order-card{border-left:3px solid var(--coral)}
      .custom-tag{font:9px var(--mono);text-transform:uppercase;background:#fbf0ea;color:var(--coral-dark);padding:2px 6px;border-radius:3px;margin-left:6px;vertical-align:middle}
      .custom-quote-box{margin-top:12px;padding:12px 14px;background:#fff8f6;border:1px solid rgba(231,110,89,.3);border-radius:4px}
      .quote-header{display:flex;justify-content:space-between;align-items:center;gap:10px}
      .quote-badge{font:9.5px var(--mono);text-transform:uppercase;background:#557351;color:#fff;padding:2px 8px;border-radius:999px;letter-spacing:.04em}
      .quote-price{font:700 18px var(--sans);color:var(--ink)}
      .quote-seller-note{margin:8px 0 0;font-size:11.5px;color:var(--ink);background:#fff;padding:8px 10px;border-radius:3px;border:1px solid var(--line)}
      .custom-quote-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;align-items:center}
      .quote-accept-btn{background:#557351!important;color:#fff!important;padding:9px 15px!important;font-size:11px!important}
      .quote-accept-btn:hover{background:#456142!important}
      .quote-decline-btn{font-size:11px!important;padding:8px 13px!important}
      .quote-whatsapp-link{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#25d366;text-decoration:none;font-weight:600;padding:8px 10px;border:1px solid rgba(37,211,102,.3);border-radius:2px}
      .quote-whatsapp-link:hover{background:rgba(37,211,102,.08)}
      .custom-accepted-box{margin-top:12px;padding:10px 14px;background:#dfeada;border-radius:4px;color:#557351;font-size:11.5px;line-height:1.5}
      .return-panel{max-width:520px!important}
      .return-policy-box{background:#fff8f6;border:1px solid rgba(231,110,89,.3);border-radius:4px;padding:12px 14px;font-size:11.5px;color:var(--ink);line-height:1.5;margin-bottom:14px}
      .return-window-note{display:block;margin-top:5px;font-size:10.5px;color:#557351;font-weight:600}
      .return-window-note.expired{color:#a74232;font-weight:400}
    `;
    document.head.appendChild(ordersStyle);
  }

  function injectModal() {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="commerce-modal" id="checkoutModal" hidden>
        <div class="commerce-panel" role="dialog" aria-modal="true" aria-labelledby="checkoutTitle">
          <div class="commerce-head">
            <div>
              <p class="eyebrow">A brighter checkout</p>
              <h2 id="checkoutTitle">Complete your order.</h2>
              <p>Handcrafted blooms, clear pricing, and fast delivery details in one place.</p>
            </div>
            <button class="commerce-close" id="commerceClose" type="button" aria-label="Close checkout">×</button>
          </div>

          <div id="commerceAuth" hidden>
            <div class="commerce-tabs">
              <button class="commerce-tab active" data-auth-tab="login" type="button">Sign in</button>
              <button class="commerce-tab" data-auth-tab="register" type="button">Create account</button>
              <button class="commerce-tab" data-auth-tab="phone" type="button">Phone OTP</button>
            </div>
            <form class="commerce-form" id="loginForm">
              <label>Email address<input id="loginEmail" type="email" required autocomplete="email"></label>
              <label>Password<input id="loginPassword" type="password" required minlength="8" autocomplete="current-password"></label>
              <button class="commerce-action" type="submit">Sign in and continue <span>→</span></button>
            </form>
            <form class="commerce-form" id="registerForm" hidden>
              <div class="commerce-grid">
                <label>Your name<input id="registerName" required minlength="2" maxlength="120" autocomplete="name"></label>
                <label>Phone number<input id="registerPhone" required inputmode="tel" autocomplete="tel" maxlength="14" placeholder="+91 9876543210"><small class="field-help">Use a 10-digit Indian mobile number.</small></label>
              </div>
              <label>Email address<input id="registerEmail" type="email" required autocomplete="email"></label>
              <label>Password<input id="registerPassword" type="password" minlength="8" required autocomplete="new-password"><small class="commerce-note">Use at least 8 characters.</small></label>
              <button class="commerce-action" type="submit">Create account <span>→</span></button>
            </form>
            <form class="commerce-form" id="phoneForm" hidden>
              <label>Your name <span class="commerce-note">(for a new account)</span><input id="phoneName" minlength="2" maxlength="120" autocomplete="name"></label>
              <label>Mobile number<input id="phoneNumber" required inputmode="tel" autocomplete="tel" maxlength="14" placeholder="+91 9876543210"><small class="field-help">We will send a one-time code by SMS.</small></label>
              <button class="commerce-action" id="sendOtpButton" type="button">Send OTP <span>→</span></button>
              <div id="phoneOtpSection" hidden>
                <label>6-digit OTP<input id="phoneOtp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="Enter the code"></label>
                <button class="commerce-action" id="verifyOtpButton" type="button">Verify OTP <span>→</span></button>
              </div>
              <p class="commerce-message" id="phoneMessage"></p>
            </form>
            <p class="commerce-message" id="commerceMessage"></p>
            <div class="google-auth" id="googleAuth">
              <div class="auth-divider">or continue with</div>
              <div id="googleSignInButton"></div>
              <p class="google-auth-note">Google verifies your email securely. Your order history stays in Raycrafting.</p>
            </div>
            <p class="commerce-note">Your account lets you track orders, review price quotes, and keep delivery details handy.</p>
          </div>

          <div id="commerceFlow">
            <div id="customerBar" class="customer-bar"></div>
            <div class="checkout-layout">
              <div>
                <section class="checkout-section">
                  <h3>How should we get it to you?</h3>
                  <div class="fulfillment-options" id="fulfillmentOptions">
                    <label class="fulfillment-option">
                      <input type="radio" name="fulfillmentMethod" value="manual" checked>
                      <span><strong>Standard delivery</strong><small>Handcrafted delivery across India. Free above ₹499.</small></span>
                    </label>
                    <label class="fulfillment-option">
                      <input type="radio" name="fulfillmentMethod" value="self_pickup">
                      <span><strong>Self pickup</strong><small>Collect from Himanshi's studio after order is ready. No delivery fee.</small></span>
                    </label>
                  </div>
                  <div class="location-row" id="locationRow">
                    <button id="locationButton" type="button">📍 Use my current location</button>
                    <small id="locationMessage">Optional: helps auto-fill your delivery area.</small>
                  </div>

                  <h3>Delivery address</h3>

                  <!-- Blinkit/Zepto Saved Address Card -->
                  <div class="zepto-address-card" id="savedAddressView" hidden>
                    <div class="zepto-address-header">
                      <span class="zepto-address-badge">✓ Delivering to</span>
                      <button type="button" class="zepto-change-btn" id="changeAddressBtn">Change address ✎</button>
                    </div>
                    <div class="zepto-address-details">
                      <strong id="savedAddressSummaryName">—</strong>
                      <p id="savedAddressSummaryText">—</p>
                    </div>
                  </div>

                  <!-- Detailed Address Form -->
                  <form class="commerce-form" id="addressForm">
                    <div id="addressFormFields">
                      <div class="commerce-grid">
                        <label>Full name<input id="addressName" required minlength="2" maxlength="120" autocomplete="name" placeholder="Himanshi Sharma"></label>
                        <label>Phone number<input id="addressPhone" required inputmode="tel" autocomplete="tel" maxlength="14" placeholder="+91 9876543210"><small class="field-help">10-digit Indian mobile number.</small></label>
                      </div>
                      <label id="addressEmailField">Email address <span class="commerce-note">(for order updates &amp; receipt)</span><input id="addressEmail" type="email" required minlength="5" maxlength="120" autocomplete="email" placeholder="you@example.com"><small class="field-help">We'll email your order details &amp; tracking status here.</small></label>
                      <label id="addressLine1Field">House / Flat / Street address<input id="addressLine1" required minlength="5" maxlength="200" autocomplete="street-address" placeholder="e.g. Flat 402, Sunshine Apartments"></label>
                      <label id="addressLine2Field">Landmark or Area <span class="commerce-note">(optional)</span><input id="addressLine2" maxlength="200" autocomplete="address-line2" placeholder="Near City Park"></label>
                      <div class="commerce-grid" id="addressCityStateFields">
                        <label>City<input id="addressCity" required minlength="2" maxlength="80" autocomplete="address-level2" placeholder="City"></label>
                        <label>State<input id="addressState" required minlength="2" maxlength="80" autocomplete="address-level1" placeholder="State"></label>
                      </div>
                      <label id="addressPostalCodeField">PIN code<input id="addressPostalCode" required inputmode="numeric" pattern="[1-8][0-9]{5}" maxlength="6" autocomplete="postal-code" placeholder="e.g. 110001"><small class="field-help">6 digits; Indian PINs start with 1–8.</small><span id="pincodeStatus" class="pincode-status"></span></label>
                    </div>
                    <p class="commerce-message" id="addressMessage" aria-live="polite"></p>
                  </form>
                </section>

                <section class="checkout-section">
                  <h3>Choose payment method</h3>
                  <div class="payment-method-options" id="paymentMethodOptions">
                    <label class="payment-method-card active" data-method="razorpay">
                      <div class="pm-radio-row">
                        <input type="radio" name="paymentMethod" value="razorpay" checked>
                        <div class="pm-text">
                          <div class="pm-title-row">
                            <strong>⚡ Instant UPI, Cards &amp; NetBanking</strong>
                            <span class="pm-badge-rec">Recommended</span>
                          </div>
                          <p class="pm-desc">Instant confirmation via Razorpay. Zero transaction fee. 100% encrypted &amp; secure.</p>
                          <div class="pm-chips">
                            <span class="pm-chip">GPay</span>
                            <span class="pm-chip">PhonePe</span>
                            <span class="pm-chip">Paytm</span>
                            <span class="pm-chip">RuPay</span>
                            <span class="pm-chip">Cards &amp; NetBanking</span>
                          </div>
                        </div>
                      </div>
                    </label>
                    <label class="payment-method-card" data-method="cod">
                      <div class="pm-radio-row">
                        <input type="radio" name="paymentMethod" value="cod">
                        <div class="pm-text">
                          <div class="pm-title-row">
                            <strong>📦 Pay on Delivery (Cash on Delivery)</strong>
                          </div>
                          <p class="pm-desc">Pay cash or scan QR upon doorstep delivery. No advance payment required.</p>
                        </div>
                      </div>
                    </label>
                  </div>
                </section>

                <section class="checkout-section">
                  <h3>Discounts &amp; Vouchers</h3>
                  <button type="button" class="coupon-chip" id="welcomeCouponChip">🎁 Tap to apply WELCOME10 (10% OFF)</button>
                  <div class="coupon-row">
                    <input id="couponCode" placeholder="Enter coupon code" autocomplete="off">
                    <button class="commerce-action" id="couponButton" type="button">Apply</button>
                  </div>
                  <p class="coupon-help">First time here? Use code <strong>WELCOME10</strong> for 10% off your entire order!</p>
                  <p class="commerce-message" id="couponMessage"></p>
                </section>
              </div>

              <aside>
                <section class="checkout-section">
                  <h3>Your order</h3>
                  <div class="checkout-lines" id="checkoutLines"></div>
                  <div class="checkout-maker-reassurance">
                    🌸 <span>Handmade in small batches by Himanshi · 100% Gift-Ready</span>
                  </div>
                  <div class="checkout-totals" id="checkoutTotals"></div>
                </section>
                <button class="commerce-action" id="payButton" type="button">Continue to payment <span>→</span></button>
                <p class="commerce-message" id="paymentMessage"></p>
                <div class="checkout-trust-badge">
                  <span class="trust-shield">🔒</span>
                  <div>
                    <strong>100% Secure Checkout</strong>
                    <p>Encrypted payment &amp; handcrafted order guarantee · Free shipping on ₹499+</p>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>`
    );

    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="commerce-modal" id="ordersModal" hidden>
        <div class="commerce-panel" role="dialog" aria-modal="true" aria-labelledby="ordersTitle">
          <div class="commerce-head">
            <div>
              <p class="eyebrow">Your Raycrafting catalogue</p>
              <h2 id="ordersTitle">Your orders &amp; quotes.</h2>
              <p>Track your handcrafted pieces, accept maker quotes, or request assistance.</p>
            </div>
            <button class="commerce-close" id="ordersClose" type="button" aria-label="Close orders">×</button>
          </div>
          <div id="ordersLoginNote" hidden>
            <p class="commerce-note">Sign in to see your order history and custom price quotes.</p>
            <button class="commerce-action" id="ordersLoginButton" type="button">Sign in to your account <span>→</span></button>
          </div>
          <div class="orders-list" id="ordersList">
            <p class="commerce-note">Loading your orders…</p>
          </div>
          <div class="support-box">
            <div>
              <strong>Need a hand with an order?</strong>
              <p>Chat directly with Himanshi on WhatsApp or email the studio.</p>
            </div>
            <div class="support-links">
              <a id="chatSupport" href="mailto:raywithcharm@gmail.com">Email support</a>
              <a id="callSupport" href="tel:" hidden>Call support</a>
            </div>
          </div>
        </div>
      </div>`
    );

    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="commerce-modal" id="orderConfirmModal" hidden>
        <div class="commerce-panel confirm-panel" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
          <div class="confirm-celebration">
            <div class="confirm-flower-icon">🌸</div>
            <p class="eyebrow">Raycrafting Handcrafted Order</p>
            <h2 id="confirmTitle">Your order is placed!</h2>
            <p id="confirmSubtitle">We’ve received your order and Himanshi is carefully preparing your handmade piece.</p>
          </div>
          <div class="confirm-summary-box">
            <div class="confirm-summary-row">
              <span>Order ID</span>
              <strong id="confirmOrderId">#RC-0000</strong>
            </div>
            <div class="confirm-summary-row">
              <span>Total Amount</span>
              <strong id="confirmTotal">₹0</strong>
            </div>
            <div class="confirm-summary-row">
              <span>Payment Method</span>
              <span class="confirm-badge" id="confirmPaymentBadge">Pay on Delivery</span>
            </div>
            <div class="confirm-summary-row" id="confirmAddressRow">
              <span>Deliver to</span>
              <strong id="confirmAddressText">—</strong>
            </div>
          </div>
          <div class="confirm-actions">
            <button class="commerce-action" id="confirmViewOrdersBtn" type="button">Track in My Orders <span>→</span></button>
            <a class="confirm-whatsapp-btn" id="confirmWhatsAppBtn" target="_blank" rel="noopener noreferrer" href="#">💬 Chat with Himanshi on WhatsApp</a>
            <a class="orders-button" id="confirmReceiptLink" href="thank-you.html" style="margin-top:6px;display:block;text-align:center;text-decoration:none;">View Full Order Receipt 📄</a>
            <button class="orders-button" id="confirmCloseBtn" type="button" style="margin-top:6px">Back to Shop</button>
          </div>
        </div>
      </div>`
    );

    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="commerce-modal" id="returnModal" hidden>
        <div class="commerce-panel return-panel" role="dialog" aria-modal="true" aria-labelledby="returnTitle">
          <div class="commerce-head">
            <div>
              <p class="eyebrow">Raycrafting Studio Policy</p>
              <h2 id="returnTitle">Request a Return</h2>
              <p>Handmade pieces are eligible for return only for defective or damaged items within 3 days of delivery.</p>
            </div>
            <button class="commerce-close" id="returnClose" type="button" aria-label="Close return modal">×</button>
          </div>
          <div class="return-policy-box">
            🌸 <strong>Handmade Studio Quality Guarantee:</strong> Every piece is hand-twisted with care by Himanshi. If your order arrived broken, damaged during transit, or with a craftsmanship defect, we will arrange a replacement or refund within 3 days of delivery.
          </div>
          <form class="commerce-form" id="returnForm">
            <input type="hidden" id="returnOrderId" value="">
            <label>Genuine Reason for Return <span style="color:var(--coral-dark)">*</span>
              <select id="returnCategory" required>
                <option value="" disabled selected>Select genuine reason...</option>
                <option value="Defective / Damaged Piece">Defective / Damaged piece received</option>
                <option value="Broken in Transit">Broken or crushed during courier transit</option>
                <option value="Wrong Item Received">Wrong item or incorrect color received</option>
                <option value="Missing Item / Parts">Missing flower, stem, pot, or accessories</option>
                <option value="Craftsmanship Flaw">Major craftsmanship defect</option>
              </select>
            </label>
            <label>Describe the Defect or Damage <span style="color:var(--coral-dark)">*</span>
              <textarea id="returnDetail" required minlength="10" maxlength="500" rows="3" placeholder="Please describe the exact defect or damage in detail..."></textarea>
              <small class="field-help">Please describe the issue. You can also share unboxing photos/videos with Himanshi on WhatsApp.</small>
            </label>
            <div style="display:flex;gap:10px;margin-top:6px;">
              <button class="commerce-action" type="submit" id="submitReturnBtn" style="flex:1;">Submit Return Request <span>→</span></button>
              <button class="orders-button" type="button" id="cancelReturnBtn">Cancel</button>
            </div>
            <p class="commerce-message" id="returnMessage"></p>
          </form>
        </div>
      </div>`
    );
  }

  function injectAccountUI() {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="account-modal" id="accountModal" hidden>
        <div class="account-card" role="dialog" aria-modal="true" aria-labelledby="accountTitle">
          <div class="account-card-header">
            <div>
              <p class="eyebrow">Your Raycrafting account</p>
              <h2 id="accountTitle">A little home base.</h2>
            </div>
            <button class="commerce-close" id="accountClose" type="button" aria-label="Close account">×</button>
          </div>
          <p>Keep your details close, follow your orders, and make every checkout feel effortless.</p>
          <div class="account-details">
            <div class="account-detail"><small>Name</small><strong id="accountName">—</strong></div>
            <div class="account-detail"><small>Email</small><strong id="accountEmail">—</strong></div>
            <div class="account-detail"><small>Phone</small><strong id="accountPhone">Add at checkout</strong></div>
            <div class="account-detail"><small>Sign-in method</small><strong id="accountMethod">Email, Phone or Google</strong></div>
          </div>
          <div class="about-links">
            <button class="commerce-action" type="button" data-account-action="orders">View my orders</button>
            <button class="commerce-action" type="button" data-account-action="signout">Sign out</button>
          </div>
        </div>
      </div>
      <div class="about-modal" id="aboutModal" hidden>
        <div class="about-card" role="dialog" aria-modal="true" aria-labelledby="aboutTitle">
          <div class="about-card-header">
            <div>
              <p class="eyebrow">The person behind the pieces</p>
              <h2 id="aboutTitle">About Raycrafting.</h2>
            </div>
            <button class="commerce-close" id="aboutClose" type="button" aria-label="Close about Raycrafting">×</button>
          </div>
          <div class="about-story">
            <img src="assets/sunflower.jpeg" alt="Handmade orange sunflower in a small dark pot">
            <div>
              <p>Raycrafting is a small handmade studio creating pipe-cleaner flowers, keepsakes, and thoughtful little gifts that stay bright long after the moment.</p>
              <p><strong>Made by Himanshi Sharma.</strong> Every piece is shaped, wrapped, and checked by hand in small batches, with a little patience in every twist.</p>
            </div>
          </div>
          <p>For custom colours, desk companions, return questions, or simply to say hello, reach the studio directly. We keep the shop personal, clear, and kind.</p>
          <div class="about-links">
            <a class="commerce-action" href="mailto:raywithcharm@gmail.com?subject=Hello%20Raycrafting">Email the studio ↗</a>
            <a class="commerce-action" href="#custom" onclick="document.querySelector('#aboutModal').hidden=true;document.body.style.overflow=''">Plan a custom order ↗</a>
          </div>
        </div>
      </div>`
    );
  }

  function getLines() {
    const map = new Map(products().map((product) => [product.id, product]));
    return cart().map((item) => ({ ...item, product: map.get(item.id) })).filter((item) => item.product);
  }

  function clearCartView() {
    try { localStorage.removeItem("raycrafting-cart"); } catch {}
    if (typeof window.raycraftingClearCart === "function") {
      try { window.raycraftingClearCart(); } catch {}
    }
    window.dispatchEvent(new CustomEvent("raycrafting:cart-cleared"));
    const countBadge = $("#cartCount");
    if (countBadge) countBadge.textContent = "0";
    const drawerBadge = $("#drawerCount");
    if (drawerBadge) drawerBadge.textContent = "(0)";
    const cartItemsNode = $("#cartItems");
    if (cartItemsNode) cartItemsNode.innerHTML = "";
    const cartEmptyNode = $("#cartEmpty");
    if (cartEmptyNode) cartEmptyNode.hidden = false;
    const drawerFooterNode = $("#drawerFooter");
    if (drawerFooterNode) drawerFooterNode.hidden = true;
    renderCheckout();
    return 0;
  }

  function totals() {
    const subtotal = getLines().reduce((sum, item) => sum + priceInfo(item.product).sale * item.quantity, 0);
    const discount = Math.min(subtotal, Number(coupon.discount) || 0);
    const shipping = document.querySelector("input[name=fulfillmentMethod]:checked")?.value === "self_pickup" ? 0 : (subtotal - discount >= 499 ? 0 : 60);
    return { subtotal, discount, shipping, total: subtotal - discount + shipping };
  }

  function selectedPaymentMethod() {
    return document.querySelector("input[name=paymentMethod]:checked")?.value || "razorpay";
  }

  function renderCheckout() {
    const lines = getLines();
    const total = totals();
    const method = selectedPaymentMethod();

    const linesNode = $("#checkoutLines");
    if (linesNode) {
      linesNode.innerHTML = lines.map((item) => {
        const detail = priceInfo(item.product);
        return `<div class="checkout-line"><img src="${esc(item.product.image || window.RAYCRAFTING_DEFAULT_IMAGE)}" alt="${esc(item.product.name)}"><div><h4>${esc(item.product.name)}</h4><p>${item.quantity} × ${money(detail.sale)}</p></div><strong>${money(detail.sale * item.quantity)}</strong></div>`;
      }).join("");
    }

    const totalsNode = $("#checkoutTotals");
    if (totalsNode) {
      totalsNode.innerHTML = lines.length ? `
        <div class="checkout-total-row"><span>Subtotal</span><strong>${money(total.subtotal)}</strong></div>
        ${total.discount ? `<div class="checkout-total-row discount"><span>Coupon savings</span><strong>−${money(total.discount)}</strong></div>` : ""}
        <div class="checkout-total-row"><span>Delivery</span><strong>${total.shipping ? money(total.shipping) : "Free"}</strong></div>
        <div class="checkout-total-row total"><span>Total</span><strong>${money(total.total)}</strong></div>
      ` : `<p class="commerce-note">Your bag is empty. Add something bright before checking out.</p>`;
    }

    const payBtn = $("#payButton");
    if (payBtn) {
      payBtn.disabled = !lines.length;
      if (!lines.length) {
        payBtn.textContent = "Your bag is empty";
      } else if (method === "cod") {
        payBtn.textContent = `Place Order · Pay ${money(total.total)} on Delivery 📦 →`;
      } else {
        payBtn.textContent = `Pay ${money(total.total)} via UPI / Card 🔒 →`;
      }
    }

    const chip = $("#welcomeCouponChip");
    if (chip) {
      if (coupon.code && coupon.code.toUpperCase() === "WELCOME10") {
        chip.textContent = "✓ WELCOME10 applied (10% OFF)";
        chip.classList.add("applied");
      } else {
        chip.textContent = "🎁 Tap to apply WELCOME10 (10% OFF)";
        chip.classList.remove("applied");
      }
    }
  }

  function decorateProducts() {
    const map = new Map(products().map((product) => [product.id, product]));
    document.querySelectorAll(".product-card[data-product-id]").forEach((card) => {
      const product = map.get(card.dataset.productId);
      if (!product) return;
      const info = priceInfo(product);
      const price = card.querySelector(".product-price");
      if (!price) return;
      price.innerHTML = `<span class="discount-display"><span class="current-price">${money(info.sale)}</span>${info.original ? `<span class="old-price">${money(info.original)}</span><span class="sale-badge">${info.percent}% off</span>` : ""}</span>`;
    });
  }

  function decorateModal(product) {
    if (!product) return;
    const info = priceInfo(product);
    const node = $("#modalPrice");
    if (node) node.innerHTML = `<span class="discount-display"><span class="current-price">${money(info.sale)}</span>${info.original ? `<span class="old-price">${money(info.original)}</span><span class="sale-badge">${info.percent}% off</span>` : ""}</span>`;
  }

  async function loadCustomer() {
    if (!token) {
      customer = null;
      updateProfileUI();
      return false;
    }
    try {
      customer = (await request("/me")).customer;
      updateProfileUI();
      return true;
    } catch {
      setStoredToken("");
      customer = null;
      updateProfileUI();
      return false;
    }
  }

  function showAuthTab(tab) {
    document.querySelectorAll("[data-auth-tab]").forEach((button) => button.classList.toggle("active", button.dataset.authTab === tab));
    $("#loginForm").hidden = tab !== "login";
    $("#registerForm").hidden = tab !== "register";
    $("#phoneForm").hidden = tab !== "phone";
    showMessage("");
    const phoneMessage = $("#phoneMessage");
    if (phoneMessage && tab !== "phone") phoneMessage.textContent = "";
  }

  function profileInitial() {
    return (customer?.name || customer?.email || "?").trim().charAt(0).toUpperCase() || "?";
  }

  function updateProfileUI() {
    const avatar = $("#profileAvatar");
    const label = $("#profileLabel");
    const menuLabel = $("#profileMenuLabel");
    const authAction = $("#profileAuthAction");
    if (!avatar || !label) return;
    if (customer) {
      avatar.innerHTML = customer.avatarUrl ? `<img src="${esc(customer.avatarUrl)}" alt="${esc(customer.name || 'Account')} avatar">` : esc(profileInitial());
      label.textContent = customer.name || "Account";
      const displayId = (customer.email && !customer.email.endsWith("@accounts.raycrafting.local"))
        ? customer.email
        : (customer.name || (customer.phone ? `+91 ${customer.phone}` : "Customer"));
      if (menuLabel) menuLabel.textContent = `Signed in as ${displayId}`;
      if (authAction) authAction.textContent = "Sign out";
    } else {
      avatar.textContent = "?";
      label.textContent = "Account";
      if (menuLabel) menuLabel.textContent = "Your Raycrafting account";
      if (authAction) authAction.textContent = "Sign in / create account";
    }
  }

  function closeProfileMenu() {
    if ($("#profileMenu")) $("#profileMenu").hidden = true;
  }

  function openAboutModal() {
    closeProfileMenu();
    $("#aboutModal").hidden = false;
    document.body.style.overflow = "hidden";
  }

  async function openAccountModal() {
    closeProfileMenu();
    if (!customer && !(await loadCustomer())) {
      openCheckout(true);
      return;
    }
    $("#accountName").textContent = customer.name || "—";
    $("#accountEmail").textContent = customer.email || "—";
    $("#accountPhone").textContent = customer.phone || "Add at checkout";
    $("#accountMethod").textContent = "Email, Phone or Google";
    $("#accountModal").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeAccountModal() {
    $("#accountModal").hidden = true;
    if ($("#aboutModal").hidden && $("#checkoutModal").hidden && $("#ordersModal").hidden && $("#orderConfirmModal").hidden) {
      document.body.style.overflow = "";
    }
  }

  function closeAboutModal() {
    $("#aboutModal").hidden = true;
    if ($("#accountModal").hidden && $("#checkoutModal").hidden && $("#ordersModal").hidden && $("#orderConfirmModal").hidden) {
      document.body.style.overflow = "";
    }
  }

  function googleLogin(credential) {
    request("/auth/google", { method: "POST", body: JSON.stringify({ credential }) })
      .then(saveLogin)
      .catch((error) => showMessage(error.message));
  }

  function phoneMessage(message, kind = "") {
    const node = $("#phoneMessage");
    if (node) { node.textContent = message; node.className = "commerce-message " + kind; }
  }

  async function requestPhoneOtp() {
    const phone = normalizeIndianPhone($("#phoneNumber").value);
    if (!validIndianPhone(phone)) {
      phoneMessage("Enter a valid 10-digit Indian mobile number starting with 6–9.");
      return;
    }
    const button = $("#sendOtpButton");
    button.disabled = true;
    phoneMessage("Sending your OTP…");
    try {
      const result = await request("/auth/phone/request", { method: "POST", body: JSON.stringify({ phone }) });
      phoneAuthPending = phone;
      $("#phoneOtpSection").hidden = false;
      $("#phoneOtp").value = "";
      $("#phoneOtp").focus();
      phoneMessage(result.message || "OTP sent. Enter it below.", "success");
    } catch (error) {
      phoneMessage(error.message);
    } finally {
      button.disabled = false;
      button.classList.remove("is-loading");
    }
  }

  async function verifyPhoneOtp() {
    const phone = phoneAuthPending || normalizeIndianPhone($("#phoneNumber").value);
    const code = $("#phoneOtp").value.replace(/\D/g, "");
    if (!phoneAuthPending) { phoneMessage("Send an OTP first."); return; }
    if (!/^\d{6}$/.test(code)) { phoneMessage("Enter the 6-digit OTP."); return; }
    const button = $("#verifyOtpButton");
    button.disabled = true;
    phoneMessage("Verifying your OTP…");
    try {
      saveLogin(await request("/auth/phone/verify", { method: "POST", body: JSON.stringify({ phone, code, name: $("#phoneName").value.trim() }) }));
    } catch (error) {
      phoneMessage(error.message);
    } finally {
      button.disabled = false;
      button.classList.remove("is-loading");
    }
  }

  async function setupGoogleAuth() {
    const target = $("#googleAuth");
    if (!target) return;
    try {
      const config = await request("/config");
      if (!config.googleEnabled || !config.googleClientId) {
        target.hidden = true;
        return;
      }
      target.hidden = false;
      const loadScript = () => new Promise((resolve, reject) => {
        if (window.google?.accounts?.id) return resolve();
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      await loadScript();
      window.google.accounts.id.initialize({
        client_id: config.googleClientId,
        callback: (response) => googleLogin(response.credential)
      });
      const button = $("#googleSignInButton");
      if (button && !button.dataset.ready) {
        window.google.accounts.id.renderButton(button, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: Math.min(420, window.innerWidth - 90)
        });
        button.dataset.ready = "true";
      }
    } catch {
      target.hidden = true;
    }
  }

  function getSavedAddress() {
    try {
      const raw = localStorage.getItem("raycrafting_saved_address");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.name && parsed.phone && (parsed.line1 || parsed.fulfillmentMethod === "self_pickup")) {
        return parsed;
      }
    } catch {}
    return null;
  }

  function syncSavedAddressUI() {
    const saved = getSavedAddress();
    const savedCard = $("#savedAddressView");
    const formFields = $("#addressFormFields");

    if (customer) {
      if (!$("#addressName").value) $("#addressName").value = customer.name || "";
      if (!$("#addressPhone").value) $("#addressPhone").value = customer.phone || "";
      if (!$("#addressEmail").value && customer.email && !customer.email.endsWith("@accounts.raycrafting.local")) {
        $("#addressEmail").value = customer.email;
      }
    }

    if (saved && !isEditingAddress) {
      if (!$("#addressName").value && saved.name) $("#addressName").value = saved.name;
      if (!$("#addressPhone").value && saved.phone) $("#addressPhone").value = saved.phone;
      if (!$("#addressEmail").value && saved.email) $("#addressEmail").value = saved.email;
      if (!$("#addressLine1").value && saved.line1) $("#addressLine1").value = saved.line1;
      if (!$("#addressLine2").value && saved.line2) $("#addressLine2").value = saved.line2;
      if (!$("#addressCity").value && saved.city) $("#addressCity").value = saved.city;
      if (!$("#addressState").value && saved.state) $("#addressState").value = saved.state;
      if (!$("#addressPostalCode").value && saved.postalCode) $("#addressPostalCode").value = saved.postalCode;

      if (savedCard) {
        savedCard.hidden = false;
        const namePhone = $("#savedAddressSummaryName");
        const fullText = $("#savedAddressSummaryText");
        if (namePhone) namePhone.textContent = `${saved.name} · ${saved.phone}${saved.email ? ` · ${saved.email}` : ""}`;
        if (fullText) fullText.textContent = `${saved.line1}${saved.line2 ? ", " + saved.line2 : ""}, ${saved.city}, ${saved.state} - ${saved.postalCode}`;
      }
      if (formFields) formFields.hidden = true;
    } else {
      if (savedCard) savedCard.hidden = true;
      if (formFields) formFields.hidden = false;
    }
  }

  function showCheckoutFlow() {
    $("#commerceAuth").hidden = true;
    $("#commerceFlow").hidden = false;
    const bar = $("#customerBar");
    bar.textContent = "";

    if (customer) {
      const signedIn = document.createElement("span");
      signedIn.innerHTML = `Signed in as <strong>${esc(customer.name)}</strong> · ${esc(customer.email || customer.phone || "")}`;
      const logoutButton = document.createElement("button");
      logoutButton.id = "logoutCustomer";
      logoutButton.type = "button";
      logoutButton.textContent = "Sign out";
      bar.append(signedIn, logoutButton);
      logoutButton.addEventListener("click", logout);
    } else {
      const guestNote = document.createElement("span");
      guestNote.innerHTML = `⚡ <strong>Express Checkout</strong> · Quick &amp; secure (No password needed)`;
      const signInLink = document.createElement("button");
      signInLink.id = "checkoutSignInLink";
      signInLink.type = "button";
      signInLink.textContent = "Have an account? Sign in ➔";
      bar.append(guestNote, signInLink);
      signInLink.addEventListener("click", () => {
        $("#checkoutTitle").textContent = "Sign in to Raycrafting";
        $("#commerceAuth").hidden = false;
        $("#commerceFlow").hidden = true;
        showAuthTab("login");
      });
    }

    syncSavedAddressUI();
    setFulfillmentUI();
    renderCheckout();
    maybePromptLocationAccess();
  }

  function openCheckout(forceAuth = false) {
    closeProfileMenu();
    $("#checkoutModal").hidden = false;
    document.body.style.overflow = "hidden";
    renderCheckout();
    setupGoogleAuth();

    if (forceAuth) {
      $("#checkoutTitle").textContent = "Sign in to your account.";
      $("#commerceAuth").hidden = false;
      $("#commerceFlow").hidden = true;
      showAuthTab("login");
      return;
    }

    $("#checkoutTitle").textContent = "Complete your order.";
    if (token) {
      loadCustomer().then(() => showCheckoutFlow());
    } else {
      showCheckoutFlow();
    }
  }
  window.raycraftingOpenCheckout = openCheckout;

  function closeCheckout() {
    $("#checkoutModal").hidden = true;
    if ($("#aboutModal").hidden && $("#ordersModal").hidden && $("#orderConfirmModal").hidden && $("#accountModal").hidden) {
      document.body.style.overflow = "";
    }
  }

  function saveLogin(data) {
    setStoredToken(data.token);
    customer = data.customer || null;
    updateProfileUI();
    closeProfileMenu();
    if (getLines().length > 0) {
      showCheckoutFlow();
    } else {
      closeCheckout();
      openOrders();
    }
  }

  async function login(event) {
    event.preventDefault();
    const button = event.submitter || $("#loginForm button[type=submit]");
    if (button) button.disabled = true;
    try {
      saveLogin(await request("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: $("#loginEmail").value, password: $("#loginPassword").value })
      }));
    } catch (error) {
      showMessage(error.message);
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function register(event) {
    event.preventDefault();
    const button = event.submitter || $("#registerForm button[type=submit]");
    if (button) button.disabled = true;
    try {
      saveLogin(await request("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: $("#registerName").value,
          email: $("#registerEmail").value,
          phone: $("#registerPhone").value,
          password: $("#registerPassword").value
        })
      }));
    } catch (error) {
      showMessage(error.message);
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function logout() {
    if (token) await request("/auth/logout", { method: "POST" }).catch(() => {});
    setStoredToken("");
    customer = null;
    updateProfileUI();
    closeAccountModal();
    $("#checkoutTitle").textContent = "Sign in to your account.";
    $("#commerceAuth").hidden = false;
    $("#commerceFlow").hidden = true;
    showAuthTab("login");
  }

  async function applyCoupon() {
    const code = $("#couponCode").value.trim();
    if (!code) {
      coupon = { code: "", discount: 0 };
      $("#couponMessage").textContent = "";
      renderCheckout();
      return;
    }
    try {
      const result = await request("/coupons/validate", {
        method: "POST",
        body: JSON.stringify({ code, subtotal: totals().subtotal })
      });
      coupon = result;
      $("#couponMessage").className = "commerce-message success";
      $("#couponMessage").textContent = `${result.description} applied.`;
      renderCheckout();
    } catch (error) {
      coupon = { code: "", discount: 0 };
      $("#couponMessage").className = "commerce-message";
      $("#couponMessage").textContent = error.message;
      renderCheckout();
    }
  }

  function normalizeIndianPhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
    if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
    return digits;
  }
  function validIndianPhone(value) { return /^[6-9]\d{9}$/.test(normalizeIndianPhone(value)); }
  function validIndianPincode(value) { return /^[1-8]\d{5}$/.test(String(value || "").trim()); }

  function selectedFulfillment() {
    return document.querySelector("input[name=fulfillmentMethod]:checked")?.value || "manual";
  }

  function address() {
    return {
      fulfillmentMethod: selectedFulfillment(),
      name: ($("#addressName")?.value || "").trim(),
      phone: normalizeIndianPhone($("#addressPhone")?.value || ""),
      email: ($("#addressEmail")?.value || "").trim().toLowerCase(),
      line1: ($("#addressLine1")?.value || "").trim(),
      line2: ($("#addressLine2")?.value || "").trim(),
      city: ($("#addressCity")?.value || "").trim(),
      state: ($("#addressState")?.value || "").trim(),
      postalCode: ($("#addressPostalCode")?.value || "").trim()
    };
  }

  function setFulfillmentUI() {
    const selfPickup = selectedFulfillment() === "self_pickup";
    const locRow = $("#locationRow");
    if (locRow) locRow.hidden = selfPickup;

    ["addressLine1Field", "addressLine2Field", "addressCityStateFields", "addressPostalCodeField"].forEach((id) => {
      const node = $("#" + id);
      if (node) node.hidden = selfPickup;
    });
    ["addressLine1", "addressCity", "addressState", "addressPostalCode"].forEach((id) => {
      const node = $("#" + id);
      if (node) node.required = !selfPickup;
    });
    const message = $("#addressMessage");
    if (message) {
      message.textContent = selfPickup ? "Self pickup selected. You can collect your order directly from Himanshi's studio." : "";
      message.className = selfPickup ? "commerce-message success" : "commerce-message";
    }
    renderCheckout();
  }

  function validateAddress() {
    const value = address();
    const selfPickup = value.fulfillmentMethod === "self_pickup";
    // Clear previous field errors
    ["addressName", "addressPhone", "addressEmail", "addressLine1", "addressCity", "addressState", "addressPostalCode"].forEach((id) => {
      const el = $(id);
      if (el) el.classList.remove("field-error", "shake-field");
    });

    const checks = [
      [value.name.length >= 2 && value.name.length <= 120, "Enter your full name.", $("#addressName")],
      [validIndianPhone(value.phone), "Enter a valid 10-digit Indian mobile number starting with 6–9.", $("#addressPhone")],
      [Boolean(value.email) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email), "Enter a valid email address to receive order details & tracking.", $("#addressEmail")]
    ];
    if (!selfPickup) {
      checks.push(
        [value.line1.length >= 5 && value.line1.length <= 200, "Enter a complete street / house address (at least 5 characters).", $("#addressLine1")],
        [value.line2.length <= 200, "Address line 2 is too long.", $("#addressLine2")],
        [value.city.length >= 2 && value.city.length <= 80, "Enter a valid city.", $("#addressCity")],
        [value.state.length >= 2 && value.state.length <= 80, "Enter a valid state.", $("#addressState")],
        [validIndianPincode(value.postalCode), "Enter a valid 6-digit Indian PIN code starting with 1–8.", $("#addressPostalCode")]
      );
    }
    const failed = checks.find((check) => !check[0]);
    if (failed && failed[2]) {
      failed[2].classList.add("field-error", "shake-field");
      failed[2].focus();
    }
    const message = $("#addressMessage");
    if (message) {
      message.textContent = failed ? failed[1] : (selfPickup ? "Self pickup selected. You can collect your order directly from Himanshi's studio." : "");
      message.className = failed ? "commerce-message" : "commerce-message success";
    }
    return { valid: !failed, value, error: failed?.[1] || "" };
  }

  async function geolocationPermission() {
    if (!navigator.permissions?.query) return "prompt";
    try { return (await navigator.permissions.query({ name: "geolocation" })).state; } catch { return "prompt"; }
  }

  async function maybePromptLocationAccess() {
    if (!navigator.geolocation || selectedFulfillment() === "self_pickup") return;
    const permission = await geolocationPermission();
    if (permission === "denied") {
      const message = $("#locationMessage");
      if (message) message.textContent = "Location access blocked. Enter address manually or enable location in browser settings.";
      return;
    }
    detectLocation();
  }

  async function detectLocation() {
    const button = $("#locationButton");
    const message = $("#locationMessage");
    if (!navigator.geolocation) {
      if (message) message.textContent = "Location not available. Enter address manually.";
      return;
    }
    button.disabled = true;
    button.textContent = "Finding your address…";
    if (message) message.textContent = "Allow location when prompted…";

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        detectedLocation = {
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
          accuracy: Math.round(position.coords.accuracy || 0)
        };
        try {
          const result = await request("/location/reverse-geocode", {
            method: "POST",
            body: JSON.stringify({ latitude: detectedLocation.latitude, longitude: detectedLocation.longitude })
          });
          const addr = result.address || {};
          if (addr.line1) $("#addressLine1").value = addr.line1;
          if (addr.line2) $("#addressLine2").value = addr.line2;
          if (addr.city) $("#addressCity").value = addr.city;
          if (addr.state) $("#addressState").value = addr.state;
          if (addr.postalCode) $("#addressPostalCode").value = addr.postalCode;
          if (message) message.textContent = "✓ Address auto-detected from location. Please verify.";
          isEditingAddress = true;
          syncSavedAddressUI();
          validateAddress();
        } catch (error) {
          if (message) message.textContent = error.message || "Could not fill address from location. Enter manually.";
        }
        button.textContent = "📍 Use my current location";
        button.disabled = false;
      },
      (error) => {
        if (message) message.textContent = error.code === 1 ? "Location access was denied. Enter address manually." : "Could not detect location. Enter address manually.";
        button.textContent = "📍 Try location again";
        button.disabled = false;
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }

  async function lookupPostalCode(pincode) {
    const status = $("#pincodeStatus");
    if (!validIndianPincode(pincode)) {
      if (status) { status.textContent = ""; status.className = "pincode-status"; }
      return;
    }
    if (status) {
      status.className = "pincode-status loading";
      status.textContent = "Detecting City & State from PIN code…";
    }
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
      const data = await res.json();
      if (Array.isArray(data) && data[0]?.Status === "Success" && Array.isArray(data[0]?.PostOffice) && data[0].PostOffice.length > 0) {
        const po = data[0].PostOffice[0];
        const city = po.District || po.Block || po.Circle;
        const state = po.State;
        if (city && (!$("#addressCity").value || $("#addressCity").value !== city)) $("#addressCity").value = city;
        if (state && (!$("#addressState").value || $("#addressState").value !== state)) $("#addressState").value = state;
        if (status) {
          status.className = "pincode-status detected";
          status.textContent = `✓ ${city}, ${state} detected automatically`;
        }
      } else if (status) {
        status.className = "pincode-status";
        status.textContent = "";
      }
    } catch {
      if (status) { status.className = "pincode-status"; status.textContent = ""; }
    }
  }

  function showOrderConfirmation({ orderId, total, paymentMethod, addressText }) {
    closeCheckout();
    try {
      localStorage.setItem("raycrafting_last_order_id", orderId || "");
      localStorage.setItem("raycrafting_last_order_details", JSON.stringify({
        id: orderId,
        total: total,
        paymentMethod: paymentMethod,
        address: { line1: addressText },
        items: cartLines()
      }));
    } catch {}
    if ($("#confirmReceiptLink") && orderId) {
      $("#confirmReceiptLink").href = `thank-you.html?orderId=${encodeURIComponent(orderId)}`;
    }
    if (window.raycraftingTrack) {
      window.raycraftingTrack("purchase", {
        transaction_id: orderId,
        value: total,
        currency: "INR",
        payment_type: paymentMethod
      });
    }
    $("#confirmOrderId").textContent = orderId ? `#${orderId}` : "#RC";
    $("#confirmTotal").textContent = money(total);
    const isCod = paymentMethod === "cod";
    const badge = $("#confirmPaymentBadge");
    if (badge) {
      badge.textContent = isCod ? "📦 Pay on Delivery" : "⚡ Paid Online (Razorpay)";
      badge.style.background = isCod ? "#fff1cf" : "#dfeada";
      badge.style.color = isCod ? "#98721a" : "#557351";
    }
    const addrNode = $("#confirmAddressText");
    if (addrNode) addrNode.textContent = addressText || "Handcrafted delivery";

    const waBtn = $("#confirmWhatsAppBtn");
    if (waBtn) {
      const phone = String(supportConfig.supportPhone || "").replace(/\D/g, "");
      if (phone) {
        const clean = phone.startsWith("91") ? phone : "91" + phone;
        waBtn.href = `https://wa.me/${clean}?text=${encodeURIComponent(`Hi Himanshi! I just placed order ${orderId} on Raycrafting (${money(total)}). Excited for my handmade blooms!`)}`;
        waBtn.style.display = "inline-flex";
      } else {
        waBtn.style.display = "none";
      }
    }
    $("#orderConfirmModal").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeOrderConfirmation() {
    $("#orderConfirmModal").hidden = true;
    if ($("#checkoutModal").hidden && $("#ordersModal").hidden && $("#accountModal").hidden) {
      document.body.style.overflow = "";
    }
  }

  function loadRazorpay() {
    return new Promise((resolve, reject) => {
      if (window.Razorpay) return resolve();
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Could not load Razorpay Checkout."));
      document.head.appendChild(script);
    });
  }

  function statusLabel(status) {
    return ({
      pending_payment: "Pending payment",
      failed_payment: "Payment failed",
      paid: "Paid",
      processing: "Processing",
      shipped: "Shipped",
      out_for_delivery: "Out for delivery",
      delivered: "Delivered",
      cancel_requested: "Cancellation requested",
      return_requested: "Return requested",
      cancelled: "Cancelled",
      returned: "Returned",
      declined: "Declined",
      new: "Under Review",
      pending: "Under Review",
      price_quoted: "Price Quoted",
      accepted: "Accepted & Crafting"
    }[status] || status.replaceAll("_", " "));
  }

  function renderOrders(orders = [], customOrders = []) {
    const target = $("#ordersList");
    if (!target) return;

    if (!orders.length && !customOrders.length) {
      target.innerHTML = `<p class="commerce-note">You have no orders or custom requests yet. Your next bright handcrafted thing will appear here.</p>`;
      return;
    }

    let html = "";

    if (orders.length > 0) {
      html += orders.map((order) => {
        const items = order.items.map((item) => `${item.quantity} × ${esc(item.name)} (${money(item.line_total)})`).join(" · ");
        const reasons = order.failure_reason
          ? `<p class="order-history-reason"><strong>Payment issue:</strong> ${esc(order.failure_reason)}</p>`
          : order.decision_reason
          ? `<p class="order-history-reason"><strong>Seller note:</strong> ${esc(order.decision_reason)}</p>`
          : order.customer_request_reason
          ? `<p class="order-history-reason"><strong>Your request:</strong> ${esc(order.customer_request_reason)}</p>`
          : "";
        const canCancel = ["pending_payment", "paid", "processing"].includes(order.status);
        const deliveryTimestamp = new Date(order.delivered_at || order.updated_at || order.created_at).getTime();
        const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
        const isWithin3Days = (Date.now() - deliveryTimestamp) <= THREE_DAYS_MS;
        const canReturn = order.status === "delivered" && isWithin3Days;
        const returnExpired = order.status === "delivered" && !isWithin3Days;
        const pm = order.payment_method === "cod" ? " · 📦 Pay on Delivery" : (order.status === "paid" || order.status === "processing" ? " · ⚡ Paid online" : "");
        return `<article class="order-history-card">
          <div class="order-history-head">
            <div>
              <h3>${esc(order.id)}</h3>
              <p class="order-history-meta">${new Date(order.created_at).toLocaleString("en-IN")} · ${money(order.total)}${pm}</p>
            </div>
            <span class="order-history-status ${esc(order.status)}">${esc(statusLabel(order.status))}</span>
          </div>
          <div class="order-history-items">${items}</div>
          ${reasons}
          ${(canCancel || canReturn || returnExpired) ? `<div class="order-history-actions">
            ${canCancel ? `<button type="button" data-order-action="cancel" data-order-id="${esc(order.id)}">Request cancellation</button>` : ""}
            ${canReturn ? `<div><button type="button" data-order-action="return" data-order-id="${esc(order.id)}">Request return</button><small class="return-window-note">✓ Eligible for return within 3 days for defective/damaged pieces</small></div>` : ""}
            ${returnExpired ? `<small class="return-window-note expired">3-day return window closed</small>` : ""}
          </div>` : ""}
        </article>`;
      }).join("");
    }

    if (customOrders.length > 0) {
      const phoneDigits = String(supportConfig.supportPhone || "").replace(/\D/g, "");
      const cleanPhone = phoneDigits.startsWith("91") ? phoneDigits : "91" + phoneDigits;

      html += `<h3 class="orders-section-heading">Custom Requests &amp; Quotes</h3>`;
      html += customOrders.map((req) => {
        const isQuoted = req.status === "price_quoted";
        const isAccepted = req.status === "accepted";
        const budgetHintText = req.budget_hint ? ` · Budget hint: ₹${esc(req.budget_hint)}` : "";
        const statusBadgeText = isQuoted
          ? `🏷️ Quoted: ${money(req.quoted_price)}`
          : statusLabel(req.status);

        let quoteBox = "";
        if (isQuoted) {
          quoteBox = `
            <div class="custom-quote-box">
              <div class="quote-header">
                <span class="quote-badge">Himanshi's Price Quote</span>
                <strong class="quote-price">${money(req.quoted_price)}</strong>
              </div>
              ${req.seller_note ? `<p class="quote-seller-note"><strong>Maker note:</strong> ${esc(req.seller_note)}</p>` : ""}
              <div class="custom-quote-actions">
                <button type="button" class="commerce-action quote-accept-btn" data-custom-action="accept" data-custom-id="${esc(req.id)}">✓ Accept Quote (${money(req.quoted_price)})</button>
                <button type="button" class="orders-button quote-decline-btn" data-custom-action="decline" data-custom-id="${esc(req.id)}">✗ Decline</button>
                ${phoneDigits ? `<a class="quote-whatsapp-link" target="_blank" rel="noopener noreferrer" href="https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Hi Himanshi! Regarding custom request ${req.id} (quote ${money(req.quoted_price)}): `)}">💬 Chat on WhatsApp</a>` : ""}
              </div>
            </div>
          `;
        } else if (isAccepted) {
          quoteBox = `
            <div class="custom-accepted-box">
              🌸 <strong>Quote Accepted (${money(req.quoted_price || 0)})</strong> · Himanshi has received your confirmation and is handcrafting your custom piece! We will reach out when it is ready.
            </div>
          `;
        }

        return `<article class="order-history-card custom-order-card">
          <div class="order-history-head">
            <div>
              <h3>${esc(req.id)} <span class="custom-tag">Custom Piece</span></h3>
              <p class="order-history-meta">${new Date(req.created_at).toLocaleString("en-IN")}${budgetHintText}</p>
            </div>
            <span class="order-history-status ${esc(req.status)}">${esc(statusBadgeText)}</span>
          </div>
          <div class="order-history-items">
            <strong>Your Request:</strong> ${esc(req.description || req.notes || "Custom handcrafted design")}
          </div>
          ${quoteBox}
        </article>`;
      }).join("");
    }

    target.innerHTML = html;
  }

  function renderOrdersAuthPrompt(errorMsg = "") {
    const list = $("#ordersList");
    if (!list) return;
    list.innerHTML = `
      <div class="orders-empty-auth">
        <div class="orders-auth-flower">🌸</div>
        <h3>Sign in to view your orders &amp; quotes</h3>
        <p>Track your handcrafted blooms, review custom price quotes from Himanshi, or request returns.</p>
        ${errorMsg && errorMsg !== "Sign in to view your orders." ? `<p class="commerce-message" style="margin-bottom:12px;">${esc(errorMsg)}</p>` : ""}
        <button class="commerce-action" id="ordersPromptSignInBtn" type="button">Sign in to your account <span>→</span></button>
      </div>
    `;
    $("#ordersPromptSignInBtn")?.addEventListener("click", () => {
      closeOrders();
      openCheckout(true);
    });
  }

  async function loadSupport() {
    try {
      supportConfig = await request("/config");
    } catch {
      /* Fallback values are preserved */
    }
    const chatLink = $("#chatSupport");
    if (chatLink) {
      chatLink.href = `mailto:${encodeURIComponent(supportConfig.supportEmail || "raywithcharm@gmail.com")}?subject=${encodeURIComponent("Raycrafting order support")}`;
    }
    const phone = String(supportConfig.supportPhone || "").trim();
    const callLink = $("#callSupport");
    if (callLink && phone) {
      callLink.href = `tel:${phone.replace(/[^+\d]/g, "")}`;
      callLink.hidden = false;
    }
  }

  async function loadOrders() {
    const loginNote = $("#ordersLoginNote");
    if (loginNote) loginNote.hidden = true;

    if (!token) {
      renderOrdersAuthPrompt();
      return;
    }

    $("#ordersList").innerHTML = `<p class="commerce-note">Loading your orders…</p>`;
    try {
      const data = await request("/orders");
      renderOrders(data.orders || [], data.customOrders || []);
    } catch (error) {
      // Session expired or 401
      setStoredToken("");
      customer = null;
      updateProfileUI();
      renderOrdersAuthPrompt(error.message);
    }
  }

  function openOrders() {
    closeProfileMenu();
    $("#ordersModal").hidden = false;
    document.body.style.overflow = "hidden";
    loadSupport();
    loadOrders();
  }
  window.raycraftingOpenOrders = openOrders;

  function closeOrders() {
    $("#ordersModal").hidden = true;
    if ($("#checkoutModal").hidden && $("#orderConfirmModal").hidden && $("#accountModal").hidden && $("#aboutModal").hidden) {
      document.body.style.overflow = "";
    }
  }

  function openReturnModal(orderId) {
    const modal = $("#returnModal");
    if (!modal) return;
    const idInput = $("#returnOrderId");
    if (idInput) idInput.value = orderId;
    const cat = $("#returnCategory");
    if (cat) cat.value = "";
    const detail = $("#returnDetail");
    if (detail) detail.value = "";
    const msg = $("#returnMessage");
    if (msg) { msg.textContent = ""; msg.className = "commerce-message"; }
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeReturnModal() {
    const modal = $("#returnModal");
    if (modal) modal.hidden = true;
    if ($("#checkoutModal").hidden && $("#orderConfirmModal").hidden && $("#accountModal").hidden && $("#aboutModal").hidden && $("#ordersModal").hidden) {
      document.body.style.overflow = "";
    }
  }

  async function submitReturn(event) {
    event.preventDefault();
    const btn = $("#submitReturnBtn");
    const msg = $("#returnMessage");
    const orderId = $("#returnOrderId")?.value;
    const category = $("#returnCategory")?.value;
    const detail = $("#returnDetail")?.value.trim();

    if (!category) {
      if (msg) { msg.textContent = "Please select a genuine reason for return."; msg.className = "commerce-message"; }
      return;
    }
    if (!detail || detail.length < 10) {
      if (msg) { msg.textContent = "Please describe the defect or issue in more detail (at least 10 characters)."; msg.className = "commerce-message"; }
      return;
    }

    if (btn) btn.disabled = true;
    if (msg) { msg.textContent = "Submitting return request…"; msg.className = "commerce-message"; }

    try {
      await request("/orders/action", {
        method: "POST",
        body: JSON.stringify({
          orderId,
          action: "return",
          reason: `${category}: ${detail}`
        })
      });
      closeReturnModal();
      toast("Return request submitted for review. Himanshi will reach out shortly.");
      loadOrders();
    } catch (error) {
      if (msg) { msg.textContent = error.message; msg.className = "commerce-message"; }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function orderAction(orderId, action) {
    if (action === "return") {
      openReturnModal(orderId);
      return;
    }
    const label = "Why would you like to cancel this order before delivery?";
    const reason = window.prompt(label);
    if (!reason || !reason.trim()) return;
    try {
      await request("/orders/action", { method: "POST", body: JSON.stringify({ orderId, action, reason: reason.trim() }) });
      toast("Cancellation request sent.");
      loadOrders();
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function customOrderAction(orderId, action) {
    let reason = "";
    if (action === "decline") {
      reason = window.prompt("Reason for declining quote (optional):") || "";
    }
    try {
      const res = await request("/custom-orders/action", {
        method: "POST",
        body: JSON.stringify({ orderId, action, reason })
      });
      toast(res.message || (action === "accept" ? "Quote accepted! Himanshi will begin crafting your piece." : "Quote declined."));
      loadOrders();
    } catch (error) {
      window.alert(error.message);
    }
  }

  function addOrdersButton() {
    const actions = document.querySelector(".header-actions");
    if (!actions || $("#ordersButton")) return;
    actions.insertAdjacentHTML("afterbegin", `<button class="orders-button" id="ordersButton" type="button">My orders</button>`);
    $("#ordersButton").addEventListener("click", openOrders);
  }

  async function pay() {
    const button = $("#payButton");
    button.disabled = true;
    button.classList.add("is-loading");
    showMessage("");
    try {
      const delivery = validateAddress();
      if (!delivery.valid) {
        isEditingAddress = true;
        syncSavedAddressUI();
        showMessage(delivery.error);
        return;
      }

      try {
        localStorage.setItem("raycrafting_saved_address", JSON.stringify(delivery.value));
      } catch {}

      const paymentMethod = selectedPaymentMethod();
      const addressSummary = delivery.value.fulfillmentMethod === "self_pickup"
        ? "Studio Self-Pickup"
        : `${delivery.value.line1}, ${delivery.value.city}, ${delivery.value.state} - ${delivery.value.postalCode}`;

      const created = await request("/orders", {
        method: "POST",
        body: JSON.stringify({
          items: getLines().map((item) => ({ id: item.id, quantity: item.quantity })),
          couponCode: coupon.code,
          address: delivery.value,
          email: delivery.value.email,
          phone: delivery.value.phone,
          name: delivery.value.name,
          fulfillmentMethod: delivery.value.fulfillmentMethod,
          paymentMethod,
          giftMessage: localStorage.getItem("raycrafting-gift-note") || ""
        })
      });

      // If server returned a session token (guest checkout or refreshed session), persist it!
      if (created.token) {
        setStoredToken(created.token);
        loadCustomer();
      }

      if (paymentMethod === "cod") {
        clearCartView();
        toast("🌸 Order confirmed! We'll start crafting it.");
        showOrderConfirmation({
          orderId: created.orderId,
          total: created.total,
          paymentMethod: "cod",
          addressText: addressSummary
        });
        return;
      }

      // Razorpay Instant Online Payment
      razorpayConfig = razorpayConfig || await request("/config");
      if (!razorpayConfig.razorpayEnabled) {
        throw new Error("Online payment is temporarily unavailable. Please choose Pay on Delivery or try again shortly.");
      }
      const paymentOrder = await request("/payments/razorpay/order", {
        method: "POST",
        body: JSON.stringify({ orderId: created.orderId })
      });
      await loadRazorpay();
      const checkout = new Razorpay({
        key: paymentOrder.keyId,
        amount: paymentOrder.amount,
        currency: "INR",
        name: "Raycrafting",
        description: `Order ${created.orderId}`,
        order_id: paymentOrder.orderId,
        prefill: {
          name: delivery.value.name,
          email: delivery.value.email || customer?.email || "",
          contact: delivery.value.phone
        },
        config: {
          display: {
            blocks: {
              banks: { name: "Pay via UPI", instruments: [{ method: "upi" }] }
            },
            sequence: ["block.banks"],
            preferences: { show_default_blocks: true }
          }
        },
        theme: { color: "#e76e59" },
        handler: async (response) => {
          try {
            await request("/verify-payment", {
              method: "POST",
              body: JSON.stringify({
                orderId: created.orderId,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature
              })
            });
            clearCartView();
            toast("Payment received — your order is confirmed.");
            showOrderConfirmation({
              orderId: created.orderId,
              total: created.total,
              paymentMethod: "razorpay",
              addressText: addressSummary
            });
          } catch (error) {
            showMessage(error.message);
          }
        }
      });
      checkout.on("payment.failed", async (response) => {
        const reason = response.error?.description || "Payment was not completed.";
        await request("/payments/razorpay/failed", {
          method: "POST",
          body: JSON.stringify({
            orderId: created.orderId,
            paymentId: response.error?.metadata?.payment_id || "",
            reason
          })
        }).catch(() => {});
        showMessage(`${reason} You can retry payment anytime from 'My orders' or select Pay on Delivery.`);
      });
      checkout.open();
    } catch (error) {
      showMessage(error.message);
    } finally {
      button.disabled = false;
      button.classList.remove("is-loading");
    }
  }

  function init() {
    injectStyles();
    injectModal();
    injectAccountUI();
    addOrdersButton();
    updateProfileUI();
    loadCustomer();
    setupGoogleAuth();

    $("#sellerAboutButton")?.addEventListener("click", openAboutModal);
    $("#profileButton")?.addEventListener("click", (event) => {
      event.stopPropagation();
      const menu = $("#profileMenu");
      if (menu) menu.hidden = !menu.hidden;
    });

    $("#profileMenu")?.addEventListener("click", (event) => {
      const action = event.target.closest("[data-profile-action]")?.dataset.profileAction;
      if (!action) return;
      if (action === "about") openAboutModal();
      else if (action === "account") openAccountModal();
      else if (action === "orders") { closeProfileMenu(); openOrders(); }
      else if (action === "settings") openAccountModal();
      else if (action === "auth") {
        if (customer) logout();
        else openCheckout(true);
      }
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest(".profile-area")) closeProfileMenu();
    });

    $("#accountClose")?.addEventListener("click", closeAccountModal);
    $("#aboutClose")?.addEventListener("click", closeAboutModal);
    $("#accountModal")?.addEventListener("click", (event) => { if (event.target.id === "accountModal") closeAccountModal(); });
    $("#aboutModal")?.addEventListener("click", (event) => { if (event.target.id === "aboutModal") closeAboutModal(); });

    $("#accountModal")?.addEventListener("click", (event) => {
      const action = event.target.closest("[data-account-action]")?.dataset.accountAction;
      if (action === "orders") { closeAccountModal(); openOrders(); }
      if (action === "signout") logout();
    });

    $("#checkoutButton")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openCheckout(false);
    }, true);

    $("#commerceClose")?.addEventListener("click", closeCheckout);
    $("#checkoutModal")?.addEventListener("click", (event) => { if (event.target.id === "checkoutModal") closeCheckout(); });
    $("#ordersClose")?.addEventListener("click", closeOrders);
    $("#ordersModal")?.addEventListener("click", (event) => { if (event.target.id === "ordersModal") closeOrders(); });
    $("#ordersLoginButton")?.addEventListener("click", () => { closeOrders(); openCheckout(true); });

    $("#ordersList")?.addEventListener("click", (event) => {
      const orderActionBtn = event.target.closest("[data-order-action]");
      if (orderActionBtn) {
        orderAction(orderActionBtn.dataset.orderId, orderActionBtn.dataset.orderAction);
        return;
      }
      const customActionBtn = event.target.closest("[data-custom-action]");
      if (customActionBtn) {
        customOrderAction(customActionBtn.dataset.customId, customActionBtn.dataset.customAction);
        return;
      }
    });

    document.querySelectorAll("[data-auth-tab]").forEach((button) => {
      button.addEventListener("click", () => showAuthTab(button.dataset.authTab));
    });

    $("#loginForm")?.addEventListener("submit", login);
    $("#registerForm")?.addEventListener("submit", register);
    $("#sendOtpButton")?.addEventListener("click", requestPhoneOtp);
    $("#verifyOtpButton")?.addEventListener("click", verifyPhoneOtp);

    $("#phoneNumber")?.addEventListener("input", (event) => {
      event.target.value = event.target.value.replace(/[^+\d ()-]/g, "").slice(0, 14);
      phoneAuthPending = "";
    });
    $("#phoneOtp")?.addEventListener("input", (event) => {
      event.target.value = event.target.value.replace(/\D/g, "").slice(0, 6);
    });

    $("#couponButton")?.addEventListener("click", applyCoupon);
    $("#welcomeCouponChip")?.addEventListener("click", () => {
      const input = $("#couponCode");
      if (input) {
        input.value = "WELCOME10";
        applyCoupon();
      }
    });

    $("#payButton")?.addEventListener("click", pay);
    $("#locationButton")?.addEventListener("click", detectLocation);

    document.querySelectorAll("input[name=fulfillmentMethod]").forEach((input) => {
      input.addEventListener("change", setFulfillmentUI);
    });

    document.querySelectorAll("input[name=paymentMethod]").forEach((radio) => {
      radio.addEventListener("change", () => {
        document.querySelectorAll(".payment-method-card").forEach((card) => {
          const r = card.querySelector("input[type=radio]");
          card.classList.toggle("active", r && r.checked);
        });
        renderCheckout();
      });
    });

    $("#changeAddressBtn")?.addEventListener("click", () => {
      isEditingAddress = true;
      syncSavedAddressUI();
      $("#addressLine1")?.focus();
    });

    $("#addressPhone")?.addEventListener("input", (event) => {
      event.target.value = event.target.value.replace(/[^+\d ()-]/g, "").slice(0, 14);
    });

    $("#addressPostalCode")?.addEventListener("input", (event) => {
      event.target.value = event.target.value.replace(/\D/g, "").slice(0, 6);
      if (event.target.value.length === 6) {
        lookupPostalCode(event.target.value);
      } else {
        const st = $("#pincodeStatus");
        if (st) st.textContent = "";
      }
    });

    $("#addressForm")?.addEventListener("input", () => {
      if ($("#addressMessage")?.textContent) validateAddress();
    });

    $("#confirmViewOrdersBtn")?.addEventListener("click", () => {
      closeOrderConfirmation();
      openOrders();
    });
    $("#confirmCloseBtn")?.addEventListener("click", closeOrderConfirmation);
    $("#orderConfirmModal")?.addEventListener("click", (event) => {
      if (event.target.id === "orderConfirmModal") closeOrderConfirmation();
    });

    $("#returnClose")?.addEventListener("click", closeReturnModal);
    $("#cancelReturnBtn")?.addEventListener("click", closeReturnModal);
    $("#returnModal")?.addEventListener("click", (event) => {
      if (event.target.id === "returnModal") closeReturnModal();
    });
    $("#returnForm")?.addEventListener("submit", submitReturn);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeCheckout();
        closeOrderConfirmation();
        closeOrders();
        closeAccountModal();
        closeAboutModal();
        closeReturnModal();
      }
    });

    const productGrid = $("#productGrid");
    if (productGrid) {
      const observer = new MutationObserver(() => decorateProducts());
      observer.observe(productGrid, { childList: true });
      decorateProducts();
    }

    document.addEventListener("click", (event) => {
      const card = event.target.closest(".product-card[data-product-id]");
      if (card && event.target.closest("[data-action='details']")) {
        setTimeout(() => decorateModal(products().find((product) => product.id === card.dataset.productId)), 0);
      }
    });

    window.addEventListener("storage", (event) => {
      if (event.key === window.RAYCRAFTING_STORAGE_KEY || event.key === "raycrafting-cart") {
        coupon = { code: "", discount: 0 };
        decorateProducts();
        renderCheckout();
      }
    });
  }

  init();
}());
