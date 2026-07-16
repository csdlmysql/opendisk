// Mock backend — simulates all of Rust's commands/events when running plain Vite (web).
// Generates a fake multi-level directory tree of ~10,000 nodes, simulating scan-progress then scan-complete.

import type {
  DiffNode,
  DiffResult,
  DupComplete,
  DupError,
  DupFile,
  DupGroup,
  DupProgress,
  FileCategory,
  FileHit,
  NodeKind,
  NodeView,
  ScanComplete,
  ScanError,
  ScanProgress,
  SnapshotMeta,
  Volume,
} from "../types/model";
import type { ExportArgs, FindFilesArgs } from "./tauri";

interface MockNode {
  id: number;
  name: string;
  kind: NodeKind;
  size: number;
  parentId: number;
  childIds: number[];
}

// ---- Seeded RNG (mulberry32) so the tree is reproducible and easy to debug ----
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rand = mulberry32(1337);
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

// ---- Pool of realistic names ----
const TOP_DIRS = ["Applications", "Library", "System", "Users", "private", "usr", "opt"];
const USER_DIRS = ["Documents", "Downloads", "Desktop", "Movies", "Music", "Pictures", "Projects", "Library", "Public"];
const GENERIC_DIRS = [
  "Caches", "Logs", "Preferences", "Containers", "Frameworks", "Application Support",
  "src", "dist", "build", "assets", "components", "public", "bin", "include", "share",
  "tmp", "vendor", "coverage", ".cache", "target", "out", "resources",
];
const PKG_NAMES = [
  "react", "react-dom", "lodash", "webpack", "typescript", "@types", "eslint", "@babel",
  "vite", "rollup", "zustand", "date-fns", "rxjs", "moment", "chalk", "commander",
  "express", "next", "vue", "three", "d3", "postcss", "tailwindcss", "esbuild", "prettier",
];
const APP_NAMES = [
  "Safari.app", "Xcode.app", "Photos.app", "Music.app", "Final Cut Pro.app",
  "Logic Pro.app", "Slack.app", "Visual Studio Code.app", "Figma.app", "Docker.app",
  "Google Chrome.app", "Notion.app", "Spotify.app", "iMovie.app", "Keynote.app",
];
const FILE_TEMPLATES: { ext: string; min: number; max: number; weight: number }[] = [
  { ext: "mp4", min: 200e6, max: 4.5e9, weight: 6 },
  { ext: "mov", min: 300e6, max: 6e9, weight: 4 },
  { ext: "jpg", min: 1e6, max: 12e6, weight: 10 },
  { ext: "png", min: 200e3, max: 8e6, weight: 10 },
  { ext: "pdf", min: 100e3, max: 40e6, weight: 6 },
  { ext: "zip", min: 5e6, max: 900e6, weight: 4 },
  { ext: "dmg", min: 50e6, max: 3e9, weight: 2 },
  { ext: "log", min: 1e3, max: 20e6, weight: 5 },
  { ext: "js", min: 500, max: 800e3, weight: 12 },
  { ext: "ts", min: 500, max: 400e3, weight: 12 },
  { ext: "json", min: 200, max: 2e6, weight: 8 },
  { ext: "cache", min: 10e3, max: 200e6, weight: 5 },
  { ext: "wav", min: 5e6, max: 400e6, weight: 3 },
  { ext: "psd", min: 20e6, max: 1.5e9, weight: 2 },
];
const FILE_BASENAMES = [
  "vacation", "meeting-recording", "screenshot", "invoice", "report", "backup",
  "IMG_2043", "presentation", "budget", "notes", "index", "main", "utils", "config",
  "avatar", "banner", "podcast-ep", "render", "export", "draft", "final-v2",
];

let arena: MockNode[] = [];
let rootId = 0;
let scannedPath = "/";
let scannedVolume = "Macintosh HD";

// ---- File category classifier by extension ----
const CATEGORY_BY_EXT: Record<string, FileCategory> = {
  jpg: "image", jpeg: "image", png: "image", gif: "image", heic: "image", psd: "image",
  mp4: "video", mov: "video", mkv: "video", avi: "video",
  wav: "audio", mp3: "audio", aac: "audio", flac: "audio",
  zip: "archive", tar: "archive", gz: "archive", rar: "archive",
  dmg: "diskimage", iso: "diskimage", raw: "diskimage", img: "diskimage", vmdk: "diskimage",
  app: "application", pkg: "application", exe: "application",
  pdf: "document", doc: "document", docx: "document", txt: "document", md: "document",
  js: "code", ts: "code", json: "code", tsx: "code", rs: "code", py: "code",
};

