let products = loadProducts();
window.RAYCRAFTING_PRODUCTS = products;
const productGrid = document.querySelector("#productGrid");
const emptyState = document.querySelector("#emptyState");
const searchInput = document.querySelector("#searchInput");
const searchRow = document.querySelector("#searchRow");
const sortSelect = document.querySelector("#sortSelect");
const cartDrawer = document.querySelector("#cartDrawer");
const cartItems = document.querySelector("#cartItems");
const cartEmpty = document.querySelector("#cartEmpty");
const drawerFooter = document.querySelector("#drawerFooter");
const overlay = document.querySelector("#overlay");
const toast = document.querySelector("#toast");

let activeFilter = "All";
let selectedProduct = null;
let cart = JSON.parse(localStorage.getItem("raycrafting-cart") || "[]");

function loadProducts() {
  const saved = localStorage.getItem(window.RAYCRAFTING_STORAGE_KEY);
  return saved ? JSON.parse(saved) : window.RAYCRAFTING_DEFAULT_PRODUCTS.map((product) => ({ ...product }));
}

function productImage(product) {
  return product.image || window.RAYCRAFTING_DEFAULT_IMAGE;
}

function isProductActive(product) {
  return product && product.active !== false && product.active !== 0;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

const money = (value) => {
  const num = Number(value);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: num % 1 === 0 ? 0 : 2
  }).format(num);
};

function getVisibleProducts() {
  const query = searchInput.value.trim().toLowerCase();
  const visible = products.filter(isProductActive).filter((product) => {
    let matchesFilter = true;
    if (activeFilter === "All") matchesFilter = true;
    else if (activeFilter === "Flowers") matchesFilter = product.category === "Flowers";
    else if (activeFilter === "Keepsakes") matchesFilter = product.category === "Keepsakes";
    else if (activeFilter === "Bundles") matchesFilter = product.category === "Bundles";
    else if (activeFilter === "Under200") matchesFilter = product.price < 200;
    else if (activeFilter === "Bestsellers") matchesFilter = product.badge === "Bestseller" || product.badge === "Trending" || product.featured <= 4;

    const matchesSearch = !query || `${product.name} ${product.category} ${product.detail} ${product.description || ""} ${product.badge || ""}`.toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });
  return visible.sort((a, b) => {
    if (sortSelect.value === "low") return a.price - b.price;
    if (sortSelect.value === "high") return b.price - a.price;
    if (sortSelect.value === "name") return a.name.localeCompare(b.name);
    return a.featured - b.featured;
  });
}

function productMarkup(product) {
  const liked = localStorage.getItem(`raycrafting-like-${product.id}`) === "true";
  const badge = product.badge ? `<span class="product-badge">${escapeHtml(product.badge)}</span>` : "";
  const orig = Number(product.original_price || product.originalPrice || 0);
  const oldPriceHtml = orig > product.price ? `<span class="product-price-old">${money(orig)}</span>` : "";

  let discountPill = "";
  if (orig > product.price) {
    const pct = Math.round(((orig - product.price) / orig) * 100);
    if (pct >= 5) {
      discountPill = `<span class="product-discount-pill">${pct}% OFF</span>`;
    }
  }

  return `<article class="product-card" data-product-id="${escapeHtml(product.id)}">
    <div class="product-image art-${escapeHtml(product.art || "default")}" data-action="details">
      <img src="${escapeHtml(productImage(product))}" alt="${escapeHtml(product.name)}, a handmade ${escapeHtml(product.category.toLowerCase())}" loading="lazy" />
      <span class="product-tag">${escapeHtml(product.category)}</span>
      ${badge}
      ${discountPill}
      <button class="wish-button ${liked ? "active" : ""}" type="button" data-action="like" aria-label="${liked ? "Remove" : "Add"} ${escapeHtml(product.name)} ${liked ? "from" : "to"} wishlist">${liked ? "♥" : "♡"}</button>
      <div class="product-quick-view-overlay" data-action="details">
        <span class="quick-view-btn">Quick View 👁</span>
      </div>
    </div>
    <div class="product-info">
      <div class="product-heading">
        <h3 data-action="details">${escapeHtml(product.name)}</h3>
        <p>${escapeHtml(product.detail)}</p>
      </div>
      <div class="product-price-box">
        <span class="product-price">${money(product.price)}</span>
        ${oldPriceHtml}
      </div>
      <div class="product-actions-grid">
        <button class="action-btn action-btn-bag" type="button" data-action="add" aria-label="Add ${escapeHtml(product.name)} to bag">
          <span>Add to bag +</span>
        </button>
        <button class="action-btn action-btn-buy" type="button" data-action="buy-now" aria-label="Buy ${escapeHtml(product.name)} now">
          <span>Buy now ⚡</span>
        </button>
      </div>
    </div>
  </article>`;
}

