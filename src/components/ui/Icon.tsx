import { ICONS, type IconName, type IconShape } from "@/lib/ui-icons";

// Redesign R0: one icon, drawn in the text's own colour. Decoration (hidden from a screen reader) unless a `label`
// names it — an icon never stands alone for a meaning: a word goes beside it.
export default function Icon({ name, size = 24, strokeWidth = 2, label }: { name: IconName; size?: number; strokeWidth?: number; label?: string }) {
  const shapes = ICONS[name] as readonly IconShape[];
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  return (
    <svg className="ui-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" focusable="false" {...a11y}>
      {shapes.map((s, i) =>
        s.t === "path" ? <path key={i} d={s.d} />
          : s.t === "circle" ? <circle key={i} cx={s.cx} cy={s.cy} r={s.r} />
          : <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} />,
      )}
    </svg>
  );
}
