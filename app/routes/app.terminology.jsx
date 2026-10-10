import { useState } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import {
  Page, Layout, Card, DataTable, Button, TextField, Select, BlockStack,
  InlineStack, Text, Banner, EmptyState, Checkbox
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { brandlabBackendUrl, brandlabHeaders } from "../lib/brandlab.server";

const LANGUAGES = [
  { label: "Italian", value: "it" },
  { label: "French", value: "fr" },
  { label: "German", value: "de" },
  { label: "Spanish", value: "es" },
  { label: "Chinese", value: "zh" }
];

const TERM_TYPES = [
  { label: "Locked (exact translation required)", value: "locked" },
  { label: "Standard", value: "standard" },
  { label: "Forbidden", value: "forbidden" }
];

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const url = new URL(request.url);
  const minOcc = url.searchParams.get("min_occurrences") || "2";

  const params = new URLSearchParams({ shop_domain: shopDomain, min_occurrences: minOcc, limit: "50" });
  const res = await fetch(brandlabBackendUrl("terminology/recommendations", params), {
    headers: brandlabHeaders(shopDomain)
  });
  const data = res.ok ? await res.json() : { total: 0, items: [] };
  return json({ ...data, shopDomain, minOcc });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();
  const sourceTerms = formData.getAll("source_terms").filter(Boolean);
  const targetTerms = formData.getAll("target_terms");

  const terms = sourceTerms.map((source, idx) => ({
    source_term: source,
    target_term: targetTerms[idx] || "",
    term_type: formData.get(`term_type_${source}`) || "locked"
  }));

  const res = await fetch(brandlabBackendUrl("terminology/confirm"), {
    method: "POST",
    headers: brandlabHeaders(shopDomain, { json: true }),
    body: JSON.stringify({
      shop_domain: shopDomain,
      target_locale: formData.get("target_locale"),
      terms
    })
  });

  return json({ success: res.ok, confirmed: res.ok ? terms.length : 0 });
};

export default function Terminology() {
  const { items, total } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [selected, setSelected] = useState({});
  const [targetTerms, setTargetTerms] = useState({});
  const [termTypes, setTermTypes] = useState({});
  const [targetLocale, setTargetLocale] = useState("it");

  const isSaving = navigation.state === "submitting";
  const selectedCount = Object.values(selected).filter(Boolean).length;

  const rows = items.map((item) => {
    const checkbox = (
      <Checkbox
        key={`sel-${item.source_term}`}
        label={`Select ${item.source_term}`}
        labelHidden
        checked={Boolean(selected[item.source_term])}
        onChange={(checked) => setSelected((s) => ({ ...s, [item.source_term]: checked }))}
      />
    );
    const typeSelect = (
      <Select
        key={`type-${item.source_term}`}
        label=""
        options={TERM_TYPES}
        value={termTypes[item.source_term] || "locked"}
        onChange={(v) => setTermTypes((t) => ({ ...t, [item.source_term]: v }))}
      />
    );
    const targetInput = (
      <TextField
        key={`target-${item.source_term}`}
        label=""
        value={targetTerms[item.source_term] || ""}
        onChange={(v) => setTargetTerms((t) => ({ ...t, [item.source_term]: v }))}
        placeholder="Target term"
        autoComplete="off"
      />
    );
    const context = <Text variant="bodySm" as="span" tone="subdued">{item.sample_context}</Text>;
    return [checkbox, item.source_term, String(item.occurrences), context, typeSelect, targetInput];
  });

  const handleConfirm = () => {
    const formData = new FormData();
    formData.set("target_locale", targetLocale);
    Object.keys(selected).forEach((term) => {
      if (selected[term]) {
        formData.append("source_terms", term);
        formData.append("target_terms", targetTerms[term] || "");
      }
    });
    Object.entries(termTypes).forEach(([term, type]) => {
      if (selected[term]) formData.set(`term_type_${term}`, type);
    });
    submit(formData, { method: "post" });
  };

  return (
    <Page
      title="Terminology"
      subtitle="Review recommended brand terms extracted from your store content, then confirm them to guide AI translations"
    >
      <TitleBar title="Terminology" />
      <Layout>
        <Layout.Section>
          {actionData?.success && <Banner tone="success" onDismiss>{actionData.confirmed} terms confirmed into glossary</Banner>}
          {actionData && !actionData.success && <Banner tone="critical" onDismiss>Failed to confirm terms</Banner>}
        </Layout.Section>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="400" align="end" blockAlign="center">
                <Select label="Target language" labelInline options={LANGUAGES} value={targetLocale} onChange={setTargetLocale} />
                <Button variant="primary" onClick={handleConfirm} loading={isSaving} disabled={selectedCount === 0}>
                  Confirm {selectedCount > 0 ? `${selectedCount} ` : ""}terms
                </Button>
              </InlineStack>
              {total === 0 ? (
                <EmptyState heading="No term recommendations">
                  <p>Scan your store content first, then run the audit. Terms that repeat across products will appear here.</p>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "numeric", "text", "text", "text"]}
                  headings={["", "Term", "Occurrences", "Context", "Type", "Target translation"]}
                  rows={rows}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
