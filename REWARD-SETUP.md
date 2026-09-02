# Cart reward setup

## Rules implemented

- Eligible products: `dant-manjari-classic`, `dant-manjan-for-kids`, and `dant-manjan-strong` only.
- Two eligible bottles: automatically add one toothbrush from `/products/9786179354865` and discount that gift line by 100%.
- Three eligible bottles: display the free-shipping milestone as unlocked.
- Bundle products do not count because their handles are not in the allow-list.

## Theme installation

1. Upload `cart-progress-bar.liquid` to **Online store → Themes → Edit code → Snippets**.
2. In the cart-drawer file, add `{% render 'cart-progress-bar' %}` directly above the cart items.
3. Remove the old reward snippet/render so two reward bars do not run together.

The gift's hidden/default variant ID is resolved in Liquid from product ID `9786179354865`. Shopify creates a default variant even when a product has no variant options in Admin. The Ajax Cart API accepts this variant ID, not the product ID.

## Product and inventory

Keep product `9786179354865` at its normal price and enable **Track quantity**. The cart adds the real variant at quantity one, then the Function applies 100% off only to the line marked `_free_gift=true`. The order therefore reduces toothbrush inventory normally.

## Discounts shown in Shopify Admin

The app name (`cart-reward-discount`) and the Function discount are different objects. A Function-owned discount opens its configured app details route, which previously showed Shopify's starter screen.

Keep exactly one active automatic product discount linked to the **Cart rewards** Function. The Function discounts the complete gift line; the storefront separately keeps that gift line at quantity one.

## Important: free shipping

This archive contains a product discount Function only. The bar can show free shipping at three bottles, but exact “three eligible singles, bundles excluded” shipping enforcement requires a delivery-discount Function. Shopify's native free-shipping discount is suitable only if an order-value threshold is acceptable.

## Deploy and verify

1. Run `npm install` at the app root if dependencies are incomplete.
2. Run `npm run deploy`.
3. Reauthorize the app for the new `read_discounts` and `write_discounts` scopes.
4. Open the app and click **Activate automatic reward** once. This creates the automatic app discount through `discountAutomaticAppCreate`.
5. Do not create a native Buy X Get Y discount for this offer.
6. Test: one eligible single; two singles; three singles; a bundle alone; one single plus a bundle; and removing a bottle after unlocking the gift.
