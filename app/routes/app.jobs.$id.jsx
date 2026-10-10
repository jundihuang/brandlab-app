import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import {
  Page, Layout, Card, DataTable, Badge, Banner, Button, BlockStack, InlineStack,
  Text, Modal, TextField, EmptyState, Checkbox,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authenticate } from "../shopify.server";
import { brandlabBackendUrl, brandlabHeaders } from "../lib/brandlab.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const response = await fetch(
    brandlabBackendUrl(`jobs/${params.id}`, new URLSearchParams({ shop_domain: session.shop })),
    { headers: brandlabHeaders(session.shop) },
  );
  const data = await response.json();
  return json(data, { status: response.status });
};

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const shopAccessToken = session.accessToken;
  const intent = form.get("intent");
  const headers = brandlabHeaders(session.shop, { json: true });
  let path = `jobs/${params.id}`;
  let method = "POST";
  let body;

  if (intent === "generate") {
    path += "/generate";
    body = JSON.stringify({ limit: 20 });
  } else if (intent === "quality") {
    path += "/quality_check";
    body = JSON.stringify({ item_ids: form.getAll("item_ids[]").map(Number) });
  } else if (intent === "publish") {
    path += "/publish";
    body = JSON.stringify({ item_ids: form.getAll("item_ids[]").map(Number), access_token: shopAccessToken });
  } else if (intent === "review") {
    path += `/items/${form.get("item_id")}`;
    method = "PUT";
    body = JSON.stringify({
      action: form.get("review_action"),
      translated_content: form.get("translated_content") || undefined,
    });
  } else {
    return json({ error: "Unknown action" }, { status: 400 });
  }

  const response = await fetch(brandlabBackendUrl(path), { method, headers, body });
  const data = await response.json();
  return json(data, { status: response.status });
};

const STATUS_TONES = {
  pending: "info", translating: "warning", validating: "warning",
  auto_passed: "success", pending_review: "attention", pending_expert: "critical",
  approved: "success", rejected: "critical", published: "success", failed: "critical",
};

