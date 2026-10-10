import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page, Layout, Card, DataTable, Badge, Banner, Button, TextField, BlockStack,
  InlineStack, EmptyState, Text, Checkbox, Box,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { useRef, useState } from "react";
import { authenticate } from "../shopify.server";
import { brandlabBackendUrl, brandlabHeaders } from "../lib/brandlab.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const response = await fetch(brandlabBackendUrl("imports", new URLSearchParams({ shop_domain: session.shop })), {
    headers: brandlabHeaders(session.shop),
  });
  const data = response.ok ? await response.json() : { total: 0, items: [] };
  return json({ ...data, backendError: response.ok ? null : `Import API unavailable (${response.status})` });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");
  const headers = brandlabHeaders(session.shop, { json: true });
  let path = "imports";
  let method = "POST";
  let body;

  if (intent === "upload") {
    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "Choose a CSV file" }, { status: 400 });
    const content = await file.text();
    body = JSON.stringify({
      file_name: file.name,
      csv_content: content,
      field_mapping: {
        resource_type: "resource_type",
        handle: "handle",
        resource_gid: "resource_gid",
        fields: { title: "title", body_html: "body_html" },
      },
    });
  } else if (intent === "confirm") {
    path = `imports/${form.get("id")}/confirm`;
    body = JSON.stringify({ publish_approved: form.get("publish") === "true" });
  } else if (intent === "map") {
    path = `imports/${form.get("id")}`;
    method = "PUT";
    body = JSON.stringify({
      field_mapping: {
        resource_type: form.get("resource_type"),
        handle: form.get("handle"),
        resource_gid: form.get("resource_gid"),
        fields: { title: form.get("title"), body_html: form.get("body_html") },
      },
    });
  } else {
    return json({ error: "Unknown action" }, { status: 400 });
  }

  const response = await fetch(brandlabBackendUrl(path), { method, headers, body });
  const data = await response.json();
  return json(data, { status: response.status });
};

const STATUS_TONE = {
  pending: "info", staged: "success", invalid: "critical",
  imported: "success", partially_imported: "warning",
};

export default function Imports() {
  const { items, total, backendError } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [publish, setPublish] = useState(false);
  const [selected, setSelected] = useState(null);
  const busy = fetcher.state !== "idle";
  const actionError = backendError || fetcher.data?.error;

  const rows = items.map((item) => [
    `#${item.id}`,
    item.file_name,
    <Badge key={`s-${item.id}`} tone={STATUS_TONE[item.status] || "info"}>{item.status}</Badge>,
    item.detected_source_locale || "-",
    item.primary_locale || "-",
    String(item.rows_count),
    String(item.error_count),
    item.translation_job_id ? `#${item.translation_job_id}` : "-",
    new Date(item.created_at).toLocaleString(),
    <InlineStack key={`a-${item.id}`} gap="200">
      <Button size="slim" onClick={() => setSelected(item)}>Map</Button>
      <Button
        size="slim"
        variant="primary"
        disabled={!item.staged}
        loading={busy}
        onClick={() => {
          const data = new FormData();
          data.set("intent", "confirm");
          data.set("id", item.id);
          data.set("publish", publish ? "true" : "false");
          fetcher.submit(data, { method: "post" });
        }}
      >
        Confirm
      </Button>
    </InlineStack>,
  ]);

  const mapping = selected?.field_mapping || {};
  const upload = () => {
    if (!file) return;
    const data = new FormData();
    data.set("intent", "upload");
    data.set("file", file);
    fetcher.submit(data, { method: "post" });
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  if (fetcher.state === "idle" && fetcher.data?.results) {
    shopify.toast.show(`Import job #${fetcher.data.job.id} created`);
  }

  return (
    <Page title="Imports" subtitle={`${total} staged import batches`}>
      <TitleBar title="Imports" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {actionError ? <Banner tone="critical">{actionError}</Banner> : null}
            {fetcher.data?.error_count === 0 && fetcher.data?.status ? (
              <Banner tone="success" title="CSV staged">
                Language gate passed. Rows remain staged until you confirm the batch.
              </Banner>
            ) : null}

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Upload CSV</Text>
                <InlineStack gap="300" blockAlign="center">
                  <Box visuallyHidden>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(event) => setFile(event.target.files?.[0] || null)}
                    />
                  </Box>
                  <Button onClick={() => fileRef.current?.click()}>Choose CSV</Button>
                  {file ? <Text as="span">{file.name}</Text> : <Text as="span" tone="subdued">No file selected</Text>}
                  <Button variant="primary" loading={busy} disabled={!file} onClick={upload}>Stage CSV</Button>
                </InlineStack>
                <Text tone="subdued" as="p">
                  Expected headers include resource_type, handle, resource_gid, title, and body_html.
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <InlineStack blockAlign="center" gap="300">
                  <Text as="h2" variant="headingMd">Import batches</Text>
                  <Checkbox label="Publish approved primary-language conversions" checked={publish} onChange={setPublish} />
                </InlineStack>
                {total === 0 ? (
                  <EmptyState heading="No imports" body="Upload a CSV to stage external content behind the language gate." />
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "text", "numeric", "numeric", "text", "text", "text"]}
                    headings={["Batch", "File", "Status", "Detected", "Primary", "Rows", "Errors", "Job", "Created", "Actions"]}
                    rows={rows}
                  />
                )}
              </BlockStack>
            </Card>

            {selected ? (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Field mapping — batch #{selected.id}</Text>
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="map" />
                    <input type="hidden" name="id" value={selected.id} />
                    <BlockStack gap="300">
                      <InlineStack gap="300">
                        <div style={{ minWidth: "180px" }}>
                          <TextField label="Resource type header" name="resource_type" defaultValue={mapping.resource_type || "resource_type"} />
                        </div>
                        <div style={{ minWidth: "180px" }}>
                          <TextField label="Handle header" name="handle" defaultValue={mapping.handle || "handle"} />
                        </div>
                        <div style={{ minWidth: "220px" }}>
                          <TextField label="Resource GID header" name="resource_gid" defaultValue={mapping.resource_gid || "resource_gid"} />
                        </div>
                      </InlineStack>
                      <InlineStack gap="300">
                        <div style={{ minWidth: "180px" }}>
                          <TextField label="Title header" name="title" defaultValue={mapping.fields?.title || "title"} />
                        </div>
                        <div style={{ minWidth: "180px" }}>
                          <TextField label="Body HTML header" name="body_html" defaultValue={mapping.fields?.body_html || "body_html"} />
                        </div>
                      </InlineStack>
                      <InlineStack gap="200">
                        <Button submit loading={busy}>Save mapping</Button>
                        <Button onClick={() => setSelected(null)}>Close</Button>
                      </InlineStack>
                    </BlockStack>
                  </fetcher.Form>
                </BlockStack>
              </Card>
            ) : null}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
