# McDelivery India UI inventory (reference only; recreate layout/theme with placeholder brand)

Tech: Ionic + Angular SPA (ion-app, ion-header, ion-content with its own shadow scroll element — document itself doesn't scroll). Assets from assets.mcdelivery.co.in. Font family "Speedee" (brand custom font, sans-serif fallback) everywhere.
Viewport used: 1440x900 desktop (emulated), 390x844 mobile.

## 1. Home `/` (desktop 1440) — screenshot desktop-home.png
Body bg #FBF6F0 (warm cream). Page scroll height ~10370px.

### Header (ion-header > .toolbar-desktop) — sticky, 96px tall, white, padding 15px 70px,
shadow `0 2px 6px rgba(0,0,0,.12), inset 0 -1px 0 #DADCE0`.
- LHS (flex, gap 40px): logo img 71x65 (red circle + "McDelivery" wordmark below).
- Mode dropdown `.bm-select`: 176x66, bg #DB0007 red, radius 10px; scooter icon 30px (white) + "McDelivery" 14px/700 white + white chevron. Dropdown menu (white, radius 0 0 10 10) offers "Take Away" (black text, icon). So mode toggle = McDelivery (delivery) vs Take Away.
- Address/time pill `.address-select`: 374x66 white, 1px #E5E5E5 border, radius 10px. Left: yellow M glyph + "**Aundh**, Aundh D P Road" + chevron; 2nd line "Please enter your location so we can …" (ellipsis). Right: yellow clock icon over "Now" (time slot picker). Divider vertical line before RHS menu.
- RHS: text links "Offers", "Restaurants Nearby" (17px/700 black, margin-left 48px), account icon (20px outline person), search icon (20px magnifier). Icons are thin-stroke monochrome outline SVGs.

### Hero banner (app-banner)
- 20px yellow strip (#FBB901) full width at top, then black band (212px) holding a 1366x177 promo image (centered, ~30px side margin) — the banner image has its own colours (red→yellow gradient promo art: "FREE BURGER ON ORDERS ABOVE ₹349, USE CODE B349, FREE DELIVERY, 20 MINS DELIVERY").
- Carousel nav = thumbnail strip overlapping the bottom edge (centered): active thumb 130x80, inactive 100x60, each black bg, 2px white border, radius 5px, padding 5px. 2 slides observed. No dots/arrows.

### "Our Menu" header block (cream bg, padding ~40px 120px)
- H "Our Menu" 44px/700 #2B2B2B.
- Popular-category chips: "For You", "Deals", "New Launch" — white pill, radius 50px, padding 10px 15px, 13px/700, small yellow icon left, shadow `0 4px 20px rgba(167,167,167,.14)`; gap 10px.
- Search box (right aligned, 380x53): white, 1px #C4C4C4 border, radius 6px, shadow `0 5px 20px rgba(96,100,112,.1)`, placeholder "Search here" #6D6D6D 16px, yellow magnifier icon right.

### Main 3-column area (from y≈512)
1. Left category rail `.categories-container` 232px wide, white, radius 5px, shadow `1px 0 9px rgba(0,0,0,.08)`, padding 10px 0 50px 10px (sticky-like list). Each row 70–82px: 56px circle (#FCECC7 pale yellow bg) with product image + title 14px/16px/700 #2B2B2B (2-line wrap, width 104). Active row: 3px yellow (#FBB901) bar on right edge, radius 5px 0 0 5px. Categories (12): McBreakfast & Value Mornings; Burger Combos ( 3 Pc Meals ); FREE Fries Combos; McSaver Combos (2 Pc Meals); Burgers & Wraps; Group Sharing Combos; Coffee & Beverages; Fries & Sides; Desserts; Cakes Brownies & Cookies; Protein Plus & Coke Zero Meals; Spiderman Brand New Day - The Meal. Inactive titles appear lighter/greyer in screenshot.
2. Menu list (785px col, padding-left 20): H1 category title 25px/30px/700; filter pills "Veg", "Non-Veg" (bg #FFF8E6, 1px border rgba(154,127,98,.42), radius 20px, padding 2px 15px, 12px/700 text #B69A81). Grid `.menus__grid`: 2 columns (1fr 1fr), gap 20px row / 15px col; cards 319px wide x 383–434px tall. All categories render in one long scroll? (grid of ~42 cards under first category title — see §2).
3. Cart column (374px, separated by a thin vertical rule): "Your Cart" 20px/700; card 370x400 white radius 10, shadow `0 0 8px rgba(0,0,0,.1)`; empty state = illustration (brown paper bag with yellow M on red band + scattered x/o marks) + "Oops! Your cart is empty. You haven’t placed any order yet." 18-20px/700 centered.

### Menu card (app-menu-card-v7 .menu) 319x~415
- White, radius 10px, padding 15px 10px, shadow `0 4px 20px rgba(167,167,167,.14)`.
- Optional discount badge top-left flush: "23% Off" 20px/700 white on #DA0005, radius 0 5px 5px 0, 104x34.
- Veg/non-veg marker top-right: 15px square outline icon (green square+dot = veg, red square+triangle = non-veg; Indian FSSAI style).
- Image area 299x200 (product png on white/transparent, centered ~228x193).
- Title h4 16px/700 #2B2B2B (2 lines max); description 14px/400 #B69A81 (tan) single-line ellipsis.
- Price row: strike-through original "₹369" 18px/400 #909090 then price "₹285" 18px/700 #2B2B2B. Format: ₹ prefix, no decimals, no space.
- CTA: full-width "Add +" button 275x34, bg #FFBC0B yellow, radius 4px, text 16px/700 #2B2B2B, plus icon. Under it "Customisable" 12px #909090 centered (only on customisable items).
- Footer strip (some cards): allergen icons in small circles with labels (Soybeans, Egg, Milk, Gluten) 8–9px, and right side weight "112 g" + "🔥 281 Kcal" tiny text; separated by hairline top border.

### SEO text block (y≈9229, full width, padding 40px 50px)
"McDelivery India – Order Food Online" 20px/700 + 6 paragraphs 16px/24px #2B2B2B.

### App download banner (app-desktop-bottom-banner) 326px, bg #FBB901, padding 42px 0 65px 285px
- QR image 175x175 + caption "CLICK ON QR CODE TO ENLARGE." (bold small).
- "DISCOVER WITH US" 18px/700 uppercase red #DB0007; "Tell us about your experience." / "Scan this QR code to discover more with us." 22px/700 black; button "Download the app" black bg, white 19px/700, radius 25px, padding 12px 43px.

### Footer (app-desktop-footer) black #000, white text, padding 50px 70px, 249px
- Inline links separated by "|": Privacy Policy | Terms & Conditions | Corporate Website | Faq | Bug Bounty | Site Map | Veg Burgers | Non Veg Burgers | Nutrition Info | All Restaurants (16px/400 white).
- "An Average active adult requires 2,000 Kcal energy per day…" 13px; "FSSAI Central License Number : 10014022002648"; "Copyright 2026 H.R.P.L" 16px/700.
- Right: 3 social icons (52x33 each).

## 2. Category pages `/menu/<id>-<slug>` (same layout as home; SPA route change)
Clicking a rail category changes URL, swaps the grid (only that category's items shown), scrolls content so menu title is near top (scrollTop≈426). Active rail row gets yellow right bar + full-opacity title; inactive titles rgba(43,43,43,.5).
| URL | Title | items |
|---|---|---|
| /menu/2106-mcbreakfast | McBreakfast & Value Mornings (default on `/`) | 40 |
| /menu/3899-meals-for-one | Burger Combos ( 3 Pc Meals ) | 30 |
| /menu/4911-free_fries_combos | FREE Fries Combos | 23 |
| /menu/4885-match-time-meals | McSaver Combos (2 Pc Meals) | 51 |
| /menu/659-burgers-wraps | Burgers & Wraps | 39 |
| /menu/4886-match-time-sharers | Group Sharing Combos | 32 |
| /menu/702-coffee-beverages-hot-and-cold | Coffee & Beverages | 37 |
| /menu/4611-fries-sides | Fries & Sides | 24 |
| /menu/690-desserts | Desserts | 8 |
| /menu/4892-cakes-brownies-croissants | Cakes Brownies & Cookies | 6 |
| /menu/4901-whole_wheat_bun | Protein Plus & Coke Zero Meals | 27 |
| /menu/4920-spiderman_brand_new_day_the_meal | Spiderman Brand New Day - The Meal | 18 |
- Veg/Non-Veg filter pills are toggles (client-side; Burgers 39 -> 22 veg). Active pill: bg #FCECC7, border 1px #FBB901, text #2B2B2B. Click again to clear.

## 3. Tag pages `/tag-wise-menu?tag=...` (chips "For You" / "Deals" / "New Launch") — desktop-tag-wise-menu.png
- Header reduced: logo + RHS links only (no mode dropdown / address pill).
- Cream hero band (~150px) with H1 tag name 54px/700 #2B2B2B, bottom shadow; no category rail and no cart column.
- Full-width card grid `.menus-card-grid` (flex wrap), 4 cards per row at 1440 (319px cards, ~15px gap, 20px row gap), side margin ~45px.
- Counts: For You 34, Deals 29, New launch 22.
- Sold-out state: card class `menu-hold`, product image `filter: grayscale(1)`, veg marker grey, Add button replaced by "Sold out" 16px/700 #D0040A text.

## 4. Item detail modal (click card image) — desktop-item-detail.png
- URL unchanged. `ion-modal` centered 600x600, wrapper bg #FBF6F0, radius 5px, shadow `0 28px 48px rgba(0,0,0,.4)`; backdrop rgba(0,0,0,.33) AND page behind is blurred (`backdrop-filter: blur(30px)` on modal host). Click backdrop to close.
- Internal "bottom-sheet" pattern: toolbar row (white, radius 20 20 0 0, 60px) with category icon + category name "Burgers & Wraps" 16px/700 (scrolls out of view in desktop).
- Body: image 350x300 centered; veg marker top-right; name 18px/700 black; price "₹159" 20px/700; description 13px #909090 (full text, 24px line-height); full-width Add + button 545x44 (#FFBC0B, radius 4); "Customisable" 12px grey; nutrition strip (allergen icons 16px with 8px #A87C4F labels; right: "168 g" + flame icon "402 Kcal"), top border 1px rgba(182,154,129,.2).

## 5. Customisation / meal-builder modal (Add on a customisable item) — desktop-customise-step1.png, step2.png
Two-step builder, 600px wide x ~855 tall centered modal, same blur backdrop. Thin progress bar at top of content (4px, track #FFF6DC, fill #FFBC0B, ~half = step 1 of 2).
Step 1 "Choose your variant" (app-make-it-a-meal):
- Header (white 60px): back chevron, small product thumb, title "McVeggie Burger" 18px/700, close "X" (grey) right.
- Sub-heading "Choose your variant" 16px/400. Selected variant card: bg rgba(251,185,0,.1), 1px #FBB900 border, radius 20px, 92px tall: thumb 67x44, veg icon 14px + name 16px/500 #303030, "₹ 159" 16px; right yellow radio (17px circle, 1px #FFBC0B border, 11px solid inner dot when selected).
- "Make it a Quick Meal" list: rows 58px (no card bg): thumb, veg icon + name, green savings pill "Save ₹ 60" (14px #498A11 on rgba(149,219,87,.2), radius 11px), right "+ ₹ 130" 16px + radio. ~24 upsell rows (combos, 2x, + fries, Happy Meal, Birthday Party Package +₹2,039, party combos …). Price format here has space: "₹ 159", thousands comma.
- Sticky footer (white, shadow `0 -6px 20px rgba(168,124,79,.2)`, 67px): "Order Value" 16px/700 over "₹ 159"; right button "Next" 200x45 bg #FBB900, radius 10px, 16px/700 black.
Step 2 "Customise Your Burgers":
- Header: back chevron + "Customise Your Burgers" 18px/700. Summary card: beige (#F3E7DA-ish) radius 10, thumb + "McVeggie Burger" bold.
- Section labels uppercase letter-spaced 14px: "SELECT YOUR **ADD-ONS**" (second word bold), "SAUCES", "VEGGIES".
- Rows 64px in white grouped card (first radius 10 10 0 0): image 81x54 radius 8, name 16px/400 #303030; right price "₹24" + stepper. Stepper: 20x20 squares radius 6px, 1px #FDBB30 border; minus outline, count "01" 14px #A87C4F, plus filled #FFBC0B when qty>0; only outlined "+" when 0.
- Items: Protein Slice ₹24, Mcveggie Patty ₹39 (01 default), Add Eatqual ₹0, QP Bun to Whole Wheat Bun ₹10, Tomato Ketchup Sachet ₹1 (01), Cheese ₹24; Sauces: Veg Sauce ₹25 (01); Veggies: Lettuce ₹0 (01), Jalapeno ₹11, Onion ₹11, Tomato ₹6.
- Footer: Order Value ₹ 159 + "Add to Cart" button (same style as Next).

## 6. Cart side panel with item (desktop) — desktop-cart-with-item.png
Adding to cart (no login needed) -> `ion-toast` "Item added to cart" (light colour, app-toast). Store silently switched to "McDonald's India, Tumkur" and the category list changed (store-specific menu: e.g. "Fried Chicken & Wings" appears) — menu is store-dependent.
- Header gains a cart icon (outline trolley) with a small circular count badge "1" (outlined circle top-right) between account and search icons.
- Menu card in grid swaps Add button for stepper: minus 30x30 bg #E3D1BD radius 10px, count "01" 20px, plus 30x30 bg #FFBC0B radius 10px.
- Cart column (sticky at top under header while page scrolls): title row "Your Cart" + "Clear All" (14px/700 #D90108 red, underlined) right.
  - Line item card (app-menu-card-v3) 320x105: thumb 90x70; name 14px/700 + veg marker; price "₹ 159" 18px + ".00" 14px (decimals smaller); "Customise" 13px #B69A81 underlined link (re-opens builder); stepper right.
  - Below the card: status stack 370x78 radius 10px: dark strip (#2B2B2B-ish w/ icon) "Free Delivery on Order above ₹259" 12px/600 white; then yellow bar #FBB900 (radius 0 0 10 10) with trolley icon "1 Items" 14px/700 + "View Cart" underlined 14px/700 right.
- Free-delivery strip bg = `linear-gradient(90deg,#2B2B2B,#919191)`.

## 7. Cart page `/cart` (via "View Cart") — desktop-cart.png
- Header same, but mode dropdown greyed/disabled (light grey bg). Content centered ~1133px (ion-grid, margin ~146px each side); 2 columns: left 755px, right 378px.
- Left: "Your Order" 16px/700 + "Clear All" red; order card (white, radius 10, shadow 0 0 8px rgba(0,0,0,.1)) with line items (app-menu-card-v3, same as side panel, wider 708px).
- "Recommendation" 16px/700 + horizontal Swiper carousel of mini cards 170x262 (gap 10px): image pops out above the card top, veg marker, name 12–13px/700, price "₹69", circular-ish yellow "+" button 30x30 radius 10, "Customisable", optional allergen strip. Free-drag, no arrows visible.
- Stat banner card: logo bag icon + "McDelivery delivered over 12,700 Feel Good Moments in the last 24 hours" 16px.
- Accordion card "Add Delivery Instructions" 16px/700 #B69A81 with "+" right (white, radius 10).
- Right: donation card with yellow-outline checkbox 20px: "Donate ₹ 3 for Ronald Mcdonald House of Charity." 14px/700 + "Know More" link #B69A81 underlined + gift icon. "Total Charges" heading with chevron (accordion) -> card "Total Payable ₹ 209"; expanded rows: Sub Total ₹ 159, Handling Charges ₹ 39.99, GST & Other Charges ₹ 10.
- Fixed bottom bar (ion-footer, 88px, white, shadow `0 -4px 20px #E4CFB5`): store logo, "McDonald's India" 14px/700 + full store address 14px/500 (ellipsis) + "Change" link #B69A81 underlined; vertical divider; primary CTA "Log In / Sign Up to Continue" 318x45 bg #FBB900, radius 10px, 16px/700 black. (= checkout login wall.)

## 8. Login / checkout wall modal (cart CTA or account icon) — desktop-login.png  (NOT filled)
- `ion-modal.app-auth-modal` centered 340x526, bg #FBF6F0, blur backdrop. Close X icon 25px top-right.
- "Hi there!" 36px/700 #2B2B2B centered; "Welcome to Mcdonalds." 16px/500 #B69A81.
- Field label "Enter your mobile number" 16px #676767; outlined input 300x50 (bg cream, 1px #C4C4C4, radius 6px) with phone icon left, floating label "Mobile Number" notch, placeholder "10 Digit Mobile Number".
- Link "Click here if you have a referral code." 14px/700 #A87C4F.
- "Verify Mobile" button 300x45 radius 10px; disabled state bg #CCCCCC (enabled = #FBB900).
- Consent: 'By clicking the "Verify Mobile" button, you agree to our Terms and Conditions' — quoted label in #EB445A, link #0091E2 blue.
- Flow is OTP-based (not explored further).

## 9. Offers `/offers` (header "Offers") — desktop-offers.png
- Reduced header (logo + RHS; "Offers" link hidden while on it). Cream page.
- Centered H1 "Offers For You" 54px/700 #2B2B2B; centered search 400x53 placeholder "Enter Coupon Code" (cream bg, 1px #C4C4C4, radius 6, magnifier greyed/disabled until text).
- `.offer-card-grid` flex-wrap, gap 20px, 4 cards/row at 1440 (cards 302px wide, ~276–316 tall), left margin ~85px.
- Offer card: white, radius 10, shadow 0 0 8px rgba(0,0,0,.1), padding 10px. Top-left coupon code chip "FLAT125" 16px/700 black on #FFBC0B radius 5px; top-right flush tag "FLAT125 OFF" 13px/700 white on #D90108, radius 0 10px (top-right/bottom-left). Title 14px/700; description 13px/400 (24px line height, clamped ~3 lines); "Show More" 16px #B69A81 underlined (expands); footer "Min Cart Value excluding delivery fees and taxes ₹ 499" 12px underlined.
- Cards currently NOT applicable render with `filter: grayscale(1)` (so chips look grey/black in screenshot) — i.e. ineligible offers are greyscaled.
- 10 offers: FLAT125, BKF199, Gofree, F299, BUCKETHAT, B349, FLAT75, FSIDE, B499, FREEBURGER.

## 10. Restaurants Nearby `/restaurants-nearby` — desktop-restaurants-nearby-empty.png
- Reduced header. Without a chosen location it only shows centered text "Sorry, we do not serve this location yet" 16px #2B2B2B on cream. (Store list could not be reached without granting a real location/login.)

## 11. Location picker (click address pill, delivery mode) — desktop-location-picker.png
- 600x600 centered modal (cream body, white 60px header). Header: yellow back chevron (#FFBC0B-ish) + "Select Delivery Address" 16px/700. Body only shows a full-width pill button "Log In / Sign Up to Continue" (bg #FFC93D, radius 28px, 55px tall, 14px/700, soft yellow glow shadow). => saved addresses require login; no free-text address search for guests in delivery mode.

## 12. Time picker (click "Now") — desktop-time-picker.png
- Same 600x600 modal. Header: yellow back chevron + "When do you want your delivery?".
- "Store Timing: 09:00 am - 08:59 am" 15px/500 #B69A81 centered.
- Checkbox row "As soon as possible" (17px square, 1px #FFC93D border, radius 3, yellow tick when checked) 15px/700.
- Divider hr rgba(43,43,43,.3) with centered "OR" 12px/700 #BCB8B4.
- "Schedule delivery" checkbox; below it (disabled overlay until checked) day radio group: Today/05 Oct, Tomorrow/06 Oct, Day-after/07 Oct (radio 17px, border+fill #A87C4F brown), then a wheel-style time picker (fade masks top/bottom).
- Footer button "Confirm Time" 560x46 bg #FFC93D, pill radius, 14px/700.

## 13. Mode toggle: Take Away + store picker — desktop-home-takeaway.png, desktop-takeaway-store-click.png, desktop-store-search.png, desktop-store-list.png
- Mode dropdown (`.bm-select` red button) opens white dropdown under it (radius 0 0 10 10, shadow `0 27px 80px rgba(48,48,48,.15), 0 6px 18px rgba(48,48,48,.05)`) listing the other mode. Choosing "Take Away" relabels button "Take Away" (stays red) and address pill becomes "No store selected ⌄" + "Now".
- Without a store the page shows SKELETON loading state: tan (#E3C9A6-ish) burger-shaped placeholder icons + bars in the rail, pill placeholders for filters, outline cards with burger glyph + bars + "- +" squares; hero banner missing (a11y text "No banner image found..!").
- Clicking "No store selected" drops a panel (`.dine-in-stores`, fixed full-screen dark scrim rgba(0,0,0,.43) under header) with a 500px white list panel centered under header (radius 0 0 10 10) and mock search input 460x48 (white, 1px #E5E5E5, radius 6, shadow 0 5px 20px rgba(96,100,112,.1), yellow magnifier, placeholder "Search for area, street name..").
- Clicking it opens the location-search modal (600x600 cream): yellow back chevron + white search field; "Current location / Using GPS" row (yellow pin icon, "Current location" 14px/700 #FFBC0B yellow, "Using GPS" 11px); then 'Search Results for "Bandra"' 16px/700 and result rows (place name 16px/700 + full address 16px/400, hairline dividers).
- Picking an area returns to the dropdown panel showing nearby stores sorted by distance (thin 4px yellow progress bar while loading). Store card (white, radius 16px): yellow M glyph 24px + store name 16px/700 #2B2B2B; address 14px/400 #535353 (multi-line); row: green 5px dot + "Open" 12px #2D9B48, "|" and hours "07:00 am - 12:45 am" 12px #B69A81; right "walking-man icon 679 m" 14px/700 #B69A81 (distance format "679 m" / "1.3 km").

### 10b. Restaurants Nearby WITH browser geolocation (emulated public coords, Bandra) — desktop-restaurants-nearby.png
- Uses browser geolocation (not the selected store). Single centered column 580px (`.stores__content`, padding 20px) of the same store cards (540px wide, white, radius 16px, ~118–172px tall, no gap/flush stack), sorted by distance. No map, no filters, no title. ~13 stores listed.

## 14. Search `/search` (header magnifier) — desktop-search.png, desktop-search-results.png
- Reduced header (no search icon while on page). Cream band: H1 "Search Menu" 54px/700, left-aligned at x=40.
- Full-width input 1345x38 (cream bg, 1px tan/yellowish border #E3C9A6-ish, radius 6px, placeholder "Search here"). Inline ghost-text autocomplete: typed "pan" + greyed completion "eer Burger" in the same field.
- Veg / Non-Veg filter pills below (same style as menu, 36px tall).
- Empty query: "Popular Items" 16px/700 heading + 5-col grid (cards 240px wide, compact variant: image pops above card top, name 16px/400, price "₹125", round-square yellow "+" 30px button bottom-right, "Customisable", allergen strip). Discount cards show "₹366 ₹219 40% Off".
- After typing: "Your Recent Searches" 16px/700 + "Clear All" red (#E10000-ish, 16px/700) right; recent-search chips (history icon + term, 1px tan border, radius 6px); results grid of full menu cards (4 per row, 319px) live-updating.

## 15. Footer link targets (all are JS-click spans, no <a>)
| Link | Destination |
|---|---|
| Privacy Policy | /privacy-policy (on-site) |
| Terms & Conditions | /terms-and-conditions |
| Corporate Website | OFF-SITE window.open https://www.mcdonaldsindia.com/ (_blank) |
| Faq | /faq |
| Bug Bounty | /bug-bounty |
| Site Map | /sitemap |
| Veg Burgers | /tag-wise-menu?tag=veg-burger |
| Non Veg Burgers | /tag-wise-menu?tag=non-veg-burger |
| Nutrition Info | no route change / no window.open captured (likely file download/PDF via anchor or no-op) — not verified |
| All Restaurants | /restaurant-links |
| Social icons | OFF-SITE facebook.com/McDonaldsIndia, instagram.com/mcdonalds_india, twitter.com/mcdonaldsindia |
Footer + app banner + SEO block appear only on home/category pages; static pages have no footer.

## 16. Static content pages (shared template `.static-page-container`) — desktop-faq.png, desktop-privacy-policy.png, desktop-about.png
- Reduced header; cream bg; content padding 0 120px; H1 54px/700 #2B2B2B (centered on Privacy/Bug Bounty/Sitemap, left on FAQ/T&C); section H4 18–20px/700; body p 16px/24px #2B2B2B; inline links #FFC93D (yellow!) text.
- `/faq` "Frequently asked questions": left column 829px wide; search box "Search your query here" (cream, 1px #C4C4C4, radius 6, yellow magnifier); topic chips "Delivery, Burger, Order, Coupon, Customize" (transparent, 1px #CCC border, radius 40px, 14px, 36px tall); ~25 accordions (54px rows, question 16px/400, chevron right; open = yellow up-chevron, answer 13–14px grey, hairline divider). Right ~40% empty.
- `/privacy-policy` (h≈4381), `/terms-and-conditions` (numbered H4 sections 18px), `/bug-bounty` ("McDelivery Bug Bounty Program", mailto link, contributor icon links to LinkedIn/X).
- `/sitemap`: H1 centered "Site Map"; H2 sections 20px/700 ("McDelivery", "Categories", "Restaurants"); 3-column link grid (350px cols), links 18px/400 **#0E46FF blue**. McDelivery links: Birthday Party (/birthday-party -> redirects to /), Bug Bounty, About, Search, Restaurants Nearby, Refer A Friend (/refer-friend), Offers, Terms, Privacy, Feedback (/feedback), FAQ.
- `/about`: centered title bar "About" 18px/700 (72px tall), list 600px centered of menu rows 65px (16px text, bottom border 1px #F6EADC, chevron): Terms and Conditions, Frequently asked questions, About McDonalds, Version "Version 15.5.0" (14px #B69A81). (App-style settings list.)

## 17. All Restaurants `/restaurant-links` and restaurant detail — desktop-restaurant-links.png, desktop-restaurant-detail.png
- `/restaurant-links`: H1 "All Restaurants" 54px; centered search "Enter Store Name"; 3-column list of 427 store tiles (362x57, white, radius 10, shadow 0 0 8px rgba(0,0,0,.1), store name centered 14px/700 black). Links to `/restaurants/<city>/<id>/order-food-online-in-mcdonalds-<slug>`.
- Restaurant detail (SEO store page): white hero area left (~55%) with yellow M + H1 "McDonald's A To Z Vasai" 36px/700 + tag "OPEN NOW" (19px/600 #DB0007 red on rgba(255,188,13,.25), radius 5); icon rows (yellow outline icons 30px): Address / Phone Number / Store Timings (label 18px, value 16px); two buttons "ORDER NOW" and "NAVIGATE" 317x40 same pale-yellow+red-text style. Right side: banner carousel (skeleton while loading).
  - "New Launches" 22px/700 + tab pills "Popular" (active: white text on #DB0007, radius 30) / "Deals" / "New Launch" (white bg); horizontal row of compact cards (image 210x130, veg icon, "+" add icon, strike-through + price + "40% Off"); red pill "View All" 19px white on #DB0007 radius 40.
  - "About this outlet" 30px/600 accordion (+/-); "OTHER OUTLETS" 18px/600 red heading with nearby-store cards (name, address, hours, phone, NAVIGATE / ORDER NOW); QR app banner.
- Skeleton colour on this page: #FFD9A9 (peach) blocks radius 5px, burger-shaped placeholders.

## 18. Profile `/profile` (guest) — desktop-profile.png
- Centered 720px column: brand logo 102x48; "Hi" 24px/700; "Login / Sign Up" 14px #0091E2 link (opens auth modal).
- 3 quick tiles in a row (white, radius 10, bottom border 1px rgba(166,168,171,.3)): icon 42px tall + label 14px — "My orders", "Offers", "Settings".
- List rows (45px, 20px line icons, 16px label, 8x12 chevron right): Manage Payments, Address Book, Colour Blind Friendly, Store Locator, Download Nutrition Info (download icon -> nutrition PDF lives here), About. "Version 15.5.0" 14px #B69A81.

## 19. 404 / unknown routes / Track order
- Unknown paths (e.g. /this-page-does-not-exist-xyz, /track-order, /order-history, /account, /checkout) return HTTP 403 from the server and the SPA redirects to `/` — there is NO dedicated 404 page and NO public "Track order" link in header/footer (order tracking is behind login: "My orders" in profile).
- /birthday-party also redirects to /. /refer-friend and /feedback exist (200) — not inspected further (likely login-gated forms).

# MOBILE (390x844, mobile UA, touch) — completely different "app-like" layout (`.mobile-tablet-view`)

## M1. Mobile home `/` — mobile-home.png, mobile-home-menu-grid.png
- Top smart app banner (58px, bg #FFC93D yellow, fixed above everything): close "X", logo, "Free Chocolate/Strawberry Shake: App Only Offer" 13px, red pill "Get App" (#DB0007 bg, white 13px/700, radius ~28px). Closable.
- NO desktop header. Instead red toolbar block (`.banner__toolbar`, bg #DB0007, radius 0 0 18px 18px, 123px) overlapping the top of the hero:
  - Segmented mode toggle 358x38 pill (bg rgba(255,255,255,.9), radius 40px) with sliding dark thumb (#2B2B2B, radius 80px, 174x30): "McDelivery" (scooter icon) | "Take Away" (bag icon); active label white on dark, inactive dark on light. 18px/700 text.
  - Address row: "MUMBAI ▾" 18px/700 uppercase white + address line 14px white ellipsis; right "🕑 Now ▾" 15px/700 white. (Guest delivery mode auto-filled from browser geolocation.)
  - Take Away mode: row reads "No store selected ▾" and the store list panel auto-opens (white sheet under toolbar with "Search for area, street name.." and store cards — same components as desktop §13).
- Hero carousel (Swiper, full width 390x390 square creative, bottom radius 16px) with in-image CTAs.
- "Quick Picks" 24px/700 + horizontal swiper of 113x113 tiles (radius 16px, photo bg with dark gradient, icon + caps label "DEALS", "NEW LAUNCH" white 14px/700).
- "Our Menu" 24px/700 + subtitle "Choose from a wide variety" 13px #B69A81. Bento grid `.grid-container` (6-col grid, gap 6px, 350px wide, 20px side gutters): 1 full-width hero tile (350x226), then 2-up tiles (172x194), then 3-up tiles (113x132–150). Tile: bg #F9F9F9, radius 10px, 1px light border, shadow `0 -1px 8px 1px rgba(182,154,129,.11)`, image on top, centered category title 22px/700 (large) / smaller in 3-up.
- Mobile category set differs (store-specific): Burger Combos, Exclusive Value Combo, McSaver Combos, Burgers & Wraps, Group Sharing Combos, Coffee & Beverages, Fries & Sides, Desserts, Cakes Brownies & Cookies, Protein Plus & Coke Zero Meals, Spiderman Brand New Day - The Meal.
- Pull-to-refresh (ion-refresher) and infinite scroll present. No SEO text / footer links / QR banner on mobile home.
- On scroll: toolbar collapses into a white sticky bar under the app banner: "MUMBAI • 4201, Bandra West, Mumbai, …  ⌄" (bold city + address).
- Fixed bottom tab bar (`.footer-v1`, floating card 366px wide, 12px side inset, bg rgba(255,255,255,.9) + blur(10px), radius 10–16px, shadow `0 -4px 12px rgba(0,0,0,.08)`, 70px tall): Home / Menu / Search / MyMcD — outline icons 24px + 14px labels; active = dark label + 40x? yellow underline pill (#FFBC0B) below; inactive grey #9B9B9B-ish.
- When cart non-empty: cart status stack docks above tab bar (dark gradient strip "Free Delivery on Order above ₹259" + yellow bar "🛒 1 Items … View Cart").

## M2. Mobile menu `/menu/<id>-<slug>` (tap bento tile or "Menu" tab) — mobile-menu.png
- First load often shows SKELETON (peach #FFD9A9 burger-shaped rail icons, pill filters, list rows with "- +" squares); after load:
- White sticky header (109px, bottom border 1px #DFDFDF): "Our Menu" 24px/700 + yellow outline search icon right. Filter row (horizontal scroll): three food-pref toggles 60x32 (radius 8, 1px #DFDFDF border; mini switch track #E6E6E6 with veg-green / non-veg-red / egg-orange marker as thumb), then text chips "Top Sellers", "NONG" (no onion no garlic) 1px #DFDFDF border radius 8, 14px.
- Two-pane layout: LEFT category rail 68px (white, right border 1px rgba(223,223,223,.6)): 45px circle thumb (bg #E7E7E7; active = pale yellow #FCECC7) + 11px label incl. count "(39)", inactive rgba(43,43,43,.5), active full colour + 3–4px yellow vertical bar on the rail's right edge. RIGHT list 322px: section title "Burgers & Wraps (39)" 16px rgba(43,43,43,.5); virtual-scrolled (cdk-virtual-scroll) list rows (200px, hairline bottom divider):
  - Row: title 17px/700 #303030 + veg marker right; below: image tile 142x128 (radius 12, 1px #EDEDED border, image overflows slightly); right column: optional "⊙ Bestseller" tag (red #DB0007 14px with icon), strike price "₹510" 17px #909090 + price "₹289" 17px black, green "43% Off" chip (12px #83BF4F on #F9F4EE radius 3), "Add" button 96x31 yellow #FFBC0B radius 6 18px/700, "Customisable" 12px/300 #A87C4F.
- Bottom: tab bar (Menu active) + free-delivery strip docked above.

## M3. Mobile item detail = bottom sheet — mobile-item-detail.png
- `ion-modal.modal-sheet` full-width sheet from y≈93, radius 20 20 0 0, grab handle (40x4 grey pill) on top, page behind blurred.
- Sheet header (white): yellow back chevron + category name "Burger Combos ( 3 Pc Meals )" 18px/700.
- Body (cream): "43% Off" red flag badge top-left (radius 0 5 5 0), veg marker top-right; big product image; name 20px/700; strike "₹510" + "₹289" 22px/700 + green "43% Off" chip; description 14px grey; full-width "Add +" yellow button (radius 6, 44px); "Customisable".

## M4. Mobile combo / meal builder (Add on a combo) — mobile-meal-builder.png, mobile-meal-builder-sides.png
- Sheet "Customise Your Meal" (back chevron, 18px/700 title). Sections separated by hairlines: "Choice of Burgers" (thumb + veg icon + "McVeggie Burger" 16px/700 + yellow underlined "Customise" link -> ingredient customiser as desktop step 2), "Choice of Sides" (Fries (Medium) + "Change"), "Choice of Beverages" (Coke + "Change"), "Choice of Add-on" ("Select - Add on" + "Change"). Section labels 16px/400 #2B2B2B. Links yellow #FFBC0B underlined.
- "Change" opens sub-sheet "Choose Your Sides": radio list rows (thumb 80px, name 16px/700, "₹ 40" upgrade price / "₹ 0"), yellow radio right; sticky footer full-width "Done" button (#FBB900, radius 10, 46px).
- Builder footer: "Order Value ₹ 289" + "Add to Cart" (200x45 yellow radius 10).
- Toast after add: top of screen, 374x48 at y=16 (inset 8px), bg #F4F5F8, black text "Item added to cart", radius 10, Material elevation shadow. (Desktop toast same component.)

## M5. Mobile cart `/cart` — mobile-cart.png
- Header bar 60px: "‹ Back" (no tab bar on cart). Then YELLOW address strip (#FFBC0B, radius 16 16 0 0): "No address selected ⌄" 18px/700 + "Please enter your location so we can search t…" 14px; right clock "Now".
- "Your Order" 18px/700 + "Clear All" red underlined; white card radius 10 with line items (thumb, name 14px/700 + veg icon, "₹ 289.00", "Customise" tan underlined, stepper − (#E3D1BD) 01 + (#FFBC0B) 30px squares radius 10).
- "Recommendation" + round prev/next arrow buttons (28px circles, tan #B69A81 / light) + 2-up carousel cards (image pops above card).
- "Offers For You" 16px/700 + "View All Offers" 14px/700; offer chip: code "FSIDE" yellow text on dark + "APPLY" 56x25 button (#FFBC0B, radius 0 5 5 0) – coupon card w/ title "Free Delivery + Free Side of your choice".
- Then the same blocks as desktop: Feel-Good-Moments banner, Donate ₹3 checkbox card, Total Charges accordion ("Total Payable ₹ 512"), "Add Delivery Instructions".
- Fixed bottom (ion-footer 167px white): store row (logo bag, "Hill Road NTS Bandra" 16px/700 + address ellipsis + "Change" tan underlined), hairline, full-width CTA "Log In / Sign Up to Continue" (#FBB900, radius 10, ~46px, 18px/700) = checkout login wall.

## M6. Mobile login, MyMcD/profile, offers, search — mobile-login.png, mobile-profile.png, mobile-offers.png, mobile-search.png
- Login: same auth content as desktop but as a full-width bottom sheet (`modal-sheet`, radius 20 20 0 0, from y≈93). Not filled.
- MyMcD tab = /profile: "‹ Back" header, same content as desktop profile (Hi / Login / Sign Up / 3 tiles / list rows / version), tab bar + cart bar below.
- Inner pages (offers/search/profile/cart) use a simple header: yellow chevron + "Back" 16px grey left, centered page title 16–18px/700 (no 54px hero titles on mobile).
- /offers loaded directly on mobile showed only the "Enter Coupon Code" search (offer cards did not render in this session — possibly needs store/session; on desktop they did).
- /search mobile: full-width "Search here" input (tan 1px border, radius 10), centered Veg/Non-Veg pills (pale yellow #FFF8E6, tan text), "Your Recent Searches" + red "Clear All", chips; "Popular Items" 2-up grid (cards 170px: image pops out above card, name 16px/700, price 18px/700, yellow rounded-square "+" 30px, "Customisable", allergen/kcal strip).

## Mobile vs desktop summary
- Desktop: white sticky 96px header w/ red mode dropdown + address/time pill + text links; 3-column home (rail | 2-col card grid | sticky cart); centered 600px modals; footer/SEO/QR blocks.
- Mobile: yellow app-download smart banner; red rounded toolbar with segmented McDelivery/Take Away toggle + address/time; hero square carousel; Quick Picks; bento category grid; floating bottom tab bar (Home/Menu/Search/MyMcD) with docked cart bar; two-pane menu (68px icon rail + list rows); bottom-sheet modals with grab handle; no site footer.

## Breakpoints
- Layout switch is JS-driven (`.desktop-view` vs `.mobile-tablet-view`), not pure CSS: 1024 and 1200 wide => mobile/tablet app layout; 1280 => desktop. Threshold is somewhere in 1201–1279 (likely >1200).
- CSS media queries present (Ionic/Bootstrap-ish): 576, 768, 800, 900, 960, 992, 1150, 1200.
- Desktop home grid: always 2 columns (1fr 1fr) between rail and cart; tag/search/offers pages: 4 cards per row at 1440 (flex-wrap 319px cards), search popular: 5 per row (240px). Mobile: bento 1/2/3-up, search 2-up, menu list 1-col.

# DESIGN TOKENS (computed)
| Token | Value | Use |
|---|---|---|
| brand-red | #DB0007 (rgb 219,0,7) | mode button, mobile toolbar, active tabs, "View All", OPEN NOW text, DISCOVER heading |
| red-alt | #DA0005 / #D90108 / #D0040A | discount badge / Clear All + offer tag / Sold out |
| yellow-primary | #FFBC0B (255,188,11) | Add buttons, steppers +, radios, progress fill, mobile cart address strip |
| yellow-cta | #FBB900 / #FBB901 | modal Next/Add-to-Cart/checkout CTAs, cart status bar, app banner, top strip, active rail bar |
| yellow-soft | #FFC93D | time/location CTA pills, mobile app banner bg, checkbox border, inline link colour on static pages |
| yellow-tint | #FCECC7 | category circle bg, active filter bg |
| cream-tint | #FFF8E6 / #FFF6DC | filter pill bg / progress track |
| page-bg | #FBF6F0 | body + modal body (warm cream) |
| surface | #FFFFFF | header, cards, cart card |
| tile-bg (mobile) | #F9F9F9 | bento tiles |
| text-primary | #2B2B2B | headings/body |
| text-strong | #000000 / #303030 | modal titles, item names in builder |
| text-muted | #909090 | strike price, "Customisable", descriptions in modal |
| text-tan | #B69A81 | card descriptions, links (Change/Know More/Customise), subtitles, timings |
| text-brown | #A87C4F | nutrition labels, referral link, qty count, date radios |
| grey-placeholder | #6D6D6D / #676767 | input text/labels |
| border-input | #C4C4C4 | inputs |
| border-light | #E5E5E5 / #DFDFDF / #F6EADC | address pill, mobile headers, list dividers |
| stepper-minus | #E3D1BD | minus button bg |
| success-green | #2D9B48 (Open), #498A11 on rgba(149,219,87,.2) (Save ₹), #83BF4F on #F9F4EE (% Off) |
| link-blue | #0091E2 (T&C, Login/Sign Up), #0E46FF (sitemap links) |
| disabled | #CCCCCC | disabled primary button |
| footer-bg | #000000 with #FFFFFF text |
| skeleton | #FFD9A9 peach (burger-shaped placeholders) |
| gradient strip | linear-gradient(90deg,#2B2B2B,#919191) | free-delivery strip |
| veg / non-veg | green square+dot / red square+triangle 15px outline icons (FSSAI style); egg = orange |

Typography: single family "Speedee" (weights 300, 400, 700; italics available), fallback sans-serif. Sizes: H1 hero 54px/700 (static pages), 44px/700 "Our Menu", 36px/700 login & store name, 25px/700 category title, 24px/700 mobile section titles, 20px/700 cart title / SEO h2 / modal price, 18px/700 modal titles & prices (18px/400 strike), 17px/700 header links, 16px/700 card titles & buttons, 16px/400 body (line-height 24px), 14px/700 rail titles (line-height 16px) & small buttons, 13px chips/description, 12px filter pills/meta, 8px nutrition labels. Uppercase used sparingly ("DISCOVER WITH US", "SELECT YOUR …" letter-spaced, mobile city name).
Radii: 4px (Add button desktop card), 5px (thumbs, badges, tags), 6px (inputs, mobile Add), 8px (food toggles, thumbs), 10px (cards, CTAs, modals' inner cards, cart stepper btns), 16px (store cards, mobile tiles, sheet bottoms), 18–20px (mobile toolbar bottom, sheets, filter pills), 25–40px pills (download app, chips, segmented toggle), 50% circles.
Shadows: header `0 2px 6px rgba(0,0,0,.12)`; card `0 4px 20px rgba(167,167,167,.14)`; cart/offer card `0 0 8px rgba(0,0,0,.1)`; search `0 5px 20px rgba(96,100,112,.1)`; modal `0 28px 48px rgba(0,0,0,.4)`; dropdown `0 27px 80px rgba(48,48,48,.15)`; sticky footer `0 -6px 20px rgba(168,124,79,.2)` / `0 -4px 20px #E4CFB5`; mobile tab bar `0 -4px 12px rgba(0,0,0,.08)`.
Overlays: ion-backdrop rgba(0,0,0,.33) + backdrop-filter blur(30px) on modals; store dropdown scrim rgba(0,0,0,.43); tab bar blur(10px).
Spacing: header padding 15px 70px; main content side padding ~120px (menu header) / 45px rail start; grid gaps 20px row/15px col; card padding 15px 10px; mobile gutters 20px (16px on inner pages).
Dimensions: header 96px desktop; logo 71x65; desktop menu card 319 x 383–434; cart column 374px; rail 232px; modal 600x600 (builder 600x855, auth 340x526); mobile tab bar 70px + 28px offer strip + 35px cart bar; mobile toolbar 123px; app banner 58px.
Icons: monochrome thin-line outline SVGs (account, search, cart trolley, clock, pin, phone), yellow-accent variants (clock, pin, magnifier); category/product imagery is photographic PNG on transparent bg.
Price format: "₹285" (no space, no decimals) on menu cards; "₹ 159" (space) in builder/cart totals; "₹ 159.00" with smaller ".00" in cart lines; thousands comma "₹ 2,039"; strike-through original in grey before price; "% Off" badges.

# NOT REACHED / LIMITATIONS
- Anything behind login (OTP): order history/tracking, saved addresses (delivery address picker shows only "Log In / Sign Up to Continue"), payments, checkout beyond the login wall, refer-a-friend/feedback forms.
- No dedicated 404 page (unknown routes -> 403 server, SPA redirects to /). No public Track Order entry.
- No cookie-consent banner observed; only the mobile "Get App" smart banner. No desktop app prompt beyond the QR section.
- Nutrition Info footer link: no navigation/window.open captured on click (profile has "Download Nutrition Info") — target unverified.
- Mobile /offers rendered no offer cards in-session; /refer-friend, /feedback not inspected.
- Full-page screenshots impossible (ion-content inner scroll); screenshots are viewport captures. Desktop screenshots taken at 1440x900 via emulation.
- Location used for browsing: public Bandra (Mumbai) coordinates via emulated geolocation and the public store search; cart items were added client-side only (no login/order).
