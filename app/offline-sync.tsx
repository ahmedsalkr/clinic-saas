"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  getPendingChangesCount,
  syncClinicData,
} from "@/lib/clinic-sync";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

type SyncStatus = "idle" | "offline" | "setup" | "syncing" | "synced" | "error";

interface SyncState {
  status: SyncStatus;
  message: string;
}

let syncState: SyncState = { status: "idle", message: "" };
let syncInFlight: Promise<void> | null = null;
const syncListeners = new Set<() => void>();
const offlineSnapshot: SyncState = { status: "offline", message: "" };
const idleSnapshot: SyncState = { status: "idle", message: "" };

function getSnapshot() {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return offlineSnapshot;
  }
  return syncState;
}

function getServerSnapshot(): SyncState {
  return idleSnapshot;
}

function updateSyncState(status: SyncStatus, message = "") {
  syncState = { status, message };
  syncListeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  syncListeners.add(listener);
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    syncListeners.delete(listener);
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

async function runSync() {
  if (typeof navigator === "undefined" || !navigator.onLine) {
    updateSyncState("offline");
    return;
  }
  if (!isSupabaseConfigured()) {
    updateSyncState("setup");
    return;
  }
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    updateSyncState("syncing");
    try {
      const synced = await syncClinicData();
      if (!synced) {
        updateSyncState("idle");
        return;
      }

      const pendingCount = getPendingChangesCount();
      updateSyncState(
        pendingCount === 0 ? "synced" : "error",
        pendingCount === 0
          ? ""
          : `${pendingCount} تغييرًا ما زال في انتظار المزامنة.`,
      );
    } catch (error) {
      console.error("Clinic data synchronization failed.", error);
      updateSyncState(
        "error",
        error instanceof Error ? error.message : "حدث خطأ غير معروف.",
      );
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

function getStatusText(state: SyncState) {
  switch (state.status) {
    case "offline":
      return "غير متصل — التغييرات محفوظة محليًا وستُزامن عند عودة الاتصال.";
    case "setup":
      return "المزامنة غير مهيأة. أضف إعدادات Supabase إلى ملف البيئة.";
    case "syncing":
      return "جارٍ مزامنة البيانات...";
    case "synced":
      return "تمت مزامنة البيانات.";
    case "error":
      return `تعذرت المزامنة: ${state.message}`;
    default:
      return "";
  }
}

export default function OfflineSync() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      updateSyncState("setup");
      return;
    }

    const handleSync = () => {
      void runSync();
    };
    const handleAuthChange = () => {
      window.setTimeout(handleSync, 0);
    };
    const supabase = getSupabaseClient();
    const { data } = supabase.auth.onAuthStateChange(handleAuthChange);

    window.addEventListener("online", handleSync);
    window.addEventListener("clinic-sync-needed", handleSync);
    window.addEventListener("focus", handleSync);
    handleSync();

    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener("online", handleSync);
      window.removeEventListener("clinic-sync-needed", handleSync);
      window.removeEventListener("focus", handleSync);
    };
  }, []);

  const text = getStatusText(state);
  if (!text) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-3 left-3 z-50 max-w-sm rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg"
    >
      {text}
    </div>
  );
}
