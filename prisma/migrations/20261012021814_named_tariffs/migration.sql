-- Именованные тарифы с историей цен и выбор тарифа для ученика.
-- Данные сохраняются: каждое сочетание формат × программа × оплата становится тарифом школы,
-- его цены (по датам начала) переносятся в TariffPrice.

-- 1. История цен
CREATE TABLE "TariffPrice" (
    "id" TEXT NOT NULL,
    "tariffId" TEXT NOT NULL,
    "pricePerHour" INTEGER NOT NULL,
    "validFrom" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    CONSTRAINT "TariffPrice_pkey" PRIMARY KEY ("id")
);

-- 2. Новые поля тарифа (имя заполняется ниже)
ALTER TABLE "Tariff"
    ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "name" TEXT;

-- 3. Все цены сочетания — к одной записи-тарифу (с наименьшим id)
INSERT INTO "TariffPrice" ("id", "tariffId", "pricePerHour", "validFrom")
SELECT t."id" || '_p', k."keepId", t."pricePerHour", t."validFrom"
FROM "Tariff" t
JOIN (SELECT "kind", "program", "paymentMode", MIN("id") AS "keepId" FROM "Tariff" GROUP BY 1, 2, 3) k
  USING ("kind", "program", "paymentMode");

DELETE FROM "Tariff"
WHERE "id" NOT IN (SELECT MIN("id") FROM "Tariff" GROUP BY "kind", "program", "paymentMode");

UPDATE "Tariff" SET
  "isDefault" = true,
  "name" = (CASE "program" WHEN 'EXAM' THEN 'ОГЭ/ЕГЭ' ELSE 'Школьная программа' END)
        || ' · ' || (CASE "kind" WHEN 'GROUP' THEN 'группа' ELSE 'индивидуально' END)
        || ' · ' || (CASE "paymentMode" WHEN 'MONTHLY' THEN 'абонемент' ELSE 'поурочно' END);

ALTER TABLE "Tariff" ALTER COLUMN "name" SET NOT NULL;

-- 4. Старые поля цены больше не нужны
DROP INDEX "Tariff_kind_program_paymentMode_validFrom_key";
ALTER TABLE "Tariff" DROP COLUMN "pricePerHour", DROP COLUMN "validFrom";

-- 5. Тариф ученика
ALTER TABLE "Client" ADD COLUMN "tariffId" TEXT;

CREATE UNIQUE INDEX "TariffPrice_tariffId_validFrom_key" ON "TariffPrice"("tariffId", "validFrom");
CREATE INDEX "Tariff_kind_program_paymentMode_idx" ON "Tariff"("kind", "program", "paymentMode");
ALTER TABLE "Client" ADD CONSTRAINT "Client_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "Tariff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TariffPrice" ADD CONSTRAINT "TariffPrice_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "Tariff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
