import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigate } from "@remix-run/react";
import {
  Page, Layout, Card, DataTable, Button, Badge, InlineStack, EmptyState,
  Select, TextField, BlockStack
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { brandlabBackendUrl, brandlabHeaders } from "../lib/brandlab.server";

const JOB_STATUSES = [
  { label: "All statuses", value: "" },
  { label: "Translating", value: "translating" },
  { label: "Reviewing", value: "reviewing" },
  { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" }
];

const STATUS_TONES = {
  draft: "info", scanning: "warning", translating: "warning",
  reviewing: "attention", completed: "success", failed: "critical"
};

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const url = new URL(request.url);

  const params = new URLSearchParams({ shop_domain: shopDomain });
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("search");
  if (status) params.set("status", status);
  if (search) params.set("search", search);

  const res = await fetch(brandlabBackendUrl("jobs", params), {
    headers: brandlabHeaders(shopDomain)
  });
  const data = res.ok ? await res.json() : { total: 0, items: [] };
  return json({ ...data, filters: { status, search } });
};

export default function Jobs() {
  const { items, total, filters } = useLoaderData();
  const submit = useSubmit();
  const navigate = useNavigate();
  const [status, setStatus] = useState(filters.status || "");
  const [search, setSearch] = useState(filters.search || "");

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (search) params.set("search", search);
    submit(params, { method: "get" });
  };

  const rows = items.map((job) => [
    `#${job.id}`,
    job.target_locale.toUpperCase(),
    job.market || "-",
    <Badge key={`s-${job.id}`} tone={STATUS_TONES[job.status] || "info"}>{job.status}</Badge>,
    String(job.items_count),
    job.publish_strategy?.mode || "-",
    new Date(job.created_at).toLocaleString(),
    <Button key={`v-${job.id}`} size="slim" variant="plain" onClick={() => navigate(`/app/jobs/${job.id}`)}>
      View
    </Button>
  ]);

  return (
    <Page
      title="Translation Jobs"
      subtitle="One job per market and language. Track progress and review AI translations."
      primaryAction={{ content: "New job", onAction: () => navigate("/app/jobs/new") }}
    >
      <TitleBar title="Translation Jobs" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="300" align="end" blockAlign="center">
                <div style={{ minWidth: "200px" }}>
                  <TextField label="" placeholder="Search market or locale" value={search} onChange={setSearch} autoComplete="off" />
                </div>
                <div style={{ minWidth: "160px" }}>
                  <Select label="" options={JOB_STATUSES} value={status} onChange={setStatus} />
                </div>
                <Button onClick={applyFilters}>Filter</Button>
              </InlineStack>
              {total === 0 ? (
                <EmptyState heading="No translation jobs" message="Create a job to translate store content into a target market language.">
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "numeric", "text", "text", "text"]}
                  headings={["Job", "Target", "Market", "Status", "Items", "Strategy", "Created", ""]}
                  rows={rows}
                />
              )}
              <InlineStack>
                <Badge>{total} jobs</Badge>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
