"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { createHeldMovement, isMovementKey } from "@/lib/player-movement.mjs";

export function useHeldMovement(move: (dx: number, dy: number) => void, enabled: boolean) {
  const latestMove = useRef(move);
  useLayoutEffect(() => { latestMove.current = move; });

  useEffect(() => {
    if (!enabled) return;
    const editable = (target: EventTarget | null) => target instanceof HTMLElement &&
      !!target.closest("input,textarea,select,[contenteditable=true]");
    const controls = createHeldMovement((dx: number, dy: number) => {
      if (document.hidden || editable(document.activeElement) || document.querySelector('[role="dialog"]')) {
        controls.clear();
        return;
      }
      latestMove.current(dx, dy);
    });
    function keydown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || editable(event.target) || document.querySelector('[role="dialog"]')) return;
      // Browser repeat events must not restart a key cleared by blur or a dialog.
      if (event.repeat) {
        if (isMovementKey(event.key)) event.preventDefault();
        return;
      }
      if (controls.press(event.key)) event.preventDefault();
    }
    function keyup(event: KeyboardEvent) { controls.release(event.key); }
    function visibility() { if (document.hidden) controls.clear(); }
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", controls.clear);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      controls.clear();
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", controls.clear);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [enabled]);
}
