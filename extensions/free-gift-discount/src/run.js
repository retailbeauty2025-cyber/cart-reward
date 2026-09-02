// @ts-check
import { DiscountApplicationStrategy } from "../generated/api";

/**
 * @typedef {import("../generated/api").RunInput} RunInput
 * @typedef {import("../generated/api").FunctionRunResult} FunctionRunResult
 */

// MERCHANT CONFIG: must match the property key/value your storefront
// snippet uses when it auto-adds the free toothbrush (search "_free_gift"
// in cart-progress-bar.liquid).
const FREE_GIFT_PROPERTY_VALUE = "true";
const ELIGIBLE_PRODUCT_HANDLES = new Set([
  "dant-manjari-classic",
  "dant-manjan-for-kids",
  "dant-manjan-strong",
]);

/**
 * @type {FunctionRunResult}
 */
const EMPTY_DISCOUNT = {
  discountApplicationStrategy: DiscountApplicationStrategy.First,
  discounts: [],
};

/**
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function run(input) {
  const eligibleQuantity = input.cart.lines.reduce((total, line) => {
    const handle = line.merchandise?.product?.handle;
    return total + (ELIGIBLE_PRODUCT_HANDLES.has(handle) ? line.quantity : 0);
  }, 0);
  const freeGiftLine = input.cart.lines.find(
    (line) => line.attribute?.value === FREE_GIFT_PROPERTY_VALUE
  );

  // Nothing to discount — return no-op so this function never touches
  // unrelated carts/lines.
  if (!freeGiftLine || eligibleQuantity < 2) {
    return EMPTY_DISCOUNT;
  }

  return {
    discountApplicationStrategy: DiscountApplicationStrategy.First,
    discounts: [{
      message: "Free Bamboo Toothbrush",
      value: {
        percentage: {
          value: 100.0,
        },
      },
      targets: [
        {
          cartLine: {
            id: freeGiftLine.id,
          },
        },
      ],
    }],
  };
}
