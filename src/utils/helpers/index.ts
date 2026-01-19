import labels from "@/src/assets/models/imagenet_labels.json";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { toByteArray } from "base64-js";
import jpeg from "jpeg-js";
import * as MediaLibrary from "expo-media-library";
import {
  FOOD,
  HASH_H,
  HASH_W,
  INPUT_SIZE,
  LOCATION_ROUND_DECIMALS,
  MIN_TOP_SCORE, NATURE, PEOPLE,
  PETS
} from "@/src/constants/clusters";
import { ContentCategory, Group, PhotoItem } from "@/src/flows/MainFlow/screens/ClustersScreen/_types";

export const topK = (arr: Float32Array, k: number) => {
  const items: { index: number; score: number }[] = [];
  for (let i = 0; i < arr.length; i++) items.push({ index: i, score: arr[i] });
  items.sort((a, b) => b.score - a.score);
  return items.slice(0, k);
}

export const labelToCategory = (label: string): ContentCategory => {
  const l = label.toLowerCase();

  if (FOOD.some((w) => l.includes(w))) return "food";
  if (PETS.some((w) => l.includes(w))) return "pets";
  if (NATURE.some((w) => l.includes(w))) return "nature";
  if (PEOPLE.some((w) => l.includes(w))) return "people";
  return "other";
}

export const categoryFromTopFallback = (
  top: { index: number; score: number }[],
  logitsLen: number
): { category: ContentCategory; score: number; usedLabel?: string; usedRank?: number } => {
  const labelsArr = labels as string[];
  const shift = logitsLen === 1001 ? 1 : 0;

  for (let rank = 0; rank < top.length; rank++) {
    const t = top[rank];
    if (!t) continue;
    if (t.score < MIN_TOP_SCORE) continue;

    const idx = t.index - shift;
    if (idx < 0) continue;

    const label = labelsArr?.[idx];
    if (!label) continue;

    const cat = labelToCategory(label);
    if (cat !== "other") {
      return { category: cat, score: t.score, usedLabel: label, usedRank: rank + 1 };
    }
  }

  return { category: "other", score: top[0]?.score ?? 0 };
}

export const uriToFloat32NHWC = async (uri: string, w: number, h: number): Promise<Float32Array> => {
  const size = Math.min(w, h);
  const originX = Math.max(0, Math.floor((w - size) / 2));
  const originY = Math.max(0, Math.floor((h - size) / 2));

  const resized = await ImageManipulator.manipulateAsync(
    uri,
    [
      { crop: { originX, originY, width: size, height: size } },
      { resize: { width: INPUT_SIZE, height: INPUT_SIZE } },
    ],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
  );

  const b64 = await FileSystem.readAsStringAsync(resized.uri, { encoding: "base64" });
  const jpg = toByteArray(b64);
  const decoded = jpeg.decode(jpg, { useTArray: true });

  if (decoded.width !== INPUT_SIZE || decoded.height !== INPUT_SIZE) {
    throw new Error(`Decoded size mismatch: ${decoded.width}x${decoded.height}`);
  }

  const out = new Float32Array(1 * INPUT_SIZE * INPUT_SIZE * 3);
  const data = decoded.data;

  let j = 0;
  for (let i = 0; i < data.length; i += 4) {
    out[j++] = data[i] / 255;
    out[j++] = data[i + 1] / 255;
    out[j++] = data[i + 2] / 255;
  }

  return out;
}

export const uriToDHash64 = async (uri: string, w: number, h: number): Promise<bigint> => {
  const size = Math.min(w, h);
  const originX = Math.max(0, Math.floor((w - size) / 2));
  const originY = Math.max(0, Math.floor((h - size) / 2));

  const resized = await ImageManipulator.manipulateAsync(
    uri,
    [
      { crop: { originX, originY, width: size, height: size } },
      { resize: { width: HASH_W, height: HASH_H } },
    ],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
  );

  const b64 = await FileSystem.readAsStringAsync(resized.uri, { encoding: "base64" });
  const jpg = toByteArray(b64);
  const decoded = jpeg.decode(jpg, { useTArray: true });

  if (decoded.width !== HASH_W || decoded.height !== HASH_H) {
    throw new Error(`dHash decoded size mismatch: ${decoded.width}x${decoded.height}`);
  }

  const data = decoded.data;

  const lum = new Array<number>(HASH_W * HASH_H);
  let p = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    lum[p++] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  let hash = 0n;
  let bit = 0n;
  for (let y = 0; y < HASH_H; y++) {
    for (let x = 0; x < HASH_W - 1; x++) {
      const left = lum[y * HASH_W + x]!;
      const right = lum[y * HASH_W + x + 1]!;
      const v = left < right ? 1n : 0n;
      hash |= v << bit;
      bit++;
    }
  }

  return hash;
}

