import { useState } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page, Layout, Card, DataTable, Button, TextField, Select, Modal, BlockStack,
  Badge, InlineStack, EmptyState
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

import { brandlabBackendUrl, brandlabHeaders } from "../lib/brandlab.server";

const RULE_DOMAINS = [
  { label: "Product Naming", value: "product_naming" },
  { label: "Product Description", value: "product_description" },
  { label: "Variants", value: "variants" },
  { label: "SEO", value: "seo" },
  { label: "Care & Compliance", value: "care_compliance" },
  { label: "Store Content", value: "store_content" }
];

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const url = new URL(request.url);

  const params = new URLSearchParams({ shop_domain: shopDomain, per_page: "50" });
  const domain = url.searchParams.get("rule_domain");
  if (domain) params.set("rule_domain", domain);

  const res = await fetch(brandlabBackendUrl("guidelines", params), {
    headers: brandlabHeaders(shopDomain)
  });

  const data = res.ok ? await res.json() : { total: 0, items: [] };
  return json({ ...data, shopDomain });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    await fetch(brandlabBackendUrl("guidelines"), {
      method: "POST",
    headers: brandlabHeaders(shopDomain, { json: true }),
      body: JSON.stringify({
        shop_domain: shopDomain,
        name: formData.get("name"),
        rule_domain: formData.get("rule_domain"),
        description: formData.get("description"),
        rules: JSON.parse(formData.get("rules") || "[]")
      })
    });
  } else if (intent === "toggle") {
    await fetch(brandlabBackendUrl(`guidelines/${formData.get("id")}`), {
      method: "PUT",
    headers: brandlabHeaders(shopDomain, { json: true }),
      body: JSON.stringify({ active: formData.get("active") === "true" })
    });
  } else if (intent === "delete") {
    await fetch(brandlabBackendUrl(`guidelines/${formData.get("id")}`), {
      method: "DELETE",
    headers: brandlabHeaders(shopDomain)
    });
  }

  return json({ ok: true });
};

export default function Guidelines() {
  const { items, total } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [ruleDomain, setRuleDomain] = useState("product_naming");
  const [description, setDescription] = useState("");
  const [instruction, setInstruction] = useState("");

  const isLoading = navigation.state === "submitting";

  const rows = items.map((g) => [
    g.name,
    RULE_DOMAINS.find(d => d.value === g.rule_domain)?.label || g.rule_domain,
    g.version,
    g.active ? <Badge tone="success">Active</Badge> : <Badge tone="critical">Disabled</Badge>,
    <InlineStack gap="200" key={g.id}>
      <Button size="micro" url={`/app/guidelines/${g.id}`}>View</Button>
      <Button size="micro" url={`/app/guidelines/${g.id}/edit`}>Edit</Button>
      <Button size="micro" onClick={() => {
        submit({ intent: "toggle", id: g.id.toString(), active: (!g.active).toString() }, { method: "POST" });
      }}>{g.active ? "Disable" : "Enable"}</Button>
      <Button size="micro" tone="critical" onClick={() => {
        submit({ intent: "delete", id: g.id.toString() }, { method: "POST" });
      }}>Delete</Button>
    </InlineStack>
  ]);

  const handleCreate = () => {
    const rules = instruction ? [{ instruction }] : [];
    submit({ intent: "create", name, rule_domain: ruleDomain, description, rules: JSON.stringify(rules) }, { method: "POST" });
    setModalOpen(false);
    setName(""); setDescription(""); setInstruction("");
  };

  return (
    <Page title="Guidelines" subtitle={`${total} rule packages`} primaryAction={{ content: "New guideline", onAction: () => setModalOpen(true) }}>
      <Layout>
        <Layout.Section>
          <Card>
            {rows.length === 0 ? (
              <EmptyState heading="No guidelines yet" body="Create your first rule package to control translation quality.">
              </EmptyState>
            ) : (
              <DataTable columnContentTypes={["text", "text", "numeric", "text", "text"]} headings={["Name", "Domain", "Version", "Status", "Actions"]} rows={rows} />
            )}
          </Card>
        </Layout.Section>
      </Layout>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New guideline" primaryAction={{ content: "Create", onAction: handleCreate, loading: isLoading }}>
        <Modal.Section>
          <BlockStack gap="400">
            <TextField label="Name" value={name} onChange={setName} autoComplete="off" />
            <Select label="Rule domain" options={RULE_DOMAINS} value={ruleDomain} onChange={setRuleDomain} />
            <TextField label="Description" value={description} onChange={setDescription} multiline={2} />
            <TextField label="Instruction" value={instruction} onChange={setInstruction} multiline={2} helpText="e.g. Always translate 'Made in Italy' as 'Fabbricato in Italia'" />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
