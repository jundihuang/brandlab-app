import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Select,
  Checkbox,
  Button,
  BlockStack,
  InlineStack,
  Banner,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useCallback, useState } from "react";
import { authenticate } from "../shopify.server";
import { brandlabBackendUrl, brandlabHeaders } from "../lib/brandlab.server";

const RULE_DOMAINS = [
  { label: "Product Naming", value: "product_naming" },
  { label: "Product Description", value: "product_description" },
  { label: "Variants", value: "variants" },
  { label: "SEO", value: "seo" },
  { label: "Care & Compliance", value: "care_compliance" },
  { label: "Store Content", value: "store_content" },
];

export async function loader({ request, params }) {
  const { session } = await authenticate.admin(request);
  const response = await fetch(brandlabBackendUrl(`guidelines/${params.id}`), {
    headers: brandlabHeaders(session.shop),
  });
  const guideline = await response.json().catch(() => ({}));
  return json({ guideline: response.ok ? guideline : null });
}

export async function action({ request, params }) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();
  const rules = JSON.parse(formData.get("rules") || "[]");
  const body = {
    shop_domain: shopDomain,
    name: formData.get("name"),
    description: formData.get("description"),
    rule_domain: formData.get("rule_domain"),
    active: formData.get("active") === "true",
    rules,
  };

  const response = await fetch(brandlabBackendUrl(`guidelines/${params.id}`), {
    method: "PUT",
    headers: brandlabHeaders(shopDomain, { json: true }),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return json({ success: false, error: payload.error_message || "Unable to update guideline" });
  }
  return json({ success: true, error: null, guideline: payload });
}

function emptyRule() {
  return { instruction: "", pattern: "", mode: "informational", hard_rule: false };
}

export default function EditGuideline() {
  const { guideline } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [name, setName] = useState(guideline?.name || "");
  const [description, setDescription] = useState(guideline?.description || "");
  const [ruleDomain, setRuleDomain] = useState(guideline?.rule_domain || "product_naming");
  const [active, setActive] = useState(guideline?.active ?? true);
  const [rules, setRules] = useState(
    (guideline?.rules || []).map((rule) => ({
      instruction: rule.instruction || "",
      pattern: rule.pattern || "",
      mode: rule.must_match ? "must_match" : rule.must_not_match ? "must_not_match" : "informational",
      hard_rule: rule.hard_rule || false,
    })),
  );
  const isSaving = navigation.state === "submitting";

  const updateRule = useCallback((index, field, value) => {
    setRules((current) => current.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, [field]: value } : rule)));
  }, []);

  const save = useCallback(() => {
    const serialized = rules.map(({ instruction, pattern, mode, hard_rule }) => ({
      instruction,
      pattern: pattern || undefined,
      must_match: mode === "must_match",
      must_not_match: mode === "must_not_match",
      hard_rule,
    }));
    const formData = new FormData();
    formData.set("name", name);
    formData.set("description", description);
    formData.set("rule_domain", ruleDomain);
    formData.set("active", active.toString());
    formData.set("rules", JSON.stringify(serialized));
    submit(formData, { method: "put" });
  }, [active, description, name, ruleDomain, rules, submit]);

  if (!guideline) {
    return (
      <Page title="Edit guideline" backAction={{ url: "/app/guidelines" }}>
        <Banner tone="critical" title="Guideline not found" />
      </Page>
    );
  }

  return (
    <Page
      title={`Edit ${guideline.name}`}
      subtitle={`Current version v${guideline.version}; saving rules creates v${guideline.version + 1}`}
      backAction={{ url: `/app/guidelines/${guideline.id}` }}
      primaryAction={{ content: "Save", onAction: save, loading: isSaving }}
    >
      <TitleBar title={`Edit ${guideline.name}`} />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <FormLayout>
                <TextField label="Name" value={name} onChange={setName} autoComplete="off" />
                <Select label="Rule domain" options={RULE_DOMAINS} value={ruleDomain} onChange={setRuleDomain} />
                <TextField label="Description" value={description} onChange={setDescription} multiline={2} />
                <Checkbox label="Active" checked={active} onChange={setActive} />
              </FormLayout>
            </Card>

            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">Rules</Text>
                  <Button onClick={() => setRules((current) => [...current, emptyRule()])}>Add rule</Button>
                </InlineStack>

                {rules.length === 0 ? <Banner tone="info">A guideline without rules will not affect translations.</Banner> : null}

                {rules.map((rule, index) => (
                  <BlockStack key={index} gap="300">
                    <TextField
                      label={`Rule ${index + 1} instruction`}
                      value={rule.instruction}
                      onChange={(value) => updateRule(index, "instruction", value)}
                      autoComplete="off"
                      helpText="Shown to AI and reviewers, e.g. Preserve Made in Italy."
                    />
                    <InlineStack gap="300" align="start">
                      <div style={{ minWidth: 220 }}>
                        <Select
                          label="Mode"
                          options={[
                            { label: "Informational", value: "informational" },
                            { label: "Text must match pattern", value: "must_match" },
                            { label: "Text must not match pattern", value: "must_not_match" },
                          ]}
                          value={rule.mode}
                          onChange={(value) => updateRule(index, "mode", value)}
                        />
                      </div>
                      <div style={{ flexGrow: 1 }}>
                        <TextField
                          label="Regex pattern"
                          value={rule.pattern}
                          onChange={(value) => updateRule(index, "pattern", value)}
                          autoComplete="off"
                          helpText="Required for deterministic audit; informational rules may leave this blank."
                        />
                      </div>
                    </InlineStack>
                    <Checkbox
                      label="Hard rule (blocked content cannot auto-publish)"
                      checked={rule.hard_rule}
                      onChange={(checked) => updateRule(index, "hard_rule", checked)}
                    />
                    <InlineStack>
                      <Button tone="critical" onClick={() => setRules((current) => current.filter((_, i) => i !== index))}>
                        Remove rule
                      </Button>
                    </InlineStack>
                  </BlockStack>
                ))}

                <InlineStack>
                  <Button variant="primary" loading={isSaving} onClick={save}>Save guideline</Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
