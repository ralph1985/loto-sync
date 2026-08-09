"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { loadGroupsAndTickets } from "@/features/tickets/data";
import type { Group, Ticket } from "@/features/tickets/types";
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
      const { groups: nextGroups, tickets: nextTickets } = await loadGroupsAndTickets(true);
      setGroups(nextGroups);
      setTickets(nextTickets);
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
    const loadInitialData = async () => {
      setLoadingData(true);
      setLoadingTickets(true);
      setLoadError(null);
      setTicketsError(null);
      try {
        const { groups: nextGroups, tickets: nextTickets } = await loadGroupsAndTickets();
        if (!isActive) return;
        setGroups(nextGroups);
        setTickets(nextTickets);
      } catch (error) {
        if (isActive) {
          const message = error instanceof Error ? error.message : "No se pudieron cargar los datos iniciales.";
          setLoadError(message);
          setTicketsError(message);
        }
      } finally {
        if (isActive) {
          setLoadingData(false);
          setLoadingTickets(false);
        }
      }
    };
    loadInitialData();
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
