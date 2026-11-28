import { getSupabaseClient } from "@/lib/supabase";

const PROFILE_CACHE_KEY = "clinic:auth-profile";

export interface AppProfile {
  id: string;
  email: string;
  username: string;
  fullName: string;
  role: "admin" | "employee";
  clinicId: string;
  clinicCode: string;
  clinicName: string;
  clinicPhone: string;
  clinicAddress: string;
  clinicLogoUrl: string | null;
  subscriptionStatus: string;
  planType: "monthly" | "yearly";
  seatCount: number;
  subscriptionPeriodEnd: string | null;
}

interface DatabaseProfile {
  id: string;
  email: string;
  username: string;
  clinic_id: string;
  full_name: string;
  role: "admin" | "employee";
  is_active: boolean;
}

interface WorkspaceContext {
  clinic_id: string;
  clinic_code: string;
  clinic_name: string;
  clinic_phone: string;
  clinic_address: string;
  clinic_logo_url: string | null;
  subscription_status: string;
  plan_type: "monthly" | "yearly";
  seat_count: number;
  subscription_period_end: string | null;
}

function isNetworkError(error: unknown) {
  return (
    error instanceof TypeError ||
    (error instanceof Error &&
      ["AuthRetryableFetchError", "FetchError"].includes(error.name))
  );
}

export function getCachedProfile(): AppProfile | null {
  if (typeof window === "undefined") return null;

  const cached = localStorage.getItem(PROFILE_CACHE_KEY);
  if (!cached) return null;

  const profile: unknown = JSON.parse(cached);
  if (
    !profile ||
    typeof profile !== "object" ||
    !("id" in profile) ||
    !("email" in profile) ||
    !("fullName" in profile) ||
    !("role" in profile) ||
    (profile.role !== "admin" && profile.role !== "employee")
  ) {
    throw new Error("The cached user profile is invalid.");
  }

  const cachedProfile = profile as Partial<AppProfile>;
  if (
    typeof cachedProfile.id !== "string" ||
    typeof cachedProfile.email !== "string" ||
    typeof cachedProfile.fullName !== "string" ||
    (cachedProfile.role !== "admin" && cachedProfile.role !== "employee")
  ) {
    return null;
  }

  return {
    id: cachedProfile.id,
    email: cachedProfile.email,
    username: cachedProfile.username ?? cachedProfile.email,
    fullName: cachedProfile.fullName,
    role: cachedProfile.role,
    clinicId: cachedProfile.clinicId ?? "",
    clinicCode: cachedProfile.clinicCode ?? "",
    clinicName: cachedProfile.clinicName ?? "المركز الطبي",
    clinicPhone: cachedProfile.clinicPhone ?? "",
    clinicAddress: cachedProfile.clinicAddress ?? "",
    clinicLogoUrl: cachedProfile.clinicLogoUrl ?? null,
    subscriptionStatus: cachedProfile.subscriptionStatus ?? "pending",
    planType: cachedProfile.planType === "yearly" ? "yearly" : "monthly",
    seatCount: cachedProfile.seatCount ?? 1,
    subscriptionPeriodEnd: cachedProfile.subscriptionPeriodEnd ?? null,
  };
}

export function cacheProfile(profile: AppProfile) {
  localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
  localStorage.setItem("clinic:active-id", profile.clinicId);
  localStorage.setItem("userRole", profile.role);
  localStorage.setItem("userName", profile.fullName);
}

export function clearCachedProfile() {
  localStorage.removeItem(PROFILE_CACHE_KEY);
  localStorage.removeItem("clinic:active-id");
  localStorage.removeItem("userRole");
  localStorage.removeItem("userName");
  localStorage.removeItem("loginTime");
}

export async function getCurrentProfile(): Promise<AppProfile | null> {
  const cached = getCachedProfile();
  if (typeof navigator !== "undefined" && !navigator.onLine) return cached;

  const supabase = getSupabaseClient();
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      if (cached && isNetworkError(userError)) return cached;
      throw userError;
    }
    if (!user) {
      clearCachedProfile();
      return null;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, username, clinic_id, full_name, role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      if (cached && isNetworkError(error)) return cached;
      throw error;
    }

    const profile = data as DatabaseProfile | null;
    if (
      !profile ||
      !profile.is_active ||
      !profile.clinic_id ||
      (profile.role !== "admin" && profile.role !== "employee")
    ) {
      clearCachedProfile();
      return null;
    }

    const { data: workspaceData, error: workspaceError } =
      await supabase.rpc("get_workspace_context");
    if (workspaceError) {
      if (cached && isNetworkError(workspaceError)) return cached;
      throw workspaceError;
    }

    const workspace = (
      Array.isArray(workspaceData) ? workspaceData[0] : workspaceData
    ) as WorkspaceContext | null;
    if (!workspace || workspace.clinic_id !== profile.clinic_id) {
      clearCachedProfile();
      return null;
    }

    const currentProfile: AppProfile = {
      id: profile.id,
      email: profile.email,
      username: profile.username,
      fullName: profile.full_name || profile.email,
      role: profile.role,
      clinicId: workspace.clinic_id,
      clinicCode: workspace.clinic_code,
      clinicName: workspace.clinic_name,
      clinicPhone: workspace.clinic_phone,
      clinicAddress: workspace.clinic_address,
      clinicLogoUrl: workspace.clinic_logo_url,
      subscriptionStatus: workspace.subscription_status,
      planType: workspace.plan_type,
      seatCount: workspace.seat_count,
      subscriptionPeriodEnd: workspace.subscription_period_end,
    };
    cacheProfile(currentProfile);
    return currentProfile;
  } catch (error) {
    if (cached && isNetworkError(error)) return cached;
    throw error;
  }
}
