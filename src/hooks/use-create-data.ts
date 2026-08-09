"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { Group, Ticket } from "@/features/tickets/types";
import {
  API_GROUPS_CACHE_KEY,
  API_TICKETS_CACHE_KEY,
  readApiCache,
  writeApiCache,
} from "@/lib/api-cache";
import { loadSessionClient } from "@/lib/session-client";

export function useCreateData() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [canAccessCreate, setCanAccessCreate] = useState<boolean | null>(null);

  const refreshInitialData = useCallback(async () => {
    setLoadingData(true);
    setLoadingTickets(true);
    setLoadError(null);
    setTicketsError(null);
    try {
      const [groupsResponse, ticketsResponse] = await Promise.all([
        fetch("/api/groups"),
        fetch("/api/tickets"),
      ]);
      if (!groupsResponse.ok || !ticketsResponse.ok) {
        throw new Error("No se pudieron recargar los datos.");
      }
      const groupsPayload = await groupsResponse.json();
      const ticketsPayload = await ticketsResponse.json();
      const nextGroups = groupsPayload.data ?? [];
      const nextTickets = ticketsPayload.data ?? [];
      setGroups(nextGroups);
      setTickets(nextTickets);
      writeApiCache(API_GROUPS_CACHE_KEY, nextGroups);
      writeApiCache(API_TICKETS_CACHE_KEY, nextTickets);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudieron recargar los datos.";
      setLoadError(message);
      setTicketsError(message);
    } finally {
      setLoadingData(false);
      setLoadingTickets(false);
    }
  }, []);

  useEffect(() => {
    let isActive = true;
    loadSessionClient()
      .then((session) => {
        if (!isActive) return;
        if (!session) {
          router.replace("/login");
          setCanAccessCreate(false);
          return;
        }
        const memberships = Array.isArray(session.memberships) ? session.memberships : [];
        const hasCreatePermission = memberships.some(
          (membership: { role?: string }) => membership.role === "OWNER"
        );
        if (!hasCreatePermission) {
          router.replace("/review");
          setCanAccessCreate(false);
          return;
        }
        setCanAccessCreate(true);
      })
      .catch(() => {
        if (!isActive) return;
        router.replace("/review");
        setCanAccessCreate(false);
      });
    return () => {
      isActive = false;
    };
  }, [router]);

  useEffect(() => {
    if (canAccessCreate !== true) return;
    let isActive = true;
    const loadGroups = async () => {
      setLoadingData(true);
      setLoadError(null);
      try {
        const cachedGroups = readApiCache<Group[]>(API_GROUPS_CACHE_KEY);
        if (cachedGroups) {
          if (isActive) setGroups(cachedGroups);
          return;
        }
        const response = await fetch("/api/groups");
        if (!response.ok) throw new Error("No se pudieron cargar los datos iniciales.");
        const payload = await response.json();
        const nextGroups = payload.data ?? [];
        if (!isActive) return;
        setGroups(nextGroups);
        writeApiCache(API_GROUPS_CACHE_KEY, nextGroups);
      } catch (error) {
        if (isActive) setLoadError(error instanceof Error ? error.message : "No se pudieron cargar los datos iniciales.");
      } finally {
        if (isActive) setLoadingData(false);
      }
    };
    loadGroups();
    return () => {
      isActive = false;
    };
  }, [canAccessCreate]);

  useEffect(() => {
    if (canAccessCreate !== true) return;
    let isActive = true;
    const loadTickets = async () => {
      setLoadingTickets(true);
      setTicketsError(null);
      try {
        const cachedTickets = readApiCache<Ticket[]>(API_TICKETS_CACHE_KEY);
        if (cachedTickets) {
          if (isActive) setTickets(cachedTickets);
          return;
        }
        const response = await fetch("/api/tickets");
        if (!response.ok) throw new Error("No se pudieron cargar los boletos.");
        const payload = await response.json();
        const nextTickets = payload.data ?? [];
        if (!isActive) return;
        setTickets(nextTickets);
        writeApiCache(API_TICKETS_CACHE_KEY, nextTickets);
      } catch (error) {
        if (isActive) setTicketsError(error instanceof Error ? error.message : "No se pudieron cargar los boletos.");
      } finally {
        if (isActive) setLoadingTickets(false);
      }
    };
    loadTickets();
    return () => {
      isActive = false;
    };
  }, [canAccessCreate]);

  return {
    groups,
    tickets,
    loadingData,
    loadError,
    loadingTickets,
    ticketsError,
    canAccessCreate,
    refreshInitialData,
  };
}
