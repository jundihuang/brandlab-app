import crypto from "node:crypto";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3000";

export function brandlabHeaders(shopDomain, { json = false } = {}) {
  const headers = { "X-Shopify-Shop-Domain": shopDomain };
  if (json) headers["Content-Type"] = "application/json";
  if (process.env.BRANDLAB_INTERNAL_API_TOKEN) {
    headers["X-BrandLab-Internal-Token"] = process.env.BRANDLAB_INTERNAL_API_TOKEN;
  }
  return headers;
}

export async function brandlabResponseJson(response, fallback = {}) {
  const text = await response.text();
  if (!text) return fallback;

  try {
    return JSON.parse(text);
  } catch (_error) {
    return {
      ...fallback,
      error_message: `Backend returned an invalid response (${response.status}).`,
    };
  }
}

export function brandlabBackendUrl(path, searchParams = new URLSearchParams()) {
  const query = searchParams.toString();
  return `${BACKEND_URL}/admin_api/v1/brandlab/${path}${query ? `?${query}` : ""}`;
}

const WEBHOOK_CONTENT_FIELDS = {
  product: ["title", "body_html", "product_type"],
  collection: ["title", "body_html"],
  page: ["title", "body_html"],
  blog: ["title"],
};

export function webhookSourceDigest(resourceType, payload) {
  const fields = WEBHOOK_CONTENT_FIELDS[resourceType];
  if (!fields) return undefined;
  const content = Object.fromEntries(fields.map((field) => [field, payload[field] ?? ""]));
  return crypto.createHash("sha256").update(JSON.stringify(content)).digest("hex");
}
