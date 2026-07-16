// API layer: wraps all of Tauri's invoke/listen.
// If NOT running inside Tauri (no window.__TAURI_INTERNALS__) -> use mockBackend.

import type {
  DiffResult,
  DupComplete,
  DupError,
  DupProgress,
  FileCategory,
  FileHit,
  NodeView,
  ScanComplete,
  ScanError,
  ScanProgress,
  SnapshotMeta,
  Volume,
} from "../types/model";
import { mockBackend } from "./mock";

export type UnlistenFn = () => void;

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

interface GetViewArgs {
  nodeId: number;
  depth: number;
  maxChildren: number;
  minFraction: number;
}

export type SortBy = "size" | "mtime" | "name";
export type ExportFormat = "csv" | "json";

export interface FindFilesArgs {
  minSize: number;
  olderThanDays: number;
  categories: FileCategory[];
  limit: number;
  sortBy: SortBy;
  ascending: boolean;
}

export interface ExportArgs extends FindFilesArgs {
  format: ExportFormat;
}

export interface Backend {
  listVolumes(): Promise<Volume[]>;
  startScan(path: string): Promise<void>;
  cancelScan(): Promise<void>;
  getView(args: GetViewArgs): Promise<NodeView>;
  getNodePath(nodeId: number): Promise<string>;
  revealInFinder(nodeId: number): Promise<void>;
  quickLook(nodeId: number): Promise<void>;
  openInTerminal(nodeId: number): Promise<void>;
  moveToTrash(nodeId: number): Promise<void>;
  /** Returns null if the user cancels. Throws if the command does not exist. */
  pickFolder(): Promise<string | null>;
  /** macOS Dock icon override (base64 PNG), null restores the default. */
  setDockIcon(pngBase64: string | null): Promise<void>;
  onScanProgress(cb: (p: ScanProgress) => void): Promise<UnlistenFn>;
  onScanComplete(cb: (c: ScanComplete) => void): Promise<UnlistenFn>;
  onScanError(cb: (e: ScanError) => void): Promise<UnlistenFn>;

  // ---- Large Files finder (P1) ----
  findFiles(args: FindFilesArgs): Promise<FileHit[]>;
  /** Returns the written file path, or null if the user cancelled the save dialog. */
  exportFileList(args: ExportArgs): Promise<string | null>;

  // ---- Snapshot / Compare (P2) ----
  saveSnapshot(volumeName: string): Promise<SnapshotMeta>;
  listSnapshots(): Promise<SnapshotMeta[]>;
  deleteSnapshot(id: string): Promise<void>;
  diffWithSnapshot(args: {
    id: string;
    depth: number;
    maxChildren: number;
  }): Promise<DiffResult>;

  // ---- Duplicate finder (P3) ----
  findDuplicates(minSize: number): Promise<void>;
  cancelDuplicates(): Promise<void>;
  onDupProgress(cb: (p: DupProgress) => void): Promise<UnlistenFn>;
  onDupComplete(cb: (c: DupComplete) => void): Promise<UnlistenFn>;
  onDupError(cb: (e: DupError) => void): Promise<UnlistenFn>;
}

