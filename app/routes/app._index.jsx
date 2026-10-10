import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Grid,
  Text,
  Badge,
  Banner,
  List,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { brandlabBackendUrl, brandlabHeaders } from "../lib/brandlab.server";

async function fetchTotal(path, shopDomain, extraParams = new URLSearchParams()) {
  const params = new URLSearchParams({ shop_domain: shopDomain, per_page: "1", ...Object.fromEntries(extraParams) });
  const response = await fetch(brandlabBackendUrl(path, params), {
    headers: brandlabHeaders(shopDomain),
  });
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  return (await response.json())?.total || 0;
}

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  try {
    const [
      snapshotTotal,
      guidelineTotal,
      activeGuidelineTotal,
      auditTotal,
      auditPass,
      auditFix,
      auditReview,
      auditBlocked,
    ] = await Promise.all([
      fetchTotal("scan", shopDomain),
      fetchTotal("guidelines", shopDomain),
      fetchTotal("guidelines", shopDomain, new URLSearchParams({ active: "true" })),
      fetchTotal("audit", shopDomain),
      fetchTotal("audit", shopDomain, new URLSearchParams({ status: "pass" })),
      fetchTotal("audit", shopDomain, new URLSearchParams({ status: "fix" })),
      fetchTotal("audit", shopDomain, new URLSearchParams({ status: "review" })),
      fetchTotal("audit", shopDomain, new URLSearchParams({ status: "blocked" })),
    ]);

    return json({
      shopDomain,
      backendError: null,
      snapshotTotal,
      guidelineTotal,
      activeGuidelineTotal,
      audit: { total: auditTotal, pass: auditPass, fix: auditFix, review: auditReview, blocked: auditBlocked },
    });
  } catch (error) {
    return json({
      shopDomain,
      backendError: error instanceof Error ? error.message : "Backend unavailable",
      snapshotTotal: 0,
      guidelineTotal: 0,
      activeGuidelineTotal: 0,
      audit: { total: 0, pass: 0, fix: 0, review: 0, blocked: 0 },
    });
  }
}

function MetricCard({ label, value, tone, url }) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text variant="headingLg" as="h2">{value}</Text>
        <InlineStackWrap label={label} tone={tone} url={url} />
      </BlockStack>
    </Card>
  );
}

function InlineStackWrap({ label, tone, url }) {
  const content = tone ? <Badge tone={tone}>{label}</Badge> : <Text as="span">{label}</Text>;
  return url ? <Link to={url}>{content}</Link> : content;
}

export default function Dashboard() {
  const data = useLoaderData();

  return (
    <Page title="BrandLab" subtitle={`Verified translation operations for ${data.shopDomain}`}>
      <TitleBar title="BrandLab" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {data.backendError ? (
              <Banner tone="critical" title="Backend unavailable">
                {data.backendError}
              </Banner>
            ) : null}

            <Grid columns={{ xs: 1, md: 2, lg: 4 }} gap="400">
              <MetricCard label="Source snapshots" value={data.snapshotTotal} url="/app/scan" />
              <MetricCard label="Guidelines" value={data.guidelineTotal} url="/app/guidelines" />
              <MetricCard label="Active guidelines" value={data.activeGuidelineTotal} tone="success" url="/app/guidelines" />
              <MetricCard label="Audited content" value={data.audit.total} tone="attention" url="/app/audit" />
            </Grid>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Content audit</Text>
                <Grid columns={{ xs: 2, md: 4 }} gap="300">
                  <MetricCard label="Pass" value={data.audit.pass} tone="success" url="/app/audit" />
                  <MetricCard label="Fix" value={data.audit.fix} tone="warning" url="/app/audit" />
                  <MetricCard label="Review" value={data.audit.review} tone="attention" url="/app/audit" />
                  <MetricCard label="Blocked" value={data.audit.blocked} tone="critical" url="/app/audit" />
                </Grid>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Week 1 operating flow</Text>
                <List>
                  <List.Item>Configure source, working, and target languages in Onboarding.</List.Item>
                  <List.Item>Scan Products, Collections, Pages, and Blogs into source snapshots.</List.Item>
                  <List.Item>Keep brand rules active in Guidelines.</List.Item>
                  <List.Item>Audit existing content and resolve Fix, Review, and Blocked items first.</List.Item>
                </List>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
