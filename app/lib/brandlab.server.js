const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3000";

export function brandlabHeaders(shopDomain, { json = false } = {}) {
  const headers = { "X-Shopify-Shop-Domain": shopDomain };
  if (json) headers["Content-Type"] = "application/json";
  if (process.env.BRANDLAB_INTERNAL_API_TOKEN) {
    headers["X-BrandLab-Internal-Token"] = process.env.BRANDLAB_INTERNAL_API_TOKEN;
  }
  return headers;
}

export function brandlabBackendUrl(path, searchParams = new URLSearchParams()) {
  const query = searchParams.toString();
  return `${BACKEND_URL}/admin_api/v1/brandlab/${path}${query ? `?${query}` : ""}`;
}
