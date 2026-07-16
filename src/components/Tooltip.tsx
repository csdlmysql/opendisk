// Lightweight tooltip, updated imperatively (no canvas re-render on hover).
import { forwardRef, useImperativeHandle, useRef } from "react";

export interface TooltipHandle {
  show(x: number, y: number, name: string, meta: string): void;
  hide(): void;
}

const Tooltip = forwardRef<TooltipHandle>(function Tooltip(_props, ref) {
  const elRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLDivElement>(null);
  const metaRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    show(x, y, name, meta) {
      const el = elRef.current;
      if (!el) return;
      el.style.display = "block";
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      if (nameRef.current) nameRef.current.textContent = name;
      if (metaRef.current) metaRef.current.textContent = meta;
    },
    hide() {
      if (elRef.current) elRef.current.style.display = "none";
    },
  }));

  return (
    <div className="tooltip" ref={elRef} style={{ display: "none" }} role="tooltip">
      <div className="t-name" ref={nameRef} />
      <div className="t-meta tabnum" ref={metaRef} />
    </div>
  );
});

export default Tooltip;
