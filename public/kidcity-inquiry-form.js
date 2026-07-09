(function () {
  const currentScript = document.currentScript;
  const baseUrl = new URL(currentScript.src).origin;
  const targetId = currentScript.dataset.target || "bee-suite-inquiry-form";
  const endpoint =
    currentScript.dataset.endpoint || `${baseUrl}/api/inquiries`;
  const fixedCenterId = (currentScript.dataset.centerId || "").trim();
  const fixedLocationId = (currentScript.dataset.locationId || "").trim();
  const fixedPublicLocationId = (currentScript.dataset.publicLocationId || "").trim();
  const fixedLocationName = (currentScript.dataset.locationName || "").trim();
  const fixedLocationRequested = Boolean(
    fixedCenterId ||
      fixedLocationId ||
      fixedPublicLocationId ||
      fixedLocationName
  );
  const target = document.getElementById(targetId);

  if (!target) return;

  const turnstileSiteKey = currentScript.dataset.turnstileSiteKey || "";
  const programs = [
    "Daycare",
    "Preschool",
    "Before & After School Care",
    "Summer Camp",
  ];

  const style = document.createElement("style");
  style.textContent = `
    .bee-suite-form{font-family:Inter,Arial,sans-serif;border:1px solid rgba(13,29,54,.12);border-radius:22px;padding:24px;background:linear-gradient(145deg,#fffdf5,#ffffff);box-shadow:0 24px 70px rgba(9,23,45,.16);color:#122033;max-width:560px}
    .bee-suite-form *{box-sizing:border-box}
    .bee-suite-form h2{margin:0;color:#122033;font-size:28px;line-height:1.08;font-weight:850;letter-spacing:-.02em}
    .bee-suite-form p{margin:8px 0 0;color:#536173;font-size:14px;line-height:1.55}
    .bee-suite-grid{display:grid;gap:14px;margin-top:20px}
    .bee-suite-field{display:grid;gap:7px}
    .bee-suite-field span{font-size:13px;font-weight:750;color:#24344b}
    .bee-suite-field input,.bee-suite-field select{width:100%;min-height:48px;border:1px solid rgba(13,29,54,.16);border-radius:14px;background:#fff;padding:0 14px;color:#122033;font:inherit;outline:none}
    .bee-suite-field input:focus,.bee-suite-field select:focus{border-color:#f2b705;box-shadow:0 0 0 4px rgba(242,183,5,.18)}
    .bee-suite-fixed-location{background:#f8fafc!important;color:#24344b!important}
    .bee-suite-button{width:100%;min-height:50px;border:0;border-radius:15px;background:linear-gradient(135deg,#ffca28,#f2a900);color:#15110a;font-weight:850;font-size:15px;cursor:pointer;box-shadow:0 14px 30px rgba(242,169,0,.24)}
    .bee-suite-button:disabled{cursor:not-allowed;opacity:.7}
    .bee-suite-note{font-size:12px!important;color:#667386!important;text-align:center}
    .bee-suite-status{min-height:20px;font-size:13px!important;font-weight:700}
    .bee-suite-status[data-state=success]{color:#198754!important}
    .bee-suite-status[data-state=error]{color:#b42318!important}
    .bee-suite-turnstile{display:flex;justify-content:center;min-height:65px}
    .bee-suite-honeypot{position:absolute!important;left:-10000px!important;width:1px!important;height:1px!important;overflow:hidden!important}
  `;
  document.head.appendChild(style);

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function optionLabel(location) {
    return location.crmLocationId || location.locationId || location.name;
  }

  function normalizeKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function findFixedLocation(locations) {
    const keys = [
      fixedLocationId,
      fixedPublicLocationId,
      fixedLocationName,
    ].map(normalizeKey).filter(Boolean);

    if (!keys.length) return null;

    return locations.find((location) => {
      const values = [
        location.crmLocationId,
        location.locationId,
        location.name,
      ].map(normalizeKey);

      return values.some((value) => keys.includes(value));
    }) || null;
  }

  function getFixedLocation(locations) {
    if (!fixedLocationRequested) return null;

    const matchedLocation = findFixedLocation(locations);
    if (matchedLocation) return matchedLocation;

    return {
      crmLocationId: fixedLocationId,
      locationId: fixedPublicLocationId || fixedLocationId,
      name:
        fixedLocationName ||
        fixedLocationId ||
        fixedPublicLocationId ||
        "Selected Kid City USA school",
      address: "",
      city: "",
      state: "",
      postalCode: "",
      phone: "",
    };
  }

  function groupLocations(locations) {
    return locations.reduce((groups, location) => {
      const state = location.state || "Other";
      groups[state] = groups[state] || [];
      groups[state].push(location);
      return groups;
    }, {});
  }

  function queryValue(name) {
    try {
      return new URL(window.location.href).searchParams.get(name) || "";
    } catch {
      return "";
    }
  }

  function loadTurnstile() {
    if (!turnstileSiteKey) return;
    if (document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) return;
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }

  function render(locations) {
    const fixedLocation = getFixedLocation(locations);
    const groups = groupLocations(locations);
    const locationOptions = Object.keys(groups)
      .sort()
      .map((state) => {
        const options = groups[state]
          .map(
            (location) =>
              `<option value="${escapeHtml(location.crmLocationId)}" data-location-id="${escapeHtml(location.locationId)}" data-location-name="${escapeHtml(location.name)}" data-city="${escapeHtml(location.city)}" data-state="${escapeHtml(location.state)}" data-address="${escapeHtml(location.address)}" data-postal-code="${escapeHtml(location.postalCode)}" data-location-phone="${escapeHtml(location.phone)}">${escapeHtml(optionLabel(location))}</option>`,
          )
          .join("");
        return `<optgroup label="${escapeHtml(state)}">${options}</optgroup>`;
      })
      .join("");
    const fixedLocationValue = fixedLocation
      ? fixedLocation.crmLocationId || fixedLocation.locationId || fixedLocation.name
      : "";
    const fixedPublicLocationValue = fixedLocation
      ? fixedLocation.locationId || fixedLocation.crmLocationId || fixedLocation.name
      : "";
    const locationField = fixedLocation
      ? `<input name="locationId" type="hidden" value="${escapeHtml(fixedLocationValue)}">
          <input name="publicLocationId" type="hidden" value="${escapeHtml(fixedPublicLocationValue)}">
          <label class="bee-suite-field"><span>Location</span><input class="bee-suite-fixed-location" type="text" value="${escapeHtml(optionLabel(fixedLocation))}" readonly aria-readonly="true"></label>`
      : `<label class="bee-suite-field"><span>Location</span><select name="locationId" required><option value="">Choose a location</option>${locationOptions}</select></label>`;

    target.innerHTML = `
      <form class="bee-suite-form" novalidate>
        <h2>Start an inquiry</h2>
        <p>Choose your Kid City USA school and a team member will follow up.</p>
        <div class="bee-suite-grid">
          ${fixedCenterId ? `<input name="centerId" type="hidden" value="${escapeHtml(fixedCenterId)}">` : ""}
          <label class="bee-suite-honeypot">Company<input name="company" type="text" tabindex="-1" autocomplete="off"></label>
          <label class="bee-suite-honeypot">Website<input name="website" type="text" tabindex="-1" autocomplete="off"></label>
          <label class="bee-suite-field"><span>Parent's Name</span><input name="parentName" type="text" autocomplete="name" required></label>
          <label class="bee-suite-field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
          <label class="bee-suite-field"><span>Phone Number</span><input name="phone" type="tel" autocomplete="tel" required></label>
          <label class="bee-suite-field"><span>Program</span><select name="program" required><option value="">Choose a program</option>${programs.map((program) => `<option value="${escapeHtml(program)}">${escapeHtml(program)}</option>`).join("")}</select></label>
          ${locationField}
          ${turnstileSiteKey ? `<div class="bee-suite-turnstile"><div class="cf-turnstile" data-sitekey="${escapeHtml(turnstileSiteKey)}"></div></div>` : ""}
          <button class="bee-suite-button" type="submit">Submit inquiry</button>
          <p class="bee-suite-note">By submitting, you agree to be contacted by Kid City USA.</p>
          <p class="bee-suite-status" role="status" aria-live="polite"></p>
        </div>
      </form>
    `;

    const form = target.querySelector("form");
    const status = target.querySelector(".bee-suite-status");
    const button = target.querySelector("button");

    function selectedLocationFromForm() {
      if (fixedLocation) {
        return {
          locationName: fixedLocation.name || fixedLocationName,
          publicLocationId: fixedPublicLocationValue,
          city: fixedLocation.city || "",
          state: fixedLocation.state || "",
          address: fixedLocation.address || "",
          postalCode: fixedLocation.postalCode || "",
          locationPhone: fixedLocation.phone || "",
        };
      }

      const selectedLocation = form.querySelector("select[name='locationId'] option:checked");
      if (!selectedLocation) {
        return {
          locationName: "",
          publicLocationId: "",
          city: "",
          state: "",
          address: "",
          postalCode: "",
          locationPhone: "",
        };
      }

      return {
        locationName: selectedLocation.dataset.locationName || "",
        publicLocationId: selectedLocation.dataset.locationId || "",
        city: selectedLocation.dataset.city || "",
        state: selectedLocation.dataset.state || "",
        address: selectedLocation.dataset.address || "",
        postalCode: selectedLocation.dataset.postalCode || "",
        locationPhone: selectedLocation.dataset.locationPhone || "",
      };
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.textContent = "";
      status.removeAttribute("data-state");

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const formData = new FormData(form);
      const location = selectedLocationFromForm();
      const payload = {
        parentName: String(formData.get("parentName") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        phone: String(formData.get("phone") || "").trim(),
        program: String(formData.get("program") || "").trim(),
        centerId: String(formData.get("centerId") || fixedCenterId || "").trim(),
        locationId: String(formData.get("locationId") || "").trim(),
        locationName: location.locationName,
        publicLocationId: String(formData.get("publicLocationId") || location.publicLocationId || "").trim(),
        city: location.city,
        state: location.state,
        address: location.address,
        postalCode: location.postalCode,
        locationPhone: location.locationPhone,
        pageUrl: window.location.href,
        leadSource: "Kid City USA Website Inquiry",
        utmSource: queryValue("utm_source"),
        utmMedium: queryValue("utm_medium"),
        utmCampaign: queryValue("utm_campaign"),
        utmTerm: queryValue("utm_term"),
        utmContent: queryValue("utm_content"),
        company: String(formData.get("company") || "").trim(),
        website: String(formData.get("website") || "").trim(),
        turnstileToken: String(formData.get("cf-turnstile-response") || "").trim(),
      };

      button.disabled = true;
      button.textContent = "Submitting...";
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error("Submission failed");
        form.reset();
        status.dataset.state = "success";
        status.textContent = "Thanks. Your inquiry has been submitted.";
      } catch {
        status.dataset.state = "error";
        status.textContent =
          "We could not submit the inquiry. Please call your preferred Kid City USA school.";
        if (window.turnstile) window.turnstile.reset();
      } finally {
        button.disabled = false;
        button.textContent = "Submit inquiry";
      }
    });
  }

  loadTurnstile();

  fetch(`${baseUrl}/api/public/kidcity-locations`)
    .then((response) => response.json())
    .then((data) => render(data.locations || []))
    .catch(() => {
      if (fixedLocationRequested) {
        render([]);
        return;
      }

      target.innerHTML =
        '<p class="bee-suite-status" data-state="error">The inquiry form could not load. Please refresh the page.</p>';
    });
})();
