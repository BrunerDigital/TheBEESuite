-- CreateTable
CREATE TABLE "ChildLiveLocation" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "centerId" TEXT,
    "currentClassroomId" TEXT,
    "areaName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'in_classroom',
    "reason" TEXT,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "movedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChildLiveLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChildLocationTransition" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "centerId" TEXT,
    "fromClassroomId" TEXT,
    "toClassroomId" TEXT,
    "fromAreaName" TEXT,
    "toAreaName" TEXT,
    "reason" TEXT,
    "movedById" TEXT,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChildLocationTransition_pkey" PRIMARY KEY ("id")
);

-- Keep live child location data private from Supabase Data API clients.
ALTER TABLE "ChildLiveLocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChildLocationTransition" ENABLE ROW LEVEL SECURITY;

-- CreateIndex
CREATE UNIQUE INDEX "ChildLiveLocation_childId_key" ON "ChildLiveLocation"("childId");

-- CreateIndex
CREATE INDEX "ChildLiveLocation_centerId_currentClassroomId_idx" ON "ChildLiveLocation"("centerId", "currentClassroomId");

-- CreateIndex
CREATE INDEX "ChildLiveLocation_movedAt_idx" ON "ChildLiveLocation"("movedAt");

-- CreateIndex
CREATE INDEX "ChildLocationTransition_childId_movedAt_idx" ON "ChildLocationTransition"("childId", "movedAt");

-- CreateIndex
CREATE INDEX "ChildLocationTransition_centerId_movedAt_idx" ON "ChildLocationTransition"("centerId", "movedAt");

-- CreateIndex
CREATE INDEX "ChildLocationTransition_toClassroomId_movedAt_idx" ON "ChildLocationTransition"("toClassroomId", "movedAt");

-- AddForeignKey
ALTER TABLE "ChildLiveLocation" ADD CONSTRAINT "ChildLiveLocation_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildLiveLocation" ADD CONSTRAINT "ChildLiveLocation_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildLiveLocation" ADD CONSTRAINT "ChildLiveLocation_currentClassroomId_fkey" FOREIGN KEY ("currentClassroomId") REFERENCES "Classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildLiveLocation" ADD CONSTRAINT "ChildLiveLocation_movedById_fkey" FOREIGN KEY ("movedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildLocationTransition" ADD CONSTRAINT "ChildLocationTransition_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildLocationTransition" ADD CONSTRAINT "ChildLocationTransition_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildLocationTransition" ADD CONSTRAINT "ChildLocationTransition_fromClassroomId_fkey" FOREIGN KEY ("fromClassroomId") REFERENCES "Classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildLocationTransition" ADD CONSTRAINT "ChildLocationTransition_toClassroomId_fkey" FOREIGN KEY ("toClassroomId") REFERENCES "Classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildLocationTransition" ADD CONSTRAINT "ChildLocationTransition_movedById_fkey" FOREIGN KEY ("movedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