function renderProducts() {
  const visible = getVisibleProducts();
  productGrid.innerHTML = visible.map(productMarkup).join("");
  emptyState.hidden = visible.length > 0;
}

function saveCart() {
  localStorage.setItem("raycrafting-cart", JSON.stringify(cart));
  renderCart();
}

function cartQuantity() {
  return cart.reduce((total, item) => total + item.quantity, 0);
}

function addToCart(productId, notify = true) {
  const product = products.find((item) => item.id === productId && isProductActive(item));
  if (!product) return;
  const existing = cart.find((item) => item.id === productId);
  if (existing) existing.quantity += 1;
  else cart.push({ id: productId, quantity: 1 });
  saveCart();
  if (notify) showToast(`${product.name} added to your bag.`);
}

function updateQuantity(productId, change) {
  const item = cart.find((entry) => entry.id === productId);
  if (!item) return;
  item.quantity += change;
  if (item.quantity <= 0) cart = cart.filter((entry) => entry.id !== productId);
  saveCart();
}

function renderCart() {
  cart = cart.filter((item) => products.some((product) => product.id === item.id && isProductActive(product)));
  const quantity = cartQuantity();
  document.querySelector("#cartCount").textContent = quantity;
  document.querySelector("#drawerCount").textContent = `(${quantity})`;
  cartEmpty.hidden = cart.length > 0;
  drawerFooter.hidden = cart.length === 0;
  cartItems.innerHTML = cart.map((item) => {
    const product = products.find((entry) => entry.id === item.id);
    return `<div class="cart-line"><div class="cart-line-art art-${escapeHtml(product.art || "default")} "><img src="${escapeHtml(productImage(product))}" alt="" /></div><div><h3>${escapeHtml(product.name)}</h3><p>${money(product.price)} · ${escapeHtml(product.detail)}</p><div class="qty-control"><button type="button" data-quantity="-1" data-id="${escapeHtml(product.id)}" aria-label="Decrease quantity">−</button><span>${item.quantity}</span><button type="button" data-quantity="1" data-id="${escapeHtml(product.id)}" aria-label="Increase quantity">+</button></div><button class="remove-line" type="button" data-remove="${escapeHtml(product.id)}">Remove</button></div><span class="cart-line-price">${money(product.price * item.quantity)}</span></div>`;
  }).join("");
  const subtotal = cart.reduce((total, item) => total + products.find((product) => product.id === item.id).price * item.quantity, 0);
  document.querySelector("#cartSubtotal").textContent = money(subtotal);

  const FREE_SHIPPING_THRESHOLD = 499;
  const shippingBarWrap = document.querySelector("#drawerShippingBar");
  if (shippingBarWrap) {
    if (subtotal >= FREE_SHIPPING_THRESHOLD) {
      shippingBarWrap.innerHTML = `
        <div class="shipping-bar-text shipping-unlocked">🎉 <strong>You've unlocked FREE Delivery!</strong></div>
        <div class="shipping-progress-track"><div class="shipping-progress-fill unlocked" style="width: 100%"></div></div>
      `;
    } else {
      const diff = FREE_SHIPPING_THRESHOLD - subtotal;
      const pct = Math.min(100, Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100));
      shippingBarWrap.innerHTML = `
        <div class="shipping-bar-text">Add <strong>${money(diff)}</strong> more for <strong>FREE delivery</strong>! 🚚</div>
        <div class="shipping-progress-track"><div class="shipping-progress-fill" style="width: ${pct}%"></div></div>
      `;
    }
  }
}

