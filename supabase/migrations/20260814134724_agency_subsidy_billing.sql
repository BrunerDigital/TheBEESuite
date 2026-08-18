CREATE TABLE "AgencyProgram" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "programName" TEXT,
    "stateCode" TEXT NOT NULL,
    "providerNumber" TEXT,
    "vendorNumber" TEXT,
    "submissionMethod" TEXT NOT NULL DEFAULT 'agency_portal',
    "portalUrl" TEXT,
    "remittanceEmail" TEXT,
    "paymentInstructions" TEXT,
    "requirements" JSONB,
    "status" TEXT NOT NULL DEFAULT 'setup_required',
    "customFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgencyProgram_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubsidyAuthorization" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "agencyProgramId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "authorizationNumber" TEXT NOT NULL,
    "coverageStart" TIMESTAMP(3) NOT NULL,
    "coverageEnd" TIMESTAMP(3) NOT NULL,
    "authorizedRateCents" INTEGER NOT NULL,
    "familyCopayCents" INTEGER NOT NULL DEFAULT 0,
    "unitType" TEXT NOT NULL DEFAULT 'weekly',
    "authorizedUnits" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'active',
    "requiredDocuments" JSONB,
    "customFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SubsidyAuthorization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubsidyClaim" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "agencyProgramId" TEXT NOT NULL,
    "authorizationId" TEXT,
    "number" TEXT NOT NULL,
    "servicePeriodStart" TIMESTAMP(3) NOT NULL,
    "servicePeriodEnd" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "claimedCents" INTEGER NOT NULL,
    "approvedCents" INTEGER,
    "paidCents" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "denialReason" TEXT,
    "externalReference" TEXT,
    "customFields" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SubsidyClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubsidyClaimLine" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "serviceUnits" DOUBLE PRECISION NOT NULL,
    "unitType" TEXT NOT NULL,
    "rateCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "attendanceDays" INTEGER,
    "attendanceData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubsidyClaimLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubsidyClaimDocument" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "documentId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'required',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SubsidyClaimDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubsidyRemittance" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "externalReference" TEXT NOT NULL,
    "notes" TEXT,
    "enteredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubsidyRemittance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgencyProgram_centerId_name_programName_key" ON "AgencyProgram"("centerId", "name", "programName");
CREATE INDEX "AgencyProgram_centerId_status_idx" ON "AgencyProgram"("centerId", "status");
CREATE INDEX "AgencyProgram_stateCode_name_idx" ON "AgencyProgram"("stateCode", "name");
CREATE UNIQUE INDEX "SubsidyAuthorization_agencyProgramId_authorizationNumber_childId_key" ON "SubsidyAuthorization"("agencyProgramId", "authorizationNumber", "childId");
CREATE INDEX "SubsidyAuthorization_centerId_status_coverageEnd_idx" ON "SubsidyAuthorization"("centerId", "status", "coverageEnd");
CREATE INDEX "SubsidyAuthorization_familyId_childId_idx" ON "SubsidyAuthorization"("familyId", "childId");
CREATE UNIQUE INDEX "SubsidyClaim_number_key" ON "SubsidyClaim"("number");
CREATE INDEX "SubsidyClaim_centerId_status_dueDate_idx" ON "SubsidyClaim"("centerId", "status", "dueDate");
CREATE INDEX "SubsidyClaim_agencyProgramId_servicePeriodStart_servicePeriodEnd_idx" ON "SubsidyClaim"("agencyProgramId", "servicePeriodStart", "servicePeriodEnd");
CREATE INDEX "SubsidyClaim_authorizationId_idx" ON "SubsidyClaim"("authorizationId");
CREATE INDEX "SubsidyClaimLine_claimId_idx" ON "SubsidyClaimLine"("claimId");
CREATE INDEX "SubsidyClaimLine_childId_idx" ON "SubsidyClaimLine"("childId");
CREATE INDEX "SubsidyClaimDocument_claimId_status_idx" ON "SubsidyClaimDocument"("claimId", "status");
CREATE INDEX "SubsidyClaimDocument_documentId_idx" ON "SubsidyClaimDocument"("documentId");
CREATE UNIQUE INDEX "SubsidyRemittance_claimId_externalReference_key" ON "SubsidyRemittance"("claimId", "externalReference");
CREATE INDEX "SubsidyRemittance_claimId_paidAt_idx" ON "SubsidyRemittance"("claimId", "paidAt");

ALTER TABLE "AgencyProgram" ADD CONSTRAINT "AgencyProgram_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubsidyAuthorization" ADD CONSTRAINT "SubsidyAuthorization_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubsidyAuthorization" ADD CONSTRAINT "SubsidyAuthorization_agencyProgramId_fkey" FOREIGN KEY ("agencyProgramId") REFERENCES "AgencyProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubsidyAuthorization" ADD CONSTRAINT "SubsidyAuthorization_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubsidyAuthorization" ADD CONSTRAINT "SubsidyAuthorization_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubsidyClaim" ADD CONSTRAINT "SubsidyClaim_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubsidyClaim" ADD CONSTRAINT "SubsidyClaim_agencyProgramId_fkey" FOREIGN KEY ("agencyProgramId") REFERENCES "AgencyProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubsidyClaim" ADD CONSTRAINT "SubsidyClaim_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "SubsidyAuthorization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubsidyClaimLine" ADD CONSTRAINT "SubsidyClaimLine_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "SubsidyClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubsidyClaimLine" ADD CONSTRAINT "SubsidyClaimLine_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubsidyClaimDocument" ADD CONSTRAINT "SubsidyClaimDocument_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "SubsidyClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubsidyRemittance" ADD CONSTRAINT "SubsidyRemittance_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "SubsidyClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- These records are managed only through the server-side, school-scoped API.
-- Keep the public Data API fail-closed even when legacy default grants exist.
ALTER TABLE "AgencyProgram" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubsidyAuthorization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubsidyClaim" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubsidyClaimLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubsidyClaimDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubsidyRemittance" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "AgencyProgram" FROM anon, authenticated;
REVOKE ALL ON TABLE "SubsidyAuthorization" FROM anon, authenticated;
REVOKE ALL ON TABLE "SubsidyClaim" FROM anon, authenticated;
REVOKE ALL ON TABLE "SubsidyClaimLine" FROM anon, authenticated;
REVOKE ALL ON TABLE "SubsidyClaimDocument" FROM anon, authenticated;
REVOKE ALL ON TABLE "SubsidyRemittance" FROM anon, authenticated;