function categorize(name: string): FileCategory {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "other";
  const ext = name.slice(dot + 1).toLowerCase();
  return CATEGORY_BY_EXT[ext] ?? "other";
}

/** Deterministic synthetic mtime (ms) for a node id, spread across the last ~3 years. */
function mockMtime(id: number): number {
  const now = Date.now();
  const span = 3 * 365 * 24 * 60 * 60 * 1000;
  const r = mulberry32(id * 2654435761 + 12345)();
  return Math.round(now - r * span);
}

function make(name: string, kind: NodeKind, parentId: number): MockNode {
  const n: MockNode = { id: arena.length, name, kind, size: 0, parentId, childIds: [] };
  arena.push(n);
  if (parentId >= 0) arena[parentId].childIds.push(n.id);
  return n;
}

function makeFile(parentId: number): MockNode {
  // pick a template by weight
  let totalW = 0;
  for (const t of FILE_TEMPLATES) totalW += t.weight;
  let r = rand() * totalW;
  let tpl = FILE_TEMPLATES[0];
  for (const t of FILE_TEMPLATES) {
    r -= t.weight;
    if (r <= 0) { tpl = t; break; }
  }
  const base = pick(FILE_BASENAMES);
  const suffix = rand() < 0.4 ? `-${randInt(1, 240)}` : "";
  const name = `${base}${suffix}.${tpl.ext}`;
  const node = make(name, "file", parentId);
  // skew the distribution toward small sizes (squared) for a natural look
  const t = rand() * rand();
  node.size = Math.round(tpl.min + t * (tpl.max - tpl.min));
  return node;
}

const MAX_NODES = 10000;

function pickDirName(depth: number, ctxName: string): string {
  if (ctxName === "Users") return pick(USER_DIRS);
  if (ctxName === "Applications") return pick(APP_NAMES);
  if (ctxName === "node_modules") return pick(PKG_NAMES);
  if (depth <= 1) return pick([...GENERIC_DIRS, "node_modules", ".git"]);
  const roll = rand();
  if (roll < 0.12) return "node_modules";
  if (roll < 0.16) return ".git";
  return pick(GENERIC_DIRS);
}

function genDir(node: MockNode, depth: number): void {
  if (depth >= 8 || arena.length >= MAX_NODES) return;
  const isNodeModules = node.name === "node_modules";
  const nChildren = isNodeModules ? randInt(6, 16) : randInt(3, depth < 2 ? 8 : 12);
  const dirProb = Math.max(0.05, 0.72 - depth * 0.12);
  for (let i = 0; i < nChildren; i++) {
    if (arena.length >= MAX_NODES) break;
    if (depth < 6 && rand() < dirProb) {
      const child = make(pickDirName(depth, node.name), "dir", node.id);
      genDir(child, depth + 1);
    } else {
      makeFile(node.id);
    }
  }
  // make sure the dir is not empty
  if (node.childIds.length === 0 && arena.length < MAX_NODES) makeFile(node.id);
}

function computeSizes(id: number): number {
  const n = arena[id];
  if (n.kind === "file") return n.size;
  let s = 0;
  for (const c of n.childIds) s += computeSizes(c);
  // directories also carry a bit of metadata overhead
  n.size = s;
  return s;
}

function buildTree(volumeName: string): void {
  arena = [];
  rand = mulberry32(1337);
  const root = make(volumeName, "dir", -1);
  rootId = root.id;
  for (const d of TOP_DIRS) {
    if (arena.length >= MAX_NODES) break;
    const child = make(d, "dir", root.id);
    genDir(child, 1);
  }
  computeSizes(rootId);
}

// ---- Fake volumes ----
const MOCK_VOLUMES: Volume[] = [
  {
    name: "Macintosh HD",
    mountPoint: "/",
    totalBytes: 994_662_584_320,
    availableBytes: 213_884_129_280,
    fileSystem: "APFS",
    isRemovable: false,
  },
  {
    name: "External SSD",
    mountPoint: "/Volumes/External SSD",
    totalBytes: 2_000_398_934_016,
    availableBytes: 1_640_000_000_000,
    fileSystem: "APFS",
    isRemovable: true,
  },
  {
    name: "Time Machine",
    mountPoint: "/Volumes/Time Machine",
    totalBytes: 4_000_000_000_000,
    availableBytes: 342_000_000_000,
    fileSystem: "HFS+",
    isRemovable: true,
  },
];

// ---- Event bus ----
type Cb<T> = (payload: T) => void;
const progressSubs = new Set<Cb<ScanProgress>>();
const completeSubs = new Set<Cb<ScanComplete>>();
const errorSubs = new Set<Cb<ScanError>>();
let scanTimer: ReturnType<typeof setInterval> | null = null;

