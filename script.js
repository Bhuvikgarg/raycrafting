const products = [
  { id: "sunbeam", name: "Sunbeam Stem", category: "Flowers", price: 18, detail: "one stem", description: "A happy yellow bloom for the corner of your desk or the friend who always brings the light.", art: "sunbeam", featured: 1 },
  { id: "coral-bloom", name: "Coral Bloom", category: "Flowers", price: 24, detail: "one stem", description: "A warm coral flower with a soft green stem, made to brighten a small shelf or bedside table.", art: "coral", featured: 2 },
  { id: "tiny-daisy", name: "Tiny Daisy Charm", category: "Keepsakes", price: 12, detail: "bag charm", description: "A pocket-sized daisy for your keys, tote, or the little hook by your front door.", art: "daisy", featured: 3 },
  { id: "meadow-bundle", name: "Meadow Bundle", category: "Bundles", price: 42, detail: "three stems", description: "A small mix of sunshine, sage, and soft pink, tied together for a ready-made gift.", art: "meadow", featured: 4 },
  { id: "lavender-loop", name: "Lavender Loop", category: "Keepsakes", price: 16, detail: "desk charm", description: "A little lavender loop that sits happily on a pinboard, monitor, or gift wrap.", art: "lavender", featured: 5 },
  { id: "sunset-trio", name: "Sunset Trio", category: "Bundles", price: 58, detail: "three stems", description: "Three warm-toned blooms bundled for a full, cheerful arrangement that never needs a vase change.", art: "sunset", featured: 6 }
];

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

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR"
  }).format(Number(value));

function getVisibleProducts() {
  const query = searchInput.value.trim().toLowerCase();
  const visible = products.filter((product) => {
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
  return `<article class="product-card" data-product-id="${product.id}">
    <div class="product-image art-${product.art}">
      <img src="assets/raycrafting-collection.png" alt="${product.name}, a handmade ${product.category.toLowerCase()}" loading="lazy" />
      <span class="product-tag">${product.category}</span>
      <button class="wish-button ${liked ? "active" : ""}" type="button" data-action="like" aria-label="${liked ? "Remove" : "Add"} ${product.name} ${liked ? "from" : "to"} wishlist">${liked ? "♥" : "♡"}</button>
    </div>
    <div class="product-info"><div><h3>${product.name}</h3><p>${product.detail}</p></div><span class="product-price">${money(product.price)}</span><button class="quick-add" type="button" data-action="details">View details <span aria-hidden="true">↗</span></button></div>
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
  const existing = cart.find((item) => item.id === productId);
  if (existing) existing.quantity += 1;
  else cart.push({ id: productId, quantity: 1 });
  saveCart();
  showToast(`${products.find((item) => item.id === productId).name} added to your bag.`);
}

function updateQuantity(productId, change) {
  const item = cart.find((entry) => entry.id === productId);
  if (!item) return;
  item.quantity += change;
  if (item.quantity <= 0) cart = cart.filter((entry) => entry.id !== productId);
  saveCart();
}

function renderCart() {
  const quantity = cartQuantity();
  document.querySelector("#cartCount").textContent = quantity;
  document.querySelector("#drawerCount").textContent = `(${quantity})`;
  cartEmpty.hidden = cart.length > 0;
  drawerFooter.hidden = cart.length === 0;
  cartItems.innerHTML = cart.map((item) => {
    const product = products.find((entry) => entry.id === item.id);
    return `<div class="cart-line"><div class="cart-line-art art-${product.art}"><img src="assets/raycrafting-collection.png" alt="" /></div><div><h3>${product.name}</h3><p>${money(product.price)} · ${product.detail}</p><div class="qty-control"><button type="button" data-quantity="-1" data-id="${product.id}" aria-label="Decrease quantity">−</button><span>${item.quantity}</span><button type="button" data-quantity="1" data-id="${product.id}" aria-label="Increase quantity">+</button></div><button class="remove-line" type="button" data-remove="${product.id}">Remove</button></div><span class="cart-line-price">${money(product.price * item.quantity)}</span></div>`;
  }).join("");
  const subtotal = cart.reduce((total, item) => total + products.find((product) => product.id === item.id).price * item.quantity, 0);
  document.querySelector("#cartSubtotal").textContent = money(subtotal);
}

function clearCart() {
  cart = [];
  try { localStorage.removeItem("raycrafting-cart"); } catch {}
  renderCart();
}
window.raycraftingClearCart = clearCart;
window.addEventListener("raycrafting:cart-cleared", clearCart);

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
  document.querySelector("#modalArt").innerHTML = `<img src="assets/raycrafting-collection.png" alt="${product.name}" />`;
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
  const product = products.find((item) => item.id === card.dataset.productId);
  if (event.target.closest("[data-action='like']")) {
    const liked = localStorage.getItem(`raycrafting-like-${product.id}`) === "true";
    localStorage.setItem(`raycrafting-like-${product.id}`, String(!liked));
    renderProducts();
    return;
  }
  if (event.target.closest("[data-action='details']")) openProduct(product);
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

document.querySelector("#newsletterForm").addEventListener("submit", (event) => {
  event.preventDefault();
  document.querySelector("#newsletterMessage").textContent = "You’re on the list. A little brightness is on its way.";
  event.target.reset();
});

document.querySelectorAll("[data-scroll]").forEach((button) => button.addEventListener("click", () => document.querySelector(`#${button.dataset.scroll}`).scrollIntoView({ behavior: "smooth" })));
document.addEventListener("keydown", (event) => { if (event.key === "Escape") { closeModal(); setDrawer(false); } });

renderProducts();
renderCart();
