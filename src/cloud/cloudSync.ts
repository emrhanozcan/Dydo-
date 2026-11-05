import type { PrmOrder, ReportOrderRecord, Vehicle } from "../shared/types";
import { getState, updateState } from "../storage/storage";

export interface SupabaseConfig {
  supabaseUrl: string;
  anonKey: string;
  email?: string;
  password?: string;
}

export function getSupabaseConfig(): SupabaseConfig {
  const env = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env : {} as Record<string, string>;
  return {
    supabaseUrl: (env.VITE_SUPABASE_URL || "").replace(/\/$/, ""),
    anonKey: env.VITE_SUPABASE_ANON_KEY || "",
    email: env.VITE_CLOUD_EMAIL || "",
    password: env.VITE_CLOUD_PASSWORD || "",
  };
}

export function isCloudConfigured(): boolean {
  const config = getSupabaseConfig();
  return Boolean(config.supabaseUrl && config.anonKey && !config.anonKey.includes("YOUR_"));
}

export async function initializeCloudSync(): Promise<void> {
  if (!isCloudConfigured()) return;
  const state = await getState();
  // Sadece daha önce giriş yapılmışsa senkronizasyonu aktif tut
  if (state.cloudAccount?.isLoggedIn) {
    await updateState((s) => {
      s.cloudAccount.syncStatus = "connected";
      s.cloudAccount.autoSync = true;
    });
  }
}

function getHeaders(anonKey: string): HeadersInit {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates",
  };
}

export async function loginCloud(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    const config = getSupabaseConfig();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();

    // Mobil uygulama ile birebir aynı giriş bilgileri kontrolü
    const validEmail = (config.email || "emirhnnozcn@gmail.com").toLowerCase();
    const validPassword = config.password || "78783434Eo!!";

    if (cleanEmail !== validEmail || cleanPass !== validPassword) {
      return { success: false, error: "Girdiğiniz e-posta veya şifre hatalı!" };
    }

    await updateState((s) => {
      s.cloudAccount.syncStatus = "syncing";
    });

    // Supabase bağlantısını test et
    if (config.supabaseUrl && config.anonKey && !config.anonKey.includes("YOUR_")) {
      try {
        const testRes = await fetch(`${config.supabaseUrl}/rest/v1/orders?select=id&limit=1`, {
          method: "GET",
          headers: getHeaders(config.anonKey),
        });
        if (!testRes.ok) {
          const errText = await testRes.text();
          console.warn("[PRM Supabase] Test ping failed:", errText);
        }
      } catch (err) {
        console.warn("[PRM Supabase] Connection test network error:", err);
      }
    }

    await updateState((s) => {
      s.cloudAccount.isLoggedIn = true;
      s.cloudAccount.email = cleanEmail;
      s.cloudAccount.syncStatus = "connected";
      s.cloudAccount.autoSync = true;
      s.cloudAccount.lastSyncAt = Date.now();
      s.cloudAccount.lastError = undefined;
    });

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await updateState((s) => {
      s.cloudAccount.syncStatus = "error";
      s.cloudAccount.lastError = errorMsg;
    });
    return { success: false, error: errorMsg };
  }
}

export async function logoutCloud(): Promise<void> {
  await updateState((s) => {
    s.cloudAccount.isLoggedIn = false;
    s.cloudAccount.syncStatus = "idle";
    s.cloudAccount.lastError = undefined;
  });
}

