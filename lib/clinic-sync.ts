import { getSupabaseClient } from "@/lib/supabase";

export const clinicCollections = ["patients", "doctors", "expenses"] as const;
export type ClinicCollection = (typeof clinicCollections)[number];

export interface ClinicRecord {
  id: string;
  _syncUpdatedAt: number;
  [key: string]: unknown;
}

interface PendingChange {
  collection: ClinicCollection;
  recordId: string;
  updatedAt: number;
  deleted: boolean;
  payload: ClinicRecord | null;
}

interface RemoteRecord {
  collection: ClinicCollection;
  record_id: string;
  payload: ClinicRecord | null;
  updated_at: string;
  deleted_at: string | null;
}

const LEGACY_OUTBOX_KEY = "clinic:sync:outbox";
const LEGACY_MIGRATION_KEY = "clinic:sync:legacy-migration";

function activeClinicId() {
  return localStorage.getItem("clinic:active-id");
}

function recordsKey(collection: ClinicCollection) {
  const clinicId = activeClinicId();
  return clinicId ? `clinic:${clinicId}:records:${collection}` : null;
}

function outboxKey() {
  const clinicId = activeClinicId();
  return clinicId ? `clinic:${clinicId}:sync:outbox` : null;
}

function migrationKey() {
  const clinicId = activeClinicId();
  return clinicId ? `clinic:${clinicId}:sync:legacy-migration` : null;
}

