export type DrawType = "PRIMITIVA" | "EUROMILLONES";
export type TicketStatus = "PENDIENTE" | "COMPROBADO" | "PREMIO";
export type PrimitivaCoverageMode = "SINGLE" | "WEEKLY";
export type MovementType =
  | "OPENING"
  | "ADJUSTMENT"
  | "CONTRIBUTION"
  | "TICKET_EXPENSE"
  | "PRIZE";

export type Group = {
  id: string;
  name: string;
  balanceTrackingEnabled: boolean;
  balanceCents?: number | null;
  role?: "OWNER" | "MEMBER";
};

export type Draw = {
  id: string;
  type: DrawType;
  drawDate: string;
  label?: string | null;
};

export type TicketLineNumber = {
  id: string;
  kind: "MAIN" | "STAR";
  position: number;
  value: number;
};

export type TicketLine = {
  id: string;
  lineIndex: number;
  complement?: number | null;
  reintegro?: number | null;
  numbers: TicketLineNumber[];
  elMillionCode?: string | null;
};

export type TicketLineResult = {
  lineIndex: number;
  matchesMain: number;
  matchesStars: number;
  elMillionMatch?: boolean | null;
};

export type Receipt = {
  id: string;
  blobUrl: string;
};

export type TicketCheck = {
  id: string;
  drawDate: string;
  status: TicketStatus;
  reason?: string | null;
  winningNumbers?: number[] | null;
  winningStars?: number[] | null;
  winningComplementario?: number | null;
  winningReintegro?: number | null;
  matchesMain: number;
  matchesStars: number;
  prizeCents?: number | null;
  prizeSource?: string | null;
  checkedAt: string;
  elMillionMatch?: boolean | null;
  lineResults?: TicketLineResult[] | null;
};

export type Ticket = {
  id: string;
  status: TicketStatus;
  purchaseStatus?: "PENDING_CONFIRMATION" | "CONFIRMED" | "CANCELLED";
  elMillionCode?: string | null;
  createdAt: string;
  priceCents?: number | null;
  playsJoker?: boolean;
  jokerNumber?: string | null;
  group?: Group | null;
  draw?: Draw | null;
  lines?: TicketLine[];
  receipt?: Receipt | null;
  checks?: TicketCheck[];
};

export type VerifyResponse = {
  status: TicketStatus;
  reason?: string;
  matches?: {
    main: number;
    stars: number;
  };
  check?: TicketCheck;
  ticketStatus?: TicketStatus;
  result?: {
    game: DrawType;
    drawDate: string;
    numbers: number[];
    stars?: number[];
  };
};

export type GroupMovement = {
  id: string;
  type: MovementType;
  amountCents: number;
  occurredAt: string;
  note?: string | null;
  runningBalanceCents: number;
};
