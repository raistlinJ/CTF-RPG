"use client";
import { useCallback, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export type Cutscene = { id: string; object: string; phase: "discovery" | "solve"; url: string; playbackId: string };

export default function ChallengeCutscene({ scene, onDone }: { scene: Cutscene; onDone: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [needsPlay, setNeedsPlay] = useState(false);
  const [error, setError] = useState("");
  const attachVideo = useCallback((element: HTMLVideoElement | null) => {
    video.current = element;
    if (element) void element.play().catch(() => {
      if (video.current === element) setNeedsPlay(true);
    });
  }, []);
  return <Dialog open onOpenChange={open => { if (!open) onDone(); }}>
    <DialogContent className="cutscene-modal" aria-describedby={undefined} onInteractOutside={e => e.preventDefault()}>
      <span className="eyebrow">{scene.phase === "discovery" ? "DISCOVERY CUTSCENE" : "SOLVE CUTSCENE"}</span>
      <DialogTitle>{scene.object}</DialogTitle>
      <video ref={attachVideo} src={scene.url} controls playsInline preload="auto" onEnded={onDone}
        aria-label={`${scene.object}: ${scene.phase} cutscene`}
        onPlay={() => setNeedsPlay(false)}
        onError={() => setError("This video could not be played. You can continue and try replaying it later.")} />
      {needsPlay && !error && <button className="primary" onClick={() => {
        void video.current?.play().catch(() => setError("Playback could not start. Try the video controls or continue."));
      }}>Play cutscene</button>}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="secondary-button" onClick={onDone}>{error ? "Continue" : "Skip cutscene"}</button>
    </DialogContent>
  </Dialog>;
}
