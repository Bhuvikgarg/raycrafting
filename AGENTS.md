# Raycrafting Agent Rules & Directives

## 1. Product Catalog & Pricing is 100% Strictly User-Authoritative
- **ABSOLUTE RULE: NEVER** autonomously change, alter, reduce, increase, reset, or revert product prices, names, details, categories, images, or order in ANY file (`catalog.js`, `products-seed.json`, `data/raycrafting.sqlite`, or scripts).
- If you ever propose or believe a product price or name needs to be updated, **YOU MUST ASK THE USER FIRST** and obtain explicit approval before altering anything.
- User edits made in the Admin Panel (`/admin`) are permanent and are the single source of truth in the live SQLite database (`products` and `custom_prices` tables).
- **NO WORKFLOW, NO CRON, NO SCRIPT** may ever overwrite or revert product data.
- Whenever making code changes, CSS updates, feature additions, or bug fixes, **NEVER** re-seed or touch the catalog files unless explicitly instructed by the user.

## 2. Complete Zero-Emoji Interface Policy
- **Never use emojis in customer-facing UI.** No emojis in announcement bars, navigation buttons, headings, toast notifications, sticky action bars, order tracking steps, badges, or emails.
- Clean typography, subtle SVGs, and intentional micro-copy convey sophistication and artisan luxury far better than casual emojis.
- If an icon is needed for verification, trust, search, or theme toggling, always use purposeful inline SVGs (e.g. Twitter-style verified badge, stroke search icon, moon/sun SVGs).

## 3. Brand Story & Intention Over AI Tropes
- Avoid generic AI copywriting ("Tiny joy, thoughtfully twisted", "Magical crafts", etc.).
- Main hero title is **Ray Crafting**.
- Narrative must be human, grounded, and cohesive:
  > *"Petals drift and fresh bouquets wither, but the warmth you share shouldn't have an expiration date. Each botanical sculpture and little companion is shaped with soft pipe-cleaners, patience, and intentional care — creating everlasting blooms that keep their sunshine forever."*
- Connect the falling daisies in the background directly with the brand's purpose: real flowers fade and drop petals, but Ray Crafting captures that beauty in everlasting blooms.

## 4. Phased Atmosphere Gradient
- The falling daisies background (`.fairy-background`) belongs strictly to the hero region and must be phased out via a linear gradient mask before the catalog starts:
  `-webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 88%);`
- Once shoppers reach the product catalog, background motion must not distract from evaluating products.

## 5. Mobile Product Cards: Immersive 1-per-Row & Bare Minimum Info
- On mobile devices (`<= 768px`), never cram products into a 2-column grid.
- Use a single large, full-width immersive card per row (`max-width: 440px; margin: 28px auto;`).
- Maintain uniform `aspect-ratio: 1 / 1;` with `object-fit: cover;` so images are never awkwardly cropped or of varying heights.
- Keep cards clean with **bare minimum info**: clean image, flower discount badge, product name, price, and Quick View tap target. Remove category tags, promotional labels, and view counts from mobile cards.
- View counts (`📸 X views`) must remain internal only for ranking algorithms; customers should not see view counts on catalog cards.

## 6. Flower-Shaped Discount Badge
- Do not use generic capsule/pill shapes for discounts on cards.
- Use an organic 8-petal floral rosette SVG container (`.product-discount-flower`) with `-10% OFF` centered inside, harmonizing with Raycrafting's floral aesthetic.

## 7. Twitter-Style Curvy Rosette Verified Buyer Badge
- In customer testimonials and reviews, do not write plain text `· Verified Buyer`.
- Place a familiar Twitter/X-style curvy scalloped rosette checkmark SVG badge (`.verified-rosette`) right next to the customer name for instant, intuitive trust recognition.

## 8. Semantic Search Engine
- Provide a prominent, always-accessible search bar in the catalog toolbar (`.shop-semantic-search`).
- Use client-side semantic scoring with tokenization, weighted multi-field relevance, and intent/synonym expansion (`SEMANTIC_SYNONYMS` for colors, occasions, materials, categories, and price intents like `under 200`).
- Offer instant clickable popular search tags (e.g. Lotus Lamp, Birthday Gifts, Sunflower, Bouquets).

## 9. Shadcn Skeletons & Elevated Standout Wrappers
- Use `.shadcn-skeleton` shimmer animation on image containers until the image triggers `onload`.
- Fade images in smoothly once loaded (`.is-loaded` opacity transition).
- For elevated card sections like `.custom-teaser` ("Create a custom gift"), always ensure generous margins (`margin: 64px auto 100px;`) and breathing room padding (`padding: 48px 56px;` / `36px 24px` on mobile) with soft elevation and rounded borders.

## 10. Filter Button Gradient Bleed Prevention
- Buttons with gradient backgrounds (e.g. `.filter-button.active`) must enforce `overflow: hidden !important; border-radius: 999px !important; background-clip: padding-box !important;` to eliminate WebKit gradient overflow artifacts.

## 11. Cloudinary Asset Optimization
- Support Cloudinary CDN delivery via `optimizeCloudinaryUrl(url)` with `f_auto,q_auto,w_800,c_limit`.
- Use `scripts/upload-cloudinary.js` to batch upload assets when `CLOUDINARY_URL` credentials are provided.

