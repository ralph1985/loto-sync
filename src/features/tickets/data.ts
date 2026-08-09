import type { Group, Ticket } from "@/features/tickets/types";
import { API_GROUPS_CACHE_KEY, API_TICKETS_CACHE_KEY, readApiCache, writeApiCache } from "@/lib/api-cache";

export type GroupsAndTickets = {
  groups: Group[];
  tickets: Ticket[];
};

export async function loadGroupsAndTickets(forceRefresh = false): Promise<GroupsAndTickets> {
  const cachedTickets = readApiCache<Ticket[]>(API_TICKETS_CACHE_KEY, { forceRefresh });
  const cachedGroups = readApiCache<Group[]>(API_GROUPS_CACHE_KEY, { forceRefresh });
  if (cachedTickets && cachedGroups) {
    return { groups: cachedGroups, tickets: cachedTickets };
  }

  const [groupsResponse, ticketsResponse] = await Promise.all([
    fetch("/api/groups"),
    fetch("/api/tickets"),
  ]);
  if (!groupsResponse.ok || !ticketsResponse.ok) {
    throw new Error("No se pudieron cargar los boletos.");
  }

  const groupsPayload = await groupsResponse.json();
  const ticketsPayload = await ticketsResponse.json();
  const groups = groupsPayload.data ?? [];
  const tickets = ticketsPayload.data ?? [];
  writeApiCache(API_GROUPS_CACHE_KEY, groups);
  writeApiCache(API_TICKETS_CACHE_KEY, tickets);
  return { groups, tickets };
}
