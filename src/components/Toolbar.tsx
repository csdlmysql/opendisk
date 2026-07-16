// Top toolbar: Back, breadcrumb, mode switcher, volume name + Rescan + Change disk.
import { useAppStore } from "../store/useAppStore";
import Breadcrumb from "./Breadcrumb";
import ModeSwitcher from "./ModeSwitcher";
import { ArrowLeftIcon, RefreshIcon, SwapIcon } from "./icons";

export default function Toolbar() {
  const stack = useAppStore((s) => s.viewStack);
  const volume = useAppStore((s) => s.currentVolume);
  const scanning = useAppStore((s) => s.scanning);
  const goUp = useAppStore((s) => s.goUp);
  const rescan = useAppStore((s) => s.rescan);
  const changeDrive = useAppStore((s) => s.changeDrive);

  const canGoUp = stack.length > 1;

  return (
    <div className="toolbar">
      <button
        className="icon-btn"
        onClick={goUp}
        disabled={!canGoUp || scanning}
        title="Go to parent folder"
        aria-label="Go to parent folder"
      >
        <ArrowLeftIcon />
      </button>

      <Breadcrumb />

      <ModeSwitcher />

      <div className="toolbar-right">
        {volume && <span className="vol-name" title={volume.name}>{volume.name}</span>}
        <button
          className="icon-btn"
          onClick={rescan}
          disabled={scanning}
          title="Rescan"
          aria-label="Rescan"
        >
          <RefreshIcon />
        </button>
        <button
          className="icon-btn"
          onClick={changeDrive}
          title="Change disk"
          aria-label="Change disk"
        >
          <SwapIcon />
        </button>
      </div>
    </div>
  );
}
