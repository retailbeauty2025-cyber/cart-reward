import type { Config } from "@react-router/dev/config";

export default {
  // Shopify embedded form actions originate in the hosted app iframe. Render
  // can expose an internal request host, so explicitly allow only the two
  // trusted public origins involved in Admin submissions.
  allowedActionOrigins: [
    "cart-reward.onrender.com",
    "admin.shopify.com",
  ],
} satisfies Config;
