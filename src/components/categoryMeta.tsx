// Shared category metadata: label + icon for each FileCategory.
import type { ReactNode } from "react";
import type { FileCategory } from "../types/model";
import {
  AppIcon,
  ArchiveIcon,
  AudioIcon,
  CodeIcon,
  DiskIcon,
  DocumentIcon,
  ImageIcon,
  OtherFileIcon,
  VideoIcon,
} from "./icons";

interface CategoryMeta {
  label: string; // plural label used by filter chips
  icon: (size?: number) => ReactNode;
}

export const CATEGORY_META: Record<FileCategory, CategoryMeta> = {
  image: { label: "Images", icon: (s) => <ImageIcon size={s} /> },
  video: { label: "Video", icon: (s) => <VideoIcon size={s} /> },
  audio: { label: "Audio", icon: (s) => <AudioIcon size={s} /> },
  archive: { label: "Archives", icon: (s) => <ArchiveIcon size={s} /> },
  diskimage: { label: "Disk Images", icon: (s) => <DiskIcon size={s} /> },
  application: { label: "Apps", icon: (s) => <AppIcon size={s} /> },
  document: { label: "Documents", icon: (s) => <DocumentIcon size={s} /> },
  code: { label: "Code", icon: (s) => <CodeIcon size={s} /> },
  other: { label: "Other", icon: (s) => <OtherFileIcon size={s} /> },
};

export const CATEGORY_ORDER: FileCategory[] = [
  "image",
  "video",
  "audio",
  "archive",
  "diskimage",
  "application",
  "document",
  "code",
  "other",
];

export function CategoryIcon({ category, size = 15 }: { category: FileCategory; size?: number }) {
  return <>{CATEGORY_META[category].icon(size)}</>;
}
