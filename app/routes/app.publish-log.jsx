import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page, Layout, Card, DataTable, Badge, TextField, Select, InlineStack,
  BlockStack, EmptyState, Banner, Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { brandlabBackendUrl, brandlabHeaders } from "../lib/brandlab.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const params = new URLSearchParams({ shop_domain: session.shop });
  ["job_id", "target_locale", "resource_type", "search"].forEach((key) => {
    const value = url.searchParams.get(key);
    if (value) params.set(key, value);
  });
  const response = await fetch(brandlabBackendUrl("publish_records", params), {
    headers: brandlabHeaders(session.shop),
  });
  const data = response.ok ? await response.json() : { total: 0, items: [] };
  return json({
    ...data,
    filters: Object.fromEntries(url.searchParams),
    backendError: response.ok ? null : `Publish log unavailable (${response.status})`,
  });
};

export default function PublishLog() {
  const { items, total, filters, backendError } = useLoaderData();
  const navigate = useNavigate();
  const [search, setSearch] = useState(filters.search || "");
  const [locale, setLocale] = useState(filters.target_locale || "");
  const [resourceType, setResourceType] = useState(filters.resource_type || "");

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (locale) params.set("target_locale", locale);
    if (resourceType) params.set("resource_type", resourceType);
    navigate(`/app/publish-log?${params}`);
  };

  const rows = items.map((record) => [
    `#${record.id}`,
    new Date(record.published_at).toLocaleString(),
    `#${record.translation_job_id}`,
    record.resource_type || "-",
    record.resource_handle || "-",
    record.field_key,
    record.target_locale.toUpperCase(),
    <Badge key={`score-${record.id}`} tone={Number(record.trust_score) >= 0.9 ? "success" : "attention"}>
      {record.trust_score ?? "-"}
    </Badge>,
    record.published_by || "-",
    <Text key={`digest-${record.id}`} as="span">{record.content_digest?.slice(0, 10)}</Text>,
  ]);

  return (
    <Page title="Publish log" subtitle={`${total} append-only publish records`}>
      <TitleBar title="Publish log" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {backendError ? <Banner tone="critical">{backendError}</Banner> : null}
            <Card>
              <BlockStack gap="400">
                <InlineStack gap="300" align="end">
                  <div style={{ minWidth: "220px" }}>
                    <TextField label="" placeholder="Search resource or field" value={search} onChange={setSearch} autoComplete="off" />
                  </div>
                  <div style={{ minWidth: "140px" }}>
                    <Select
                      label=""
                      value={locale}
                      onChange={setLocale}
                      options={[
                        { label: "All locales", value: "" },
                        { label: "Italian", value: "it" },
                        { label: "French", value: "fr" },
                        { label: "German", value: "de" },
                        { label: "Japanese", value: "ja" },
                      ]}
                    />
                  </div>
                  <div style={{ minWidth: "150px" }}>
                    <Select
                      label=""
                      value={resourceType}
                      onChange={setResourceType}
                      options={[
                        { label: "All resources", value: "" },
                        { label: "Products", value: "product" },
                        { label: "Collections", value: "collection" },
                        { label: "Pages", value: "page" },
                        { label: "Blogs", value: "blog" },
                      ]}
                    />
                  </div>
                  <button className="Polaris-Button" type="button" onClick={applyFilters}>Filter</button>
                </InlineStack>
                {total === 0 ? (
                  <EmptyState heading="No publishes yet" body="Approved translations appear here after Shopify accepts the write." />
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "text", "text", "text", "text", "text", "text"]}
                    headings={["Record", "Published", "Job", "Type", "Resource", "Field", "Locale", "Trust", "By", "Digest"]}
                    rows={rows}
                    increasedVerticalDensity
                  />
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