async function loadPublicProducts() {
  try {
    const response = await fetch("/api/products", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    if (!Array.isArray(data.products)) return;
    products = data.products;
    window.RAYCRAFTING_PRODUCTS = products;
    renderProducts();
    renderCart();
  } catch {
    // The browser catalog remains available if the API is temporarily offline.
  }
}

function setDrawer(open) {
  cartDrawer.classList.toggle("open", open);
  cartDrawer.setAttribute("aria-hidden", String(!open));
  overlay.hidden = !open;
  document.body.style.overflow = open ? "hidden" : "";
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove("show"), 2600);
}

function openProduct(product) {
  selectedProduct = product;
  document.querySelector("#modalArt").innerHTML = `<img src="${escapeHtml(productImage(product))}" alt="${escapeHtml(product.name)}" />`;
  document.querySelector("#modalTitle").textContent = product.name;
  document.querySelector("#modalCategory").textContent = product.category;
  document.querySelector("#modalDescription").textContent = product.description;
  const orig = Number(product.original_price || product.originalPrice || 0);
  const oldPriceHtml = orig > product.price ? ` <span class="product-price-old">${money(orig)}</span>` : "";
  document.querySelector("#modalPrice").innerHTML = `${money(product.price)}${oldPriceHtml}`;
  document.querySelector("#modalDetail").textContent = product.detail;
  const specs = document.querySelector("#modalSpecs");
  if (specs) {
    specs.innerHTML = `
      <div class="modal-spec-row"><span>📏 <strong>Size</strong></span><span>${escapeHtml(product.dimensions || "~14-16 cm tall")}</span></div>
      <div class="modal-spec-row"><span>🌿 <strong>Craft Materials</strong></span><span>${escapeHtml(product.materials || "Velvety chenille stems & craft pot")}</span></div>
      <div class="modal-spec-row"><span>✨ <strong>Care &amp; Longevity</strong></span><span>${escapeHtml(product.care || "Everlasting bloom · Never withers · Zero watering")}</span></div>
      <div class="modal-spec-row"><span>📦 <strong>Gift Ready</strong></span><span>Dispatched in 24-48h in crush-proof box</span></div>
    `;
  }
  document.querySelector("#productModal").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  document.querySelector("#productModal").hidden = true;
  if (!cartDrawer.classList.contains("open")) document.body.style.overflow = "";
}

document.querySelector("#filterGroup").addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  activeFilter = button.dataset.filter;
  document.querySelectorAll(".filter-button").forEach((item) => item.classList.toggle("active", item === button));
  renderProducts();
});

sortSelect.addEventListener("change", renderProducts);
searchInput.addEventListener("input", renderProducts);
document.querySelector("#searchToggle").addEventListener("click", () => {
  searchRow.hidden = !searchRow.hidden;
  if (!searchRow.hidden) searchInput.focus();
});
document.querySelector("#clearSearch").addEventListener("click", () => { searchInput.value = ""; renderProducts(); searchInput.focus(); });

