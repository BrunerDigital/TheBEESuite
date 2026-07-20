ALTER TABLE "AttendanceRecord" ADD COLUMN "clientActionId" TEXT;
ALTER TABLE "DailyReport" ADD COLUMN "clientActionId" TEXT;
ALTER TABLE "IncidentReport" ADD COLUMN "clientActionId" TEXT;
ALTER TABLE "ChildLocationTransition" ADD COLUMN "clientActionId" TEXT;

CREATE UNIQUE INDEX "AttendanceRecord_clientActionId_key" ON "AttendanceRecord"("clientActionId");
CREATE UNIQUE INDEX "DailyReport_childId_clientActionId_key" ON "DailyReport"("childId", "clientActionId");
CREATE UNIQUE INDEX "IncidentReport_clientActionId_key" ON "IncidentReport"("clientActionId");
CREATE UNIQUE INDEX "ChildLocationTransition_clientActionId_key" ON "ChildLocationTransition"("clientActionId");
