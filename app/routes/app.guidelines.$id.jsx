import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Banner,
  DataTable,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { brandlabBackendUrl, brandlabHeaders } from "../lib/brandlab.server";

export async function loader({ request, params }) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  try {
    const response = await fetch(brandlabBackendUrl(`guidelines/${params.id}`), {
      headers: brandlabHeaders(shopDomain),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error_message || `${response.status} ${response.statusText}`);
    return json({ guideline: payload, backendError: null });
  } catch (error) {
    return json({
      guideline: null,
      backendError: error instanceof Error ? error.message : "Unable to load guideline",
    });
  }
}

export default function GuidelineDetail() {
  const { guideline, backendError } = useLoaderData();

  if (backendError || !guideline) {
    return (
      <Page title="Guideline" backAction={{ url: "/app/guidelines" }}>
        <Banner tone="critical" title="Guideline unavailable">{backendError}</Banner>
      </Page>
    );
  }

  const ruleRows = (guideline.rules || []).map((rule, index) => [
    rule.instruction || "—",
    rule.pattern || "Any content",
    rule.must_match ? "Must match" : rule.must_not_match ? "Must not match" : "Informational",
    rule.hard_rule ? <Badge tone="critical" key={`hard-${index}`}>Hard</Badge> : <Badge key={`soft-${index}`}>Soft</Badge>,
  ]);

  return (
    <Page
      title={guideline.name}
      subtitle={`v${guideline.version} • ${guideline.shopify_domain}`}
      backAction={{ url: "/app/guidelines" }}
      primaryAction={{ content: "Edit", url: `/app/guidelines/${guideline.id}/edit` }}
    >
      <TitleBar title={guideline.name}>
        <button
          variant="primary"
          onClick={() => {
            window.location.href = `/app/guidelines/${guideline.id}/edit`;
          }}
        >
          Edit
        </button>
      </TitleBar>

      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <InlineStack gap="300">
                  {guideline.active ? <Badge tone="success">Active</Badge> : <Badge tone="critical">Disabled</Badge>}
                  <Badge>{guideline.rule_domain}</Badge>
                  <Badge>v{guideline.version}</Badge>
                </InlineStack>
                <Text as="p">{guideline.description || "No description"}</Text>
              </BlockStack>
            </Card>

            <Card padding="0">
              {ruleRows.length === 0 ? (
                <BlockStack gap="200" padding="400">
                  <Text as="h2" variant="headingMd">Rules</Text>
                  <Text as="p">No rules have been added yet.</Text>
                </BlockStack>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text"]}
                  headings={["Instruction", "Pattern", "Mode", "Severity"]}
                  rows={ruleRows}
                  increasedVerticalDensity
                />
              )}
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
