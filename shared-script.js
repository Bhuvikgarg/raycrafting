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

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR"
  }).format(Number(value));

function getVisibleProducts() {
  const query = searchInput.value.trim().toLowerCase();
  const visible = products.filter(isProductActive).filter((product) => {
    const matchesFilter = activeFilter === "All" || product.category === activeFilter;
    const matchesSearch = !query || `${product.name} ${product.category} ${product.detail}`.toLowerCase().includes(query);
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
  return `<article class="product-card" data-product-id="${escapeHtml(product.id)}">
    <div class="product-image art-${escapeHtml(product.art || "default")}">
      <img src="${escapeHtml(productImage(product))}" alt="${escapeHtml(product.name)}, a handmade ${escapeHtml(product.category.toLowerCase())}" loading="lazy" />
      <span class="product-tag">${escapeHtml(product.category)}</span>
      <button class="wish-button ${liked ? "active" : ""}" type="button" data-action="like" aria-label="${liked ? "Remove" : "Add"} ${escapeHtml(product.name)} ${liked ? "from" : "to"} wishlist">${liked ? "♥" : "♡"}</button>
    </div>
    <div class="product-info"><div><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.detail)}</p></div><span class="product-price">${money(product.price)}</span><div class="product-actions"><button class="quick-add" type="button" data-action="details">View details <span aria-hidden="true">↗</span></button><button class="quick-add quick-add-fill" type="button" data-action="add">Add to bag <span aria-hidden="true">+</span></button></div></div>
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

function addToCart(productId) {
  const product = products.find((item) => item.id === productId && isProductActive(item));
  if (!product) return;
  const existing = cart.find((item) => item.id === productId);
  if (existing) existing.quantity += 1;
  else cart.push({ id: productId, quantity: 1 });
  saveCart();
  showToast(`${product.name} added to your bag.`);
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
  document.querySelector("#modalPrice").textContent = money(product.price);
  document.querySelector("#modalDetail").textContent = product.detail;
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
  if (event.target.closest("[data-action='details']")) openProduct(product);
  if (event.target.closest("[data-action='add']")) { addToCart(product.id); setDrawer(true); }
});

document.querySelector("#modalAdd").addEventListener("click", () => { addToCart(selectedProduct.id); closeModal(); setDrawer(true); });
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

document.querySelector("#checkoutButton").addEventListener("click", () => {
  const order = cart.map((item) => `${item.quantity} x ${products.find((product) => product.id === item.id).name}`).join(", ");
  window.location.href = `mailto:hello@raycrafting.co?subject=Raycrafting%20order%20request&body=Hi%20Raycrafting,%0A%0AI'd%20like%20to%20order:%20${encodeURIComponent(order)}.%0A%0AMy%20name:%0ADelivery%20details:`;
});

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