function stopScanTimer() {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }
}

// ---- Duplicate finder event bus ----
const dupProgressSubs = new Set<Cb<DupProgress>>();
const dupCompleteSubs = new Set<Cb<DupComplete>>();
const dupErrorSubs = new Set<Cb<DupError>>();
let dupTimer: ReturnType<typeof setInterval> | null = null;

function stopDupTimer() {
  if (dupTimer) {
    clearInterval(dupTimer);
    dupTimer = null;
  }
}

// ---- In-memory snapshot store ----
let snapshots: SnapshotMeta[] = [];

// ---- API surface ----
export const mockBackend = {
  async listVolumes(): Promise<Volume[]> {
    await delay(120);
    return MOCK_VOLUMES;
  },

  async startScan(path: string): Promise<void> {
    stopScanTimer();
    const volName = MOCK_VOLUMES.find((v) => v.mountPoint === path)?.name ?? "Macintosh HD";
    scannedPath = path;
    scannedVolume = volName;
    buildTree(volName);
    const total = arena[rootId].size;
    const totalFiles = arena.filter((n) => n.kind === "file").length;
    const totalDirs = arena.length - totalFiles;

    const DURATION = 2000;
    const start = performance.now();
    // sample paths to display as "current path"
    const samplePaths = arena
      .filter((n) => n.kind === "file")
      .slice(0, 400)
      .map((n) => buildPath(n.id));

    scanTimer = setInterval(() => {
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / DURATION);
      // easeOut so it slows down near the end
      const e = 1 - Math.pow(1 - t, 2);
      const progress: ScanProgress = {
        filesScanned: Math.round(totalFiles * e),
        dirsScanned: Math.round(totalDirs * e),
        bytesScanned: Math.round(total * e),
        currentPath: pick(samplePaths) ?? "/",
        elapsedMs: Math.round(elapsed),
      };
      progressSubs.forEach((cb) => cb(progress));

      if (t >= 1) {
        stopScanTimer();
        const complete: ScanComplete = {
          rootId,
          totalBytes: total,
          filesScanned: totalFiles,
          dirsScanned: totalDirs,
          durationMs: Math.round(elapsed),
        };
        completeSubs.forEach((cb) => cb(complete));
      }
    }, 90);
  },

  async cancelScan(): Promise<void> {
    stopScanTimer();
  },

  async getView(args: {
    nodeId: number;
    depth: number;
    maxChildren: number;
    minFraction: number;
  }): Promise<NodeView> {
    const { nodeId, depth, maxChildren, minFraction } = args;
    const node = arena[nodeId];
    if (!node) throw new Error(`Mock: node ${nodeId} does not exist`);
    const rootViewSize = node.size || 1;
    return buildView(node, depth, maxChildren, minFraction, rootViewSize);
  },

  async getNodePath(nodeId: number): Promise<string> {
    return buildPath(nodeId);
  },

  async revealInFinder(nodeId: number): Promise<void> {
    // no-op on web
    // eslint-disable-next-line no-console
    console.info("[mock] reveal_in_finder", buildPath(nodeId));
  },

  async quickLook(nodeId: number): Promise<void> {
    // eslint-disable-next-line no-console
    console.info("[mock] quick_look", buildPath(nodeId));
  },

  async openInTerminal(nodeId: number): Promise<void> {
    // eslint-disable-next-line no-console
    console.info("[mock] open_in_terminal", buildPath(nodeId));
  },

  async moveToTrash(nodeId: number): Promise<void> {
    const node = arena[nodeId];
    if (!node || node.parentId < 0) return;
    const parent = arena[node.parentId];
    parent.childIds = parent.childIds.filter((c) => c !== nodeId);
    // propagate the size update upward
    let p: number = node.parentId;
    while (p >= 0) {
      arena[p].size = arena[p].childIds.reduce((s, c) => s + arena[c].size, 0);
      p = arena[p].parentId;
    }
  },

  async pickFolder(): Promise<string | null> {
    // web mock: pretend the user picked the root folder
    return "/";
  },

  onScanProgress(cb: Cb<ScanProgress>): () => void {
    progressSubs.add(cb);
    return () => progressSubs.delete(cb);
  },
  onScanComplete(cb: Cb<ScanComplete>): () => void {
    completeSubs.add(cb);
    return () => completeSubs.delete(cb);
  },
  onScanError(cb: Cb<ScanError>): () => void {
    errorSubs.add(cb);
    return () => errorSubs.delete(cb);
  },

  // ---- Large Files finder (P1) ----
  async findFiles(args: FindFilesArgs): Promise<FileHit[]> {
    await delay(120);
    const { minSize, olderThanDays, categories, limit, sortBy } = args;
    const now = Date.now();
    const cutoff = olderThanDays > 0 ? now - olderThanDays * 24 * 60 * 60 * 1000 : Infinity;
    const catSet = new Set(categories);

    const hits: FileHit[] = [];
    for (const n of arena) {
      if (n.kind !== "file") continue;
      if (n.size < minSize) continue;
      const category = categorize(n.name);
      if (catSet.size > 0 && !catSet.has(category)) continue;
      const mtimeMs = mockMtime(n.id);
      if (olderThanDays > 0 && mtimeMs > cutoff) continue;
      hits.push({
        id: n.id,
        name: n.name,
        path: buildPath(n.id),
        size: n.size,
        mtimeMs,
        category,
      });
    }
    const dir = args.ascending ? 1 : -1;
    hits.sort((a, b) => {
      if (sortBy === "name") return dir * a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      if (sortBy === "mtime") return dir * (a.mtimeMs - b.mtimeMs);
      return dir * (a.size - b.size);
    });
    return hits.slice(0, limit);
  },

  async exportFileList(_args: ExportArgs): Promise<string | null> {
    await delay(150);
    return _args.format === "json" ? "/tmp/mock-file-list.json" : "/tmp/mock-file-list.csv";
  },

  // ---- Snapshot / Compare (P2) ----
  async saveSnapshot(volumeName: string): Promise<SnapshotMeta> {
    await delay(80);
    const meta: SnapshotMeta = {
      id: `snap-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
      rootPath: scannedPath,
      volumeName,
      createdAtMs: Date.now(),
      totalBytes: arena[rootId]?.size ?? 0,
      fileCount: arena.filter((n) => n.kind === "file").length,
    };
    snapshots.unshift(meta);
    return meta;
  },

  async listSnapshots(): Promise<SnapshotMeta[]> {
    await delay(60);
    if (snapshots.length === 0) seedSnapshots();
    return [...snapshots];
  },

  async deleteSnapshot(id: string): Promise<void> {
    await delay(40);
    snapshots = snapshots.filter((s) => s.id !== id);
  },

  async diffWithSnapshot(args: {
    id: string;
    depth: number;
    maxChildren: number;
  }): Promise<DiffResult> {
    await delay(140);
    const before = snapshots.find((s) => s.id === args.id) ?? seedSnapshots()[0];
    const root = buildDiffNode(arena[rootId], args.depth, args.maxChildren, before.id);
    const totalDelta = root.delta;
    return { before, totalDelta, root };
  },

  // ---- Duplicate finder (P3) ----
  async findDuplicates(minSize: number): Promise<void> {
    stopDupTimer();
    const candidates = arena.filter((n) => n.kind === "file" && n.size >= minSize);
    const totalCandidates = candidates.length;
    const totalCandidateBytes = candidates.reduce((s, n) => s + n.size, 0);
    const DURATION = 1500;
    const start = performance.now();
    const samplePaths = candidates.slice(0, 300).map((n) => buildPath(n.id));

    dupTimer = setInterval(() => {
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / DURATION);
      const progress: DupProgress = {
        filesHashed: Math.round(totalCandidates * t),
        bytesHashed: Math.round(totalCandidateBytes * t),
        totalCandidates,
        totalCandidateBytes,
        currentPath: pick(samplePaths) ?? "/",
      };
      dupProgressSubs.forEach((cb) => cb(progress));

      if (t >= 1) {
        stopDupTimer();
        const groups = buildDupGroups(candidates);
        const totalWasted = groups.reduce((s, g) => s + g.wastedBytes, 0);
        const complete: DupComplete = {
          groups,
          totalWasted,
          durationMs: Math.round(elapsed),
        };
        dupCompleteSubs.forEach((cb) => cb(complete));
      }
    }, 90);
  },

  async cancelDuplicates(): Promise<void> {
    stopDupTimer();
  },

  onDupProgress(cb: Cb<DupProgress>): () => void {
    dupProgressSubs.add(cb);
    return () => dupProgressSubs.delete(cb);
  },
  onDupComplete(cb: Cb<DupComplete>): () => void {
    dupCompleteSubs.add(cb);
    return () => dupCompleteSubs.delete(cb);
  },
  onDupError(cb: Cb<DupError>): () => void {
    dupErrorSubs.add(cb);
    return () => dupErrorSubs.delete(cb);
  },
};

function buildPath(id: number): string {
  const parts: string[] = [];
  let cur = id;
  while (cur >= 0) {
    const n = arena[cur];
    if (n.parentId < 0) {
      // root node = volume, path starts at "/"
      parts.unshift("");
      break;
    }
    parts.unshift(n.name);
    cur = n.parentId;
  }
  const joined = parts.join("/");
  return joined === "" ? "/" : joined || "/";
}

function buildView(
  node: MockNode,
  remainingDepth: number,
  maxChildren: number,
  minFraction: number,
  rootViewSize: number,
): NodeView {
  const base: NodeView = {
    id: node.id,
    name: node.name,
    size: node.size,
    kind: node.kind,
    childCount: node.childIds.length,
    children: null,
  };
  if (remainingDepth <= 0 || node.childIds.length === 0) {
    return base;
  }
  const sorted = node.childIds.map((c) => arena[c]).sort((a, b) => b.size - a.size);
  const threshold = rootViewSize * minFraction;
  const kept: MockNode[] = [];
  const merged: MockNode[] = [];
  for (const c of sorted) {
    if (kept.length < maxChildren && c.size >= threshold) kept.push(c);
    else merged.push(c);
  }
  const children: NodeView[] = kept.map((c) =>
    buildView(c, remainingDepth - 1, maxChildren, minFraction, rootViewSize),
  );
  if (merged.length > 0) {
    const mergedSize = merged.reduce((s, c) => s + c.size, 0);
    children.push({
      id: -1,
      name: `${merged.length} smaller items`,
      size: mergedSize,
      kind: "other",
      childCount: merged.length,
      children: null,
    });
  }
  base.children = children;
  return base;
}

// ---- Snapshot / diff mock helpers ----
function seedSnapshots(): SnapshotMeta[] {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const total = arena[rootId]?.size ?? 500e9;
  const files = arena.filter((n) => n.kind === "file").length || 8000;
  snapshots = [
    {
      id: "snap-seed-1",
      rootPath: scannedPath,
      volumeName: scannedVolume,
      createdAtMs: now - 14 * day,
      totalBytes: Math.round(total * 0.92),
      fileCount: Math.round(files * 0.95),
    },
    {
      id: "snap-seed-2",
      rootPath: scannedPath,
      volumeName: scannedVolume,
      createdAtMs: now - 60 * day,
      totalBytes: Math.round(total * 0.8),
      fileCount: Math.round(files * 0.85),
    },
  ];
  return snapshots;
}

/** Build a diff tree with stable pseudo-random deltas seeded by snapshot id + node id. */
function buildDiffNode(
  node: MockNode,
  remainingDepth: number,
  maxChildren: number,
  seedKey: string,
): DiffNode {
  const seedNum = hashString(seedKey) ^ node.id;
  const r = mulberry32(seedNum)();
  // delta in range roughly [-30%, +40%] of the node size
  const factor = -0.3 + r * 0.7;
  const sizeNow = node.size;
  const sizeBefore = Math.max(0, Math.round(sizeNow / (1 + factor)));
  const delta = sizeNow - sizeBefore;

  let children: DiffNode[] | null = null;
  if (remainingDepth > 0 && node.childIds.length > 0) {
    const sorted = node.childIds
      .map((c) => arena[c])
      .sort((a, b) => b.size - a.size)
      .slice(0, maxChildren);
    children = sorted
      .map((c) => buildDiffNode(c, remainingDepth - 1, maxChildren, seedKey))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }
  return { name: node.name, sizeNow, sizeBefore, delta, kind: node.kind, children };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Build ~5 duplicate groups from real file nodes so paths/names look plausible. */
function buildDupGroups(candidates: MockNode[]): DupGroup[] {
  const sorted = [...candidates].sort((a, b) => b.size - a.size);
  const groups: DupGroup[] = [];
  const GROUP_COUNT = 5;
  let idx = 0;
  for (let g = 0; g < GROUP_COUNT && idx < sorted.length; g++) {
    const copies = 2 + (g % 3); // 2, 3, or 4 copies
    const anchor = sorted[idx];
    const size = anchor.size;
    const files: DupFile[] = [];
    for (let c = 0; c < copies && idx < sorted.length; c++) {
      const n = sorted[idx++];
      files.push({
        id: n.id,
        name: anchor.name,
        path: buildPath(n.id),
        mtimeMs: mockMtime(n.id),
      });
    }
    if (files.length < 2) break;
    const count = files.length;
    groups.push({ size, count, wastedBytes: size * (count - 1), files });
  }
  return groups.sort((a, b) => b.wastedBytes - a.wastedBytes);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