productGrid.addEventListener("click", (event) => {
  const card = event.target.closest("[data-product-id]");
  if (!card) return;
  const product = products.find((item) => item.id === card.dataset.productId && isProductActive(item));
  if (!product) return;

  if (event.target.closest("[data-action='like']")) {
    const liked = localStorage.getItem(`raycrafting-like-${product.id}`) === "true";
    localStorage.setItem(`raycrafting-like-${product.id}`, String(!liked));
    renderProducts();
    return;
  }

  if (event.target.closest("[data-action='buy-now']")) {
    addToCart(product.id, false);
    if (typeof window.raycraftingOpenCheckout === "function") {
      window.raycraftingOpenCheckout();
    } else {
      setDrawer(true);
    }
    return;
  }

  const addBtn = event.target.closest("[data-action='add']");
  if (addBtn) {
    addToCart(product.id);
    const originalHtml = addBtn.innerHTML;
    addBtn.innerHTML = `<span>Added! 🌸</span>`;
    addBtn.classList.add("added-feedback");
    setTimeout(() => {
      addBtn.innerHTML = originalHtml;
      addBtn.classList.remove("added-feedback");
    }, 1200);

    const cartToggle = document.querySelector("#cartToggle");
    if (cartToggle) {
      cartToggle.classList.remove("cart-bump");
      void cartToggle.offsetWidth;
      cartToggle.classList.add("cart-bump");
    }
    return;
  }

  if (event.target.closest("[data-action='details']") || event.target.closest(".product-image") || event.target.closest("h3")) {
    openProduct(product);
  }
});

document.querySelector("#modalAdd").addEventListener("click", () => {
  if (!selectedProduct) return;
  addToCart(selectedProduct.id);
  closeModal();
  setDrawer(true);
});

const modalBuyNow = document.querySelector("#modalBuyNow");
if (modalBuyNow) {
  modalBuyNow.addEventListener("click", () => {
    if (!selectedProduct) return;
    addToCart(selectedProduct.id, false);
    closeModal();
    if (typeof window.raycraftingOpenCheckout === "function") {
      window.raycraftingOpenCheckout();
    } else {
      setDrawer(true);
    }
  });
}
document.querySelectorAll(".modal-close").forEach((button) => button.addEventListener("click", closeModal));
document.querySelector("#cartToggle").addEventListener("click", () => setDrawer(true));
document.querySelector("#cartClose").addEventListener("click", () => setDrawer(false));
overlay.addEventListener("click", () => setDrawer(false));
document.querySelector("#emptyShop").addEventListener("click", () => setDrawer(false));

cartItems.addEventListener("click", (event) => {
  const quantityButton = event.target.closest("[data-quantity]");
  const removeButton = event.target.closest("[data-remove]");
  if (quantityButton) updateQuantity(quantityButton.dataset.id, Number(quantityButton.dataset.quantity));
  if (removeButton) { cart = cart.filter((item) => item.id !== removeButton.dataset.remove); saveCart(); }
});
const giftCheck = document.querySelector("#giftNoteCheck");
const giftBox = document.querySelector("#giftNoteBox");
const giftInput = document.querySelector("#giftNoteInput");
if (giftCheck && giftBox && giftInput) {
  const savedNote = localStorage.getItem("raycrafting-gift-note") || "";
  if (savedNote) {
    giftCheck.checked = true;
    giftBox.hidden = false;
    giftInput.value = savedNote;
  }
  giftCheck.addEventListener("change", () => {
    giftBox.hidden = !giftCheck.checked;
    if (!giftCheck.checked) {
      localStorage.removeItem("raycrafting-gift-note");
      giftInput.value = "";
    } else {
      giftInput.focus();
    }
  });
  giftInput.addEventListener("input", () => {
    localStorage.setItem("raycrafting-gift-note", giftInput.value.trim());
  });
}

fetch("/api/config").then((r) => r.json()).then((cfg) => {
  const wa = document.querySelector("#whatsappFloat");
  if (wa && cfg.supportPhone) {
    const cleanPhone = String(cfg.supportPhone).replace(/\D/g, "");
    wa.href = `https://wa.me/${cleanPhone.startsWith("91") ? cleanPhone : "91" + cleanPhone}?text=${encodeURIComponent("Hi Raycrafting! I'm browsing your online shop and had a question about custom flowers/orders.")}`;
    wa.target = "_blank";
    wa.rel = "noopener noreferrer";
  }
}).catch(() => {});

