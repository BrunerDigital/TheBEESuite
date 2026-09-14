import React from "react";
import { createRoot } from "react-dom/client";
import { SchoolDataSetupPanel } from "../../src/components/school-data-setup-panel";
import { SchoolSetupCommandCenter, type SchoolSetupCommandCenterData } from "../../src/components/school-setup-command-center";
import { assessSchoolDataSetup, emptySchoolDataReviewEvidence, readSchoolDataSetup } from "../../src/lib/school-data-setup";

const setup = { ...readSchoolDataSetup({}), path: "start_clean" as const, notes: "Saved setup notes" };
const evidence = emptySchoolDataReviewEvidence();
const dataSetup = { centerId: "synthetic-school", centerLabel: "Synthetic School", setup, evidence, assessment: assessSchoolDataSetup(setup, evidence) };
const data: SchoolSetupCommandCenterData = {
  centerId: dataSetup.centerId, centerLabel: dataSetup.centerLabel, setupStatus: "in_progress", progress: 0, completedSections: 0, totalSections: 1, blockingSections: 1, lastCapturedAt: null, schoolEin: "",
  businessProfile: { name: "Synthetic School", address: "123 Test Street", city: "Test City", state: "IN", postalCode: "46000", phone: "5555550100", email: "test@example.invalid", timezone: "America/Indiana/Indianapolis", licensedCapacity: "50" },
  businessProfileConfirmation: { complete: true, confirmationCurrent: false, missingFields: [], confirmedAt: null, confirmedByEmail: null },
  stats: [], dataSetup, sections: [], externalNeeds: [], directorChecklistCompletedIds: [],
};

createRoot(document.getElementById("root")!).render(new URLSearchParams(location.search).get("panel") === "data"
  ? <SchoolDataSetupPanel data={dataSetup} />
  : <SchoolSetupCommandCenter data={data} />);
