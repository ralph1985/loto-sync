CREATE TABLE "GroupEmailRecipient" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "label" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupEmailRecipient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupEmailRecipient_groupId_email_key" ON "GroupEmailRecipient"("groupId", "email");
CREATE INDEX "GroupEmailRecipient_groupId_enabled_idx" ON "GroupEmailRecipient"("groupId", "enabled");

ALTER TABLE "GroupEmailRecipient" ADD CONSTRAINT "GroupEmailRecipient_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
