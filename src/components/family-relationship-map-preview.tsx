"use client";

import { FamilyRelationshipMap } from "@/components/family-relationship-map";
import type { EditableFamilyRecord } from "@/components/family-record-editor";

export function FamilyRelationshipMapPreview({ family }: { family: EditableFamilyRecord }) {
  return (
    <FamilyRelationshipMap
      family={family}
      duplicateFamilyCount={1}
      onSelectGuardian={() => true}
      onSelectChild={() => true}
      onSelectPickup={() => true}
      onSelectEmergencyContact={() => true}
    />
  );
}