export async function syncOrdersToCloud(orders: PrmOrder[]): Promise<boolean> {
  if (!isCloudConfigured() || orders.length === 0) return false;
  const config = getSupabaseConfig();

  // 1. Supabase'deki mevcut aktif (teslim edilmemiş) siparişleri kontrol et:
  // - Mobilde sürücü "Yolda" işaretlemişse bu durumu ezmeden koru
  // - Web ekranından silinmiş/teslim edilmiş siparişleri otomatik "Teslim Edildi" olarak güncelle
  const existingStatuses = new Map<string, string>();
  try {
    const checkRes = await fetch(`${config.supabaseUrl}/rest/v1/orders?status=neq.Teslim%20Edildi&select=id,status`, {
      method: "GET",
      headers: getHeaders(config.anonKey),
    });
    if (checkRes.ok) {
      const existingList = (await checkRes.json()) as Array<{ id: string; status: string }>;
      existingList.forEach((item) => existingStatuses.set(item.id, item.status));

      const currentIdsSet = new Set(orders.map((o) => o.id));
      const missingIds = existingList.map((item) => item.id).filter((id) => !currentIdsSet.has(id));

      if (missingIds.length > 0) {
        // Ekranda artık görünmeyen siparişler teslim edilmiş demektir
        for (let i = 0; i < missingIds.length; i += 20) {
          const batch = missingIds.slice(i, i + 20);
          const filter = `id=in.(${batch.map((id) => `"${encodeURIComponent(id)}"`).join(",")})`;
          await fetch(`${config.supabaseUrl}/rest/v1/orders?${filter}`, {
            method: "PATCH",
            headers: getHeaders(config.anonKey),
            body: JSON.stringify({ status: "Teslim Edildi", updated_at: Date.now() }),
          });
        }
      }
    }
  } catch (err) {
    console.warn("[PRM Supabase] Error syncing delivered orders:", err);
  }

  const payloads = orders.map((order) => {
    // Mobilde "Yolda" yapılmışsa webden gelen "Bekliyor" durumunu ezme
    const existingStatus = existingStatuses.get(order.id);
    let resolvedStatus = order.status || "Bekliyor";
    if (existingStatus === "Yolda" && resolvedStatus === "Bekliyor") {
      resolvedStatus = "Yolda";
    }

    return {
      id: order.id,
      secondary_id: order.secondaryId || "",
      customer_name: order.customerName || "Bilinmeyen Müşteri",
      phone: order.phone || "",
      raw_address: order.rawAddress,
      normalized_address: order.normalizedAddress,
      details: order.details || "",
      amount: order.amount || "",
      payment_type: order.paymentType || "",
      status: resolvedStatus,
      current_vehicle: order.currentVehicle || "Atanmadı",
      created_at: order.createdAt || new Date().toISOString(),
      updated_at: Date.now(),
    };
  });

  try {
    const url = `${config.supabaseUrl}/rest/v1/orders`;
    const response = await fetch(url, {
      method: "POST",
      headers: getHeaders(config.anonKey),
      body: JSON.stringify(payloads),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[PRM Supabase] Error saving orders in bulk:", err);
      return false;
    }

    await updateState((s) => {
      s.cloudAccount.isLoggedIn = true;
      s.cloudAccount.lastSyncAt = Date.now();
      s.cloudAccount.syncedOrdersCount = (s.cloudAccount.syncedOrdersCount || 0) + payloads.length;
      s.cloudAccount.syncStatus = "connected";
    });
    return true;
  } catch (error) {
    console.error("[PRM Supabase] Network error during bulk sync:", error);
    await updateState((s) => {
      s.cloudAccount.lastError = error instanceof Error ? error.message : String(error);
    });
    return false;
  }
}

export async function syncOrderToCloud(order: PrmOrder): Promise<boolean> {
  return syncOrdersToCloud([order]);
}

export async function syncReportsToCloud(reportOrders: Record<string, ReportOrderRecord>, vehicles: Vehicle[]): Promise<boolean> {
  if (!isCloudConfigured()) return false;

  const config = getSupabaseConfig();
  if (!config.supabaseUrl || !config.anonKey || config.anonKey.includes("YOUR_")) {
    return false;
  }

  const ordersList = Object.values(reportOrders);
  const totalRevenue = ordersList.reduce((sum, item) => sum + (item.amountMinor || 0), 0);

  const vehicleStats = vehicles.map((v) => {
    const assignedCount = ordersList.filter((o) => o.vehicleId === v.id).length;
    return { id: v.id, name: v.shortName, count: assignedCount };
  });

  const payload = {
    id: "today",
    total_orders: ordersList.length,
    total_revenue_minor: totalRevenue,
    vehicle_stats: vehicleStats,
    last_updated: Date.now(),
  };

  try {
    const url = `${config.supabaseUrl}/rest/v1/reports`;
    await fetch(url, {
      method: "POST",
      headers: getHeaders(config.anonKey),
      body: JSON.stringify(payload),
    });
    return true;
  } catch (error) {
    console.error("[PRM Supabase] Error syncing reports:", error);
    return false;
  }
}

export async function fetchRemoteAssignmentsFromCloud(): Promise<Array<{ orderId: string; vehicleId: string; vehicleName: string }>> {
  if (!isCloudConfigured()) return [];

  const config = getSupabaseConfig();
  if (!config.supabaseUrl || !config.anonKey || config.anonKey.includes("YOUR_")) {
    return [];
  }

  try {
    const url = `${config.supabaseUrl}/rest/v1/remote_assignments?status=eq.pending&select=*`;
    const res = await fetch(url, {
      method: "GET",
      headers: getHeaders(config.anonKey),
    });

    if (res.ok) {
      const list = await res.json() as Array<{ id: string; order_id: string; vehicle_id: string; vehicle_name?: string }>;
      if (Array.isArray(list) && list.length > 0) {
        // Mark them completed
        for (const item of list) {
          await fetch(`${config.supabaseUrl}/rest/v1/remote_assignments?id=eq.${item.id}`, {
            method: "PATCH",
            headers: getHeaders(config.anonKey),
            body: JSON.stringify({ status: "completed" }),
          });
        }
        return list.map((item) => ({
          orderId: item.order_id,
          vehicleId: item.vehicle_id,
          vehicleName: item.vehicle_name || item.vehicle_id,
        }));
      }
    }
  } catch {
    // ignore polling failures
  }
  return [];
}
