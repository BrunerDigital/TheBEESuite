import { getAppBaseUrl } from "@/lib/supabase-auth";

type CenterEmbedInput = {
  baseUrl?: string;
  centerId: string;
  centerName: string;
  brandName?: string;
};

function cleanBaseUrl(baseUrl?: string) {
  return (baseUrl || getAppBaseUrl()).replace(/\/+$/, "");
}

function attr(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function turnstileSiteKeyAttribute() {
  const siteKey = process.env.NEXT_PUBLIC_INQUIRY_TURNSTILE_SITE_KEY || "";
  return siteKey ? `\n  data-turnstile-site-key="${attr(siteKey)}"` : "";
}

export function getKidCityInquiryEmbedCode(baseUrl?: string) {
  const appUrl = cleanBaseUrl(baseUrl);
  return `<div id="bee-suite-inquiry-form"></div>
<script
  src="${appUrl}/kidcity-inquiry-form.js"
  data-target="bee-suite-inquiry-form"
  data-endpoint="${appUrl}/api/inquiries"${turnstileSiteKeyAttribute()}
  async
></script>`;
}

export function getCenterInquiryEmbedCode({
  baseUrl,
  centerId,
  centerName,
  brandName = "The Bee Suite",
}: CenterEmbedInput) {
  const appUrl = cleanBaseUrl(baseUrl);
  return `<div id="bee-suite-inquiry-form"></div>
<script
  src="${appUrl}/bee-suite-inquiry-form.js"
  data-target="bee-suite-inquiry-form"
  data-endpoint="${appUrl}/api/inquiries"
  data-brand-name="${attr(brandName)}"
  data-center-id="${attr(centerId)}"
  data-location-name="${attr(centerName)}"${turnstileSiteKeyAttribute()}
  async
></script>`;
}
