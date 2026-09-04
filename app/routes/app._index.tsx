import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

const NS = "cart_rewards", KEY = "config", TITLE = "Cart Reward – Toothbrushes";
const defaults = {
  eligibleProducts: [], adultGift: null, kidsGift: null,
  toothbrushAt: 2, shippingAt: 3, doubleGiftAt: 4,
  progressText: "{qty}/{target} bottles — add {remaining} more to get a FREE toothbrush",
  giftUnlockedText: "Toothbrush unlocked — add {remaining} more bottle for FREE shipping",
  allUnlockedText: "All rewards unlocked — FREE toothbrush + FREE shipping",
  giftLabel: "Free Toothbrush", shippingLabel: "Free Shipping",
  giftIconUrl: "", shippingIconUrl: "",
  backgroundColor: "#ffffff", headingColor: "#172019", labelColor: "#737a75",
  completedColor: "#225d34", accentColor: "#2e7d45", trackColor: "#edf0ed",
  borderColor: "#ececec", borderWidth: 1, borderRadius: 14,
  headingFontSize: 13, labelFontSize: 11, iconSize: 28, lineThickness: 4,
  animationDuration: 450, paddingTop: 12, paddingRight: 14, paddingBottom: 14, paddingLeft: 14,
  marginTop: 0, marginRight: 0, marginBottom: 20, marginLeft: 0,
};
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
              admin: "PUBLIC_READ_WRITE",
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

function Field({ label, value, onChange, type = "text", help }: any) {
  return <label style={{ display: "grid", gap: 6, marginBottom: 14, maxWidth: 680 }}>
    <span style={{ fontWeight: 600 }}>{label}</span>
    <input type={type} value={value ?? ""} onChange={(e) => onChange(type === "number" ? Number(e.target.value) : e.target.value)} style={{ boxSizing: "border-box", width: "100%", minHeight: 38, padding: "8px 10px", border: "1px solid #8a8a8a", borderRadius: 8, font: "inherit" }} />
    {help && <span style={{ color: "#616161", fontSize: 12 }}>{help}</span>}
  </label>;
}

