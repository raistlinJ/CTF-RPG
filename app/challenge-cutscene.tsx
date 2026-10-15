"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export type Cutscene = { id: string; object: string; phase: "discovery" | "solve"; url: string; playbackId: string };

export default function ChallengeCutscene({ scene, onDone }: { scene: Cutscene; onDone: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const finished = useRef(false);
  const [needsPlay, setNeedsPlay] = useState(false);
  const [error, setError] = useState("");
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    video.current?.pause();
    onDone();
  }, [onDone]);
  useEffect(() => {
    const skipOnSpace = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      finish();
    };
    window.addEventListener("keydown", skipOnSpace, true);
    return () => window.removeEventListener("keydown", skipOnSpace, true);
  }, [finish]);
  const attachVideo = useCallback((element: HTMLVideoElement | null) => {
    video.current = element;
    if (element) void element.play().catch(() => {
      if (video.current === element) setNeedsPlay(true);
    });
  }, []);
  return <Dialog open onOpenChange={open => { if (!open) finish(); }}>
    <DialogContent className="cutscene-modal" aria-describedby={undefined} onInteractOutside={e => e.preventDefault()}>
      <span className="eyebrow">{scene.phase === "discovery" ? "DISCOVERY CUTSCENE" : "SOLVE CUTSCENE"}</span>
      <DialogTitle>{scene.object}</DialogTitle>
      <video ref={attachVideo} src={scene.url} controls playsInline preload="auto" onEnded={finish}
        aria-label={`${scene.object}: ${scene.phase} cutscene`}
        onPlay={() => setNeedsPlay(false)}
        onError={() => setError("This video could not be played. You can continue and try replaying it later.")} />
      {needsPlay && !error && <button className="primary" onClick={() => {
        void video.current?.play().catch(() => setError("Playback could not start. Try the video controls or continue."));
      }}>Play cutscene</button>}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="secondary-button" onClick={finish}>{error ? "Continue" : "Skip cutscene (Space)"}</button>
    </DialogContent>
  </Dialog>;
}
