-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "reversalOfId" TEXT;

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "markedById" TEXT,
ALTER COLUMN "format" SET DEFAULT 'ONLINE';

-- AlterTable
ALTER TABLE "ScheduleSeries" ADD COLUMN     "createdById" TEXT,
ALTER COLUMN "format" SET DEFAULT 'ONLINE';

-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN     "onlineUrl" TEXT;

-- AlterTable
ALTER TABLE "TeacherAccrual" ADD COLUMN     "extraAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "hourlyAmount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_reversalOfId_key" ON "LedgerEntry"("reversalOfId");

-- CreateIndex
CREATE INDEX "LedgerEntry_lessonId_idx" ON "LedgerEntry"("lessonId");

-- AddForeignKey
ALTER TABLE "ScheduleSeries" ADD CONSTRAINT "ScheduleSeries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

