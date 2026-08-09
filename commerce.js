(function () {
  "use strict";

  const API = "/api";
  let token = sessionStorage.getItem("raycrafting-customer-token") || "";
  let customer = null;
  let coupon = { code: "", discount: 0, description: "" };
  let razorpayConfig = null;
  let supportConfig = { supportEmail: "hello@raycrafting.co", supportPhone: "" };

  const $ = (selector) => document.querySelector(selector);
  const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value) || 0);
  const esc = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  const products = () => {
    if (Array.isArray(window.RAYCRAFTING_PRODUCTS)) return window.RAYCRAFTING_PRODUCTS;
    const saved = localStorage.getItem(window.RAYCRAFTING_STORAGE_KEY);
    return saved ? JSON.parse(saved) : (window.RAYCRAFTING_DEFAULT_PRODUCTS || []).map((product) => ({ ...product }));
  };
  const cart = () => JSON.parse(localStorage.getItem("raycrafting-cart") || "[]");
  const priceInfo = (product) => {
    const sale = Number(product.price) || 0;
    const original = Number(product.originalPrice) > sale ? Number(product.originalPrice) : 0;
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
  function showMessage(message, kind = "") { const node = $("#commerceFlow").hidden ? $("#commerceMessage") : $("#paymentMessage"); if (node) { node.textContent = message; node.className = `commerce-message ${kind}`; } }
  function toast(message) { if (typeof window.showToast === "function") window.showToast(message); else { const node = $("#toast"); if (node) { node.textContent = message; node.classList.add("show"); setTimeout(() => node.classList.remove("show"), 2600); } } }

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .commerce-modal{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:20px;background:rgba(37,38,41,.56);overflow:auto}.commerce-modal[hidden]{display:none}.commerce-panel{width:min(760px,100%);max-height:calc(100vh - 40px);overflow:auto;background:var(--white,#fffdf9);padding:30px;box-shadow:0 25px 80px rgba(37,38,41,.22)}.commerce-head{display:flex;justify-content:space-between;gap:20px;align-items:start;border-bottom:1px solid var(--line);padding-bottom:22px;margin-bottom:22px}.commerce-head h2{margin:0;font:600 34px/1 var(--display,"Playfair Display",serif);letter-spacing:-.04em}.commerce-head p{margin:8px 0 0;color:var(--muted);font-size:12px}.commerce-close{border:0;background:none;font-size:28px;color:var(--muted);cursor:pointer}.commerce-tabs{display:flex;gap:18px;border-bottom:1px solid var(--line);margin-bottom:22px}.commerce-tab{border:0;border-bottom:2px solid transparent;background:none;padding:0 0 10px;color:var(--muted);font:11px var(--mono);text-transform:uppercase;letter-spacing:.05em;cursor:pointer}.commerce-tab.active{border-color:var(--coral);color:var(--ink)}.commerce-form{display:grid;gap:14px}.commerce-form label{display:block;margin:0;font-size:11px;font-weight:600}.commerce-form input,.commerce-form select,.commerce-form textarea{width:100%;border:1px solid var(--line);background:#fbf8f3;color:var(--ink);padding:11px 12px;margin-top:7px;font:13px var(--sans);outline:0}.commerce-form input:focus,.commerce-form textarea:focus{border-color:var(--coral)}.commerce-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.commerce-action{border:0;background:var(--ink);color:var(--white);padding:13px 16px;font-size:12px;font-weight:600;cursor:pointer}.commerce-action:hover{background:var(--coral-dark)}.commerce-action:disabled{opacity:.55;cursor:wait}.commerce-message{min-height:18px;margin:0;color:var(--coral-dark);font-size:12px}.field-help{display:block;margin-top:5px;color:var(--muted);font-size:10px;font-weight:400;line-height:1.4}.commerce-message.success{color:#557351}.commerce-note{margin:14px 0 0;color:var(--muted);font-size:11px;line-height:1.6}.checkout-layout{display:grid;grid-template-columns:1.1fr .9fr;gap:26px}.checkout-section{border-bottom:1px solid var(--line);padding-bottom:22px;margin-bottom:22px}.checkout-section:last-child{border-bottom:0;margin-bottom:0}.checkout-section h3{margin:0 0 15px;font:600 20px var(--display);letter-spacing:-.03em}.checkout-lines{display:grid;gap:12px}.checkout-line{display:grid;grid-template-columns:48px 1fr auto;gap:11px;align-items:center}.checkout-line img{width:48px;height:48px;object-fit:cover;background:var(--sage)}.checkout-line h4{margin:0;font-size:12px}.checkout-line p{margin:3px 0 0;color:var(--muted);font-size:10px}.checkout-totals{padding:17px 0;border-top:1px solid var(--line);display:grid;gap:9px;font-size:12px}.checkout-total-row{display:flex;justify-content:space-between;gap:20px}.checkout-total-row.discount{color:#557351}.checkout-total-row.total{padding-top:11px;border-top:1px solid var(--line);font-weight:700;font-size:14px}.coupon-row{display:flex;gap:8px}.coupon-row input{margin:0}.coupon-row button{white-space:nowrap;padding:10px 13px}.coupon-help{margin:8px 0 0;color:var(--muted);font-size:10px}.discount-display{display:flex;align-items:center;gap:7px;margin-top:4px}.discount-display .current-price{font-weight:700}.discount-display .old-price{text-decoration:line-through;color:var(--muted);font-size:11px}.discount-display .sale-badge{color:var(--coral-dark);font:10px var(--mono);text-transform:uppercase}.product-price .discount-display{justify-content:flex-end;flex-wrap:wrap}.customer-bar{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;background:#f1eee8;font-size:12px}.customer-bar button{border:0;background:none;text-decoration:underline;color:var(--coral-dark);cursor:pointer}@media(max-width:650px){.commerce-panel{padding:22px}.checkout-layout,.commerce-grid{grid-template-columns:1fr}.commerce-head h2{font-size:28px}}
    `;
    document.head.appendChild(style);
    const ordersStyle = document.createElement("style");
    ordersStyle.textContent = `.orders-button{border:1px solid var(--line);background:transparent;padding:8px 12px;font:10px var(--mono);text-transform:uppercase;letter-spacing:.04em}.orders-button:hover{border-color:var(--coral);color:var(--coral-dark)}.orders-list{display:grid;gap:14px}.order-history-card{border:1px solid var(--line);padding:17px;background:#fffdf9}.order-history-head{display:flex;justify-content:space-between;gap:12px;align-items:start}.order-history-head h3{margin:0;font:600 19px var(--display)}.order-history-meta{margin:4px 0 0;color:var(--muted);font-size:10px}.order-history-status{display:inline-block;padding:5px 8px;background:#f1eee8;font:9px var(--mono);text-transform:uppercase;letter-spacing:.04em}.order-history-status.paid,.order-history-status.processing,.order-history-status.delivered{background:#dfeada;color:#557351}.order-history-status.failed_payment,.order-history-status.declined{background:#fbe0da;color:#a74232}.order-history-status.pending_payment,.order-history-status.cancel_requested,.order-history-status.return_requested{background:#fff1cf;color:#98721a}.order-history-items{margin:13px 0;padding-top:12px;border-top:1px solid var(--line);color:var(--muted);font-size:11px}.order-history-reason{margin:10px 0 0;padding:9px 11px;background:#fff1cf;color:#765d20;font-size:11px}.order-history-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:13px}.order-history-actions button,.support-links a{border:1px solid var(--line);background:transparent;padding:8px 10px;font-size:10px}.order-history-actions button:hover,.support-links a:hover{border-color:var(--coral);color:var(--coral-dark)}.support-box{display:flex;justify-content:space-between;align-items:center;gap:15px;margin-top:20px;padding-top:18px;border-top:1px solid var(--line)}.support-box strong{font-size:12px}.support-box p{margin:3px 0 0;color:var(--muted);font-size:10px}.support-links{display:flex;gap:8px;flex-wrap:wrap}.support-links a[hidden]{display:none}`;
    document.head.appendChild(ordersStyle);
  }

  function injectModal() {
    document.body.insertAdjacentHTML("beforeend", `<div class="commerce-modal" id="checkoutModal" hidden><div class="commerce-panel" role="dialog" aria-modal="true" aria-labelledby="checkoutTitle"><div class="commerce-head"><div><p class="eyebrow">A brighter checkout</p><h2 id="checkoutTitle">Complete your order.</h2><p>Secure account, clear pricing, and delivery details in one place.</p></div><button class="commerce-close" id="commerceClose" type="button" aria-label="Close checkout">×</button></div><div id="commerceAuth"><div class="commerce-tabs"><button class="commerce-tab active" data-auth-tab="login" type="button">Sign in</button><button class="commerce-tab" data-auth-tab="register" type="button">Create account</button></div><form class="commerce-form" id="loginForm"><label>Email address<input id="loginEmail" type="email" required autocomplete="email"></label><label>Password<input id="loginPassword" type="password" required minlength="8" autocomplete="current-password"></label><button class="commerce-action" type="submit">Sign in and continue <span>→</span></button></form><form class="commerce-form" id="registerForm" hidden><div class="commerce-grid"><label>Your name<input id="registerName" required minlength="2" maxlength="120" autocomplete="name"></label><label>Phone number<input id="registerPhone" required inputmode="tel" autocomplete="tel" maxlength="14" placeholder="+91 9876543210"><small class="field-help">Use a 10-digit Indian mobile number.</small></label></div><label>Email address<input id="registerEmail" type="email" required autocomplete="email"></label><label>Password<input id="registerPassword" type="password" minlength="8" required autocomplete="new-password"><small class="commerce-note">Use at least 8 characters.</small></label><button class="commerce-action" type="submit">Create account <span>→</span></button></form><p class="commerce-message" id="commerceMessage"></p><div class="google-auth" id="googleAuth"><div class="auth-divider">or continue with</div><div id="googleSignInButton"></div><p class="google-auth-note">Google verifies your email securely. Your order history stays in Raycrafting.</p></div><p class="commerce-note">Your account lets you track orders and keeps your delivery details ready for next time.</p></div><div id="commerceFlow" hidden><div id="customerBar" class="customer-bar"></div><div class="checkout-layout"><div><section class="checkout-section"><h3>Delivery details</h3><form class="commerce-form" id="addressForm"><div class="commerce-grid"><label>Full name<input id="addressName" required minlength="2" maxlength="120" autocomplete="name"></label><label>Phone number<input id="addressPhone" required inputmode="tel" autocomplete="tel" maxlength="14" placeholder="+91 9876543210"><small class="field-help">10-digit Indian mobile number, starting with 6–9.</small></label></div><label>Address line 1<input id="addressLine1" required minlength="5" maxlength="200" autocomplete="street-address"></label><label>Address line 2 <span class="commerce-note">(optional)</span><input id="addressLine2" maxlength="200" autocomplete="address-line2"></label><div class="commerce-grid"><label>City<input id="addressCity" required minlength="2" maxlength="80" autocomplete="address-level2"></label><label>State<input id="addressState" required minlength="2" maxlength="80" autocomplete="address-level1"></label></div><label>PIN code<input id="addressPostalCode" required inputmode="numeric" pattern="[1-8][0-9]{5}" maxlength="6" autocomplete="postal-code" placeholder="e.g. 110001"><small class="field-help">6 digits; Indian PINs start with 1–8.</small></label><p class="commerce-message" id="addressMessage" aria-live="polite"></p></form></section><section class="checkout-section"><h3>Coupon code</h3><div class="coupon-row"><input id="couponCode" placeholder="e.g. BRIGHT10" autocomplete="off"><button class="commerce-action" id="couponButton" type="button">Apply</button></div><p class="coupon-help">Try BRIGHT10, RAY100, or WELCOME15 in this demo.</p><p class="commerce-message" id="couponMessage"></p></section></div><aside><section class="checkout-section"><h3>Your order</h3><div class="checkout-lines" id="checkoutLines"></div><div class="checkout-totals" id="checkoutTotals"></div></section><button class="commerce-action" id="payButton" type="button">Continue to secure payment <span>→</span></button><p class="commerce-message" id="paymentMessage"></p><p class="commerce-note" id="paymentNote">Payment opens securely in Razorpay Test Mode once your test keys are configured.</p></aside></div></div></div></div>`);
    document.body.insertAdjacentHTML("beforeend", `<div class="commerce-modal" id="ordersModal" hidden><div class="commerce-panel" role="dialog" aria-modal="true" aria-labelledby="ordersTitle"><div class="commerce-head"><div><p class="eyebrow">Your Raycrafting catalogue</p><h2 id="ordersTitle">Your orders.</h2><p>Track every little thing, request help, or tell us when plans change.</p></div><button class="commerce-close" id="ordersClose" type="button" aria-label="Close orders">×</button></div><div id="ordersLoginNote" hidden><p class="commerce-note">Sign in to see your order history.</p><button class="commerce-action" id="ordersLoginButton" type="button">Sign in to your account <span>→</span></button></div><div class="orders-list" id="ordersList"><p class="commerce-note">Loading your orders…</p></div><div class="support-box"><div><strong>Need a hand?</strong><p>Chat or call us about an order.</p></div><div class="support-links"><a id="chatSupport" href="mailto:hello@raycrafting.co">Chat support</a><a id="callSupport" href="tel:" hidden>Call support</a></div></div></div></div>`);
  }

  function injectAccountUI() {
    document.body.insertAdjacentHTML("beforeend",       '<div class="account-modal" id="accountModal" hidden><div class="account-card" role="dialog" aria-modal="true" aria-labelledby="accountTitle"><div class="account-card-header"><div><p class="eyebrow">Your Raycrafting account</p><h2 id="accountTitle">A little home base.</h2></div><button class="commerce-close" id="accountClose" type="button" aria-label="Close account">×</button></div><p>Keep your details close, follow your orders, and make the next checkout feel easy.</p><div class="account-details"><div class="account-detail"><small>Name</small><strong id="accountName">—</strong></div><div class="account-detail"><small>Email</small><strong id="accountEmail">—</strong></div><div class="account-detail"><small>Phone</small><strong id="accountPhone">Add at checkout</strong></div><div class="account-detail"><small>Sign-in method</small><strong id="accountMethod">Email account</strong></div></div><div class="about-links"><button class="commerce-action" type="button" data-account-action="orders">View my orders</button><button class="commerce-action" type="button" data-account-action="signout">Sign out</button></div></div></div><div class="about-modal" id="aboutModal" hidden><div class="about-card" role="dialog" aria-modal="true" aria-labelledby="aboutTitle"><div class="about-card-header"><div><p class="eyebrow">The person behind the pieces</p><h2 id="aboutTitle">About Raycrafting.</h2></div><button class="commerce-close" id="aboutClose" type="button" aria-label="Close about Raycrafting">×</button></div><div class="about-story"><img src="assets/sunflower.jpeg" alt="Handmade orange sunflower in a small dark pot"><div><p>Raycrafting is a small handmade studio creating pipe-cleaner flowers, keepsakes, and thoughtful little gifts that stay bright long after the moment.</p><p><strong>Made by Bhuvik Garg.</strong> Every piece is shaped, wrapped, and checked by hand in small batches, with a little patience in every twist.</p></div></div><p>For custom colours, desk companions, return questions, or simply to say hello, reach the studio directly. We keep the shop personal, clear, and kind.</p><div class="about-links"><a class="commerce-action" href="mailto:hello@raycrafting.co?subject=Hello%20Raycrafting">Email the studio ↗</a><a class="commerce-action" href="mailto:hello@raycrafting.co?subject=Custom%20Raycrafting%20order">Plan a custom order ↗</a></div></div></div>'
    );
  }

  function getLines() {
    const map = new Map(products().map((product) => [product.id, product]));
    return cart().map((item) => ({ ...item, product: map.get(item.id) })).filter((item) => item.product);
  }
  function clearCartView() {
    localStorage.removeItem("raycrafting-cart");
    const count = getLines().length;
    if ($("cartCount")) $("cartCount").textContent = "0";
    if ($("drawerCount")) $("drawerCount").textContent = "(0)";
    if ($("cartItems")) $("cartItems").innerHTML = "";
    if ($("cartEmpty")) $("cartEmpty").hidden = false;
    if ($("drawerFooter")) $("drawerFooter").hidden = true;
    return count;
  }
  function totals() {
    const subtotal = getLines().reduce((sum, item) => sum + priceInfo(item.product).sale * item.quantity, 0);
    const discount = Math.min(subtotal, Number(coupon.discount) || 0);
    const shipping = subtotal - discount >= 4000 ? 0 : 80;
    return { subtotal, discount, shipping, total: subtotal - discount + shipping };
  }
  function renderCheckout() {
    const lines = getLines(); const total = totals();
    $("#checkoutLines").innerHTML = lines.map((item) => { const detail = priceInfo(item.product); return `<div class="checkout-line"><img src="${esc(item.product.image || window.RAYCRAFTING_DEFAULT_IMAGE)}" alt=""><div><h4>${esc(item.product.name)}</h4><p>${item.quantity} × ${money(detail.sale)}</p></div><strong>${money(detail.sale * item.quantity)}</strong></div>`; }).join("");
    $("#checkoutTotals").innerHTML = lines.length ? `<div class="checkout-total-row"><span>Subtotal</span><strong>${money(total.subtotal)}</strong></div>${total.discount ? `<div class="checkout-total-row discount"><span>Coupon savings</span><strong>−${money(total.discount)}</strong></div>` : ""}<div class="checkout-total-row"><span>Delivery</span><strong>${total.shipping ? money(total.shipping) : "Free"}</strong></div><div class="checkout-total-row total"><span>Total</span><strong>${money(total.total)}</strong></div>` : `<p class="commerce-note">Your bag is empty. Add something bright before checking out.</p>`;
    if ($("#payButton")) { $("#payButton").disabled = !lines.length; $("#payButton").textContent = lines.length ? "Continue to secure payment  →" : "Your bag is empty"; }
  }
  function decorateProducts() {
    const map = new Map(products().map((product) => [product.id, product]));
    document.querySelectorAll(".product-card[data-product-id]").forEach((card) => {
      const product = map.get(card.dataset.productId); if (!product) return; const info = priceInfo(product); const price = card.querySelector(".product-price"); if (!price) return;
      price.innerHTML = `<span class="discount-display"><span class="current-price">${money(info.sale)}</span>${info.original ? `<span class="old-price">${money(info.original)}</span><span class="sale-badge">${info.percent}% off</span>` : ""}</span>`;
    });
  }
  function decorateModal(product) { if (!product) return; const info = priceInfo(product); const node = $("#modalPrice"); if (node) node.innerHTML = `<span class="discount-display"><span class="current-price">${money(info.sale)}</span>${info.original ? `<span class="old-price">${money(info.original)}</span><span class="sale-badge">${info.percent}% off</span>` : ""}</span>`; }
  async function loadCustomer() {
    if (!token) { updateProfileUI(); return false; }
    try { customer = (await request("/me")).customer; updateProfileUI(); return true; } catch { token = ""; customer = null; sessionStorage.removeItem("raycrafting-customer-token"); updateProfileUI(); return false; }
  }
  function showAuthTab(tab) { document.querySelectorAll("[data-auth-tab]").forEach((button) => button.classList.toggle("active", button.dataset.authTab === tab)); $("#loginForm").hidden = tab !== "login"; $("#registerForm").hidden = tab !== "register"; showMessage(""); }
  function profileInitial() { return (customer?.name || customer?.email || "?").trim().charAt(0).toUpperCase() || "?"; }
  function updateProfileUI() {
    const avatar = $("#profileAvatar"); const label = $("#profileLabel"); const menuLabel = $("#profileMenuLabel"); const authAction = $("#profileAuthAction");
    if (!avatar || !label) return;
    if (customer) { avatar.innerHTML = customer.avatarUrl ? `<img src="${esc(customer.avatarUrl)}" alt="">` : esc(profileInitial()); label.textContent = customer.name || "Account"; menuLabel.textContent = `Signed in as ${customer.email}`; authAction.textContent = "Sign out"; }
    else { avatar.textContent = "?"; label.textContent = "Account"; menuLabel.textContent = "Your Raycrafting account"; authAction.textContent = "Sign in / create account"; }
  }
  function closeProfileMenu() { if ($("#profileMenu")) $("#profileMenu").hidden = true; }
  function openAboutModal() { closeProfileMenu(); $("#aboutModal").hidden = false; document.body.style.overflow = "hidden"; }
  async function openAccountModal() { closeProfileMenu(); if (!customer && !(await loadCustomer())) { openCheckout(); return; } $("#accountName").textContent = customer.name || "—"; $("#accountEmail").textContent = customer.email || "—"; $("#accountPhone").textContent = customer.phone || "Add at checkout"; $("#accountMethod").textContent = "Email or Google"; $("#accountModal").hidden = false; document.body.style.overflow = "hidden"; }
  function closeAccountModal() { $("#accountModal").hidden = true; if ($("#aboutModal").hidden && $("#checkoutModal").hidden && $("#ordersModal").hidden) document.body.style.overflow = ""; }
  function closeAboutModal() { $("#aboutModal").hidden = true; if ($("#accountModal").hidden && $("#checkoutModal").hidden && $("#ordersModal").hidden) document.body.style.overflow = ""; }
  function googleLogin(credential) { request("/auth/google", { method: "POST", body: JSON.stringify({ credential }) }).then(saveLogin).catch((error) => showMessage(error.message)); }
  async function setupGoogleAuth() { const target = $("#googleAuth"); if (!target) return; try { const config = await request("/config"); if (!config.googleEnabled || !config.googleClientId) { target.hidden = true; return; } const loadScript = () => new Promise((resolve, reject) => { if (window.google?.accounts?.id) return resolve(); const script = document.createElement("script"); script.src = "https://accounts.google.com/gsi/client"; script.async = true; script.defer = true; script.onload = resolve; script.onerror = reject; document.head.appendChild(script); }); await loadScript(); window.google.accounts.id.initialize({ client_id: config.googleClientId, callback: (response) => googleLogin(response.credential) }); const button = $("#googleSignInButton"); if (button && !button.dataset.ready) { window.google.accounts.id.renderButton(button, { theme: "outline", size: "large", text: "continue_with", shape: "rectangular", width: Math.min(420, window.innerWidth - 90) }); button.dataset.ready = "true"; } } catch { target.hidden = true; } }

  function showCheckoutFlow() { $("#commerceAuth").hidden = true; $("#commerceFlow").hidden = false; $("#customerBar").innerHTML = `<span>Signed in as <strong>${esc(customer.name)}</strong> · ${esc(customer.email)}</span><button id="logoutCustomer" type="button">Sign out</button>`; $("#logoutCustomer").addEventListener("click", logout); $("#addressName").value = customer.name || ""; $("#addressPhone").value = customer.phone || ""; renderCheckout(); }
  function openCheckout() { closeProfileMenu(); $("#checkoutModal").hidden = false; document.body.style.overflow = "hidden"; renderCheckout(); setupGoogleAuth(); loadCustomer().then((signedIn) => { if (signedIn) showCheckoutFlow(); else { $("#commerceAuth").hidden = false; $("#commerceFlow").hidden = true; showAuthTab("login"); } }); }
  function closeCheckout() { $("#checkoutModal").hidden = true; document.body.style.overflow = ""; }
  function saveLogin(data) { token = data.token; customer = data.customer; sessionStorage.setItem("raycrafting-customer-token", token); updateProfileUI(); closeProfileMenu(); showCheckoutFlow(); }
  async function login(event) { event.preventDefault(); const button = event.submitter; button.disabled = true; try { saveLogin(await request("/auth/login", { method: "POST", body: JSON.stringify({ email: $("#loginEmail").value, password: $("#loginPassword").value }) })); } catch (error) { showMessage(error.message); } finally { button.disabled = false; } }
  async function register(event) { event.preventDefault(); const button = event.submitter; button.disabled = true; try { saveLogin(await request("/auth/register", { method: "POST", body: JSON.stringify({ name: $("#registerName").value, email: $("#registerEmail").value, phone: $("#registerPhone").value, password: $("#registerPassword").value }) })); } catch (error) { showMessage(error.message); } finally { button.disabled = false; } }
  async function logout() { if (token) await request("/auth/logout", { method: "POST" }).catch(() => {}); token = ""; customer = null; sessionStorage.removeItem("raycrafting-customer-token"); updateProfileUI(); $("#commerceAuth").hidden = false; $("#commerceFlow").hidden = true; showAuthTab("login"); closeAccountModal(); }
  async function applyCoupon() { const code = $("#couponCode").value.trim(); if (!code) { coupon = { code: "", discount: 0 }; $("#couponMessage").textContent = ""; renderCheckout(); return; } try { const result = await request("/coupons/validate", { method: "POST", body: JSON.stringify({ code, subtotal: totals().subtotal }) }); coupon = result; $("#couponMessage").className = "commerce-message success"; $("#couponMessage").textContent = `${result.description} applied.`; renderCheckout(); } catch (error) { coupon = { code: "", discount: 0 }; $("#couponMessage").className = "commerce-message"; $("#couponMessage").textContent = error.message; renderCheckout(); } }
  function normalizeIndianPhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
    if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
    return digits;
  }
  function validIndianPhone(value) { return /^[6-9]\d{9}$/.test(normalizeIndianPhone(value)); }
  function validIndianPincode(value) { return /^[1-8]\d{5}$/.test(String(value || "").trim()); }
  function address() { return { name: $("#addressName").value.trim(), phone: normalizeIndianPhone($("#addressPhone").value), line1: $("#addressLine1").value.trim(), line2: $("#addressLine2").value.trim(), city: $("#addressCity").value.trim(), state: $("#addressState").value.trim(), postalCode: $("#addressPostalCode").value.trim() }; }
  function validateAddress() {
    const value = address();
    const checks = [
      [value.name.length >= 2 && value.name.length <= 120, "Enter your full name."],
      [validIndianPhone(value.phone), "Enter a valid 10-digit Indian mobile number starting with 6–9."],
      [value.line1.length >= 5 && value.line1.length <= 200, "Enter a complete address line 1."],
      [value.line2.length <= 200, "Address line 2 is too long."],
      [value.city.length >= 2 && value.city.length <= 80, "Enter a valid city."],
      [value.state.length >= 2 && value.state.length <= 80, "Enter a valid state."],
      [validIndianPincode(value.postalCode), "Enter a valid 6-digit Indian PIN code starting with 1–8."]
    ];
    const failed = checks.find((check) => !check[0]);
    const message = $("#addressMessage");
    if (message) { message.textContent = failed ? failed[1] : ""; message.className = failed ? "commerce-message" : "commerce-message success"; }
    return { valid: !failed, value, error: failed?.[1] || "" };
  }
  function loadRazorpay() { return new Promise((resolve, reject) => { if (window.Razorpay) return resolve(); const script = document.createElement("script"); script.src = "https://checkout.razorpay.com/v1/checkout.js"; script.onload = resolve; script.onerror = () => reject(new Error("Could not load Razorpay Checkout.")); document.head.appendChild(script); }); }
  function statusLabel(status) { return ({ pending_payment: "Pending payment", failed_payment: "Payment failed", paid: "Paid", processing: "Processing", shipped: "Shipped", out_for_delivery: "Out for delivery", delivered: "Delivered", cancel_requested: "Cancellation requested", return_requested: "Return requested", cancelled: "Cancelled", returned: "Returned", declined: "Declined" }[status] || status.replaceAll("_", " ")); }
  function renderOrders(orders) {
    const target = $("#ordersList");
    if (!orders.length) { target.innerHTML = `<p class="commerce-note">You have no orders yet. Your next bright thing will appear here.</p>`; return; }
    target.innerHTML = orders.map((order) => {
      const items = order.items.map((item) => `${item.quantity} × ${esc(item.name)} (${money(item.line_total)})`).join(" · ");
      const reasons = order.failure_reason ? `<p class="order-history-reason"><strong>Payment issue:</strong> ${esc(order.failure_reason)}</p>` : order.decision_reason ? `<p class="order-history-reason"><strong>Seller note:</strong> ${esc(order.decision_reason)}</p>` : order.customer_request_reason ? `<p class="order-history-reason"><strong>Your request:</strong> ${esc(order.customer_request_reason)}</p>` : "";
      const canCancel = ["pending_payment", "paid", "processing", "shipped"].includes(order.status);
      const canReturn = ["paid", "processing", "shipped", "out_for_delivery", "delivered"].includes(order.status);
      return `<article class="order-history-card"><div class="order-history-head"><div><h3>${esc(order.id)}</h3><p class="order-history-meta">${new Date(order.created_at).toLocaleString("en-IN")} · ${money(order.total)}</p></div><span class="order-history-status ${esc(order.status)}">${esc(statusLabel(order.status))}</span></div><div class="order-history-items">${items}</div>${reasons}${(canCancel || canReturn) ? `<div class="order-history-actions">${canCancel ? `<button type="button" data-order-action="cancel" data-order-id="${esc(order.id)}">Request cancellation</button>` : ""}${canReturn ? `<button type="button" data-order-action="return" data-order-id="${esc(order.id)}">Request return</button>` : ""}</div>` : ""}</article>`;
    }).join("");
  }
  async function loadSupport() {
    try { supportConfig = await request("/config"); } catch { /* The default support email remains available. */ }
    $("#chatSupport").href = `mailto:${encodeURIComponent(supportConfig.supportEmail || "hello@raycrafting.co")}?subject=${encodeURIComponent("Raycrafting order support")}`;
    const phone = String(supportConfig.supportPhone || "").trim();
    if (phone) { $("#callSupport").href = `tel:${phone.replace(/[^+\d]/g, "")}`; $("#callSupport").hidden = false; }
  }
  async function loadOrders() {
    $("#ordersLoginNote").hidden = Boolean(token);
    if (!token) { $("#ordersList").innerHTML = ""; return; }
    $("#ordersList").innerHTML = `<p class="commerce-note">Loading your orders…</p>`;
    try { const data = await request("/orders"); renderOrders(data.orders || []); } catch (error) { $("#ordersList").innerHTML = `<p class="commerce-message">${esc(error.message)}</p>`; }
  }
  function openOrders() { $("#ordersModal").hidden = false; document.body.style.overflow = "hidden"; loadSupport(); loadOrders(); }
  function closeOrders() { $("#ordersModal").hidden = true; if ($("#checkoutModal").hidden) document.body.style.overflow = ""; }
  async function orderAction(orderId, action) {
    const label = action === "cancel" ? "Why would you like to cancel this order?" : "Why would you like to return this order?";
    const reason = window.prompt(label); if (!reason || !reason.trim()) return;
    try { await request("/orders/action", { method: "POST", body: JSON.stringify({ orderId, action, reason: reason.trim() }) }); toast(action === "cancel" ? "Cancellation request sent." : "Return request sent."); loadOrders(); } catch (error) { window.alert(error.message); }
  }
  function addOrdersButton() {
    const actions = document.querySelector(".header-actions"); if (!actions || $("#ordersButton")) return;
    actions.insertAdjacentHTML("afterbegin", `<button class="orders-button" id="ordersButton" type="button">My orders</button>`);
    $("#ordersButton").addEventListener("click", openOrders);
  }
  async function pay() {
    const button = $("#payButton"); button.disabled = true; showMessage(""); try {
      const delivery = validateAddress();
      if (!delivery.valid) { showMessage(delivery.error); return; }
      const created = await request("/orders", { method: "POST", body: JSON.stringify({ items: getLines().map((item) => ({ id: item.id, quantity: item.quantity })), couponCode: coupon.code, address: delivery.value }) });
      razorpayConfig = razorpayConfig || await request("/config");
      if (!razorpayConfig.razorpayEnabled) throw new Error("Razorpay Test Mode is not configured yet. Add your test keys to .env, then restart the server.");
      const paymentOrder = await request("/payments/razorpay/order", { method: "POST", body: JSON.stringify({ orderId: created.orderId }) }); await loadRazorpay();
      const checkout = new Razorpay({ key: paymentOrder.keyId, amount: paymentOrder.amount, currency: "INR", name: "Raycrafting", description: `Order ${created.orderId}`, order_id: paymentOrder.orderId, prefill: { name: customer.name, email: customer.email, contact: customer.phone || address().phone }, config: { display: { blocks: { banks: { name: "Pay via UPI", instruments: [{ method: "upi" }] } }, sequence: ["block.banks"], preferences: { show_default_blocks: true } } }, theme: { color: "#e76e59" }, handler: async (response) => { try { await request("/verify-payment", { method: "POST", body: JSON.stringify({ orderId: created.orderId, razorpay_payment_id: response.razorpay_payment_id, razorpay_order_id: response.razorpay_order_id, razorpay_signature: response.razorpay_signature }) }); clearCartView(); closeCheckout(); toast("Payment received — your order is confirmed."); } catch (error) { showMessage(error.message); } } }); checkout.on("payment.failed", async (response) => { const reason = response.error?.description || "Payment was not completed."; await request("/payments/razorpay/failed", { method: "POST", body: JSON.stringify({ orderId: created.orderId, paymentId: response.error?.metadata?.payment_id || "", reason }) }).catch(() => {}); showMessage(`${reason} Your order is marked as failed; you can retry from My orders.`); }); checkout.open();
    } catch (error) { showMessage(error.message); } finally { button.disabled = false; }
  }
  function init() {
    injectStyles(); injectModal(); injectAccountUI();
    addOrdersButton();
    updateProfileUI();
    loadCustomer();
    setupGoogleAuth();
    $("#sellerAboutButton").addEventListener("click", openAboutModal);
    $("#profileButton").addEventListener("click", (event) => { event.stopPropagation(); $("#profileMenu").hidden = !$("#profileMenu").hidden; });
    $("#profileMenu").addEventListener("click", (event) => { const action = event.target.closest("[data-profile-action]")?.dataset.profileAction; if (!action) return; if (action === "about") openAboutModal(); else if (action === "account") openAccountModal(); else if (action === "orders") { closeProfileMenu(); openOrders(); } else if (action === "settings") openAccountModal(); else if (action === "auth") { if (customer) logout(); else openCheckout(); } });
    document.addEventListener("click", (event) => { if (!event.target.closest(".profile-area")) closeProfileMenu(); });
    $("#accountClose").addEventListener("click", closeAccountModal); $("#aboutClose").addEventListener("click", closeAboutModal);
    $("#accountModal").addEventListener("click", (event) => { if (event.target.id === "accountModal") closeAccountModal(); }); $("#aboutModal").addEventListener("click", (event) => { if (event.target.id === "aboutModal") closeAboutModal(); });
    $("#accountModal").addEventListener("click", (event) => { const action = event.target.closest("[data-account-action]")?.dataset.accountAction; if (action === "orders") { closeAccountModal(); openOrders(); } if (action === "signout") logout(); });
    $("#checkoutButton").addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); openCheckout(); }, true);
    $("#commerceClose").addEventListener("click", closeCheckout); $("#checkoutModal").addEventListener("click", (event) => { if (event.target.id === "checkoutModal") closeCheckout(); });
    $("#ordersClose").addEventListener("click", closeOrders); $("#ordersModal").addEventListener("click", (event) => { if (event.target.id === "ordersModal") closeOrders(); });
    $("#ordersLoginButton").addEventListener("click", () => { closeOrders(); openCheckout(); });
    $("#ordersList").addEventListener("click", (event) => { const action = event.target.closest("[data-order-action]"); if (action) orderAction(action.dataset.orderId, action.dataset.orderAction); });
    document.querySelectorAll("[data-auth-tab]").forEach((button) => button.addEventListener("click", () => showAuthTab(button.dataset.authTab)));
    $("#loginForm").addEventListener("submit", login); $("#registerForm").addEventListener("submit", register); $("#couponButton").addEventListener("click", applyCoupon); $("#payButton").addEventListener("click", pay);
    $("#addressPhone").addEventListener("input", (event) => { event.target.value = event.target.value.replace(/[^+\d ()-]/g, "").slice(0, 14); });
    $("#addressPostalCode").addEventListener("input", (event) => { event.target.value = event.target.value.replace(/\D/g, "").slice(0, 6); });
    $("#addressForm").addEventListener("input", () => { if ($("#addressMessage").textContent) validateAddress(); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeCheckout(); });
    const observer = new MutationObserver(() => decorateProducts()); observer.observe($("#productGrid"), { childList: true }); decorateProducts();
    document.addEventListener("click", (event) => { const card = event.target.closest(".product-card[data-product-id]"); if (card && event.target.closest("[data-action='details']")) setTimeout(() => decorateModal(products().find((product) => product.id === card.dataset.productId)), 0); });
    window.addEventListener("storage", (event) => { if (event.key === window.RAYCRAFTING_STORAGE_KEY || event.key === "raycrafting-cart") { coupon = { code: "", discount: 0 }; decorateProducts(); renderCheckout(); } });
  }
  init();
}());
