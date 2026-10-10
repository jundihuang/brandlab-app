import { useState } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import {
  Page, Layout, Card, DataTable, Button, TextField, Select, Modal, BlockStack,
  Badge, InlineStack, EmptyState, Banner, Text
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
  { label: "Locked", value: "locked" },
  { label: "Standard", value: "standard" },
  { label: "Forbidden", value: "forbidden" }
];

const TYPE_TONES = { locked: "success", standard: "info", forbidden: "critical" };

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const url = new URL(request.url);

  const params = new URLSearchParams({ shop_domain: shopDomain, per_page: "100" });
  const locale = url.searchParams.get("target_locale");
  const type = url.searchParams.get("term_type");
  const search = url.searchParams.get("search");
  if (locale) params.set("target_locale", locale);
  if (type) params.set("term_type", type);
  if (search) params.set("search", search);

  const res = await fetch(brandlabBackendUrl("glossary", params), {
    headers: brandlabHeaders(shopDomain)
  });
  const data = res.ok ? await res.json() : { total: 0, items: [] };
  return json({ ...data, shopDomain, filters: { locale, type, search } });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");
  let res;

  if (intent === "create") {
    res = await fetch(brandlabBackendUrl("glossary"), {
      method: "POST",
      headers: brandlabHeaders(shopDomain, { json: true }),
      body: JSON.stringify({
        shop_domain: shopDomain,
        source_term: formData.get("source_term"),
        target_term: formData.get("target_term"),
        target_locale: formData.get("target_locale"),
        term_type: formData.get("term_type"),
        note: formData.get("note"),
        confirmed: true
      })
    });
  } else if (intent === "delete") {
    res = await fetch(brandlabBackendUrl(`glossary/${formData.get("id")}?shop_domain=${shopDomain}`), {
      method: "DELETE",
      headers: brandlabHeaders(shopDomain)
    });
  }

  return json({ success: res ? res.ok : false });
};

export default function Glossary() {
  const { items, total, filters } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState(filters.search || "");
  const [locale, setLocale] = useState(filters.locale || "");
  const [termType, setTermType] = useState(filters.type || "");
  const [form, setForm] = useState({ source_term: "", target_term: "", target_locale: "it", term_type: "locked", note: "" });

  const isSaving = navigation.state === "submitting";

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (locale) params.set("target_locale", locale);
    if (termType) params.set("term_type", termType);
    if (search) params.set("search", search);
    submit(params, { method: "get" });
  };

  const rows = items.map((t) => [
    t.source_term,
    t.target_term || "-",
    t.target_locale,
    <Badge key={`t-${t.id}`} tone={TYPE_TONES[t.term_type] || "info"}>{t.term_type}</Badge>,
    t.confirmed ? <Badge key={`c-${t.id}`} tone="success">confirmed</Badge> : <Badge key={`c-${t.id}`} tone="warning">pending</Badge>,
    <InlineStack key={`a-${t.id}`} gap="200">
      <Button
        size="slim"
        variant="plain"
        tone="critical"
        onClick={() => {
          const fd = new FormData();
          fd.set("intent", "delete");
          fd.set("id", String(t.id));
          submit(fd, { method: "post" });
        }}
      >
        Delete
      </Button>
    </InlineStack>
  ]);

  return (
    <Page
      title="Glossary"
      subtitle="Locked terms, brand vocabulary, and forbidden words used to constrain AI translations"
      primaryAction={{ content: "Add term", onAction: () => setModalOpen(true) }}
    >
      <TitleBar title="Glossary" />
      <Layout>
        <Layout.Section>
          {actionData?.success && <Banner tone="success" onDismiss>Saved</Banner>}
          {actionData && !actionData.success && <Banner tone="critical" onDismiss>Operation failed</Banner>}
        </Layout.Section>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="300" align="end" blockAlign="center">
                <div style={{ minWidth: "180px" }}>
                  <TextField label="" placeholder="Search terms" value={search} onChange={setSearch} autoComplete="off" />
                </div>
                <div style={{ minWidth: "140px" }}>
                  <Select label="" options={[{ label: "All languages", value: "" }, ...LANGUAGES]} value={locale} onChange={setLocale} />
                </div>
                <div style={{ minWidth: "140px" }}>
                  <Select label="" options={[{ label: "All types", value: "" }, ...TERM_TYPES]} value={termType} onChange={setTermType} />
                </div>
                <Button onClick={applyFilters}>Filter</Button>
              </InlineStack>
              {total === 0 ? (
                <EmptyState heading="No glossary terms" message="Confirm recommended terms or add terms manually.">
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                  headings={["Source term", "Target term", "Locale", "Type", "Status", ""]}
                  rows={rows}
                />
              )}
              <Text variant="bodySm" as="span" tone="subdued">{total} terms</Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add glossary term"
        primaryAction={{
          content: "Save term",
          loading: isSaving,
          onAction: () => {
            const fd = new FormData();
            fd.set("intent", "create");
            Object.entries(form).forEach(([k, v]) => fd.set(k, v));
            submit(fd, { method: "post" });
            setModalOpen(false);
          }
        }}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <TextField label="Source term" value={form.source_term} onChange={(v) => setForm((f) => ({ ...f, source_term: v }))} autoComplete="off" />
            <TextField label="Target term" value={form.target_term} onChange={(v) => setForm((f) => ({ ...f, target_term: v }))} autoComplete="off" />
            <Select label="Target locale" options={LANGUAGES} value={form.target_locale} onChange={(v) => setForm((f) => ({ ...f, target_locale: v }))} />
            <Select label="Term type" options={TERM_TYPES} value={form.term_type} onChange={(v) => setForm((f) => ({ ...f, term_type: v }))} />
            <TextField label="Note" value={form.note} onChange={(v) => setForm((f) => ({ ...f, note: v }))} autoComplete="off" />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
