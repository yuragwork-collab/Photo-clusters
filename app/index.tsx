import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import labels from "../../src/assets/models/imagenet_labels.json";

import * as MediaLibrary from "expo-media-library";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";

import * as Location from "expo-location";

import { loadTensorflowModel } from "react-native-fast-tflite";

import { toByteArray } from "base64-js";
import jpeg from "jpeg-js";

import {
  FaceDetectionProvider,
  RNMLKitFaceDetectorOptions,
  useFaceDetection,
} from "@infinitered/react-native-mlkit-face-detection";

const PAGE_SIZE = 60;
const MAX_PHOTOS_TO_CLASSIFY = 60;
const INPUT_SIZE = 224;

const TOPK = 5;

const MIN_TOP_SCORE = 0.07;


const LOCATION_ROUND_DECIMALS = 2;
const MAX_LOCATION_LOOKUPS = 180;

const BURST_GAP_SEC = 5;
const DUP_HAMMING_MAX = 10;
const MAX_PHOTOS_TO_HASH = 120;
const HASH_W = 9;
const HASH_H = 8;

const MAX_ALBUMS = 10;
const MAX_ALBUM_ASSETS = 80;

type ContentCategory = "nature" | "food" | "pets" | "people" | "other";
type ClusterMode = "semantic" | "location" | "day" | "day_location" | "bursts" | "albums";

type PhotoItem = {
  id: string;
  uri: string;
  width: number;
  height: number;
  creationTime?: number;
  category?: ContentCategory;
  confidence?: number;
  top?: { index: number; score: number }[];
  debugLabelTop1?: string;
};

type Group = {
  key: string;
  title: string;
  items: PhotoItem[];
};

function topK(arr: Float32Array, k: number) {
  const items: Array<{ index: number; score: number }> = [];
  for (let i = 0; i < arr.length; i++) items.push({ index: i, score: arr[i] });
  items.sort((a, b) => b.score - a.score);
  return items.slice(0, k);
}

function labelToCategory(label: string): ContentCategory {
  const l = label.toLowerCase();

  const FOOD = [
    "pizza",
    "cheeseburger",
    "hotdog",
    "spaghetti",
    "ice cream",
    "banana",
    "apple",
    "strawberry",
    "coffee",
    "espresso",
    "plate",
    "burrito",
    "sushi",
    "wine",
    "cup",
    "restaurant",
    "menu",
    "guacamole",
    "bagel",
    "pretzel",
    "lemon",
    "orange",
    "pineapple",
    "fig",
    "pomegranate",
    "mushroom",
    "broccoli",
    "cauliflower",
    "cucumber",
    "bell pepper",
    "meat loaf",
    "carbonara",
    "potpie",
    "hot pot",
    "trifle",
    "french loaf",
    "sandwich",
    "ice_lolly",
  ];

  const PETS = [
    "dog",
    "puppy",
    "cat",
    "kitten",
    "tabby",
    "tiger cat",
    "siamese",
    "persian",
    "retriever",
    "labrador",
    "pug",
    "husky",
    "chihuahua",
    "pomeranian",
    "samoyed",
    "dalmatian",
    "golden retriever",
  ];

  const NATURE = [
    "tree",
    "forest",
    "mountain",
    "valley",
    "lakeside",
    "seashore",
    "cliff",
    "volcano",
    "river",
    "waterfall",
    "meadow",
    "coral reef",
    "snow",
    "beach",
    "lake",
    "ocean",
    "sky",
    "alp",
    "promontory",
    "sandbar",
    "geyser",
  ];

  const PEOPLE = [
    "groom",
    "bride",
    "bridegroom",
    "dancer",
    "baby",
    "soldier",
    "police",
    "fireman",
  ];

  if (FOOD.some((w) => l.includes(w))) return "food";
  if (PETS.some((w) => l.includes(w))) return "pets";
  if (NATURE.some((w) => l.includes(w))) return "nature";
  if (PEOPLE.some((w) => l.includes(w))) return "people";
  return "other";
}

