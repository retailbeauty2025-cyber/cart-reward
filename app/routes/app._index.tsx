import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  if (url.searchParams.get("activate") !== "1") return { message: "", ok: true };

  try {
    const functionsResponse = await admin.graphql(`#graphql
      query RewardFunctions {
        shopifyFunctions(first: 25) {
          nodes { id title handle apiType }
        }
      }
    `);
    const functionsJson = await functionsResponse.json();
    if (functionsJson.errors?.length) {
      return { ok: false, message: functionsJson.errors.map((e: { message: string }) => e.message).join("; ") };
    }

    const rewardFunction = functionsJson.data?.shopifyFunctions?.nodes?.find(
      (fn: { handle?: string }) => fn.handle === "free-gift-discount",
    );
    if (!rewardFunction) {
      return { ok: false, message: "Function not found. Run shopify app deploy first." };
    }

    const existingResponse = await admin.graphql(`#graphql
      query ExistingCartReward {
        discountNodes(first: 100, query: "title:'Cart Reward – Free Toothbrush'") {
          nodes {
            id
            discount {
              ... on DiscountAutomaticApp {
                title
                status
                appDiscountType { functionId }
              }
              ... on DiscountAutomaticBxgy { title status }
              ... on DiscountAutomaticBasic { title status }
              ... on DiscountAutomaticFreeShipping { title status }
            }
          }
        }
      }
    `);
    const existingJson = await existingResponse.json();
    if (existingJson.errors?.length) {
      return { ok: false, message: existingJson.errors.map((e: { message: string }) => e.message).join("; ") };
    }
    const existingNodes = existingJson.data?.discountNodes?.nodes ?? [];
    const existingAppDiscount = existingNodes.find(
      (node: { discount?: { title?: string; appDiscountType?: { functionId?: string } } }) =>
        node.discount?.title === "Cart Reward – Free Toothbrush" &&
        node.discount?.appDiscountType?.functionId === rewardFunction.id,
    );

    if (existingAppDiscount?.discount?.status === "ACTIVE") {
      return { ok: true, message: "Cart Reward – Free Toothbrush is already active." };
    }
    if (existingAppDiscount) {
      const activateResponse = await admin.graphql(`#graphql
        mutation ActivateCartReward($id: ID!) {
          discountAutomaticActivate(id: $id) {
            automaticDiscountNode { id }
            userErrors { field message }
          }
        }
      `, { variables: { id: existingAppDiscount.id } });
      const activateJson = await activateResponse.json();
      const activateErrors = activateJson.data?.discountAutomaticActivate?.userErrors ?? activateJson.errors ?? [];
      if (activateErrors.length) {
        return { ok: false, message: activateErrors.map((e: { message: string }) => e.message).join("; ") };
      }
      return { ok: true, message: "Existing Cart Reward – Free Toothbrush discount was activated." };
    }
    const titleConflict = existingNodes.find(
      (node: { discount?: { title?: string } }) => node.discount?.title === "Cart Reward – Free Toothbrush",
    );
    if (titleConflict) {
      return { ok: false, message: "A native discount already uses this title. Delete that discount, then activate again." };
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
    const errors = createJson.data?.discountAutomaticAppCreate?.userErrors ?? createJson.errors ?? [];
    if (errors.length) {
      return { ok: false, message: errors.map((e: { message: string }) => e.message).join("; ") };
    }
    const discount = createJson.data?.discountAutomaticAppCreate?.automaticAppDiscount;
    return { ok: true, message: `${discount.title} is ${String(discount.status).toLowerCase()}.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Discount activation failed." };
  }
};

export default function Index() {
  const data = useLoaderData<typeof loader>();
  return (
    <s-page heading="Cart rewards">
      <s-button slot="primary-action" variant="primary" href="/app?activate=1">
        Activate automatic reward
      </s-button>
      <s-section heading="Reward rules">
        <s-unordered-list>
          <s-list-item>Any 2 eligible Classic, Kids or Strong single bottles: one free toothbrush</s-list-item>
          <s-list-item>Bundle products are excluded</s-list-item>
          <s-list-item>The free toothbrush quantity is fixed at one</s-list-item>
        </s-unordered-list>
      </s-section>
      <s-section heading="Activation status">
        <s-paragraph>
          Remove native Buy X Get Y discounts for this offer, then activate this automatic Function discount once.
        </s-paragraph>
        {data.message && <s-paragraph>{data.ok ? `Success: ${data.message}` : `Error: ${data.message}`}</s-paragraph>}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
