# Photo Clusters (Expo)

Expo application that reads **real photos from the device gallery** and groups them into **meaningful clusters**.

The main focus is **cluster quality** — when a user opens a cluster, it should feel logically grouped and
understandable.

---

## Tech Stack

- Expo SDK **52+**
- TypeScript
- Expo Router
- `expo-media-library`
- `expo-image-manipulator`
- `expo-location`
- `react-native-fast-tflite`
- `@infinitered/react-native-mlkit-face-detection`
- `jpeg-js`, `base64-js`

---

## Core Idea

Instead of relying on a single clustering strategy, the app implements **multiple complementary clustering modes**,
reflecting how people actually think about photos:

- by day
- by place
- by content (AI)
- by shooting bursts
- by albums

Each mode is independently usable and comparable.

---

## Clustering Modes

### Day

Groups photos by **calendar day** using `creationTime`.

- Key: `YYYY-MM-DD`
- Sorted newest → oldest

**Why:** the most intuitive baseline — “photos from that day”.

---

### Location

Groups photos by **GPS location (EXIF)**.

Algorithm:

1. Reads `asset.location` via `MediaLibrary.getAssetInfoAsync`
2. Rounds coordinates (±0.01°) into geo buckets
3. Reverse geocodes each bucket into a human-readable place name
4. Merges buckets with identical city names

Resulting clusters look like:

- `Lviv, Ukraine`
- `Kyiv, Ukraine`
- `Unknown place`

**Why:** users think in places, not coordinates.

---

### Day + Location

Two-level clustering:

1. Group by day
2. Inside each day — group by location

Example title:

```
Mon, Sep 12 • Lviv, Ukraine • 18
```

**Why:** one day can include multiple meaningful locations.

---

### Semantic (AI)

**On-device semantic clustering** (no backend) — this is a **prototype / baseline** implementation.

#### Step 1 — Face detection → People

Before running image classification:

- MLKit face detection is executed
- If a face is detected, the photo is immediately classified as `People`

This improves accuracy and avoids unnecessary ML inference.

#### Step 2 — Image classification (EfficientNet Lite)

If no face is found:

1. Center-crop + resize to `224×224`
2. JPEG → Float32 tensor
3. Inference via **TFLite (EfficientNet Lite0)**
4. Top-K ImageNet labels are mapped to coarse categories

Final categories:

- `People`
- `Pets`
- `Food`
- `Nature`
- `Other`

Classification is limited to a capped number of photos to keep UI responsive.

---

## ⚠️ Note about AI quality (Backend integration)

Right now the app uses a **lightweight on-device model** (EfficientNet Lite + ImageNet labels) and simple rules (
face-first). This is intentional: it’s a **test/prototype** to validate UX and clustering modes without a server.

To make semantic clustering **significantly better**, the next step is to integrate a backend that can run **stronger AI
tooling**, for example:

- Modern vision models that produce **embeddings** (better than label-based classification)
- True clustering in embedding space (k-means / HDBSCAN / hierarchical)
- Better categories (custom taxonomy), multi-label tags, and search
- Personalization (per-user preferences, “important people/places”)
- Optional cross-photo reasoning (events, trips, timelines)

A backend path also enables batching, caching, and continuous improvements (model updates) — while keeping on-device
mode as a privacy-friendly fallback.

---

### Bursts

Groups photos shot **very close in time**.

Algorithm:

- Sort by timestamp
- Split clusters when time gap exceeds threshold
- Only clusters with 2+ photos are kept

Titles include time ranges:

```
Sep 12 14:32–14:35
```

**Why:** burst shots and near-duplicates are almost always meant to be viewed together.

---

### Albums

Groups photos by **device albums**.

- Selects top albums (Camera, Screenshots, WhatsApp, Telegram, etc.)
- Limits assets per album
- Sorts by album size

**Why:** albums are already user-defined semantic groups.

---

## Performance Considerations

- All heavy work is capped (photo count, location lookups, ML inference).
- Semantic classification runs progressively and updates UI incrementally.
- Location reverse-geocoding is cached.
- Designed to stay responsive on real devices.

---

## IMPORTANT: Real Device Required

This project uses **native ML libraries**:

- `react-native-fast-tflite`
- `@infinitered/react-native-mlkit-face-detection`

These libraries **do not work on emulators/simulators**.

**The app must be run on a real device.**

- ❌ Expo Go — **not supported**
- ❌ iOS Simulator / Android Emulator — **not supported**
- ✅ Real iOS device — **required**

---

## How to Run (Expo Dev Build)

### 1. Install dependencies

```bash
npm install
```

### 2. Create dev build

```bash
npx expo prebuild
```

### 3. iOS

```bash
npx expo run:ios --device
```

This will:

- build a dev client
- open Xcode
- run the app on a connected iPhone

Make sure signing is configured in Xcode.

---

## Permissions

The app requests:

- **Photo library access** (required)
- **Location (foreground)** — used only to convert existing EXIF GPS data into city names

If location permission is denied, location-based clusters still work but without city names.

---

## Assets

Required assets:

- `assets/models/efficientnet_lite0.tflite`
- `assets/models/imagenet_labels.json`

---

## Why This Approach

- Metadata (day, location, albums) gives **stable, explainable clusters**
- AI adds **semantic meaning** when metadata is missing
- Face-first classification improves accuracy and speed
- Multiple modes allow comparing clustering quality directly

---

## Summary

This project demonstrates that **meaningful photo clustering** can be done fully **on-device**, combining:

- simple heuristics
- metadata
- lightweight ML

without a backend and with acceptable performance on real phones.