function categoryFromTopFallback(
  top: { index: number; score: number }[],
  logitsLen: number
): { category: ContentCategory; score: number; usedLabel?: string; usedRank?: number } {
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

async function uriToFloat32NHWC(uri: string, w: number, h: number): Promise<Float32Array> {
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

function popcount64BigInt(x: bigint) {
  let c = 0;
  let v = x;
  while (v) {
    v &= v - 1n;
    c++;
  }
  return c;
}

function hamming64(a: bigint, b: bigint) {
  return popcount64BigInt(a ^ b);
}

async function uriToDHash64(uri: string, w: number, h: number): Promise<bigint> {
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

/**
 * iOS fix for MLKit: ph:// -> file://
 */
async function ensureFileUri(assetId: string, uri: string): Promise<string> {
  if (uri.startsWith("file://")) return uri;

  try {
    const info = await MediaLibrary.getAssetInfoAsync(assetId);
    if (info?.localUri && info.localUri.startsWith("file://")) return info.localUri;
  } catch {
    // ignore
  }

  const tmp = await ImageManipulator.manipulateAsync(uri, [], {
    compress: 1,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return tmp.uri;
}

function dayKeyFromSec(sec?: number) {
  if (!sec) return "unknown_day";
  const d = new Date(sec * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDayTitle(dayKey: string) {
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

function clusterByDay(items: PhotoItem[]): Group[] {
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

function clusterBySemantic(items: PhotoItem[]): Group[] {
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

function roundTo(x: number, decimals: number) {
  const p = Math.pow(10, decimals);
  return Math.round(x * p) / p;
}

function locationKeyFromLatLon(lat: number, lon: number) {
  const rLat = roundTo(lat, LOCATION_ROUND_DECIMALS);
  const rLon = roundTo(lon, LOCATION_ROUND_DECIMALS);
  return `${rLat.toFixed(LOCATION_ROUND_DECIMALS)},${rLon.toFixed(LOCATION_ROUND_DECIMALS)}`;
}

function niceCityTitle(city?: string, region?: string, country?: string) {
  const parts = [city, region, country].filter(Boolean);
  if (!parts.length) return "Unknown place";
  if (city && country) return `${city}, ${country}`;
  return parts.join(", ");
}

function normalizePlaceName(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clusterByLocation(
  items: PhotoItem[],
  locMap: Map<string, { lat: number; lon: number } | null>,
  cityNameByLocKey: Map<string, string>
): Group[] {
  // 1) групуємо по округлених координатах
  const buckets = new Map<string, PhotoItem[]>();

  for (const p of items) {
    const loc = locMap.get(p.id);
    const key = loc ? `loc_${locationKeyFromLatLon(loc.lat, loc.lon)}` : "loc_unknown";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(p);
  }

  // 2) merge по назві (display title), щоб “Lviv, Ukraine” не дублювалося
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

  // 3) збираємо groups і сортуємо (known first, newest first)
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

// NEW: Day -> Location (flat groups)
function clusterByDayThenLocation(
  items: PhotoItem[],
  locMap: Map<string, { lat: number; lon: number } | null>,
  cityNameByLocKey: Map<string, string>
): Group[] {
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

function formatTimeRangeTitle(items: PhotoItem[]) {
  const sorted = items
    .slice()
    .sort((a, b) => (a.creationTime ?? 0) - (b.creationTime ?? 0)); // old->new
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


function clusterByTimeOnly(items: PhotoItem[], gapSec = 20): Group[] {
  const normSec = (t?: number) => {
    if (!t) return 0;
    return t > 1e12 ? Math.floor(t / 1000) : t; // ms -> sec (s stays s)
  };

  const sorted = items
    .slice()
    .filter((p) => normSec(p.creationTime) > 0)
    .sort((a, b) => normSec(a.creationTime) - normSec(b.creationTime)); // old->new

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

function clusterByAlbums(albumBuckets: Map<string, { title: string; items: PhotoItem[] }>): Group[] {
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

/**
 * ====== INNER SCREEN ======
 */
function IndexInner() {
  const [permission, setPermission] = useState<MediaLibrary.PermissionResponse | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);

  const [modelStatus, setModelStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<ClusterMode>("day");

  // location caches
  const locationCacheRef = useRef<Map<string, { lat: number; lon: number } | null>>(new Map());
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationTick, setLocationTick] = useState(0);

  // city name cache by location bucket key
  const cityCacheRef = useRef<Map<string, string>>(new Map());
  const [cityLoading, setCityLoading] = useState(false);
  const [cityTick, setCityTick] = useState(0);

  // hash cache for duplicates
  const hashCacheRef = useRef<Map<string, bigint | null>>(new Map());
  const [hashLoading, setHashLoading] = useState(false);
  const [hashTick, setHashTick] = useState(0);

  // albums
  const [albumsLoading, setAlbumsLoading] = useState(false);
  const albumBucketsRef = useRef<Map<string, { title: string; items: PhotoItem[] }>>(new Map());
  const [albumsTick, setAlbumsTick] = useState(0);


  const modelRef = useRef<any>(null);

  const faceDetector = useFaceDetection();
  const faceCacheRef = useRef<Map<string, boolean>>(new Map());

  // auto semantic classification state
  const [semanticRunning, setSemanticRunning] = useState(false);
  const [semanticDone, setSemanticDone] = useState(0);
  const cancelSemanticRef = useRef(false);

  async function hasFace(assetId: string, uri: string): Promise<boolean> {
    const cached = faceCacheRef.current.get(assetId);
    if (typeof cached === "boolean") return cached;

    try {
      const fileUri = await ensureFileUri(assetId, uri);
      const result = await faceDetector.detectFaces(fileUri);
      const faces = result?.faces ?? [];
      const ok = Array.isArray(faces) && faces.length > 0;
      faceCacheRef.current.set(assetId, ok);
      return ok;
    } catch {
      faceCacheRef.current.set(assetId, false);
      return false;
    }
  }

  function parseLatLon(loc: any): { lat: number; lon: number } | null {
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

  async function ensureLocationsForVisibleSet(items: PhotoItem[]) {
    let need = 0;
    for (const p of items) if (!locationCacheRef.current.has(p.id)) need++;
    if (need === 0) return;

    const locPerm = await Location.requestForegroundPermissionsAsync();
    console.log("Location perm:", locPerm.status);

    setLocationLoading(true);
    try {
      let lookedUp = 0;

      for (const p of items) {
        if (lookedUp >= MAX_LOCATION_LOOKUPS) break;
        if (locationCacheRef.current.has(p.id)) continue;

        try {
          const info = await MediaLibrary.getAssetInfoAsync(p.id);
          const loc = parseLatLon(info?.location);
          locationCacheRef.current.set(p.id, loc);
        } catch {
          locationCacheRef.current.set(p.id, null);
        }

        lookedUp++;
      }

      setLocationTick((x) => x + 1);
    } finally {
      setLocationLoading(false);
    }
  }

  async function ensureCityNamesForBuckets() {
    const seen = new Set<string>();

    for (const [, loc] of locationCacheRef.current.entries()) {
      if (!loc) continue;
      const key = `loc_${locationKeyFromLatLon(loc.lat, loc.lon)}`;
      seen.add(key);
    }

    const toResolve = Array.from(seen).filter((k) => !cityCacheRef.current.has(k));
    if (!toResolve.length) return;

    setCityLoading(true);
    try {
      for (const k of toResolve) {
        const raw = k.replace("loc_", "");
        const [latStr, lonStr] = raw.split(",");
        const lat = Number(latStr);
        const lon = Number(lonStr);

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          cityCacheRef.current.set(k, k.replace("loc_", "Location: "));
          continue;
        }

        try {
          const res = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
          const first = res?.[0];

          const city = first?.city || first?.subregion || first?.district || first?.name || undefined;
          const region = first?.region || undefined;
          const country = first?.country || undefined;

          const pretty = niceCityTitle(city, region, country);
          cityCacheRef.current.set(k, pretty);
        } catch {
          cityCacheRef.current.set(k, `Location: ${lat.toFixed(2)}, ${lon.toFixed(2)}`);
        }

        setCityTick((x) => x + 1);
      }
    } finally {
      setCityLoading(false);
    }
  }

  async function ensureHashesFor(items: PhotoItem[]) {
    const target = items
      .slice()
      .sort((a, b) => (b.creationTime ?? 0) - (a.creationTime ?? 0))
      .slice(0, MAX_PHOTOS_TO_HASH);

    let need = 0;
    for (const p of target) if (!hashCacheRef.current.has(p.id)) need++;
    if (need === 0) return;

    setHashLoading(true);
    try {
      let done = 0;
      for (const p of target) {
        if (hashCacheRef.current.has(p.id)) continue;

        try {
          const h = await uriToDHash64(p.uri, p.width, p.height);
          hashCacheRef.current.set(p.id, h);
        } catch {
          hashCacheRef.current.set(p.id, null);
        }

        done++;
        if (done % 12 === 0) setHashTick((x) => x + 1);
      }

      setHashTick((x) => x + 1);
    } finally {
      setHashLoading(false);
    }
  }


  function toSec(t?: number | null) {
    if (!t) return undefined;
    return t > 1e12 ? Math.floor(t / 1000) : t;
  }

  async function loadAlbumBuckets() {
    if (!permission?.granted) return;

    setAlbumsLoading(true);
    try {
      const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });

      const prefer = (t: string) => {
        const s = (t || "").toLowerCase();
        console.log(s)
        if (s.includes("screenshot")) return 0;
        if (s === "camera" || s.includes("dcim")) return 1;
        if (s.includes("whatsapp")) return 2;
        if (s.includes("telegram")) return 3;
        if (s.includes("download")) return 4;
        if (s.includes("instagram")) return 5;
        return 10;
      };

      const picked = albums
        .filter((a) => (a.assetCount ?? 0) > 0)
        .slice()
        .sort((a, b) => {
          const pa = prefer(a.title);
          const pb = prefer(b.title);
          if (pa !== pb) return pa - pb;
          return (b.assetCount ?? 0) - (a.assetCount ?? 0);
        })
        .slice(0, MAX_ALBUMS);

      const buckets = new Map<string, { title: string; items: PhotoItem[] }>();

      for (const alb of picked) {
        const res = await MediaLibrary.getAssetsAsync({
          album: alb,
          mediaType: "photo",
          first: MAX_ALBUM_ASSETS,
          sortBy: [MediaLibrary.SortBy.creationTime],
        });

        const items: PhotoItem[] = res.assets
          .map((a) => ({
            id: a.id,
            uri: a.uri,
            width: a.width,
            height: a.height,
            creationTime: toSec(a.creationTime),
          }))
          .reverse();

        buckets.set(alb.id, { title: alb.title || "Album", items });
      }

      albumBucketsRef.current = buckets;
      setAlbumsTick((x) => x + 1);
    } finally {
      setAlbumsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoadingPhotos(true);
        setError(null);

        const perm = await MediaLibrary.requestPermissionsAsync();
        if (cancelled) return;
        setPermission(perm);

        if (!perm.granted) {
          setLoadingPhotos(false);
          setError("No permission to access photo library.");
          return;
        }

        const res = await MediaLibrary.getAssetsAsync({
          mediaType: "photo",
          first: PAGE_SIZE,
          sortBy: [MediaLibrary.SortBy.creationTime],
        });

        const items: PhotoItem[] = res.assets
          .map((a) => ({
            id: a.id,
            uri: a.uri,
            width: a.width,
            height: a.height,
            creationTime: toSec(a.creationTime),
          }))
          .reverse();

        setPhotos(items);
        setLoadingPhotos(false);
      } catch (e: any) {
        setLoadingPhotos(false);
        setError(e?.message ?? String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // load model once
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setModelStatus("loading");
        const asset = require("../../src/assets/models/efficientnet_lite0.tflite");
        const model = await loadTensorflowModel(asset);
        if (cancelled) return;

        modelRef.current = model;
        setModelStatus("ready");
      } catch (e: any) {
        if (cancelled) return;
        setModelStatus("error");
        setError(`Model load failed: ${e?.message ?? String(e)}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // when switching to location-ish mode, fetch location metadata and resolve city names
  useEffect(() => {
    if (mode !== "location" && mode !== "day_location") return;
    if (!permission?.granted) return;

    (async () => {
      await ensureLocationsForVisibleSet(photos);
      await ensureCityNamesForBuckets();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, permission?.granted, photos.length]);

  // also resolve city names when new locations arrive
  useEffect(() => {
    if (mode !== "location" && mode !== "day_location") return;
    void locationTick;
    ensureCityNamesForBuckets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationTick, mode]);

  // hashes for bursts when mode is bursts
  useEffect(() => {
    if (mode !== "bursts") return;
    if (!permission?.granted) return;
    ensureHashesFor(photos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, permission?.granted, photos.length]);

  // load albums when mode is albums
  useEffect(() => {
    if (mode !== "albums") return;
    if (!permission?.granted) return;
    loadAlbumBuckets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, permission?.granted]);

  // auto-run semantic classification when mode switches to "semantic"
  useEffect(() => {
    cancelSemanticRef.current = false;

    if (mode !== "semantic") {
      cancelSemanticRef.current = true;
      setSemanticRunning(false);
      return;
    }

    if (modelStatus !== "ready" || !modelRef.current) return;
    if (!permission?.granted) return;

    const run = async () => {
      if (semanticRunning) return;

      setSemanticRunning(true);
      try {
        const toDo = photos.filter((p) => !p.category).slice(0, MAX_PHOTOS_TO_CLASSIFY);
        let doneLocal = 0;

        for (const item of toDo) {
          if (cancelSemanticRef.current) break;

          try {
            const face = await hasFace(item.id, item.uri);
            if (face) {
              doneLocal++;
              setPhotos((prev) =>
                prev.map((p) =>
                  p.id === item.id
                    ? {
                      ...p,
                      category: "people",
                      confidence: 1,
                      top: undefined,
                      debugLabelTop1: "face_detected",
                    }
                    : p
                )
              );
              continue;
            }

            const input = await uriToFloat32NHWC(item.uri, item.width, item.height);
            const outputs = await modelRef.current.run([input]);
            const logits = outputs[0] as Float32Array;

            const top = topK(logits, TOPK);
            const picked = categoryFromTopFallback(top, logits.length);

            doneLocal++;
            setPhotos((prev) =>
              prev.map((p) =>
                p.id === item.id
                  ? {
                    ...p,
                    category: picked.category,
                    confidence: picked.score,
                    top,
                    debugLabelTop1: picked.usedLabel,
                  }
                  : p
              )
            );
          } catch {
            // ignore per-photo errors
          }
        }

        setSemanticDone((x) => x + doneLocal);
      } finally {
        setSemanticRunning(false);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, modelStatus, permission?.granted, photos.length]);

  const groups: Group[] = useMemo(() => {
    if (!photos.length) return [];

    if (mode === "semantic") return clusterBySemantic(photos);
    if (mode === "day") return clusterByDay(photos);

    if (mode === "bursts") {
      void hashTick;
      return clusterByTimeOnly(photos);
    }

    if (mode === "albums") {
      void albumsTick;
      return clusterByAlbums(albumBucketsRef.current);
    }

    // location-ish
    void locationTick;
    void cityTick;

    if (mode === "day_location") {
      return clusterByDayThenLocation(photos, locationCacheRef.current, cityCacheRef.current);
    }

    return clusterByLocation(photos, locationCacheRef.current, cityCacheRef.current);
  }, [photos, mode, locationTick, cityTick, hashTick, albumsTick]);

  function ModeButton({ value, label }: { value: ClusterMode; label: string }) {
    const active = mode === value;
    return (
      <Pressable
        onPress={() => setMode(value)}
        style={{
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 999,
          backgroundColor: active ? "#111" : "#eee",
        }}
      >
        <Text style={{ color: active ? "white" : "#111", fontWeight: "700", fontSize: 12 }}>
          {label}
        </Text>
      </Pressable>
    );
  }

  const remainingSemantic = useMemo(() => photos.filter((p) => !p.category).length, [photos]);

  if (loadingPhotos) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator/>
        <Text style={{ marginTop: 8, opacity: 0.7 }}>Loading photos…</Text>
        <Text style={{ marginTop: 6, opacity: 0.7 }}>Model: {modelStatus}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, paddingTop: Platform.OS === "android" ? 16 : 0 }}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: "700" }}>Photo Clusters</Text>

        <Text style={{ marginTop: 6, opacity: 0.8 }}>
          {permission?.granted ? `Loaded ${photos.length} photos.` : "No permission to access photos."}
        </Text>

        <Text style={{ marginTop: 4, opacity: 0.8 }}>
          Mode: {mode} • Model: {modelStatus}
        </Text>

        {mode === "location" || mode === "day_location" ? (
          <Text style={{ marginTop: 4, opacity: 0.75 }}>
            Location: {locationLoading ? "loading…" : "ready"} • City names:{" "}
            {cityLoading ? "resolving…" : "ready"}
          </Text>
        ) : null}

        {mode === "bursts" ? (
          <Text style={{ marginTop: 4, opacity: 0.75 }}>
            Bursts+Dups: {hashLoading ? "hashing…" : "ready"} • cached: {hashCacheRef.current.size} •
            gap≤{BURST_GAP_SEC}s • ham≤{DUP_HAMMING_MAX}
          </Text>
        ) : null}

        {mode === "albums" ? (
          <Text style={{ marginTop: 4, opacity: 0.75 }}>
            Albums: {albumsLoading ? "loading…" : "ready"} • buckets: {albumBucketsRef.current.size}
          </Text>
        ) : null}

        {mode === "semantic" ? (
          <Text style={{ marginTop: 4, opacity: 0.75 }}>
            Semantic: {modelStatus !== "ready" ? "model not ready" : semanticRunning ? "classifying…" : "idle"} •
            remaining: {remainingSemantic} • processed: {semanticDone}
          </Text>
        ) : null}

        {error ? <Text style={{ marginTop: 8, color: "#b00020" }}>{error}</Text> : null}

        <View
          style={{
            flexDirection: "row",
            gap: 10,
            marginTop: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <ModeButton value="day" label="Day"/>
          <ModeButton value="semantic" label="AI"/>
          <ModeButton value="location" label="Location"/>
          <ModeButton value="day_location" label="Day+Location"/>
          <ModeButton value="bursts" label="Bursts+Dups"/>
          <ModeButton value="albums" label="Albums"/>
        </View>

        {/*<Text style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>*/}
        {/*  Day: groups by calendar day (local time)*/}
        {/*  {"\n"}*/}
        {/*  Semantic: auto-runs face + EfficientNet when you switch into Semantic*/}
        {/*  {"\n"}*/}
        {/*  Location: groups by GPS buckets and shows city name (Kyiv/Lviv/…)*/}
        {/*  {"\n"}*/}
        {/*  Day+Location: groups by day, then by city within each day*/}
        {/*  {"\n"}*/}
        {/*  Bursts+Dups: splits into bursts (≤ {BURST_GAP_SEC}s) and groups near-duplicates by dHash*/}
        {/*  {"\n"}*/}
        {/*  Albums: groups by top albums (Screenshots/Camera/WhatsApp/Telegram/Downloads/…)*/}
        {/*</Text>*/}
      </View>

      <FlatList
        data={groups}
        keyExtractor={(g) => g.key}
        renderItem={({ item: g }) => (
          <View style={{ marginBottom: 16 }}>
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: "700" }}>
                {g.title}
              </Text>
            </View>

            <FlatList
              data={g.items}
              keyExtractor={(x) => x.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
              renderItem={({ item }) => (
                <View style={{ width: 120 }}>
                  <Pressable
                    onPress={() => {
                      router.push({
                        pathname: "/photo",
                        params: {
                          uri: item.uri,
                          id: item.id,
                          w: String(item.width),
                          h: String(item.height),
                          t: item.creationTime ? String(item.creationTime) : "",
                          cat: item.category ?? "",
                          conf: typeof item.confidence === "number" ? String(item.confidence) : "",
                          title: g.title, // опційно: заголовок групи
                        },
                      });
                    }}
                  >
                    <Image
                      source={{ uri: item.uri }}
                      style={{ width: 120, height: 120, borderRadius: 12, backgroundColor: "#ddd" }}
                    />
                  </Pressable>

                  <Text numberOfLines={1} style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>
                    {(mode === "semantic" ? item.category ?? "…" : "photo") +
                      (typeof item.confidence === "number" && mode === "semantic"
                        ? ` (${item.confidence.toFixed(2)})`
                        : "")}
                  </Text>

                  {!!item.debugLabelTop1 && mode === "semantic" && (
                    <Text numberOfLines={1} style={{ fontSize: 10, opacity: 0.55 }}>
                      picked: {item.debugLabelTop1}
                    </Text>
                  )}

                  {mode !== "semantic" && (
                    <Text numberOfLines={1} style={{ fontSize: 10, opacity: 0.55 }}>
                      {item.creationTime ? new Date(item.creationTime * 1000).toLocaleTimeString() : "—"}
                    </Text>
                  )}
                </View>
              )}
            />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

export default function Index() {

  return (
    <IndexInner/>
  );
}