// ---- Real backend via Tauri ----
function createTauriBackend(): Backend {
  // dynamic import so tree-shaking still works on plain web (but @tauri-apps/api is always available)
  const load = () => import("@tauri-apps/api/core");
  const loadEvent = () => import("@tauri-apps/api/event");

  return {
    async listVolumes() {
      const { invoke } = await load();
      return invoke<Volume[]>("list_volumes");
    },
    async startScan(path) {
      const { invoke } = await load();
      await invoke("start_scan", { path });
    },
    async cancelScan() {
      const { invoke } = await load();
      await invoke("cancel_scan");
    },
    async getView(args) {
      const { invoke } = await load();
      return invoke<NodeView>("get_view", args as unknown as Record<string, unknown>);
    },
    async getNodePath(nodeId) {
      const { invoke } = await load();
      return invoke<string>("get_node_path", { nodeId });
    },
    async revealInFinder(nodeId) {
      const { invoke } = await load();
      await invoke("reveal_in_finder", { nodeId });
    },
    async quickLook(nodeId) {
      const { invoke } = await load();
      await invoke("quick_look", { nodeId });
    },
    async openInTerminal(nodeId) {
      const { invoke } = await load();
      await invoke("open_in_terminal", { nodeId });
    },
    async moveToTrash(nodeId) {
      const { invoke } = await load();
      await invoke("move_to_trash", { nodeId });
    },
    async pickFolder() {
      const { invoke } = await load();
      // optional command — may not exist; the caller will try/catch.
      return invoke<string | null>("pick_folder");
    },
    async setDockIcon(pngBase64) {
      const { invoke } = await load();
      await invoke("set_dock_icon", { pngBase64 });
    },
    async onScanProgress(cb) {
      const { listen } = await loadEvent();
      return listen<ScanProgress>("scan-progress", (e) => cb(e.payload));
    },
    async onScanComplete(cb) {
      const { listen } = await loadEvent();
      return listen<ScanComplete>("scan-complete", (e) => cb(e.payload));
    },
    async onScanError(cb) {
      const { listen } = await loadEvent();
      return listen<ScanError>("scan-error", (e) => cb(e.payload));
    },

    async findFiles(args) {
      const { invoke } = await load();
      return invoke<FileHit[]>("find_files", args as unknown as Record<string, unknown>);
    },
    async exportFileList(args) {
      const { invoke } = await load();
      return invoke<string | null>(
        "export_file_list",
        args as unknown as Record<string, unknown>,
      );
    },
    async saveSnapshot(volumeName) {
      const { invoke } = await load();
      return invoke<SnapshotMeta>("save_snapshot", { volumeName });
    },
    async listSnapshots() {
      const { invoke } = await load();
      return invoke<SnapshotMeta[]>("list_snapshots");
    },
    async deleteSnapshot(id) {
      const { invoke } = await load();
      await invoke("delete_snapshot", { id });
    },
    async diffWithSnapshot(args) {
      const { invoke } = await load();
      return invoke<DiffResult>(
        "diff_with_snapshot",
        args as unknown as Record<string, unknown>,
      );
    },
    async findDuplicates(minSize) {
      const { invoke } = await load();
      await invoke("find_duplicates", { minSize });
    },
    async cancelDuplicates() {
      const { invoke } = await load();
      await invoke("cancel_duplicates");
    },
    async onDupProgress(cb) {
      const { listen } = await loadEvent();
      return listen<DupProgress>("dup-progress", (e) => cb(e.payload));
    },
    async onDupComplete(cb) {
      const { listen } = await loadEvent();
      return listen<DupComplete>("dup-complete", (e) => cb(e.payload));
    },
    async onDupError(cb) {
      const { listen } = await loadEvent();
      return listen<DupError>("dup-error", (e) => cb(e.payload));
    },
  };
}

// ---- Mock backend for web ----
function createMockBackend(): Backend {
  return {
    listVolumes: () => mockBackend.listVolumes(),
    startScan: (path) => mockBackend.startScan(path),
    cancelScan: () => mockBackend.cancelScan(),
    getView: (args) => mockBackend.getView(args),
    getNodePath: (id) => mockBackend.getNodePath(id),
    revealInFinder: (id) => mockBackend.revealInFinder(id),
    quickLook: (id) => mockBackend.quickLook(id),
    openInTerminal: (id) => mockBackend.openInTerminal(id),
    moveToTrash: (id) => mockBackend.moveToTrash(id),
    pickFolder: () => mockBackend.pickFolder(),
    setDockIcon: async () => {
      /* no Dock on the web — no-op */
    },
    onScanProgress: async (cb) => mockBackend.onScanProgress(cb),
    onScanComplete: async (cb) => mockBackend.onScanComplete(cb),
    onScanError: async (cb) => mockBackend.onScanError(cb),
    findFiles: (args) => mockBackend.findFiles(args),
    exportFileList: (args) => mockBackend.exportFileList(args),
    saveSnapshot: (name) => mockBackend.saveSnapshot(name),
    listSnapshots: () => mockBackend.listSnapshots(),
    deleteSnapshot: (id) => mockBackend.deleteSnapshot(id),
    diffWithSnapshot: (args) => mockBackend.diffWithSnapshot(args),
    findDuplicates: (minSize) => mockBackend.findDuplicates(minSize),
    cancelDuplicates: () => mockBackend.cancelDuplicates(),
    onDupProgress: async (cb) => mockBackend.onDupProgress(cb),
    onDupComplete: async (cb) => mockBackend.onDupComplete(cb),
    onDupError: async (cb) => mockBackend.onDupError(cb),
  };
}

export const backend: Backend = isTauri() ? createTauriBackend() : createMockBackend();
