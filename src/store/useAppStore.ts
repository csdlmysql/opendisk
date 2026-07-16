// Central state (zustand). Actions call through src/api/tauri.ts.
// Hover is kept here but the canvas subscribes imperatively (no full-app re-render).

import { create } from "zustand";
import { backend, type ExportFormat, type SortBy } from "../api/tauri";
import {
  completeDockProgress,
  resetDockProgress,
  updateDockProgress,
} from "../dock/dockProgress";
import type {
  DiffResult,
  DupComplete,
  DupGroup,
  DupProgress,
  FileCategory,
  FileHit,
  NodeKind,
  NodeView,
  ScanProgress,
  SnapshotMeta,
  Volume,
} from "../types/model";

export const VIEW_DEPTH = 5;
export const VIEW_MAX_CHILDREN = 50;
export const VIEW_MIN_FRACTION = 0.002;

// Large Files finder defaults
export const FILES_LIMIT = 500;
const DEFAULT_MIN_SIZE = 100e6; // 100 MB
const FILES_DEBOUNCE_MS = 250;

// Duplicate finder defaults
const DEFAULT_DUP_MIN_SIZE = 50e6; // 50 MB

// Compare diff view params
const DIFF_DEPTH = 3;
const DIFF_MAX_CHILDREN = 30;

export type ViewMode = "chart" | "files" | "duplicates" | "compare";
export type DupStatus = "idle" | "running" | "done";

export interface FilesQuery {
  minSize: number;
  olderThanDays: number;
  categories: FileCategory[];
  sortBy: SortBy;
  ascending: boolean;
}

let filesDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export interface Crumb {
  id: number;
  name: string;
}

export interface CollectorItem {
  id: number;
  name: string;
  size: number;
  kind: NodeKind;
}

export interface ContextTarget {
  id: number;
  name: string;
  kind: NodeKind;
  size: number;
  x: number;
  y: number;
}

type Screen = "drives" | "scan";

interface AppState {
  screen: Screen;
  volumes: Volume[];
  volumesLoading: boolean;
  currentVolume: Volume | null;

  scanning: boolean;
  progress: ScanProgress | null;
  rootId: number | null;

  viewRoot: NodeView | null;
  viewStack: Crumb[];
  viewLoading: boolean;

  hoveredId: number | null;
  selectedId: number | null;
  error: string | null;

  collector: CollectorItem[];
  collectorOpen: boolean;
  contextTarget: ContextTarget | null;

  // ---- Mode switcher ----
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // ---- Large Files finder (P1) ----
  filesQuery: FilesQuery;
  filesResult: FileHit[];
  filesLoading: boolean;
  setFilesQuery: (patch: Partial<FilesQuery>) => void;
  runFindFiles: () => Promise<void>;
  exportFiles: (format: ExportFormat) => Promise<void>;

  // ---- Duplicate finder (P3) ----
  dupStatus: DupStatus;
  dupMinSize: number;
  dupProgress: DupProgress | null;
  dupGroups: DupGroup[];
  dupTotalWasted: number;
  setDupMinSize: (n: number) => void;
  findDuplicates: () => Promise<void>;
  cancelDuplicates: () => Promise<void>;
  onDupProgress: (p: DupProgress) => void;
  onDupComplete: (c: DupComplete) => void;
  onDupError: (message: string) => void;
  trashDupFiles: (ids: number[]) => Promise<void>;

  // ---- Snapshot / Compare (P2) ----
  snapshots: SnapshotMeta[];
  selectedSnapshotId: string | null;
  diffResult: DiffResult | null;
  compareLoading: boolean;
  loadSnapshots: () => Promise<void>;
  setSelectedSnapshot: (id: string | null) => void;
  runCompare: () => Promise<void>;
  deleteSnapshot: (id: string) => Promise<void>;

  // ---- Full Disk Access ----
  /** null = not checked yet, false = missing (show the banner). */
  fdaGranted: boolean | null;
  checkFda: () => Promise<void>;

  // ---- Toast ----
  toast: string | null;
  showToast: (message: string) => void;
  clearToast: () => void;

  loadVolumes: () => Promise<void>;
  startScan: (volume: Volume) => Promise<void>;
  onProgress: (p: ScanProgress) => void;
  onComplete: (rootId: number) => Promise<void>;
  onError: (message: string) => void;

  rescan: () => Promise<void>;
  changeDrive: () => Promise<void>;

  zoomTo: (nodeId: number, name: string) => Promise<void>;
  goUp: () => Promise<void>;
  goToCrumb: (index: number) => Promise<void>;

  setHovered: (id: number | null) => void;
  setSelected: (id: number | null) => void;