function writeLocalRecords(collection: ClinicCollection, records: ClinicRecord[]) {
  const key = recordsKey(collection);
  if (!key) throw new Error("Sign in to a clinic before accessing its local data.");
  localStorage.setItem(key, JSON.stringify(records));
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function payloadWithoutSyncTime(record: ClinicRecord) {
  const payload: Record<string, unknown> = { ...record };
  delete payload._syncUpdatedAt;
  return JSON.stringify(payload);
}

function normalizeRecord(
  collection: ClinicCollection,
  value: unknown,
  index: number,
): ClinicRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${collection} record at position ${index}.`);
  }

  const record = value as Record<string, unknown>;
  const id =
    typeof record.id === "string" || typeof record.id === "number"
      ? String(record.id)
      : `legacy-${stableHash(`${collection}:${index}:${JSON.stringify(record)}`)}`;
  const syncTime =
    typeof record._syncUpdatedAt === "number"
      ? record._syncUpdatedAt
      : Date.now();

  return { ...record, id, _syncUpdatedAt: syncTime };
}

export function readLocalRecords<T extends object = ClinicRecord>(
  collection: ClinicCollection,
): T[] {
  if (typeof window === "undefined") return [];

  const key = recordsKey(collection);
  if (!key) return [];
  const stored = localStorage.getItem(key);
  if (!stored) return [];

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    throw new Error(`Local ${collection} data must be an array.`);
  }

  const records = parsed.map((value, index) =>
    normalizeRecord(collection, value, index),
  );
  if (JSON.stringify(parsed) !== JSON.stringify(records)) {
    localStorage.setItem(key, JSON.stringify(records));
  }

  return records as T[];
}

function readOutbox(): PendingChange[] {
  const key = outboxKey();
  if (!key) return [];
  const stored = localStorage.getItem(key);
  if (!stored) return [];

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    throw new Error("The local sync queue is invalid.");
  }
  return parsed as PendingChange[];
}

function writeOutbox(changes: PendingChange[]) {
  const key = outboxKey();
  if (!key) throw new Error("Sign in to a clinic before saving sync changes.");
  localStorage.setItem(key, JSON.stringify(changes));
}

function queueChange(changes: PendingChange[], change: PendingChange) {
  return [
    ...changes.filter(
      (pending) =>
        pending.collection !== change.collection ||
        pending.recordId !== change.recordId,
    ),
    change,
  ];
}

function signalSyncNeeded() {
  window.dispatchEvent(new Event("clinic-sync-needed"));
}

export function saveLocalRecords(
  collection: ClinicCollection,
  values: object[],
) {
  const previous = readLocalRecords(collection);
  const previousById = new Map(previous.map((record) => [record.id, record]));
  const next = values.map((value, index) => {
    const record = normalizeRecord(collection, value, index);
    const oldRecord = previousById.get(record.id);
    const changed =
      !oldRecord ||
      payloadWithoutSyncTime(oldRecord) !== payloadWithoutSyncTime(record);
    const updatedAt =
      oldRecord && !changed
        ? oldRecord._syncUpdatedAt
        : Math.max(Date.now(), (oldRecord?._syncUpdatedAt ?? 0) + 1);
    return { ...record, _syncUpdatedAt: updatedAt };
  });
  const nextIds = new Set(next.map((record) => record.id));

  writeLocalRecords(collection, next);

  let outbox = readOutbox();
  for (const record of next) {
    const oldRecord = previousById.get(record.id);
    if (
      !oldRecord ||
      payloadWithoutSyncTime(oldRecord) !== payloadWithoutSyncTime(record)
    ) {
      outbox = queueChange(outbox, {
        collection,
        recordId: record.id,
        updatedAt: record._syncUpdatedAt,
        deleted: false,
        payload: record,
      });
    }
  }

  for (const record of previous) {
    if (!nextIds.has(record.id)) {
      outbox = queueChange(outbox, {
        collection,
        recordId: record.id,
        updatedAt: Math.max(Date.now(), record._syncUpdatedAt + 1),
        deleted: true,
        payload: null,
      });
    }
  }

  writeOutbox(outbox);
  signalSyncNeeded();
  return next;
}

export function getLegacyDataSummary() {
  return Object.fromEntries(
    clinicCollections.map((collection) => {
      const stored = localStorage.getItem(collection);
      if (!stored) return [collection, 0];
      const records: unknown = JSON.parse(stored);
      if (!Array.isArray(records)) {
        throw new Error(`Local ${collection} data must be an array.`);
      }
      return [collection, records.length];
    }),
  ) as Record<ClinicCollection, number>;
}

export function hasLegacyDataToMigrate() {
  for (const collection of clinicCollections) {
    const stored = localStorage.getItem(collection);
    if (!stored) continue;
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      throw new Error(`Local ${collection} data must be an array.`);
    }
    if (parsed.length > 0) return true;
  }
  const legacyOutbox = localStorage.getItem(LEGACY_OUTBOX_KEY);
  if (!legacyOutbox) return false;
  const parsed: unknown = JSON.parse(legacyOutbox);
  if (!Array.isArray(parsed)) {
    throw new Error("The old local sync queue is invalid.");
  }
  return parsed.length > 0;
}

export function queueLegacyDataMigration() {
  let outbox = readOutbox();
  for (const collection of clinicCollections) {
    const stored = localStorage.getItem(collection);
    if (!stored) continue;
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      throw new Error(`Local ${collection} data must be an array.`);
    }
    const records = parsed.map((value, index) =>
      normalizeRecord(collection, value, index),
    );
    writeLocalRecords(collection, records);
    for (const record of records) {
      outbox = queueChange(outbox, {
        collection,
        recordId: record.id,
        updatedAt: record._syncUpdatedAt,
        deleted: false,
        payload: record,
      });
    }
  }

  const legacyOutbox = localStorage.getItem(LEGACY_OUTBOX_KEY);
  if (legacyOutbox) {
    const parsed: unknown = JSON.parse(legacyOutbox);
    if (!Array.isArray(parsed)) {
      throw new Error("The old local sync queue is invalid.");
    }
    for (const change of parsed as PendingChange[]) {
      if (
        clinicCollections.includes(change.collection) &&
        typeof change.recordId === "string" &&
        typeof change.updatedAt === "number"
      ) {
        outbox = queueChange(outbox, change);
      }
    }
    localStorage.removeItem(LEGACY_OUTBOX_KEY);
  }

  writeOutbox(outbox);
  const key = migrationKey();
  if (!key) throw new Error("Sign in to a clinic before migrating local data.");
  localStorage.setItem(key, "pending");
  for (const collection of clinicCollections) {
    localStorage.removeItem(collection);
  }
  localStorage.removeItem(LEGACY_MIGRATION_KEY);
  signalSyncNeeded();
}

export function isLegacyMigrationPending() {
  const key = migrationKey();
  return key ? localStorage.getItem(key) === "pending" : false;
}

export function hasLegacyMigrationCompleted() {
  const key = migrationKey();
  return key ? localStorage.getItem(key) === "complete" : false;
}

export function getStationId() {
  const clinicId = activeClinicId();
  if (!clinicId) throw new Error("Sign in to a clinic before issuing queue numbers.");
  const key = `clinic:station-id:${clinicId}`;
  let stationId = localStorage.getItem(key);
  if (!stationId) {
    stationId = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
    localStorage.setItem(key, stationId);
  }
  return stationId;
}

export function getPendingChangesCount() {
  return readOutbox().length;
}

function mergeRemoteRecords(
  collection: ClinicCollection,
  remoteRecords: RemoteRecord[],
  pendingChanges: PendingChange[],
) {
  const pendingIds = new Set(
    pendingChanges
      .filter((change) => change.collection === collection)
      .map((change) => change.recordId),
  );
  const records = new Map(
    readLocalRecords(collection).map((record) => [record.id, record]),
  );
  let outbox = pendingChanges;

  for (const remote of remoteRecords) {
    if (remote.collection !== collection || pendingIds.has(remote.record_id)) {
      continue;
    }

    const current = records.get(remote.record_id);
    const remoteTime = Date.parse(remote.updated_at);
    if (!Number.isFinite(remoteTime)) {
      throw new Error(`Invalid update time for record ${remote.record_id}.`);
    }

    if (remote.deleted_at) {
      if (!current || current._syncUpdatedAt <= remoteTime) {
        records.delete(remote.record_id);
      } else {
        outbox = queueChange(outbox, {
          collection,
          recordId: current.id,
          updatedAt: current._syncUpdatedAt,
          deleted: false,
          payload: current,
        });
      }
      continue;
    }

    if (!remote.payload) {
      throw new Error(`Missing payload for record ${remote.record_id}.`);
    }

    if (!current || remoteTime > current._syncUpdatedAt) {
      records.set(remote.record_id, {
        ...remote.payload,
        id: remote.record_id,
        _syncUpdatedAt: remoteTime,
      });
    } else if (current._syncUpdatedAt > remoteTime) {
      outbox = queueChange(outbox, {
        collection,
        recordId: current.id,
        updatedAt: current._syncUpdatedAt,
        deleted: false,
        payload: current,
      });
    }
  }

  writeLocalRecords(collection, [...records.values()]);
  return outbox;
}

export async function syncClinicData() {
  if (typeof navigator === "undefined" || !navigator.onLine) return false;

  const supabase = getSupabaseClient();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session) return false;

  const { data: workspaceData, error: workspaceError } =
    await supabase.rpc("get_workspace_context");
  if (workspaceError) throw workspaceError;
  const workspace = Array.isArray(workspaceData)
    ? workspaceData[0]
    : workspaceData;
  if (
    !workspace ||
    (workspace.subscription_status !== "active" &&
      workspace.subscription_status !== "trialing")
  ) {
    return false;
  }
  if (typeof workspace.clinic_id !== "string") {
    throw new Error("The signed-in clinic context is invalid.");
  }
  localStorage.setItem("clinic:active-id", workspace.clinic_id);

  let outbox = readOutbox();
  if (outbox.length > 0) {
    const { error } = await supabase.rpc("sync_clinic_records", {
      p_records: outbox.map((change) => ({
        collection: change.collection,
        record_id: change.recordId,
        payload: change.payload,
        updated_at: new Date(change.updatedAt).toISOString(),
        deleted_at: change.deleted
          ? new Date(change.updatedAt).toISOString()
          : null,
      })),
    });
    if (error) throw error;

    const sent = new Set(
      outbox.map(
        (change) =>
          `${change.collection}:${change.recordId}:${change.updatedAt}`,
      ),
    );
    outbox = readOutbox().filter(
      (change) =>
        !sent.has(
          `${change.collection}:${change.recordId}:${change.updatedAt}`,
        ),
    );
    writeOutbox(outbox);
  }

  const remoteRecords: RemoteRecord[] = [];
  const pageSize = 1000;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from("clinic_records")
      .select("collection, record_id, payload, updated_at, deleted_at")
      .range(start, start + pageSize - 1);
    if (error) throw error;

    const page = (data ?? []) as RemoteRecord[];
    remoteRecords.push(...page);
    if (page.length < pageSize) break;
  }

  for (const collection of clinicCollections) {
    outbox = mergeRemoteRecords(collection, remoteRecords, outbox);
  }
  writeOutbox(outbox);
  window.dispatchEvent(new Event("clinic-data-updated"));

  if (isLegacyMigrationPending() && outbox.length === 0) {
    const key = migrationKey();
    if (key) localStorage.setItem(key, "complete");
  }
  return true;
}
