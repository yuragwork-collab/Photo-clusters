import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as MediaLibrary from "expo-media-library";
import * as Location from "expo-location";
import { loadTensorflowModel } from "react-native-fast-tflite";
import { useFaceDetection } from "@infinitered/react-native-mlkit-face-detection";

import {
  categoryFromTopFallback,
  clusterByAlbums,
  clusterByDay,
  clusterByDayThenLocation,
  clusterByLocation,
  clusterBySemantic,
  clusterByTimeOnly,
  ensureFileUri,
  locationKeyFromLatLon,
  niceCityTitle,
  parseLatLon, preferAlbumTitle,
  topK,
  toSec,
  uriToDHash64,
  uriToFloat32NHWC,
} from "@/src/utils/helpers";

import {
  MAX_ALBUM_ASSETS,
  MAX_ALBUMS,
  MAX_LOCATION_LOOKUPS,
  MAX_PHOTOS_TO_CLASSIFY,
  MAX_PHOTOS_TO_HASH,
  PAGE_SIZE,
  TOPK,
} from "@/src/constants/clusters";

import { ClusterMode, Group, PhotoItem } from "@/src/flows/MainFlow/screens/ClustersScreen/_types";

export const useClustersFacade = () => {
  const faceDetector = useFaceDetection();

  const modelRef = useRef<any>(null);
  const cancelSemanticRef = useRef(false);

  const locationCacheRef = useRef<Map<string, { lat: number; lon: number } | null>>(new Map());
  const cityCacheRef = useRef<Map<string, string>>(new Map());
  const hashCacheRef = useRef<Map<string, bigint | null>>(new Map());
  const albumBucketsRef = useRef<Map<string, { title: string; items: PhotoItem[] }>>(new Map());
  const faceCacheRef = useRef<Map<string, boolean>>(new Map());

  // ---------------------- State --------------------------//
  const [mode, setMode] = useState<ClusterMode>("day");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [permission, setPermission] = useState<MediaLibrary.PermissionResponse | null>(null);
  const [loadingPhotos, setLoadingPhotos] = useState<boolean>(true);
  const [modelStatus, setModelStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [semanticRunning, setSemanticRunning] = useState<boolean>(false);


  const [locationTick, setLocationTick] = useState(0);
  const [cityTick, setCityTick] = useState(0);
  const [hashTick, setHashTick] = useState(0);
  const [albumsTick, setAlbumsTick] = useState(0);


  // ----------------------Values------------------------- //
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

    void locationTick;
    void cityTick;

    if (mode === "day_location") {
      return clusterByDayThenLocation(photos, locationCacheRef.current, cityCacheRef.current);
    }

    return clusterByLocation(photos, locationCacheRef.current, cityCacheRef.current);
  }, [photos, mode, locationTick, cityTick, hashTick, albumsTick]);

  // --------------------- Handlers ------------------------//
  const hasFace = useCallback(
    async (assetId: string, uri: string): Promise<boolean> => {
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
    },
    [faceDetector]
  );

  const ensureLocationsForVisibleSet = useCallback(async (items: PhotoItem[]) => {
    let need = 0;
    for (const p of items) if (!locationCacheRef.current.has(p.id)) need++;
    if (need === 0) return;

    const locPerm = await Location.requestForegroundPermissionsAsync();
    console.log("Location perm:", locPerm.status);

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
  }, []);

  const ensureCityNamesForBuckets = useCallback(async () => {
    const seen = new Set<string>();

    for (const [, loc] of locationCacheRef.current.entries()) {
      if (!loc) continue;
      const key = `loc_${locationKeyFromLatLon(loc.lat, loc.lon)}`;
      seen.add(key);
    }

    const toResolve = Array.from(seen).filter((k) => !cityCacheRef.current.has(k));
    if (!toResolve.length) return;

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
  }, []);

  const ensureHashesFor = useCallback(async (items: PhotoItem[]) => {
    const target = items
      .slice()
      .sort((a, b) => (b.creationTime ?? 0) - (a.creationTime ?? 0))
      .slice(0, MAX_PHOTOS_TO_HASH);

    let need = 0;
    for (const p of target) if (!hashCacheRef.current.has(p.id)) need++;
    if (need === 0) return;

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
  }, []);

  const loadAlbumBuckets = useCallback(async () => {
    if (!permission?.granted) return;

    const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });

    const picked = albums
      .filter((a) => (a.assetCount ?? 0) > 0)
      .slice()
      .sort((a, b) => {
        const pa = preferAlbumTitle(a.title);
        const pb = preferAlbumTitle(b.title);
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
  }, [permission?.granted]);

  const bootstrapPhotos = useCallback(async (isCancelled: () => boolean) => {
    try {
      setLoadingPhotos(true);
      setError(null);

      const perm = await MediaLibrary.requestPermissionsAsync();
      if (isCancelled()) return;
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
  }, []);

  const bootstrapModel = useCallback(async (isCancelled: () => boolean) => {
    try {
      setModelStatus("loading");
      const asset = require("../../../assets/models/efficientnet_lite0.tflite");
      const model = await loadTensorflowModel(asset);
      if (isCancelled()) return;

      modelRef.current = model;
      setModelStatus("ready");
    } catch (e: any) {
      if (isCancelled()) return;
      setModelStatus("error");
      setError(`Model load failed: ${e?.message ?? String(e)}`);
    }
  }, []);

  const runSemantic = useCallback(async () => {
    if (semanticRunning) return;
    if (modelStatus !== "ready" || !modelRef.current) return;
    if (!permission?.granted) return;
    if (mode !== "semantic") return;

    setSemanticRunning(true);

    try {
      const toDo = photos.filter((p) => !p.category).slice(0, MAX_PHOTOS_TO_CLASSIFY);

      for (const item of toDo) {
        if (cancelSemanticRef.current) break;

        try {
          const face = await hasFace(item.id, item.uri);
          if (face) {
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
        }
      }
    } finally {
      setSemanticRunning(false);
    }
  }, [hasFace, mode, modelStatus, permission?.granted, photos, semanticRunning]);

  // --------------------Side effects-----------------------//
  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    void bootstrapPhotos(isCancelled);

    return () => {
      cancelled = true;
    };
  }, [bootstrapPhotos]);

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    void bootstrapModel(isCancelled);

    return () => {
      cancelled = true;
    };
  }, [bootstrapModel]);

  useEffect(() => {
    if (mode !== "location" && mode !== "day_location") return;
    if (!permission?.granted) return;

    (async () => {
      await ensureLocationsForVisibleSet(photos);
      await ensureCityNamesForBuckets();
    })();
  }, [mode, permission?.granted, photos.length, ensureLocationsForVisibleSet, ensureCityNamesForBuckets]);

  useEffect(() => {
    if (mode !== "location" && mode !== "day_location") return;
    void locationTick;
    void ensureCityNamesForBuckets();
  }, [locationTick, mode, ensureCityNamesForBuckets]);

  useEffect(() => {
    if (mode !== "bursts") return;
    if (!permission?.granted) return;
    void ensureHashesFor(photos);
  }, [mode, permission?.granted, photos.length, ensureHashesFor]);

  useEffect(() => {
    if (mode !== "albums") return;
    if (!permission?.granted) return;
    void loadAlbumBuckets();
  }, [mode, permission?.granted, loadAlbumBuckets]);

  useEffect(() => {
    cancelSemanticRef.current = false;

    if (mode !== "semantic") {
      cancelSemanticRef.current = true;
      setSemanticRunning(false);
      return;
    }

    void runSemantic();
  }, [mode, runSemantic]);


  return {
    photos,
    groups,
    mode,
    error,
    loadingPhotos,
    modelStatus,
    permission,
    setMode,
  };
};
