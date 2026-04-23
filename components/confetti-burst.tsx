"use client";

import confetti from "canvas-confetti";
import { useEffect } from "react";

interface ConfettiBurstProps {
  /**
   * Changing this prop re-fires the celebration. Pass a unique value (level
   * + score, attempt id, etc.) for each new completion so a "Play again"
   * triggers a fresh burst.
   */
  fireKey: string | number;
}

/**
 * Renders nothing — fires a multi-burst confetti animation when mounted or
 * when `fireKey` changes. Cleans up its scheduled timers on unmount.
 */
export function ConfettiBurst({ fireKey }: ConfettiBurstProps) {
  useEffect(() => {
    let cancelled = false;
    const timeouts: number[] = [];

    function fireSide(originX: number) {
      if (cancelled) return;
      confetti({
        particleCount: 80,
        spread: 70,
        startVelocity: 55,
        origin: { x: originX, y: 0.7 },
        scalar: 1,
        ticks: 220,
      });
    }

    confetti({
      particleCount: 140,
      spread: 100,
      startVelocity: 50,
      origin: { x: 0.5, y: 0.6 },
      ticks: 240,
    });

    [200, 450].forEach((delay) => {
      timeouts.push(
        window.setTimeout(() => fireSide(0.15), delay),
        window.setTimeout(() => fireSide(0.85), delay + 120),
      );
    });

    timeouts.push(
      window.setTimeout(() => {
        if (cancelled) return;
        confetti({
          particleCount: 220,
          spread: 160,
          startVelocity: 35,
          origin: { x: 0.5, y: 0.4 },
          gravity: 0.7,
          scalar: 1.1,
          ticks: 300,
        });
      }, 750),
    );

    return () => {
      cancelled = true;
      for (const id of timeouts) window.clearTimeout(id);
    };
  }, [fireKey]);

  return null;
}
