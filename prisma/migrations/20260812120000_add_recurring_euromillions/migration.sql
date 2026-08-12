-- Recurring Euromillón tickets and per-ticket/per-draw El Millón data.
CREATE TYPE "TicketPurchaseStatus" AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED', 'CANCELLED');

ALTER TABLE "Draw" ADD COLUMN "elMillionCode" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "purchaseStatus" "TicketPurchaseStatus" NOT NULL DEFAULT 'CONFIRMED';
ALTER TABLE "Ticket" ADD COLUMN "elMillionCode" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "recurringTicketId" TEXT;
ALTER TABLE "TicketCheck" ADD COLUMN "elMillionMatch" BOOLEAN;

CREATE TABLE "RecurringTicket" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "drawType" "DrawType" NOT NULL DEFAULT 'EUROMILLONES',
    "startDate" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mainNumbers" JSONB NOT NULL,
    "starNumbers" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecurringTicket_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Ticket_purchaseStatus_idx" ON "Ticket"("purchaseStatus");
CREATE INDEX "RecurringTicket_groupId_active_idx" ON "RecurringTicket"("groupId", "active");
CREATE UNIQUE INDEX "Ticket_recurringTicketId_drawId_key" ON "Ticket"("recurringTicketId", "drawId");
ALTER TABLE "RecurringTicket" ADD CONSTRAINT "RecurringTicket_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_recurringTicketId_fkey"
  FOREIGN KEY ("recurringTicketId") REFERENCES "RecurringTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
