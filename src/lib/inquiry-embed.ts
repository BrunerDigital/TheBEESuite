import { getAppBaseUrl } from "@/lib/supabase-auth";

type CenterEmbedInput = {
  baseUrl?: string;
  centerId: string;
  centerName: string;
  brandName?: string;
};

type KidCityLocationEmbedInput = {
  baseUrl?: string;
  centerId: string;
  centerName: string;
  crmLocationId?: string | null;
  locationId?: string | null;
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

function dataAttribute(name: string, value: string | null | undefined) {
  const cleanValue = (value ?? "").trim();
  return cleanValue ? `${name}="${attr(cleanValue)}"` : "";
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

export function getKidCityLocationInquiryEmbedCode({
  baseUrl,
  centerId,
  centerName,
  crmLocationId,
  locationId,
}: KidCityLocationEmbedInput) {
  const appUrl = cleanBaseUrl(baseUrl);
  const selectedLocationId = crmLocationId || locationId || centerName;
  const selectedPublicLocationId = locationId || crmLocationId || centerName;
  const locationAttributes = [
    dataAttribute("data-center-id", centerId),
    dataAttribute("data-location-id", selectedLocationId),
    dataAttribute("data-public-location-id", selectedPublicLocationId),
    dataAttribute("data-location-name", centerName),
  ].filter(Boolean).join("\n  ");

  return `<div id="bee-suite-inquiry-form"></div>
<script
  src="${appUrl}/kidcity-inquiry-form.js"
  data-target="bee-suite-inquiry-form"
  data-endpoint="${appUrl}/api/inquiries"
  ${locationAttributes}${turnstileSiteKeyAttribute()}
  async
></script>`;
}

export function getCenterInquiryEmbedCode({
  baseUrl,
  centerId,
  centerName,
  brandName = "The BEE Suite",
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
