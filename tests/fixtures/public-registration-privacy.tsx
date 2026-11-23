import React from "react";
import { createRoot } from "react-dom/client";
import { OnlineRegistrationForm } from "../../src/components/online-registration-form";

const state = new URLSearchParams(location.search).get("state") === "FL" ? "FL" : "IN";
createRoot(document.getElementById("root")!).render(<OnlineRegistrationForm
  centers={[{ id: "fixture-school", name: "Fixture School", crmLocationId: null, city: "Fixture City", state }]}
  initialCenterId="fixture-school"
/>);
