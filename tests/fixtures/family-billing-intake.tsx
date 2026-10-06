import React from "react";
import { createRoot } from "react-dom/client";
import { ProcareImportPanel } from "../../src/components/procare-import-panel";
createRoot(document.getElementById("root")!).render(<div className="mx-auto max-w-5xl p-3"><ProcareImportPanel centers={[{ id: "synthetic-school", name: "Synthetic School" }]} /></div>);
