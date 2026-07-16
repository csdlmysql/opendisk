// Pill-segment breadcrumb: "Disks" → path segments, chevron in between.
import { useAppStore } from "../store/useAppStore";
import { truncateMiddle } from "../utils/format";
import { ChevronRightIcon } from "./icons";

export default function Breadcrumb() {
  const stack = useAppStore((s) => s.viewStack);
  const goToCrumb = useAppStore((s) => s.goToCrumb);
  const changeDrive = useAppStore((s) => s.changeDrive);

  return (
    <nav className="breadcrumb" aria-label="Path">
      <button className="crumb root" onClick={changeDrive} title="Choose a different disk">
        Disks
      </button>
      {stack.map((c, i) => {
        const isLast = i === stack.length - 1;
        return (
          <span
            key={`${c.id}-${i}`}
            style={{ display: "inline-flex", alignItems: "center", minWidth: 0 }}
          >
            <ChevronRightIcon className="crumb-sep" size={13} />
            <button
              className={`crumb${isLast ? " current" : ""}`}
              onClick={() => goToCrumb(i)}
              disabled={isLast}
              title={c.name}
            >
              {truncateMiddle(c.name, 22)}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
