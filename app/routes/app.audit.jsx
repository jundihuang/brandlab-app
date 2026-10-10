import { useCallback, useEffect, useMemo } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  Banner,
  DataTable,
  EmptyState,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { brandlabBackendUrl, brandlabHeaders } from "../lib/brandlab.server";

const STATUS_META = {
  pass: { label: "Pass", tone: "success" },
  fix: { label: "Fix", tone: "warning" },
  review: { label: "Review", tone: "attention" },
  blocked: { label: "Blocked", tone: "critical" },
};

async function readApi(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_message || `${response.status} ${response.statusText}`);
  }
  return payload;
}

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const params = new URLSearchParams({ shop_domain: shopDomain, per_page: "50" });

  try {
    const data = await readApi(
      await fetch(brandlabBackendUrl("audit", params), {
        headers: brandlabHeaders(shopDomain),
      }),
    );
    return json({ ...data, shopDomain, backendError: null });
  } catch (error) {
    return json({
      items: [],
      total: 0,
      shopDomain,
      backendError: error instanceof Error ? error.message : "Backend unavailable",
    });
  }
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  try {
    const data = await readApi(
      await fetch(brandlabBackendUrl("audit"), {
        method: "POST",
        headers: brandlabHeaders(shopDomain, { json: true }),
        body: JSON.stringify({ shop_domain: shopDomain }),
      }),
    );
    return json({ success: true, results: data.results, error: null });
  } catch (error) {
    return json({
      success: false,
      results: null,
      error: error instanceof Error ? error.message : "Unable to run audit",
    });
  }
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function findingText(findings) {
  if (!findings?.length) return "No issues";
  return findings
    .map((finding) => {
      const detail = finding.instruction || finding.message || finding.type;
      return `${finding.severity || finding.type}: ${detail}`;
    })
    .join(" • ");
}

export default function AuditPage() {
  const { items, total, shopDomain, backendError } = useLoaderData();
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const shopify = useAppBridge();

  const isRunning = fetcher.state !== "idle";
  const apiError = backendError || fetcher.data?.error;

  const counts = useMemo(
    () =>
      items.reduce(
        (accumulator, item) => ({
          ...accumulator,
          [item.status]: (accumulator[item.status] || 0) + 1,
        }),
        { pass: 0, fix: 0, review: 0, blocked: 0 },
      ),
    [items],
  );

  const rows = useMemo(
    () =>
      items.map((audit) => {
          const meta = STATUS_META[audit.status] || STATUS_META.review;
        return [
          audit.resource_title || audit.resource_handle || "—",
          audit.resource_type || "—",
          <Badge tone={meta.tone} key={`status-${audit.id}`}>{meta.label}</Badge>,
          findingText(audit.findings),
          formatDateTime(audit.audited_at || audit.created_at),
        ];
      }),
    [items],
  );

  const runAudit = useCallback(() => {
    fetcher.submit({}, { method: "post" });
  }, [fetcher]);

  useEffect(() => {
    if (fetcher.data?.success) {
    shopify.toast.show("Existing-content audit complete");
    }
  }, [fetcher.data?.success, shopify]);

  return (
    <Page
      title="Existing content audit"
      subtitle={`${total} audited items for ${shopDomain}`}
      primaryAction={{ content: "Run audit", onAction: runAudit, loading: isRunning }}
    >
      <TitleBar title="Existing content audit">
        <button variant="primary" onClick={runAudit} disabled={isRunning}>
          Run audit
        </button>
      </TitleBar>

      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {apiError ? <Banner tone="critical" title="Audit API error">{apiError}</Banner> : null}
            {fetcher.data?.success ? (
              <Banner tone="success" title="Audit complete">
                Pass {fetcher.data.results?.pass ?? 0} • Fix {fetcher.data.results?.fix ?? 0} • Review{" "}
                {fetcher.data.results?.review ?? 0} • Blocked {fetcher.data.results?.blocked ?? 0}
              </Banner>
            ) : null}

            <InlineStack gap="400">
              {Object.entries(STATUS_META).map(([status, meta]) => (
                <Card key={status} padding="400">
                  <BlockStack gap="200">
                    <Text variant="headingLg" as="h2">
                      {counts[status] ?? 0}
                    </Text>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </BlockStack>
                </Card>
              ))}
            </InlineStack>

            <Card padding="0">
              {rows.length === 0 ? (
                <EmptyState
                  heading="No audit results"
                  body="Run an audit after content scanning to classify existing content before translation."
                />
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text"]}
                  headings={["Content", "Type", "Recommendation", "Findings", "Audited"]}
                  rows={rows}
                  increasedVerticalDensity
                />
              )}
            </Card>

            <Card>
              <InlineStack gap="300" align="end">
                <Button loading={revalidator.state === "loading"} onClick={() => revalidator.revalidate()}>
                  Refresh results
                </Button>
              </InlineStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
