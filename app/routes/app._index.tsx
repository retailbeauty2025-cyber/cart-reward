import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const functionsResponse = await admin.graphql(`#graphql
    query RewardFunctions {
      shopifyFunctions(first: 25) {
        nodes { id title handle apiType }
      }
    }
  `);
  const functionsJson = await functionsResponse.json();
  const functions = functionsJson.data?.shopifyFunctions?.nodes ?? [];
  const rewardFunction = functions.find(
    (fn: { handle?: string }) => fn.handle === "free-gift-discount",
  );

  if (!rewardFunction) {
    return { ok: false, message: "Deploy the free-gift-discount Function first, then try again." };
  }

  const createResponse = await admin.graphql(`#graphql
    mutation CreateCartReward($input: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $input) {
        automaticAppDiscount { discountId title status }
        userErrors { field message }
      }
    }
  `, {
    variables: {
      input: {
        title: "Cart Reward – Free Toothbrush",
        functionId: rewardFunction.id,
        startsAt: new Date().toISOString(),
        combinesWith: {
          orderDiscounts: false,
          productDiscounts: false,
          shippingDiscounts: true,
        },
      },
    },
  });
  const createJson = await createResponse.json();
  const payload = createJson.data?.discountAutomaticAppCreate;
  const errors = payload?.userErrors ?? createJson.errors ?? [];

  if (errors.length) {
    return { ok: false, message: errors.map((error: { message: string }) => error.message).join("; ") };
  }
  return { ok: true, message: `${payload.automaticAppDiscount.title} is active.` };
};

export default function Index() {
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.message) shopify.toast.show(fetcher.data.message);
  }, [fetcher.data, shopify]);

  return (
    <s-page heading="Cart rewards">
      <s-button
        slot="primary-action"
        variant="primary"
        loading={busy}
        onClick={() => fetcher.submit({}, { method: "POST" })}
      >
        Activate automatic reward
      </s-button>

      <s-section heading="Reward rules">
        <s-unordered-list>
          <s-list-item>Any 2 eligible Classic, Kids or Strong single bottles: one free toothbrush</s-list-item>
          <s-list-item>Any 3 eligible single bottles: free-shipping milestone</s-list-item>
          <s-list-item>Bundle products are excluded</s-list-item>
          <s-list-item>The free toothbrush quantity is fixed at one</s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section heading="Activation">
        <s-paragraph>
          Delete or deactivate native Buy X Get Y discounts for this offer. Click Activate
          automatic reward once to create the automatic app discount connected to this Function.
        </s-paragraph>
        {fetcher.data?.message && <s-paragraph>{fetcher.data.message}</s-paragraph>}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
