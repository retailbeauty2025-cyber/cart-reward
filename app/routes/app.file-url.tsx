import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { admin } = await authenticate.admin(request);
    const id = new URL(request.url).searchParams.get("id");
    if (!id?.startsWith("gid://shopify/MediaImage/")) {
      return Response.json({ error: "Select an image from Shopify Files." }, { status: 400 });
    }
    const response = await admin.graphql(`#graphql
      query RewardIcon($id: ID!) {
        node(id: $id) {
          ... on MediaImage { id image { url width height } }
        }
      }
    `, { variables: { id } });
    const body = await response.json();
    const image = body.data?.node?.image;
    if (body.errors?.length || !image?.url) {
      return Response.json({ error: body.errors?.map((e: { message: string }) => e.message).join("; ") || "The selected image is not ready." }, { status: 422 });
    }
    return Response.json({ id, url: image.url, width: image.width, height: image.height });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to read Shopify Files." }, { status: 500 });
  }
};
