# Raycrafting Agent Rules & Directives

## 1. Product Pricing is Strictly User-Authoritative
- **NEVER** autonomously change, alter, reduce, increase, or reset product prices in any file (`catalog.js`, `products-seed.json`, `data/raycrafting.sqlite`, or scripts).
- If you ever propose or believe a product price needs to be changed, **YOU MUST ASK THE USER FIRST** and obtain explicit approval before altering any price.
- User-customized prices are authoritative and protected in `raycrafting_user_prices` (localStorage) and `custom_prices` (SQLite).
- Never overwrite or reset user-customized prices when adding new products, updating images, re-ordering items, or deploying code.
