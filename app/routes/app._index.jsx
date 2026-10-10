import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import {
  Page, Layout, Card, BlockStack, Grid, Text, Badge, Banner, List, InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { brandlabBackendUrl, brandlabHeaders } from "../lib/brandlab.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  try {
    const response = await fetch(brandlabBackendUrl("dashboard", new URLSearchParams({ shop_domain: session.shop })), {
      headers: brandlabHeaders(session.shop),
    });
    const data = await response.json();
    return json({ data, backendError: response.ok ? null : data?.error_message || "Dashboard unavailable" });
  } catch (error) {
    return json({
      data: null,
      backendError: error instanceof Error ? error.message : "Backend unavailable",
    });
  }
}

function Metric({ label, value, tone, url }) {
  const labelNode = tone ? <Badge tone={tone}>{label}</Badge> : <Text as="span">{label}</Text>;
  return (
    <Card>
      <BlockStack gap="200">
        <Text variant="headingLg" as="h2">{value ?? 0}</Text>
        {url ? <Link to={url}>{labelNode}</Link> : labelNode}
      </BlockStack>
    </Card>
  );
}

export default function Dashboard() {
  const { data, backendError } = useLoaderData();

  return (
    <Page title="BrandLab" subtitle={data ? `Verified translation operations for ${data.shop_domain}` : "Verified translation operations"}>
      <TitleBar title="BrandLab" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {backendError ? <Banner tone="critical" title="Backend unavailable">{backendError}</Banner> : null}
            {data ? (
              <>
                <Grid columns={{ xs: 1, md: 2, lg: 4 }} gap="400">
                  <Metric label="Source snapshots" value={data.snapshots.total} url="/app/scan" />
                  <Metric label="Translation jobs" value={data.jobs.total} url="/app/jobs" />
                  <Metric label="Stale translations" value={data.items.stale} tone="warning" url="/app/jobs" />
                  <Metric label="Published records" value={data.publishes.total} tone="success" url="/app/publish-log" />
                </Grid>

                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">Translation pipeline</Text>
                    <Grid columns={{ xs: 2, md: 4 }} gap="300">
                      <Metric label="Pending" value={data.items.by_status.pending} url="/app/jobs" />
                      <Metric label="Review" value={(data.items.by_status.pending_review || 0) + (data.items.by_status.pending_expert || 0)} tone="attention" url="/app/jobs" />
                      <Metric label="Approved" value={data.items.by_status.approved} tone="success" url="/app/jobs" />
                      <Metric label="Failed" value={data.items.by_status.failed} tone="critical" url="/app/jobs" />
                    </Grid>
                    <Text tone="subdued" as="p">Average Trust Score: {data.items.average_trust_score ?? "-"}</Text>
                  </BlockStack>
                </Card>

                <Grid columns={{ xs: 1, md: 2 }} gap="400">
                  <Card>
                    <BlockStack gap="300">
                      <Text as="h2" variant="headingMd">Recent jobs</Text>
                      {data.jobs.recent.map((job) => (
                        <InlineStack key={job.id} align="space-between" blockAlign="center">
                          <Link to={`/app/jobs/${job.id}`}>#{job.id} · {job.target_locale.toUpperCase()} {job.market ? `· ${job.market}` : ""}</Link>
                          <Badge tone={job.status === "completed" ? "success" : job.status === "failed" ? "critical" : "attention"}>{job.status}</Badge>
                        </InlineStack>
                      ))}
                      {data.jobs.recent.length === 0 ? <Text tone="subdued" as="p">No jobs yet.</Text> : null}
                    </BlockStack>
                  </Card>
                  <Card>
                    <BlockStack gap="300">
                      <Text as="h2" variant="headingMd">Imports & governance</Text>
                      <InlineStack gap="300">
                        <Link to="/app/imports"><Badge>{data.imports.total} imports</Badge></Link>
                        <Link to="/app/scan"><Badge tone={data.snapshots.stale ? "warning" : "success"}>{data.snapshots.stale} stale sources</Badge></Link>
                        <Link to="/app/audit"><Badge tone="attention">{data.audits.total} audits</Badge></Link>
                      </InlineStack>
                      <List>
                        <List.Item>CSV rows pass language detection before conversion.</List.Item>
                        <List.Item>Publish retries reuse the same append-only audit record.</List.Item>
                      </List>
                    </BlockStack>
                  </Card>
                </Grid>
              </>
            ) : null}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
