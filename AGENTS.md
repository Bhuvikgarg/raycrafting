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

## 12. Button Typography & Arrow-Free Clickable Styling (LitsocWebsite Standard)
- **No Arrows in Buttons:** Never include arrows (`↗`, `→`, `›`, `&rarr;`, `&nearr;`, or `+`) inside buttons or call-to-action links. All button text must be clean and direct (e.g. `SHOP THE COLLECTION`, `CUSTOM ORDERS`, `ADD TO BAG`, `BUY NOW`, `CONTINUE TO CHECKOUT`).
- **Big, Bold, Impactful Typography:** Use the `Antonio` condensed display font (`--font-btn: "Antonio", "DM Sans", sans-serif`) inspired by `https://github.com/p1yush-exe/LitsocWebsite` with bold 700 weight, uppercase transformation, `letter-spacing: 0.04em - 0.05em`, and prominent size (1.12rem - 1.25rem).
- **Superior Clickability & Touch Targets:** Enforce comfortable touch heights (`min-height: 48px`), generous horizontal padding, rounded pill shapes (`border-radius: 999px`), and tactile hover/active states for maximum engagement on both mobile and desktop.
- **Permanent Pricing Preservation Lock:** Never purge `raycrafting_user_prices` from `localStorage` during cache migrations, and ensure both frontend client (`shared-script.js`) and backend SQLite (`server.js`) strictly maintain the user-set prices without autonomous overwrites.

## 13. Catalogue Ambience, Full-Fit Borderless Imagery & Mobile Alignment
- **Soft Dreamy Catalogue Ambience (No Harsh Dark Blocks):** Product cards must maintain Raycrafting's signature warm, gentle, light pastel aesthetic (`background: #ffffff`, soft plum text `#24141e`, muted berry detail `#5c4352`, vibrant rose-pink prices `#ad2951`, and creamy-pink button pills). Avoid harsh, pitch-black blocks or heavy dark overlays that disrupt the soft blush ambience.
- **Full-Fit Edge-to-Edge Product Images:** All product images must be cropped clean of matte white border padding so photos fit edge-to-edge full bleed (`object-fit: cover; aspect-ratio: 1 / 1; width: 100%`) with zero white letterboxing.
- **Strict Mobile View Alignment:** Mobile cards (`.product-card`) must fit cleanly within the viewport (`width: 100%; max-width: 420px; margin: 0 auto; box-sizing: border-box;`). Never combine fixed `min-height` with `aspect-ratio` on cards as this forces width expansion beyond narrow mobile screens and causes left-clipped misalignment. Container `.section-shell` enforces equal 16px lateral gutters (`width: calc(100% - 32px); margin-inline: auto; padding-inline: 0;`).
- **Concise Hero Story Copy:** Keep the hero story paragraph beneath "Ray Crafting" concise and grounded (1-2 lines): *"Handcrafted everlasting blooms and little companions, shaped with soft pipe-cleaners to keep their sunshine forever."*
- **Hero Showcase Carousel (Awwwards-Grade):** Sleek thumb-accessible navigation controls (`‹` and `›`) in an editorial showcase panel below the frame, bold counter chips (`01 / 05`), status chips (`Featured Creation`), popping titles, actionable exploration pills (`EXPLORE PIECE`), and fluid horizontal touch swipe gestures (`touchstart`, `touchmove`, `touchend`).
- **Die-Cut Craft Sticker (Keel Architecture):** Handcrafted badges on showcase photos follow authentic die-cut paper peel sticker styling (`vaidikcode/keel`): 2.5px solid white border, 12px rounded corners, realistic drop shadow, 6deg rotation tilt, and a folded corner gradient crease (`.sticker-peel`).
- **Gradient Overflow Prevention on Filter Pills:** When styling active category pills (`.filter-button.active`), strictly eliminate colored box shadows that cast a pink gradient haze on WebKit browsers, and enforce `border: none !important; box-shadow: none !important; overflow: hidden !important; -webkit-mask-image: -webkit-radial-gradient(white, black);` for crisp, bleed-free pill contours.

## 14. Product-Linked Community Reviews & Post-Purchase Review Flow
- **Unified Cross-Catalogue Review Feed:** The reviews section (`#reviews`) operates as a dynamic, shared community feed displaying reviews for any piece across the store. Static hardcoded dummy reviews are prohibited.
- **Explicit Product Referencing:** Every review card must prominently display a clickable product reference pill (`.review-product-ref`) containing:
  - Product thumbnail image (rounded, cropped edge-to-edge).
  - Product name and "Review for" label.
  - Directional jump cue (`↗`) that smoothly scrolls to the catalogue, flashes an attention pulse, and opens the product detail modal.
- **Seamless Post-Purchase Review Access:**
  - **Order Confirmation Modal (`#orderConfirmModal`):** Immediately upon completing checkout, an interactive review prompt lists every purchased item with a direct "Review Piece ★" button.
  - **"My Orders" Modal (`#ordersModal`):** In past order history cards, each ordered piece has a "Review [Product Name] ★" button.
  - **Order Receipt Page (`thank-you.html`):** In the order details summary, each line item links directly to `index.html?reviewProduct=<id>&orderId=<orderId>#reviews`.
  - Clicking any of these pre-selects the product, pre-fills the `orderId`, and automatically grants the Twitter-style verified rosette checkmark upon review submission.
- **Review Submission Modal (`#reviewModal`):**
  - Accessible via "WRITE A REVIEW" CTA in the reviews section or from post-purchase buttons.
  - Includes a product dropdown selector (pre-populated with active catalogue items), an interactive 5-star rating selector (`.star-rating-select`), customer name, optional city, and review textarea.
  - Validates and stores reviews in SQLite via `POST /api/reviews` with instant client-side rendering and `localStorage` caching for zero-latency offline resilience.
- **Removal of Size Characteristics from Product Descriptions:**
  - Product descriptions and modals must focus on craftsmanship, materials, longevity, and care. Size/dimension rows are excluded from customer-facing product specifications to keep descriptions clean and focus on emotional craft appeal.




## 15. Color Choice Options Architecture & Visual Selection Flow
- **Visual Photo Swatches for Multi-Option Products:** For products with multiple colors or styles (e.g. rings, bouquets, wristlets, magnets, lamps), buyers are shown interactive photo swatches displaying the actual photo of the colored option (`.color-choice-card`), with option title and active check badge (`✓`).
- **Real-Time Photo Switching:** Tapping any color option updates the selected state, highlights the active choice with brand styling, and immediately switches the main modal photograph (`#modalMainImg`) to the photo of that specific colored option.
- **Card Action Interception for Options:** If a buyer taps `ADD TO BAG` or `BUY NOW` directly from the catalogue grid for a piece that has multiple color choices, the system intercepts the click and opens the Quick View modal with the color choices highlighted (`.product-color-choice-wrap.highlight-pulse`) and prompts the buyer to choose their preferred color before proceeding.
- **Cart & Checkout Color Preservation:**
  - Selected options are captured as `{ id, quantity, option, image }` in `raycrafting-cart`.
  - Bag drawer renders distinct cart lines for different chosen colors of the same product, displaying the color badge (`.cart-line-option`) and that exact color's thumbnail image.
  - Checkout summary (`#checkoutLines`) preserves the chosen color subtitle (`.checkout-line-option`).
  - Order items in SQLite (`order_items.selected_option` and `order_items.name`) and order notifications record the chosen color option cleanly.
- **Pricing File Synchronization Rule:** Product pricing across `data/raycrafting.sqlite` (`products` and `custom_prices` tables), `catalog.js`, and `products-seed.json` is strictly derived from user-specified pricing files without deviations.
