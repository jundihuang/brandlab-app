import { useCallback, useEffect, useMemo, useState } from "react";
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
  Checkbox,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { brandlabBackendUrl, brandlabHeaders } from "../lib/brandlab.server";

const RESOURCE_TYPES = [
  { label: "Products", value: "product" },
  { label: "Collections", value: "collection" },
  { label: "Pages", value: "page" },
  { label: "Blogs", value: "blog" },
];

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
  const url = new URL(request.url);
  const resourceType = url.searchParams.get("resource_type");
  const stale = url.searchParams.get("stale");

  const params = new URLSearchParams({ shop_domain: shopDomain, per_page: "50" });
  if (resourceType) params.set("resource_type", resourceType);
  if (stale === "true" || stale === "false") params.set("stale", stale);

  try {
    const data = await readApi(
      await fetch(brandlabBackendUrl("scan", params), {
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
  const formData = await request.formData();
  const resourceTypes = formData.getAll("resource_types[]").map(String);

  try {
    const data = await readApi(
      await fetch(brandlabBackendUrl("scan"), {
        method: "POST",
        headers: brandlabHeaders(shopDomain, { json: true }),
        body: JSON.stringify({
          shop_domain: shopDomain,
          access_token: session.accessToken,
          resource_types: resourceTypes,
        }),
      }),
    );
    return json({ success: true, message: data.message, resourceTypes: data.resource_types, error: null });
  } catch (error) {
    return json({
      success: false,
      message: null,
      resourceTypes: [],
      error: error instanceof Error ? error.message : "Unable to queue scan",
    });
  }
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function ScanPage() {
  const { items, total, shopDomain, backendError } = useLoaderData();
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const shopify = useAppBridge();
  const [selectedTypes, setSelectedTypes] = useState(RESOURCE_TYPES.map(({ value }) => value));

  const isScanning = fetcher.state !== "idle";
  const apiError = backendError || fetcher.data?.error;

  const rows = useMemo(
    () =>
      items.map((snapshot) => [
        snapshot.resource_type,
        snapshot.handle || "—",
        snapshot.content?.title || "—",
        <Badge tone={snapshot.stale ? "warning" : "success"} key={`stale-${snapshot.id}`}>
          {snapshot.stale ? "Changed" : "Current"}
        </Badge>,
        <code key={`digest-${snapshot.id}`} style={{ fontSize: "0.75em" }}>
          {snapshot.digest?.slice(0, 12)}
        </code>,
        formatDateTime(snapshot.scanned_at),
      ]),
    [items],
  );

  const toggleType = useCallback((value, checked) => {
    setSelectedTypes((current) =>
      checked ? [...new Set([...current, value])] : current.filter((type) => type !== value),
    );
  }, []);

  const queueScan = useCallback(() => {
    const formData = new FormData();
    const types = selectedTypes.length ? selectedTypes : RESOURCE_TYPES.map(({ value }) => value);
    types.forEach((type) => formData.append("resource_types[]", type));
    fetcher.submit(formData, { method: "post" });
  }, [fetcher, selectedTypes]);

  useEffect(() => {
    if (fetcher.data?.success) {
    shopify.toast.show("Scan queued. Results will appear as the background job completes.");
    }
  }, [fetcher.data?.success, shopify]);

  return (
    <Page
      title="Content scan"
      subtitle={`${total} snapshots for ${shopDomain}`}
      primaryAction={{ content: "Queue scan", onAction: queueScan, loading: isScanning }}
    >
      <TitleBar title="Content scan">
        <button
          variant="primary"
          onClick={queueScan}
          disabled={isScanning || selectedTypes.length === 0}
        >
          Queue scan
        </button>
      </TitleBar>

      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {apiError ? <Banner tone="critical" title="Scan API error">{apiError}</Banner> : null}
            {fetcher.data?.success ? (
              <Banner tone="info" title="Scan queued">
                Resource types: {fetcher.data.resourceTypes?.join(", ")}. Refresh shortly to see new snapshots and audit results.
              </Banner>
            ) : null}

            <Card>
              <BlockStack gap="400">
                <InlineStack gap="500" align="start">
                  {RESOURCE_TYPES.map((type) => (
                    <Checkbox
                      key={type.value}
                      label={type.label}
                      checked={selectedTypes.includes(type.value)}
                      onChange={(checked) => toggleType(type.value, checked)}
                    />
                  ))}
                </InlineStack>
                <InlineStack gap="300">
                  <Button
                    variant="primary"
                    loading={isScanning}
                    disabled={selectedTypes.length === 0}
                    onClick={queueScan}
                  >
                    Queue selected content
                  </Button>
                  <Button loading={revalidator.state === "loading"} onClick={() => revalidator.revalidate()}>
                    Refresh results
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>

            <Card padding="0">
              {rows.length === 0 ? (
                <EmptyState
                  heading="No content snapshots"
                  body="Queue a scan to create the source baseline used by guidelines, audits, and translation jobs."
                />
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                  headings={["Type", "Handle", "Title", "State", "Digest", "Scanned"]}
                  rows={rows}
                  increasedVerticalDensity
                />
              )}
            </Card>

            <Card>
              <Text as="h2" variant="headingSm">
                Scan contract
              </Text>
              <BlockStack gap="200">
                <Text as="p">Every resource is stored as an immutable source snapshot with a digest.</Text>
                <Text as="p">Changed Shopify content is marked stale so linked translations can be queued for refresh.</Text>
                <Text as="p">The scan job automatically runs an existing-content audit against active guidelines.</Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