export default function Index() {
  const loaded = useLoaderData<typeof loader>(), result = useActionData<typeof action>();
  const [config, setConfig] = useState<any>(loaded.config);
  async function pick(kind: "eligible" | "adult" | "kids") {
    const products = await (window as any).shopify.resourcePicker({ type: "product", multiple: kind === "eligible", filter: { variants: true } });
    if (!products?.length) return;
    if (kind === "eligible") setConfig({ ...config, eligibleProducts: products.map(chosen) });
    else setConfig({ ...config, [kind === "adult" ? "adultGift" : "kidsGift"]: chosen(products[0]) });
  }
  const set = (key: string, value: any) => setConfig({ ...config, [key]: value });
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
    <s-section heading="Milestones">
      <Field label="Free toothbrush milestone" type="number" value={config.toothbrushAt} onChange={(v: number) => set("toothbrushAt", v)} />
      <Field label="Free shipping milestone" type="number" value={config.shippingAt} onChange={(v: number) => set("shippingAt", v)} />
      <Field label="Two-toothbrush milestone" type="number" value={config.doubleGiftAt} onChange={(v: number) => set("doubleGiftAt", v)} />
    </s-section>
    <s-section heading="Progress bar text">
      <Field label="Before toothbrush unlocks" value={config.progressText} onChange={(v: string) => set("progressText", v)} help="Available: {qty}, {target}, {remaining}" />
      <Field label="After toothbrush unlocks" value={config.giftUnlockedText} onChange={(v: string) => set("giftUnlockedText", v)} help="Available: {qty}, {target}, {remaining}" />
      <Field label="All rewards unlocked" value={config.allUnlockedText} onChange={(v: string) => set("allUnlockedText", v)} help="Available: {qty}" />
      <Field label="Toothbrush milestone label" value={config.giftLabel} onChange={(v: string) => set("giftLabel", v)} />
      <Field label="Shipping milestone label" value={config.shippingLabel} onChange={(v: string) => set("shippingLabel", v)} />
    </s-section>
    <s-section heading="Progress bar icons">
      <Field label="Toothbrush icon image URL" value={config.giftIconUrl} onChange={(v: string) => set("giftIconUrl", v)} help="Leave blank to use the built-in toothbrush icon. Use an HTTPS SVG, PNG or WebP URL." />
      <Field label="Shipping icon image URL" value={config.shippingIconUrl} onChange={(v: string) => set("shippingIconUrl", v)} help="Leave blank to use the built-in delivery icon. Use an HTTPS SVG, PNG or WebP URL." />
    </s-section>
    <s-section heading="Colors">
      <Field label="Background color" type="color" value={config.backgroundColor} onChange={(v: string) => set("backgroundColor", v)} />
      <Field label="Heading text color" type="color" value={config.headingColor} onChange={(v: string) => set("headingColor", v)} />
      <Field label="Milestone label color" type="color" value={config.labelColor} onChange={(v: string) => set("labelColor", v)} />
      <Field label="Completed label color" type="color" value={config.completedColor} onChange={(v: string) => set("completedColor", v)} />
      <Field label="Progress and completed icon color" type="color" value={config.accentColor} onChange={(v: string) => set("accentColor", v)} />
      <Field label="Incomplete track color" type="color" value={config.trackColor} onChange={(v: string) => set("trackColor", v)} />
      <Field label="Border color" type="color" value={config.borderColor} onChange={(v: string) => set("borderColor", v)} />
    </s-section>
    <s-section heading="Typography and sizing">
      <Field label="Heading font size (px)" type="number" value={config.headingFontSize} onChange={(v: number) => set("headingFontSize", v)} />
      <Field label="Milestone label font size (px)" type="number" value={config.labelFontSize} onChange={(v: number) => set("labelFontSize", v)} />
      <Field label="Icon circle size (px)" type="number" value={config.iconSize} onChange={(v: number) => set("iconSize", v)} />
      <Field label="Progress line thickness (px)" type="number" value={config.lineThickness} onChange={(v: number) => set("lineThickness", v)} />
      <Field label="Animation duration (milliseconds)" type="number" value={config.animationDuration} onChange={(v: number) => set("animationDuration", v)} />
      <Field label="Border width (px)" type="number" value={config.borderWidth} onChange={(v: number) => set("borderWidth", v)} />
      <Field label="Border radius (px)" type="number" value={config.borderRadius} onChange={(v: number) => set("borderRadius", v)} />
    </s-section>
    <s-section heading="Padding">
      <Field label="Top padding (px)" type="number" value={config.paddingTop} onChange={(v: number) => set("paddingTop", v)} />
      <Field label="Right padding (px)" type="number" value={config.paddingRight} onChange={(v: number) => set("paddingRight", v)} />
      <Field label="Bottom padding (px)" type="number" value={config.paddingBottom} onChange={(v: number) => set("paddingBottom", v)} />
      <Field label="Left padding (px)" type="number" value={config.paddingLeft} onChange={(v: number) => set("paddingLeft", v)} />
    </s-section>
    <s-section heading="Margin">
      <Field label="Top margin (px)" type="number" value={config.marginTop} onChange={(v: number) => set("marginTop", v)} />
      <Field label="Right margin (px)" type="number" value={config.marginRight} onChange={(v: number) => set("marginRight", v)} />
      <Field label="Bottom margin (px)" type="number" value={config.marginBottom} onChange={(v: number) => set("marginBottom", v)} />
      <Field label="Left margin (px)" type="number" value={config.marginLeft} onChange={(v: number) => set("marginLeft", v)} />
    </s-section>
    <Form method="post">
      <input type="hidden" name="config" value={JSON.stringify(config)} />
      <s-button type="submit" name="intent" value="save">Save settings</s-button>{" "}
      <s-button type="submit" name="intent" value="activate" variant="primary">Save and activate</s-button>
    </Form>
    <s-section heading="Status"><s-paragraph>{loaded.apiError || (result && (result.ok ? `Success: ${result.message}` : `Error: ${result.message}`)) || "Configure products, then activate once."}</s-paragraph></s-section>
  </s-page>;
}
export const headers: HeadersFunction = (args) => boundary.headers(args);
