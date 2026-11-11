"use client";

import { useEffect, useRef } from "react";

import {
  playCompletionChime,
  showPomodoroBrowserNotification,
} from "@/lib/pomodoro-audio";
import { useRuangKerjaStore } from "@/lib/storage-store";

/**
 * Global background interval runner for the Pomodoro timer so the countdown
 * continues accurately across route changes and notifies the user on finish.
 */
export function PomodoroRuntime() {
  const running = useRuangKerjaStore((s) => s.pomodoroRuntime.running);
  const endsAt = useRuangKerjaStore((s) => s.pomodoroRuntime.endsAt);
  const setPomodoroSecondsLeft = useRuangKerjaStore((s) => s.setPomodoroSecondsLeft);
  const completePomodoroSession = useRuangKerjaStore((s) => s.completePomodoroSession);
  const completingRef = useRef(false);

  useEffect(() => {
    if (!running || !endsAt) {
      completingRef.current = false;
      return;
    }

    const syncTick = () => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setPomodoroSecondsLeft(remaining);
      if (remaining === 0 && !completingRef.current) {
        completingRef.current = true;
        const { message } = completePomodoroSession();
        playCompletionChime();
        showPomodoroBrowserNotification("RuangKerja Pomodoro", message);
      }
    };

    syncTick();
    const id = window.setInterval(syncTick, 500);
    return () => window.clearInterval(id);
  }, [running, endsAt, setPomodoroSecondsLeft, completePomodoroSession]);

  return null;
}

