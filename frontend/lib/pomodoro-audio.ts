export function playCompletionChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.56);
  } catch {
    // Ignore browser audio autoplay restrictions before user interaction
  }
}

export function requestPomodoroNotificationPermission(): void {
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    void Notification.requestPermission();
  }
}

export function showPomodoroBrowserNotification(title: string, body: string): void {
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification(title, { body });
    } catch {
      // Ignore environments restricting Notification constructor
    }
  }
}

