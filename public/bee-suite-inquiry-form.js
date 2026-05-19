(function () {
  const currentScript = document.currentScript;
  const baseUrl = new URL(currentScript.src).origin;
  const targetId = currentScript.dataset.target || "bee-suite-inquiry-form";
  const endpoint = currentScript.dataset.endpoint || `${baseUrl}/api/inquiries`;
  const target = document.getElementById(targetId);

  if (!target) return;

  const brandName = currentScript.dataset.brandName || "The Bee Suite";
  const centerId = currentScript.dataset.centerId || "";
  const locationName = currentScript.dataset.locationName || currentScript.dataset.centerName || "";
  const locationsUrl = currentScript.dataset.locationsUrl || "";
  const preset = currentScript.dataset.preset || "";
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
    .bee-suite-form h2{margin:0;color:#122033;font-size:28px;line-height:1.08;font-weight:850;letter-spacing:0}
    .bee-suite-form p{margin:8px 0 0;color:#536173;font-size:14px;line-height:1.55}
    .bee-suite-grid{display:grid;gap:14px;margin-top:20px}
    .bee-suite-field{display:grid;gap:7px}
    .bee-suite-field span{font-size:13px;font-weight:750;color:#24344b}
    .bee-suite-field input,.bee-suite-field select{width:100%;min-height:48px;border:1px solid rgba(13,29,54,.16);border-radius:14px;background:#fff;padding:0 14px;color:#122033;font:inherit;outline:none}
    .bee-suite-field input:focus,.bee-suite-field select:focus{border-color:#f2b705;box-shadow:0 0 0 4px rgba(242,183,5,.18)}
    .bee-suite-button{width:100%;min-height:50px;border:0;border-radius:15px;background:linear-gradient(135deg,#ffca28,#f2a900);color:#15110a;font-weight:850;font-size:15px;cursor:pointer;box-shadow:0 14px 30px rgba(242,169,0,.24)}
    .bee-suite-button:disabled{cursor:not-allowed;opacity:.7}
    .bee-suite-note{font-size:12px!important;color:#667386!important;text-align:center}
    .bee-suite-status{min-height:20px;font-size:13px!important;font-weight:700}
    .bee-suite-status[data-state=success]{color:#198754!important}
    .bee-suite-status[data-state=error]{color:#b42318!important}
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
    const place = [location.city, location.state].filter(Boolean).join(", ");
    return place ? `${location.name} - ${place}` : location.name;
  }

  function groupLocations(locations) {
    return locations.reduce((groups, location) => {
      const state = location.state || "Other";
      groups[state] = groups[state] || [];
      groups[state].push(location);
      return groups;
    }, {});
  }

  function renderLocationInput(locations) {
    if (centerId) {
      return `<input name="centerId" type="hidden" value="${escapeHtml(centerId)}"><input name="locationId" type="hidden" value="${escapeHtml(centerId)}"><input name="locationName" type="hidden" value="${escapeHtml(locationName)}">`;
    }

    if (locations && locations.length) {
      const groups = groupLocations(locations);
      const locationOptions = Object.keys(groups)
        .sort()
        .map((state) => {
          const options = groups[state]
            .map(
              (location) =>
                `<option value="${escapeHtml(location.crmLocationId || location.id)}" data-center-id="${escapeHtml(location.id || "")}" data-location-id="${escapeHtml(location.locationId || "")}" data-location-name="${escapeHtml(location.name || "")}" data-city="${escapeHtml(location.city || "")}" data-state="${escapeHtml(location.state || "")}" data-address="${escapeHtml(location.address || "")}" data-postal-code="${escapeHtml(location.postalCode || "")}" data-location-phone="${escapeHtml(location.phone || "")}">${escapeHtml(optionLabel(location))}</option>`,
            )
            .join("");
          return `<optgroup label="${escapeHtml(state)}">${options}</optgroup>`;
        })
        .join("");

      return `<label class="bee-suite-field"><span>Location</span><select name="locationId" required><option value="">Choose a location</option>${locationOptions}</select></label>`;
    }

    return `<label class="bee-suite-field"><span>Preferred location</span><input name="locationName" type="text" autocomplete="organization" required></label>`;
  }

  function render(locations) {
    target.innerHTML = `
      <form class="bee-suite-form" novalidate>
        <h2>Start an inquiry</h2>
        <p>Tell ${escapeHtml(brandName)} where you would like care and a team member will follow up.</p>
        <div class="bee-suite-grid">
          <label class="bee-suite-honeypot">Company<input name="company" type="text" tabindex="-1" autocomplete="off"></label>
          <label class="bee-suite-honeypot">Website<input name="website" type="text" tabindex="-1" autocomplete="off"></label>
          <label class="bee-suite-field"><span>Parent's Name</span><input name="parentName" type="text" autocomplete="name" required></label>
          <label class="bee-suite-field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
          <label class="bee-suite-field"><span>Phone Number</span><input name="phone" type="tel" autocomplete="tel" required></label>
          <label class="bee-suite-field"><span>Program</span><select name="program" required><option value="">Choose a program</option>${programs.map((program) => `<option value="${escapeHtml(program)}">${escapeHtml(program)}</option>`).join("")}</select></label>
          ${renderLocationInput(locations)}
          <button class="bee-suite-button" type="submit">Submit inquiry</button>
          <p class="bee-suite-note">By submitting, you agree to be contacted about childcare enrollment.</p>
          <p class="bee-suite-status" role="status" aria-live="polite"></p>
        </div>
      </form>
    `;

    const form = target.querySelector("form");
    const status = target.querySelector(".bee-suite-status");
    const button = target.querySelector("button");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.textContent = "";
      status.removeAttribute("data-state");

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const formData = new FormData(form);
      const selectedLocation = form.querySelector("select[name='locationId'] option:checked");
      const submittedLocationName = String(formData.get("locationName") || "").trim();
      const payload = {
        parentName: String(formData.get("parentName") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        phone: String(formData.get("phone") || "").trim(),
        program: String(formData.get("program") || "").trim(),
        centerId: String(formData.get("centerId") || selectedLocation?.dataset.centerId || "").trim(),
        locationId: String(formData.get("locationId") || formData.get("centerId") || submittedLocationName).trim(),
        locationName: selectedLocation?.dataset.locationName || submittedLocationName || locationName,
        publicLocationId: selectedLocation?.dataset.locationId || "",
        city: selectedLocation?.dataset.city || "",
        state: selectedLocation?.dataset.state || "",
        address: selectedLocation?.dataset.address || "",
        postalCode: selectedLocation?.dataset.postalCode || "",
        locationPhone: selectedLocation?.dataset.locationPhone || "",
        pageUrl: window.location.href,
        leadSource: `${brandName} Website Inquiry`,
        brandName,
        company: String(formData.get("company") || "").trim(),
        website: String(formData.get("website") || "").trim(),
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
        status.textContent = "We could not submit the inquiry. Please call your preferred school.";
      } finally {
        button.disabled = false;
        button.textContent = "Submit inquiry";
      }
    });
  }

  const resolvedLocationsUrl = locationsUrl || (preset === "kidcity" ? `${baseUrl}/api/public/kidcity-locations` : "");

  if (resolvedLocationsUrl) {
    fetch(resolvedLocationsUrl)
      .then((response) => response.json())
      .then((data) => render(data.locations || []))
      .catch(() => {
        target.innerHTML =
          '<p class="bee-suite-status" data-state="error">The inquiry form could not load. Please refresh the page.</p>';
      });
    return;
  }

  render([]);
})();
