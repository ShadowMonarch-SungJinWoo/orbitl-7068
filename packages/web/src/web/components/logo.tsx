import { cn } from "../lib/utils";

/** OrbitL brand mark. Sits on a subtle tile so the darker part of the mark reads on any surface. */
export function Logo({ className, size = 36 }: { className?: string; size?: number }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-xl bg-white/[0.06] ring-1 ring-white/10 shadow-soft dark:bg-white/[0.06]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <img
        src="/images/orbitl-logo.png"
        alt="OrbitL"
        width={size}
        height={size}
        className="size-[78%] object-contain"
        draggable={false}
      />
    </span>
  );
}
