import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { brandlabBackendUrl, brandlabHeaders, webhookSourceDigest } from "../lib/brandlab.server";

export const action = async ({ request }) => {
  const { payload, shop } = await authenticate.webhook(request);
  await fetch(brandlabBackendUrl("content_stale"), {
    method: "POST",
    headers: brandlabHeaders(shop, { json: true }),
    body: JSON.stringify({
      resource_gid: payload.admin_graphql_api_id,
      resource_type: "product",
      source_digest: webhookSourceDigest("product", payload),
      changed_at: payload.updated_at,
    }),
  });
  return json({ ok: true });
};
