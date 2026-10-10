import { useState } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import {
  Page, Layout, Card, FormLayout, TextField, Select, Button, Banner
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { brandlabBackendUrl, brandlabHeaders } from "../lib/brandlab.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const res = await fetch(brandlabBackendUrl("onboarding", new URLSearchParams({ shop_domain: shopDomain })), {
    headers: brandlabHeaders(shopDomain)
  });

  const config = res.ok ? await res.json() : {};
  return json({ config, shopDomain });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();

  const body = {
    shop_domain: shopDomain,
    source_language: formData.get("source_language"),
    working_language: formData.get("working_language"),
    target_locales: formData.get("target_locales")?.split(",").map(s => s.trim()).filter(Boolean),
    brand_tone: formData.get("brand_tone")
  };

  const res = await fetch(brandlabBackendUrl("onboarding"), {
    method: "PUT",
    headers: brandlabHeaders(shopDomain, { json: true }),
    body: JSON.stringify(body)
  });

  return json({ success: res.ok });
};

const LANGUAGES = [
  { label: "English", value: "en" },
  { label: "Italian", value: "it" },
  { label: "French", value: "fr" },
  { label: "German", value: "de" },
  { label: "Spanish", value: "es" },
  { label: "Chinese", value: "zh" }
];

export default function Onboarding() {
  const { config, shopDomain } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [sourceLanguage, setSourceLanguage] = useState(config.source_language || "en");
  const [workingLanguage, setWorkingLanguage] = useState(config.working_language || "en");
  const [targetLocales, setTargetLocales] = useState((config.target_locales || []).join(", "));
  const [brandTone, setBrandTone] = useState(config.brand_tone || "");

  const isLoading = navigation.state === "submitting";

  const handleSubmit = () => {
    submit({ source_language: sourceLanguage, working_language: workingLanguage, target_locales: targetLocales, brand_tone: brandTone }, { method: "PUT" });
  };

  return (
    <Page title="Onboarding" subtitle={`Configure BrandLab for ${shopDomain}`}>
      <Layout>
        <Layout.Section>
          {actionData?.success && <Banner tone="success">Settings saved</Banner>}
          {actionData && !actionData.success && <Banner tone="critical">Failed to save settings. Please try again.</Banner>}
          <Card>
            <FormLayout>
              <Select label="Source language (store primary)" options={LANGUAGES} value={sourceLanguage} onChange={setSourceLanguage} />
              <Select label="Working language (for merchant review)" options={LANGUAGES} value={workingLanguage} onChange={setWorkingLanguage} />
              <TextField label="Target locales (comma-separated)" value={targetLocales} onChange={setTargetLocales} placeholder="it, fr" helpText="e.g. it, fr, de" />
              <TextField label="Brand tone" value={brandTone} onChange={setBrandTone} placeholder="e.g. Premium, playful, technical" multiline={2} />
              <Button variant="primary" loading={isLoading} onClick={handleSubmit}>Save settings</Button>
            </FormLayout>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