document.querySelector("#newsletterForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target; const button = form.querySelector("button"); const message = document.querySelector("#newsletterMessage");
  button.disabled = true; message.textContent = "Saving your email…";
  try {
    const response = await fetch("/api/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: document.querySelector("#newsletterEmail").value.trim() }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not join the list.");
    message.textContent = data.message || "You’re on the list. A little brightness is on its way."; form.reset();
  } catch (error) { message.textContent = error.message; } finally { button.disabled = false; }
});

document.querySelectorAll("[data-scroll]").forEach((button) => button.addEventListener("click", () => document.querySelector(`#${button.dataset.scroll}`).scrollIntoView({ behavior: "smooth" })));
window.addEventListener("storage", (event) => {
  if (event.key === window.RAYCRAFTING_STORAGE_KEY) window.location.reload();
});
document.addEventListener("keydown", (event) => { if (event.key === "Escape") { closeModal(); setDrawer(false); } });

renderProducts();
renderCart();
loadPublicProducts();


const heroFrame = document.querySelector("#heroSlideshow");
const heroSlides = Array.from(document.querySelectorAll(".hero-slide"));
const heroCounter = document.querySelector("#heroCounter");
const heroCaption = document.querySelector("#heroCaption");
let activeHeroSlide = 0;
function showHeroSlide(index) {
  if (!heroSlides.length) return;
  activeHeroSlide = (index + heroSlides.length) % heroSlides.length;
  heroSlides.forEach((slide, slideIndex) => {
    const active = slideIndex === activeHeroSlide;
    slide.classList.toggle("is-active", active);
    slide.setAttribute("aria-hidden", String(!active));
  });
  if (heroCounter) heroCounter.textContent = String(activeHeroSlide + 1).padStart(2, "0") + " / " + String(heroSlides.length).padStart(2, "0");
  if (heroCaption) heroCaption.textContent = heroSlides[activeHeroSlide].dataset.caption || "the little things collection";
}
if (heroFrame && heroSlides.length > 1) {
  showHeroSlide(0);
  setInterval(() => showHeroSlide(activeHeroSlide + 1), 5200);
}