export const ensureFileUri = async (assetId: string, uri: string): Promise<string> => {
  if (uri.startsWith("file://")) return uri;

  try {
    const info = await MediaLibrary.getAssetInfoAsync(assetId);
    if (info?.localUri && info.localUri.startsWith("file://")) return info.localUri;
  } catch {
  }

  const tmp = await ImageManipulator.manipulateAsync(uri, [], {
    compress: 1,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return tmp.uri;
}

export const dayKeyFromSec = (sec?: number) => {
  if (!sec) return "unknown_day";
  const d = new Date(sec * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const formatDayTitle = (dayKey: string) => {
  if (dayKey === "unknown_day") return "Unknown day";
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export const clusterByDay = (items: PhotoItem[]): Group[] => {
  const sorted = [...items].sort((a, b) => (b.creationTime ?? 0) - (a.creationTime ?? 0));
  const map = new Map<string, PhotoItem[]>();

  for (const p of sorted) {
    const k = dayKeyFromSec(p.creationTime);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(p);
  }

  const keys = Array.from(map.keys()).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

  return keys.map((k) => ({
    key: `day_${k}`,
    title: `${formatDayTitle(k)}`,
    items: map.get(k)!,
  }));
}

export const clusterBySemantic = (items: PhotoItem[]): Group[] => {
  const map: Record<ContentCategory, PhotoItem[]> = {
    nature: [],
    food: [],
    pets: [],
    people: [],
    other: [],
  };

  for (const p of items) map[p.category ?? "other"].push(p);

  const order: ContentCategory[] = ["people", "pets", "food", "nature", "other"];

  return order.map((k) => ({
    key: `sem_${k}`,
    title:
      k === "nature"
        ? "Nature"
        : k === "food"
          ? "Food"
          : k === "pets"
            ? "Pets"
            : k === "people"
              ? "People"
              : "Other / Unclassified",
    items: map[k].slice().sort((a, b) => (b.creationTime ?? 0) - (a.creationTime ?? 0)),
  }));
}

export const roundTo = (x: number, decimals: number) => {
  const p = Math.pow(10, decimals);
  return Math.round(x * p) / p;
}

export const locationKeyFromLatLon = (lat: number, lon: number) => {
  const rLat = roundTo(lat, LOCATION_ROUND_DECIMALS);
  const rLon = roundTo(lon, LOCATION_ROUND_DECIMALS);
  return `${rLat.toFixed(LOCATION_ROUND_DECIMALS)},${rLon.toFixed(LOCATION_ROUND_DECIMALS)}`;
}

export const niceCityTitle = (city?: string, region?: string, country?: string) => {
  const parts = [city, region, country].filter(Boolean);
  if (!parts.length) return "Unknown place";
  if (city && country) return `${city}, ${country}`;
  return parts.join(", ");
}

export const normalizePlaceName = (s: string) => {
  return (s || "")
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const clusterByLocation = (
  items: PhotoItem[],
  locMap: Map<string, { lat: number; lon: number } | null>,
  cityNameByLocKey: Map<string, string>
): Group[] => {
  const buckets = new Map<string, PhotoItem[]>();

  for (const p of items) {
    const loc = locMap.get(p.id);
    const key = loc ? `loc_${locationKeyFromLatLon(loc.lat, loc.lon)}` : "loc_unknown";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(p);
  }

  const merged = new Map<
    string,
    { title: string; items: PhotoItem[]; newest: number; isUnknown: boolean }
  >();

  for (const [k, bucket] of buckets.entries()) {
    const sorted = bucket.slice().sort((a, b) => (b.creationTime ?? 0) - (a.creationTime ?? 0));

    let title = "No location";
    let mergeKey = "loc_unknown";
    let isUnknown = true;

    if (k !== "loc_unknown") {
      title = cityNameByLocKey.get(k) ?? k.replace("loc_", "Location: ");
      mergeKey = `locm_${normalizePlaceName(title)}`;
      isUnknown = false;
    }

    const newest = sorted[0]?.creationTime ?? 0;

    const existing = merged.get(mergeKey);
    if (!existing) {
      merged.set(mergeKey, { title, items: sorted, newest, isUnknown });
    } else {
      existing.items.push(...sorted);
      existing.newest = Math.max(existing.newest, newest);
    }
  }

  const groups: Group[] = Array.from(merged.entries()).map(([mergeKey, v]) => {
    const allSorted = v.items.slice().sort((a, b) => (b.creationTime ?? 0) - (a.creationTime ?? 0));
    return {
      key: mergeKey,
      title: `${v.title} • ${allSorted.length}`,
      items: allSorted,
    };
  });

  groups.sort((a, b) => {
    const aUnknown = a.key === "loc_unknown";
    const bUnknown = b.key === "loc_unknown";
    if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;

    const aT = a.items[0]?.creationTime ?? 0;
    const bT = b.items[0]?.creationTime ?? 0;
    return bT - aT;
  });

  return groups;
}

export const clusterByDayThenLocation = (
  items: PhotoItem[],
  locMap: Map<string, { lat: number; lon: number } | null>,
  cityNameByLocKey: Map<string, string>
): Group[] => {
  const dayGroups = clusterByDay(items);
  const out: Group[] = [];

  for (const dg of dayGroups) {
    const locGroups = clusterByLocation(dg.items, locMap, cityNameByLocKey);
    for (const lg of locGroups) {
      out.push({
        key: `dl_${dg.key}__${lg.key}`,
        title: `${dg.title} • ${lg.title}`,
        items: lg.items,
      });
    }
  }

  return out;
}

export const formatTimeRangeTitle = (items: PhotoItem[]) => {
  const sorted = items
    .slice()
    .sort((a, b) => (a.creationTime ?? 0) - (b.creationTime ?? 0));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const a = first?.creationTime ? new Date(first.creationTime * 1000) : null;
  const b = last?.creationTime ? new Date(last.creationTime * 1000) : null;

  if (!a) return "Unknown time";
  const day = a.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const t1 = a.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const t2 = b ? b.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
  return `${day} ${t1}${t2 ? "–" + t2 : ""}`;
}


export const clusterByTimeOnly = (items: PhotoItem[], gapSec = 20): Group[] => {
  const normSec = (t?: number) => {
    if (!t) return 0;
    return t > 1e12 ? Math.floor(t / 1000) : t;
  };

  const sorted = items
    .slice()
    .filter((p) => normSec(p.creationTime) > 0)
    .sort((a, b) => normSec(a.creationTime) - normSec(b.creationTime));

  const clusters: PhotoItem[][] = [];
  let cur: PhotoItem[] = [];

  const flush = () => {
    if (cur.length >= 2) clusters.push(cur);
    cur = [];
  };

  for (const p of sorted) {
    if (!cur.length) {
      cur.push(p);
      continue;
    }

    const prev = cur[cur.length - 1]!;
    const gap = normSec(p.creationTime) - normSec(prev.creationTime);

    if (gap <= gapSec) cur.push(p);
    else {
      flush();
      cur.push(p);
    }
  }
  flush();

  const groups: Group[] = clusters.map((sc, i) => {
    const show = sc.slice().sort((a, b) => normSec(b.creationTime) - normSec(a.creationTime));
    return {
      key: `time_${i}`,
      title: `Burst: ${formatTimeRangeTitle(sc)}`,
      items: show,
    };
  });

  groups.sort(
    (a, b) => normSec(b.items[0]?.creationTime) - normSec(a.items[0]?.creationTime)
  );
  return groups;
}

export const clusterByAlbums = (albumBuckets: Map<string, { title: string; items: PhotoItem[] }>): Group[] => {
  const groups: Group[] = [];
  for (const [id, v] of albumBuckets.entries()) {
    const sorted = v.items.slice().sort((a, b) => (b.creationTime ?? 0) - (a.creationTime ?? 0));
    groups.push({
      key: `alb_${id}`,
      title: `${v.title}`,
      items: sorted,
    });
  }

  groups.sort((a, b) => b.items.length - a.items.length);

  return groups;
}


export const toSec = (t?: number | null) => {
  if (!t) return undefined;
  return t > 1e12 ? Math.floor(t / 1000) : t;
}

export const parseLatLon = (loc: any): { lat: number; lon: number } | null => {
  if (!loc) return null;
  const latRaw = loc.latitude;
  const lonRaw = loc.longitude;

  const lat = typeof latRaw === "number" ? latRaw : Number(latRaw);
  const lon = typeof lonRaw === "number" ? lonRaw : Number(lonRaw);

  const ok =
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180;

  return ok ? { lat, lon } : null;
}


export const preferAlbumTitle = (t: string) => {
  const s = (t || "").toLowerCase();
  if (s.includes("screenshot")) return 0;
  if (s === "camera" || s.includes("dcim")) return 1;
  if (s.includes("whatsapp")) return 2;
  if (s.includes("telegram")) return 3;
  if (s.includes("download")) return 4;
  if (s.includes("instagram")) return 5;
  return 10;
};
