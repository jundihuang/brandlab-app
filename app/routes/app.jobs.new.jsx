import { useState } from "react";
import { json, redirect } from "@remix-run/node";
import { useSubmit, useNavigation, useActionData } from "@remix-run/react";
import {
  Page, Layout, Card, FormLayout, Select, Checkbox, BlockStack,
  Button, Banner, Text, InlineStack
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
  { key: "product", label: "Products (title, description)" },
  { key: "collection", label: "Collections (title, description)" },
  { key: "page", label: "Pages (title, content)" },
  { key: "blog", label: "Blog posts (title, content)" }
];

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

  const [targetLocale, setTargetLocale] = useState("it");
  const [market, setMarket] = useState("IT");
  const [strategy, setStrategy] = useState("merchant_review_first");
  const [types, setTypes] = useState({ product: true, collection: false, page: false, blog: false });

  const isSaving = navigation.state === "submitting";
  const anyType = Object.values(types).some(Boolean);

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
          {actionData && !actionData.success && <Banner tone="critical" onDismiss>{actionData.error}</Banner>}
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Scope</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                One job targets one market and language. Selected content types must already be scanned.
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
                <Button variant="primary" onClick={handleSubmit} loading={isSaving} disabled={!anyType}>
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
