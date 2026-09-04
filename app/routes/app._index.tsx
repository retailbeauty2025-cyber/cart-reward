import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

const NS = "cart_rewards", KEY = "config", TITLE = "Cart Reward – Toothbrushes";
const defaults = { eligibleProducts: [], adultGift: null, kidsGift: null, toothbrushAt: 2, shippingAt: 3, doubleGiftAt: 4 };
const readJson = (response: Response) => response.json();

async function getState(admin: any) {
  const body = await readJson(await admin.graphql(`#graphql
    query CartRewardState {
      shop { id metafield(namespace: "${NS}", key: "${KEY}") { value } }
      shopifyFunctions(first: 25) { nodes { id handle } }
      discountNodes(first: 100, query: "title:'${TITLE}'") {
        nodes { id discount { ... on DiscountAutomaticApp { title status appDiscountType { functionId } } } }
      }
    }`));
  let config: any = defaults;
  try { config = { ...defaults, ...JSON.parse(body.data?.shop?.metafield?.value || "{}") }; } catch {}
  return { body, config };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const { body, config } = await getState(admin);
  return { config, apiError: body.errors?.map((e: any) => e.message).join("; ") || "" };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const { body } = await getState(admin);
  if (body.errors?.length) return { ok: false, message: body.errors.map((e: any) => e.message).join("; ") };
  let config: any;
  try { config = JSON.parse(String(form.get("config") || "{}")); } catch { return { ok: false, message: "Invalid reward settings." }; }
  if (!config.eligibleProducts?.length || !config.adultGift?.variantId || !config.kidsGift?.variantId)
    return { ok: false, message: "Select eligible bottles, an adult toothbrush and a kids toothbrush." };
  const value = JSON.stringify(config);
  const definition = await readJson(
    await admin.graphql(
      `#graphql
        mutation DefineCartReward($definition: MetafieldDefinitionInput!) {
          metafieldDefinitionCreate(definition: $definition) {
            userErrors { code message }
          }
        }
      `,
      {
        variables: {
          definition: {
            name: "Cart reward configuration",
            namespace: NS,
            key: KEY,
            type: "json",
            ownerType: "SHOP",
            access: {
              admin: "MERCHANT_READ_WRITE",
              storefront: "PUBLIC_READ",
            },
          },
        },
      },
    ),
  );
  const definitionErrors = definition.data?.metafieldDefinitionCreate?.userErrors ?? definition.errors ?? [];
  const blockingDefinitionErrors = definitionErrors.filter((e: any) => !/already exists|taken/i.test(e.message));
  if (blockingDefinitionErrors.length) return { ok: false, message: blockingDefinitionErrors.map((e: any) => e.message).join("; ") };
  const save = await readJson(await admin.graphql(`#graphql
    mutation SaveCartReward($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) { userErrors { field message } }
    }`, { variables: { metafields: [{ ownerId: body.data.shop.id, namespace: NS, key: KEY, type: "json", value }] } }));
  const saveErrors = save.data?.metafieldsSet?.userErrors ?? save.errors ?? [];
  if (saveErrors.length) return { ok: false, message: saveErrors.map((e: any) => e.message).join("; ") };
  if (form.get("intent") === "save") return { ok: true, message: "Reward settings saved." };
  const functionId = body.data.shopifyFunctions.nodes.find((fn: any) => fn.handle === "free-gift-discount")?.id;
  if (!functionId) return { ok: false, message: "Function not found. Deploy Store-App first." };
  const existing = body.data.discountNodes.nodes.find((node: any) => node.discount?.appDiscountType?.functionId === functionId);
  if (!existing) {
    const created = await readJson(await admin.graphql(`#graphql
      mutation ActivateReward($input: DiscountAutomaticAppInput!) {
        discountAutomaticAppCreate(automaticAppDiscount: $input) { automaticAppDiscount { discountId status } userErrors { field message } }
      }`, { variables: { input: { title: TITLE, functionId, startsAt: new Date().toISOString(), combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true }, metafields: [{ namespace: NS, key: KEY, type: "json", value }] } } }));
    const errors = created.data?.discountAutomaticAppCreate?.userErrors ?? created.errors ?? [];
    return errors.length ? { ok: false, message: errors.map((e: any) => e.message).join("; ") } : { ok: true, message: "Automatic reward activated." };
  }
  const updated = await readJson(await admin.graphql(`#graphql
    mutation UpdateReward($id: ID!, $input: DiscountAutomaticAppInput!) {
      discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $input) { userErrors { field message } }
    }`, { variables: { id: existing.id, input: { metafields: [{ namespace: NS, key: KEY, type: "json", value }] } } }));
  const errors = updated.data?.discountAutomaticAppUpdate?.userErrors ?? updated.errors ?? [];
  return errors.length ? { ok: false, message: errors.map((e: any) => e.message).join("; ") } : { ok: true, message: "Automatic reward settings updated." };
};

const numericId = (gid: string) => Number(gid?.split("/").pop() || 0);
const chosen = (product: any) => { const variant = product.variants?.[0]; return { productId: numericId(product.id), productGid: product.id, variantId: numericId(variant?.id), variantGid: variant?.id, title: product.title, isKids: /kids?/i.test(product.title) }; };

export default function Index() {
  const loaded = useLoaderData<typeof loader>(), result = useActionData<typeof action>();
  const [config, setConfig] = useState<any>(loaded.config);
  async function pick(kind: "eligible" | "adult" | "kids") {
    const products = await (window as any).shopify.resourcePicker({ type: "product", multiple: kind === "eligible", filter: { variants: true } });
    if (!products?.length) return;
    if (kind === "eligible") setConfig({ ...config, eligibleProducts: products.map(chosen) });
    else setConfig({ ...config, [kind === "adult" ? "adultGift" : "kidsGift"]: chosen(products[0]) });
  }
  return <s-page heading="Cart rewards">
    <s-section heading="Products">
      <s-paragraph>Only selected single-bottle products qualify. Bundle products remain excluded.</s-paragraph>
      <s-button onClick={() => pick("eligible")}>Select eligible bottles</s-button>
      <s-paragraph>{config.eligibleProducts?.map((p: any) => `${p.title}${p.isKids ? " (Kids)" : ""}`).join(", ") || "None selected"}</s-paragraph>
      <s-button onClick={() => pick("adult")}>Select adult toothbrush</s-button>
      <s-paragraph>{config.adultGift?.title || "None selected"}</s-paragraph>
      <s-button onClick={() => pick("kids")}>Select kids toothbrush</s-button>
      <s-paragraph>{config.kidsGift?.title || "None selected"}</s-paragraph>
    </s-section>
    <s-section heading="Milestones"><s-paragraph>2 bottles: one toothbrush. 3 bottles: free shipping. 4 bottles: two toothbrushes. If Kids is included, one gift is the Kids toothbrush.</s-paragraph></s-section>
    <Form method="post">
      <input type="hidden" name="config" value={JSON.stringify(config)} />
      <s-button type="submit" name="intent" value="save">Save settings</s-button>{" "}
      <s-button type="submit" name="intent" value="activate" variant="primary">Save and activate</s-button>
    </Form>
    <s-section heading="Status"><s-paragraph>{loaded.apiError || (result && (result.ok ? `Success: ${result.message}` : `Error: ${result.message}`)) || "Configure products, then activate once."}</s-paragraph></s-section>
  </s-page>;
}
export const headers: HeadersFunction = (args) => boundary.headers(args);