  reveal: (nodeId: number) => Promise<void>;
  quickLook: (nodeId: number) => Promise<void>;
  openInTerminal: (nodeId: number) => Promise<void>;
  trash: (nodeId: number) => Promise<void>;
  clearError: () => void;

  cancelScan: () => Promise<void>;

  openContextMenu: (t: ContextTarget) => void;
  closeContextMenu: () => void;

  addToCollector: (item: CollectorItem) => void;
  removeFromCollector: (id: number) => void;
  clearCollector: () => void;
  setCollectorOpen: (open: boolean) => void;
  trashCollector: () => Promise<void>;
}

async function loadView(nodeId: number): Promise<NodeView> {
  return backend.getView({
    nodeId,
    depth: VIEW_DEPTH,
    maxChildren: VIEW_MAX_CHILDREN,
    minFraction: VIEW_MIN_FRACTION,
  });
}

export const useAppStore = create<AppState>((set, get) => ({
  screen: "drives",
  volumes: [],
  volumesLoading: false,
  currentVolume: null,

  scanning: false,
  progress: null,
  rootId: null,

  viewRoot: null,
  viewStack: [],
  viewLoading: false,

  hoveredId: null,
  selectedId: null,
  error: null,

  collector: [],
  collectorOpen: false,
  contextTarget: null,

  viewMode: "chart",

  filesQuery: {
    minSize: DEFAULT_MIN_SIZE,
    olderThanDays: 0,
    categories: [],
    sortBy: "size",
    ascending: false,
  },
  filesResult: [],
  filesLoading: false,

  dupStatus: "idle",
  dupMinSize: DEFAULT_DUP_MIN_SIZE,
  dupProgress: null,
  dupGroups: [],
  dupTotalWasted: 0,

  snapshots: [],
  selectedSnapshotId: null,
  diffResult: null,
  compareLoading: false,

  fdaGranted: null,

  async checkFda() {
    try {
      const granted = await backend.checkFullDiskAccess();
      set({ fdaGranted: granted });
    } catch {
      set({ fdaGranted: true }); // fail open: never block the UI over the probe
    }
  },

  toast: null,

  async loadVolumes() {
    set({ volumesLoading: true, error: null });
    try {
      let volumes = await backend.listVolumes();
      if (volumes.length === 0) {
        // Transient empty result (e.g. heavy IO during a running scan) — retry once.
        await new Promise((r) => setTimeout(r, 800));
        volumes = await backend.listVolumes();
      }
      set({ volumes, volumesLoading: false });
    } catch (e) {
      set({ volumesLoading: false, error: String(e) });
    }
  },

  async startScan(volume) {
    set({
      screen: "scan",
      scanning: true,
      currentVolume: volume,
      progress: null,
      viewRoot: null,
      viewStack: [],
      rootId: null,
      hoveredId: null,
      selectedId: null,
      error: null,
      collector: [],
      collectorOpen: false,
      contextTarget: null,
      viewMode: "chart",
      filesResult: [],
      filesLoading: false,
      dupStatus: "idle",
      dupProgress: null,
      dupGroups: [],
      dupTotalWasted: 0,
      diffResult: null,
      selectedSnapshotId: null,
    });
    try {
      await backend.startScan(volume.mountPoint);
    } catch (e) {
      set({ scanning: false, error: String(e) });
    }
  },

  onProgress(p) {
    if (!get().scanning) return;
    set({ progress: p });
    // Dock ring (iOS-update style): estimate against the volume's used bytes.
    const vol = get().currentVolume;
    const used = vol ? vol.totalBytes - vol.availableBytes : 0;
    if (used > 0) {
      void updateDockProgress(p.bytesScanned / used);
    }
  },

  async onComplete(rootId) {
    set({ rootId, scanning: false });
    void completeDockProgress();
    try {
      const view = await loadView(rootId);
      const name = get().currentVolume?.name ?? view.name;
      set({ viewRoot: view, viewStack: [{ id: rootId, name }], hoveredId: null, selectedId: null });
      // Fire-and-forget: keep this scan as a baseline snapshot for future comparisons.
      const volName = get().currentVolume?.name ?? name;
      backend.saveSnapshot(volName).catch(() => {
        /* snapshot is best-effort; ignore failures */
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  onError(message) {
    set({ scanning: false, error: message });
    void resetDockProgress();
  },

  async rescan() {
    const vol = get().currentVolume;
    if (vol) await get().startScan(vol);
  },

  async changeDrive() {
    try {
      await backend.cancelScan();
    } catch {
      /* ignore */
    }
    void resetDockProgress();
    set({
      screen: "drives",
      scanning: false,
      progress: null,
      viewRoot: null,
      viewStack: [],
      rootId: null,
      currentVolume: null,
      hoveredId: null,
      selectedId: null,
      collector: [],
      collectorOpen: false,
      contextTarget: null,
      viewMode: "chart",
      filesResult: [],
      dupStatus: "idle",
      dupProgress: null,
      dupGroups: [],
      dupTotalWasted: 0,
      diffResult: null,
      selectedSnapshotId: null,
    });
    await get().loadVolumes();
  },

  async zoomTo(nodeId, name) {
    if (nodeId === -1) return; // virtual node is not zoomable
    set({ viewLoading: true, error: null });
    try {
      const view = await loadView(nodeId);
      set((s) => ({
        viewRoot: view,
        viewStack: [...s.viewStack, { id: nodeId, name }],
        viewLoading: false,
        hoveredId: null,
        selectedId: null,
      }));
    } catch (e) {
      set({ viewLoading: false, error: String(e) });
    }
  },

  async goUp() {
    const stack = get().viewStack;
    if (stack.length <= 1) return;
    await get().goToCrumb(stack.length - 2);
  },

  async goToCrumb(index) {
    const stack = get().viewStack;
    if (index < 0 || index >= stack.length) return;
    if (index === stack.length - 1) return;
    const target = stack[index];
    set({ viewLoading: true, error: null });
    try {
      const view = await loadView(target.id);
      set({
        viewRoot: view,
        viewStack: stack.slice(0, index + 1),
        viewLoading: false,
        hoveredId: null,
        selectedId: null,
      });
    } catch (e) {
      set({ viewLoading: false, error: String(e) });
    }
  },

  setHovered(id) {
    if (get().hoveredId !== id) set({ hoveredId: id });
  },

  setSelected(id) {
    set({ selectedId: id });
  },

  async reveal(nodeId) {
    if (nodeId === -1) return;
    try {
      await backend.revealInFinder(nodeId);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  async quickLook(nodeId) {
    if (nodeId === -1) return;
    try {
      await backend.quickLook(nodeId);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  async openInTerminal(nodeId) {
    if (nodeId === -1) return;
    try {
      await backend.openInTerminal(nodeId);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  async trash(nodeId) {
    if (nodeId === -1) return;
    try {
      await backend.moveToTrash(nodeId);
      // reload the current view to refresh
      const stack = get().viewStack;
      const cur = stack[stack.length - 1];
      if (cur) {
        const view = await loadView(cur.id);
        set({ viewRoot: view, hoveredId: null, selectedId: null });
      }
    } catch (e) {
      set({ error: String(e) });
    }
  },

  clearError() {
    set({ error: null });
  },

  async cancelScan() {
    try {
      await backend.cancelScan();
    } catch {
      /* ignore */
    }
    set({ scanning: false });
    void resetDockProgress();
  },

  openContextMenu(t) {
    if (t.id === -1) return; // virtual node has no menu
    set({ contextTarget: t });
  },

  closeContextMenu() {
    set({ contextTarget: null });
  },

  addToCollector(item) {
    if (item.id === -1) return;
    set((s) =>
      s.collector.some((c) => c.id === item.id)
        ? s
        : { collector: [...s.collector, item] },
    );
  },

  removeFromCollector(id) {
    set((s) => ({ collector: s.collector.filter((c) => c.id !== id) }));
  },

  clearCollector() {
    set({ collector: [], collectorOpen: false });
  },

  setCollectorOpen(open) {
    set({ collectorOpen: open });
  },

  async trashCollector() {
    const items = get().collector;
    if (items.length === 0) return;
    for (const it of items) {
      try {
        await backend.moveToTrash(it.id);
      } catch (e) {
        set({ error: String(e) });
      }
    }
    // refresh the current view
    const stack = get().viewStack;
    const cur = stack[stack.length - 1];
    set({ collector: [], collectorOpen: false, hoveredId: null, selectedId: null });
    if (cur) {
      try {
        const view = await loadView(cur.id);
        set({ viewRoot: view });
      } catch (e) {
        set({ error: String(e) });
      }
    }
  },

  // ---- Mode switcher ----
  setViewMode(mode) {
    if (get().viewMode === mode) return;
    set({ viewMode: mode });
    // Lazily fetch data the first time a mode is opened.
    if (mode === "files" && get().filesResult.length === 0 && !get().filesLoading) {
      void get().runFindFiles();
    } else if (mode === "compare" && get().snapshots.length === 0) {
      void get().loadSnapshots();
    }
  },

  // ---- Large Files finder (P1) ----
  setFilesQuery(patch) {
    set((s) => ({ filesQuery: { ...s.filesQuery, ...patch } }));
    if (filesDebounceTimer) clearTimeout(filesDebounceTimer);
    filesDebounceTimer = setTimeout(() => {
      void get().runFindFiles();
    }, FILES_DEBOUNCE_MS);
  },

  async runFindFiles() {
    const q = get().filesQuery;
    set({ filesLoading: true });
    try {
      const hits = await backend.findFiles({
        minSize: q.minSize,
        olderThanDays: q.olderThanDays,
        categories: q.categories,
        limit: FILES_LIMIT,
        sortBy: q.sortBy,
        ascending: q.ascending,
      });
      set({ filesResult: hits, filesLoading: false });
    } catch (e) {
      set({ filesLoading: false, error: String(e) });
    }
  },

  async exportFiles(format) {
    const q = get().filesQuery;
    try {
      const path = await backend.exportFileList({
        minSize: q.minSize,
        olderThanDays: q.olderThanDays,
        categories: q.categories,
        limit: FILES_LIMIT,
        sortBy: q.sortBy,
        ascending: q.ascending,
        format,
      });
      if (path) get().showToast(`Saved to ${path}`);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  // ---- Duplicate finder (P3) ----
  setDupMinSize(n) {
    set({ dupMinSize: n });
  },

  async findDuplicates() {
    set({
      dupStatus: "running",
      dupProgress: null,
      dupGroups: [],
      dupTotalWasted: 0,
      error: null,
    });
    try {
      await backend.findDuplicates(get().dupMinSize);
    } catch (e) {
      set({ dupStatus: "idle", error: String(e) });
    }
  },

  async cancelDuplicates() {
    try {
      await backend.cancelDuplicates();
    } catch {
      /* ignore */
    }
    set({ dupStatus: "idle", dupProgress: null });
  },

  onDupProgress(p) {
    if (get().dupStatus !== "running") return;
    set({ dupProgress: p });
  },

  onDupComplete(c) {
    set({
      dupStatus: "done",
      dupProgress: null,
      dupGroups: c.groups,
      dupTotalWasted: c.totalWasted,
    });
  },

  onDupError(message) {
    set({ dupStatus: "idle", dupProgress: null, error: message });
  },

  async trashDupFiles(ids) {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    for (const id of ids) {
      try {
        await backend.moveToTrash(id);
      } catch (e) {
        set({ error: String(e) });
      }
    }
    // Remove trashed files from their groups and recompute wasted bytes.
    set((s) => {
      const groups = s.dupGroups
        .map((g) => {
          const files = g.files.filter((f) => !idSet.has(f.id));
          const count = files.length;
          return { ...g, files, count, wastedBytes: g.size * Math.max(0, count - 1) };
        })
        .filter((g) => g.files.length >= 2);
      const dupTotalWasted = groups.reduce((sum, g) => sum + g.wastedBytes, 0);
      return { dupGroups: groups, dupTotalWasted };
    });
  },

  // ---- Snapshot / Compare (P2) ----
  async loadSnapshots() {
    try {
      const snaps = await backend.listSnapshots();
      set((s) => {
        // Prefer a snapshot whose rootPath matches the current volume.
        const rootPath = s.currentVolume?.mountPoint;
        const match = snaps.find((sn) => sn.rootPath === rootPath);
        return {
          snapshots: snaps,
          selectedSnapshotId: s.selectedSnapshotId ?? match?.id ?? snaps[0]?.id ?? null,
        };
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setSelectedSnapshot(id) {
    set({ selectedSnapshotId: id });
  },

  async runCompare() {
    const id = get().selectedSnapshotId;
    if (!id) return;
    set({ compareLoading: true, error: null });
    try {
      const result = await backend.diffWithSnapshot({
        id,
        depth: DIFF_DEPTH,
        maxChildren: DIFF_MAX_CHILDREN,
      });
      set({ diffResult: result, compareLoading: false });
    } catch (e) {
      set({ compareLoading: false, error: String(e) });
    }
  },

  async deleteSnapshot(id) {
    try {
      await backend.deleteSnapshot(id);
    } catch (e) {
      set({ error: String(e) });
    }
    set((s) => {
      const snapshots = s.snapshots.filter((sn) => sn.id !== id);
      const selectedSnapshotId =
        s.selectedSnapshotId === id ? snapshots[0]?.id ?? null : s.selectedSnapshotId;
      const diffResult = s.diffResult?.before.id === id ? null : s.diffResult;
      return { snapshots, selectedSnapshotId, diffResult };
    });
  },

  // ---- Toast ----
  showToast(message) {
    set({ toast: message });
  },

  clearToast() {
    set({ toast: null });
  },
}));
