import React from "react";
import { createRoot } from "react-dom/client";
import { FamilyStudentIntakeForm } from "../../src/components/family-student-intake-form";

createRoot(document.getElementById("root")!).render(<FamilyStudentIntakeForm centers={[
  { id: "synthetic-school", name: "Synthetic School", classrooms: [{ id: "synthetic-room", name: "Preschool", ageGroup: "Preschool" }] },
]} />);
