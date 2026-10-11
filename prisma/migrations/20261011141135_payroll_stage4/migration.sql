-- DropIndex
DROP INDEX "TeacherRatePlan_teacherId_validFrom_idx";

-- AlterTable
ALTER TABLE "Payroll" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedById" TEXT;

-- AlterTable
ALTER TABLE "PayrollAdjustment" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "sourceMonth" DATE;

-- AlterTable
ALTER TABLE "PayrollPayment" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isAdvance" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RatePlan" ADD COLUMN     "familyId" TEXT,
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "versionFrom" DATE;

-- CreateTable
CREATE TABLE "UserInvite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserInvite_token_key" ON "UserInvite"("token");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherRatePlan_teacherId_validFrom_key" ON "TeacherRatePlan"("teacherId", "validFrom");

-- AddForeignKey
ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