export default function JobDetail() {
  const { job, items, summary, error_message } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const [selected, setSelected] = useState([]);
  const [editing, setEditing] = useState(null);
  const [editedContent, setEditedContent] = useState("");
  const busy = fetcher.state !== "idle";

  const submit = useCallback((intent, itemIds = [], extra = {}) => {
    const data = new FormData();
    data.set("intent", intent);
    itemIds.forEach((id) => data.append("item_ids[]", id));
    Object.entries(extra).forEach(([key, value]) => data.set(key, value));
    fetcher.submit(data, { method: "post" });
  }, [fetcher]);

  useEffect(() => {
    if (fetcher.state !== "idle") return;
    if (fetcher.data?.error_message) {
      shopify.toast.show(fetcher.data.error_message, { isError: true });
    } else if (fetcher.data?.summary) {
      shopify.toast.show(`Operation complete: ${JSON.stringify(fetcher.data.summary)}`);
    }
  }, [fetcher.state, fetcher.data, shopify]);

  const rows = useMemo(() => items.map((item) => {
    const issues = item.validation?.issues || [];
    return [
      <Checkbox
        key={`check-${item.id}`}
        label=""
        checked={selected.includes(item.id)}
        disabled={!["approved", "auto_passed"].includes(item.status)}
        onChange={(checked) => setSelected((current) => checked ? [...current, item.id] : current.filter((id) => id !== item.id))}
      />,
      `#${item.id}`,
      item.resource_type,
      item.resource_title,
      item.field_key,
      <BlockStack key={`status-${item.id}`} gap="200">
        <Badge tone={STATUS_TONES[item.status] || "info"}>{item.status}</Badge>
        {item.stale ? <Badge tone="warning">Source changed</Badge> : null}
      </BlockStack>,
      item.trust_score ?? "-",
      issues.length ? (
        <Text key={`issues-${item.id}`} tone="critical" as="span">{issues[0].message}</Text>
      ) : <Text key={`issues-${item.id}`} tone="success" as="span">No issues</Text>,
      item.publish_record ? (
        <Text key={`pub-${item.id}`} tone="subdued" as="span">
          {new Date(item.publish_record.published_at).toLocaleString()}
        </Text>
      ) : "-",
      <InlineStack key={`actions-${item.id}`} gap="200">
        <Button size="slim" onClick={() => { setEditing(item); setEditedContent(item.translated_content || ""); }}>Edit</Button>
        <Button size="slim" loading={busy} onClick={() => submit("review", [], { item_id: item.id, review_action: "accept" })}>Accept</Button>
        <Button size="slim" tone="critical" loading={busy} onClick={() => submit("review", [], { item_id: item.id, review_action: "reject" })}>Reject</Button>
      </InlineStack>,
    ];
  }), [items, selected, submit, busy]);

  const reviewAction = () => {
    const data = new FormData();
    data.set("intent", "review");
    data.set("item_id", editing.id);
    data.set("review_action", "edit");
    data.set("translated_content", editedContent);
    fetcher.submit(data, { method: "post" });
    setEditing(null);
  };

  return (
    <Page
      title={`Job #${job.id}`}
      subtitle={`${job.target_locale.toUpperCase()} · ${job.market || "All markets"} · ${items.length} items`}
      backAction={{ url: "/app/jobs" }}
      primaryAction={{ content: "Generate AI", loading: busy, onAction: () => submit("generate") }}
    >
      <TitleBar title={`Translation job #${job.id}`}>
        <button variant="primary" onClick={() => submit("generate")}>Generate AI</button>
      </TitleBar>
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {error_message ? <Banner tone="critical">{error_message}</Banner> : null}
            {fetcher.data?.results ? <Banner tone="info" title="Batch complete">{JSON.stringify(fetcher.data.summary)}</Banner> : null}

            <Card>
              <InlineStack gap="300" blockAlign="center">
                <Badge tone={job.status === "completed" ? "success" : job.status === "failed" ? "critical" : "attention"}>{job.status}</Badge>
                <Badge>Strategy: {job.publish_strategy?.mode}</Badge>
                {job.context_snapshot?.guideline_ids?.length ? <Badge>{job.context_snapshot.guideline_ids.length} guidelines</Badge> : null}
                {job.context_snapshot?.glossary_terms?.length ? <Badge>{job.context_snapshot.glossary_terms.length} terms</Badge> : null}
                <Button onClick={() => navigate("/app/publish-log")}>Publish log</Button>
              </InlineStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <InlineStack gap="200">
                  <Button loading={busy} onClick={() => submit("quality", selected)}>Run QA + Judge</Button>
                  <Button
                    variant="primary"
                    loading={busy}
                    disabled={selected.length === 0}
                    onClick={() => submit("publish", selected)}
                  >
                    Publish approved ({selected.length})
                  </Button>
                  <Text tone="subdued" as="span">
                    {Object.entries(summary || {}).map(([key, value]) => `${key}: ${value}`).join(" · ")}
                  </Text>
                </InlineStack>
                {items.length === 0 ? (
                  <EmptyState heading="No job items" body="Run a content scan, then create a new translation job." />
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "text", "text", "numeric", "text", "text", "text"]}
                    headings={["", "Item", "Type", "Resource", "Field", "Status", "Trust", "QA", "Published", "Actions"]}
                    rows={rows}
                    increasedVerticalDensity
                  />
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={`Edit item #${editing?.id || ""}`}
        primaryAction={{ content: "Save and approve", onAction: reviewAction, loading: busy }}
        secondaryActions={[{ content: "Cancel", onAction: () => setEditing(null) }]}
      >
        <Modal.Section>
          <TextField label="Translation" value={editedContent} onChange={setEditedContent} multiline={6} autoComplete="off" />
        </Modal.Section>
      </Modal>
    </Page>
  );
}
