import { useEffect, useMemo, useState } from "react";
import { json, redirect } from "@remix-run/node";
import { useSubmit, useNavigation, useActionData, useFetcher } from "@remix-run/react";
import {
  Page, Layout, Card, FormLayout, Select, Checkbox, BlockStack,
  Button, Banner, Text, InlineStack, Badge
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { brandlabBackendUrl, brandlabHeaders } from "../lib/brandlab.server";

const TARGET_LANGUAGES = [
  { label: "Italian (it)", value: "it" },
  { label: "French (fr)", value: "fr" },
  { label: "German (de)", value: "de" },
  { label: "Spanish (es)", value: "es" },
  { label: "Chinese (zh)", value: "zh" }
];

const MARKETS = [
  { label: "Italy", value: "IT" },
  { label: "France", value: "FR" },
  { label: "Germany", value: "DE" },
  { label: "Spain", value: "ES" },
  { label: "Global", value: "GLOBAL" }
];

const RESOURCE_TYPES = [
  { key: "product", label: "Products" },
  { key: "collection", label: "Collections" },
  { key: "page", label: "Pages" },
  { key: "blog", label: "Blog posts" }
];

const RESOURCE_TYPE_LABELS = Object.fromEntries(
  RESOURCE_TYPES.map((resourceType) => [resourceType.key, resourceType.label])
);

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const url = new URL(request.url);

  if (url.searchParams.get("preview") !== "1") {
    return json({ preview: null });
  }

  const resourceTypes = url.searchParams.getAll("resource_types").filter(Boolean);
  const params = new URLSearchParams({
    shop_domain: shopDomain,
    target_locale: url.searchParams.get("target_locale") || "it",
    market: url.searchParams.get("market") || ""
  });
  resourceTypes.forEach((type) => params.append("resource_types", type));

  const res = await fetch(brandlabBackendUrl("jobs/eligible_inventory", params), {
    headers: brandlabHeaders(shopDomain)
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return json(
      { preview: { error: error.error_message || "Unable to calculate eligible content" } },
      { status: res.status }
    );
  }

  const payload = await res.json();
  return json({
    preview: {
      ...payload.summary,
      error: null
    }
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();

  const resourceTypes = RESOURCE_TYPES.map((r) => r.key).filter((k) => formData.get(`type_${k}`) === "on");

  const res = await fetch(brandlabBackendUrl("jobs"), {
    method: "POST",
    headers: brandlabHeaders(shopDomain, { json: true }),
    body: JSON.stringify({
      shop_domain: shopDomain,
      target_locale: formData.get("target_locale"),
      market: formData.get("market"),
      scope: { resource_types: resourceTypes },
      publish_strategy: { mode: formData.get("strategy") }
    })
  });

  if (res.ok) {
    const job = await res.json();
    return redirect(`/app/jobs/${job.id}`);
  }
  const err = await res.json().catch(() => ({}));
  return json({ success: false, error: err.error_message || "Failed to create job" }, { status: 422 });
};

export default function JobNew() {
  const submit = useSubmit();
  const navigation = useNavigation();
  const actionData = useActionData();
  const previewFetcher = useFetcher();

  const [targetLocale, setTargetLocale] = useState("it");
  const [market, setMarket] = useState("IT");
  const [strategy, setStrategy] = useState("merchant_review_first");
  const [types, setTypes] = useState({ product: true, collection: false, page: false, blog: false });

  const isSaving = navigation.state === "submitting";
  const anyType = Object.values(types).some(Boolean);
  const selectedTypes = useMemo(
    () => RESOURCE_TYPES.filter((resourceType) => types[resourceType.key]).map((r) => r.key),
    [types]
  );

  const preview = previewFetcher.data?.preview;
  const previewLoading = previewFetcher.state !== "idle";
  const previewTotal = preview?.total;
  const previewByType = preview?.by_resource_type || {};

  useEffect(() => {
    if (!selectedTypes.length) {
      return undefined;
    }

    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        preview: "1",
        target_locale: targetLocale,
        market
      });
      selectedTypes.forEach((type) => params.append("resource_types", type));
      previewFetcher.load(`/app/jobs/new?${params.toString()}`);
    }, 250);

    return () => clearTimeout(timer);
  }, [previewFetcher, market, selectedTypes, targetLocale]);

  const handleSubmit = () => {
    const fd = new FormData();
    fd.set("target_locale", targetLocale);
    fd.set("market", market);
    fd.set("strategy", strategy);
    Object.entries(types).forEach(([k, v]) => fd.set(`type_${k}`, v ? "on" : ""));
    submit(fd, { method: "post" });
  };

  return (
    <Page title="New translation job" backAction={{ url: "/app/jobs" }}>
      <TitleBar title="New translation job" />
      <Layout>
        <Layout.Section>
          {actionData && !actionData.success && (
            <Banner tone="critical" onDismiss>{actionData.error}</Banner>
          )}
          {preview?.error && (
            <Banner tone="warning" title="Preview unavailable">
              {preview.error}
            </Banner>
          )}
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Scope</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                One job targets one market and language. Eligible content comes from the scanned field inventory and must have passed audit.
              </Text>
              <FormLayout>
                <InlineStack gap="400">
                  <div style={{ minWidth: "220px" }}>
                    <Select label="Target language" options={TARGET_LANGUAGES} value={targetLocale} onChange={setTargetLocale} />
                  </div>
                  <div style={{ minWidth: "220px" }}>
                    <Select label="Market" options={MARKETS} value={market} onChange={setMarket} />
                  </div>
                </InlineStack>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">Content types</Text>
                  {RESOURCE_TYPES.map((r) => (
                    <Checkbox
                      key={r.key}
                      label={r.label}
                      checked={types[r.key]}
                      onChange={(v) => setTypes((t) => ({ ...t, [r.key]: v }))}
                    />
                  ))}
                </BlockStack>
              </FormLayout>
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Eligible content preview</Text>
              {!anyType && (
                <Banner tone="info">Select at least one content type to see the eligible item count.</Banner>
              )}
              {anyType && previewLoading && (
                <Text as="p" variant="bodyMd" tone="subdued">Calculating eligible items…</Text>
              )}
              {anyType && !previewLoading && !preview?.error && (
                <BlockStack gap="300">
                  <Text as="p" variant="headingLg">
                    {previewTotal === 1 ? "1 translation item" : `${previewTotal || 0} translation items`}
                  </Text>
                  <InlineStack gap="200">
                    {Object.entries(previewByType).map(([type, count]) => (
                      <Badge key={type} tone="info">
                        {RESOURCE_TYPE_LABELS[type] || type}: {count}
                      </Badge>
                    ))}
                  </InlineStack>
                  {previewTotal === 0 && (
                    <Banner tone="warning">
                      No audit-approved content is eligible for this language and market.
                    </Banner>
                  )}
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Counts exclude non-translatable fields, missing sources, and content already written in the target language.
                  </Text>
                </BlockStack>
              )}
              <Text as="h2" variant="headingMd">Publish strategy</Text>
              <FormLayout>
                <Select
                  label="How translations are published"
                  options={[
                    { label: "Merchant review first (recommended)", value: "merchant_review_first" },
                    { label: "Auto publish high-confidence", value: "auto_with_threshold" }
                  ]}
                  value={strategy}
                  onChange={setStrategy}
                  helpText="Strategy is snapshotted with the job and applied to all items."
                />
              </FormLayout>
              <InlineStack align="end">
                <Button
                  variant="primary"
                  onClick={handleSubmit}
                  loading={isSaving}
                  disabled={!anyType || previewLoading || previewTotal === 0}
                >
                  Create job
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