// ==========================================
// Floating Daisies & Fairy Glitter Atmosphere
// ==========================================
function initFairyAtmosphere() {
  const container = document.querySelector("#fairyBackground");
  if (!container) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) return;

  const DAISY_SVG = `
    <svg viewBox="0 0 40 40" class="fairy-daisy-svg" aria-hidden="true">
      <g transform="translate(20,20)">
        <ellipse cx="0" cy="-12" rx="4.5" ry="7" fill="rgba(255, 255, 255, 0.92)" />
        <ellipse cx="0" cy="-12" rx="4.5" ry="7" fill="rgba(255, 255, 255, 0.92)" transform="rotate(45)" />
        <ellipse cx="0" cy="-12" rx="4.5" ry="7" fill="rgba(255, 255, 255, 0.92)" transform="rotate(90)" />
        <ellipse cx="0" cy="-12" rx="4.5" ry="7" fill="rgba(255, 255, 255, 0.92)" transform="rotate(135)" />
        <ellipse cx="0" cy="-12" rx="4.5" ry="7" fill="rgba(255, 255, 255, 0.92)" transform="rotate(180)" />
        <ellipse cx="0" cy="-12" rx="4.5" ry="7" fill="rgba(255, 255, 255, 0.92)" transform="rotate(225)" />
        <ellipse cx="0" cy="-12" rx="4.5" ry="7" fill="rgba(255, 255, 255, 0.92)" transform="rotate(270)" />
        <ellipse cx="0" cy="-12" rx="4.5" ry="7" fill="rgba(255, 255, 255, 0.92)" transform="rotate(315)" />
        <circle cx="0" cy="0" r="5" fill="#f8c850" />
        <circle cx="-1.5" cy="-1.5" r="1.5" fill="#ffeaa7" opacity="0.85" />
      </g>
    </svg>
  `;

  const SPARKLE_SVG = `
    <svg viewBox="0 0 24 24" class="fairy-sparkle-svg" aria-hidden="true">
      <path d="M12 0 C12 6.6 17.4 12 24 12 C17.4 12 12 17.4 12 24 C12 17.4 6.6 12 0 12 C6.6 12 12 6.6 12 0 Z" />
    </svg>
  `;

  const isMobile = window.innerWidth < 768;
  const daisyCount = isMobile ? 8 : 16;
  const sparkleCount = isMobile ? 12 : 24;

  const fragment = document.createDocumentFragment();

  for (let i = 0; i < daisyCount; i++) {
    const daisy = document.createElement("div");
    daisy.className = "floating-daisy";
    daisy.innerHTML = DAISY_SVG;

    const size = Math.floor(Math.random() * 14) + 16;
    const left = (Math.random() * 96 + 2).toFixed(1);
    const duration = (Math.random() * 12 + 14).toFixed(1);
    const delay = -(Math.random() * 25).toFixed(1);
    const sway = (Math.random() * 60 - 30).toFixed(0) + "px";
    const opacity = (Math.random() * 0.35 + 0.45).toFixed(2);

    daisy.style.setProperty("--size", `${size}px`);
    daisy.style.setProperty("--left", `${left}%`);
    daisy.style.setProperty("--duration", `${duration}s`);
    daisy.style.setProperty("--delay", `${delay}s`);
    daisy.style.setProperty("--sway-x", sway);
    daisy.style.setProperty("--target-opacity", opacity);

    fragment.appendChild(daisy);
  }

  for (let i = 0; i < sparkleCount; i++) {
    const sparkle = document.createElement("div");
    sparkle.className = "glitter-sparkle";
    sparkle.innerHTML = SPARKLE_SVG;

    const size = Math.floor(Math.random() * 9) + 8;
    const left = (Math.random() * 96 + 2).toFixed(1);
    const top = (Math.random() * 96 + 2).toFixed(1);
    const duration = (Math.random() * 3 + 2.5).toFixed(1);
    const delay = -(Math.random() * 5).toFixed(1);
    const opacity = (Math.random() * 0.45 + 0.35).toFixed(2);
    const color = i % 2 === 0 ? "rgba(240, 191, 72, 0.85)" : "rgba(231, 110, 89, 0.75)";

    sparkle.style.setProperty("--size", `${size}px`);
    sparkle.style.setProperty("--left", `${left}%`);
    sparkle.style.setProperty("--top", `${top}%`);
    sparkle.style.setProperty("--duration", `${duration}s`);
    sparkle.style.setProperty("--delay", `${delay}s`);
    sparkle.style.setProperty("--glitter-opacity", opacity);
    sparkle.style.color = color;

    fragment.appendChild(sparkle);
  }

  container.appendChild(fragment);

  // Delightful interactive click / tap sparkle burst
  document.addEventListener("pointerdown", (e) => {
    if (e.target.closest("input, textarea, select")) return;
    createSparkleBurst(e.clientX, e.clientY);
  }, { passive: true });
}

function createSparkleBurst(x, y) {
  if (!x || !y) return;
  const count = 5;
  for (let i = 0; i < count; i++) {
    const star = document.createElement("div");
    star.className = "click-sparkle";
    star.innerHTML = `✦`;

    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * 35 + 15;
    const destX = Math.cos(angle) * distance;
    const destY = Math.sin(angle) * distance;
    const color = ["#f0bf48", "#e76e59", "#ff9a8b", "#ffd166"][Math.floor(Math.random() * 4)];

    star.style.left = `${x}px`;
    star.style.top = `${y}px`;
    star.style.color = color;
    star.style.setProperty("--dx", `${destX}px`);
    star.style.setProperty("--dy", `${destY}px`);

    document.body.appendChild(star);
    setTimeout(() => star.remove(), 700);
  }
}

initFairyAtmosphere();

