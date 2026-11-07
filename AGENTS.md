# Raycrafting Agent Rules & Directives

## 1. Product Catalog & Pricing is 100% Strictly User-Authoritative
- **ABSOLUTE RULE: NEVER** autonomously change, alter, reduce, increase, reset, or revert product prices, names, details, categories, images, or order in ANY file (`catalog.js`, `products-seed.json`, `data/raycrafting.sqlite`, or scripts).
- If you ever propose or believe a product price or name needs to be updated, **YOU MUST ASK THE USER FIRST** and obtain explicit approval before altering anything.
- User edits made in the Admin Panel (`/admin`) are permanent and are the single source of truth in the live SQLite database (`products` and `custom_prices` tables).
- **NO WORKFLOW, NO CRON, NO SCRIPT** may ever overwrite or revert product data.
- Whenever making code changes, CSS updates, feature additions, or bug fixes, **NEVER** re-seed or touch the catalog files unless explicitly instructed by the user.
