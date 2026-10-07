import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";

const COLORS = ["#2563EB", "#4F46E5", "#06B6D4", "#22C55E", "#F59E0B"];

/** Lightweight confetti burst — fires whenever `trigger` changes to a new truthy value. */
export function Confetti({ trigger }: { trigger: number }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!trigger) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 1800);
    return () => clearTimeout(t);
  }, [trigger]);

  const pieces = Array.from({ length: 60 });

  return (
    <AnimatePresence>
      {show && (
        <div className="pointer-events-none fixed inset-0 z-[200] overflow-hidden">
          {pieces.map((_, i) => {
            const left = Math.random() * 100;
            const color = COLORS[i % COLORS.length];
            const size = 6 + Math.random() * 8;
            const delay = Math.random() * 0.25;
            const rotate = Math.random() * 360;
            return (
              <motion.div
                key={i}
                initial={{ y: -40, x: `${left}vw`, opacity: 1, rotate }}
                animate={{ y: "110vh", rotate: rotate + 360, opacity: [1, 1, 0.6] }}
                transition={{ duration: 1.4 + Math.random() * 0.6, delay, ease: "easeIn" }}
                style={{
                  position: "absolute",
                  width: size,
                  height: size * 0.6,
                  backgroundColor: color,
                  borderRadius: 2,
                }}
              />
            );
          })}
        </div>
      )}
    </AnimatePresence>
  );
}
