ALTER TABLE "Group" ADD COLUMN "balanceTrackingEnabled" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Group"
SET "balanceTrackingEnabled" = false
WHERE lower(trim("name")) = 'bego';
