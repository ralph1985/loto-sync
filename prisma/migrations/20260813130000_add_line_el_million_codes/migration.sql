-- Keep the legacy Ticket.elMillionCode for existing tickets and store new
-- Euromillones codes next to the line they belong to.
ALTER TABLE "TicketLine" ADD COLUMN "elMillionCode" TEXT;
ALTER TABLE "TicketCheck" ADD COLUMN "lineResults" JSONB;
