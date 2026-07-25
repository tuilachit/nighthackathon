"use client";

import { useEffect, useRef, useState } from "react";

const MAX_RECORDING_MS = 20_000;

interface VoiceRecorderProps {
  readonly onTranscript: (text: string) => void;
}

type RecorderStatus = "idle" | "recording" | "transcribing" | "error";

export function VoiceRecorder({
  onTranscript,
}: VoiceRecorderProps): React.JSX.Element {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<number | undefined>(undefined);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(
    () => () => {
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current);
      }
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
      stopTracks(streamRef.current);
    },
    [],
  );

  async function startRecording(): Promise<void> {
    if (
      !("MediaRecorder" in window) ||
      navigator.mediaDevices?.getUserMedia === undefined
    ) {
      setStatus("error");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType === undefined ? undefined : { mimeType },
      );
      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        stopTracks(stream);
        streamRef.current = null;
        void uploadRecording(chunksRef.current, recorder.mimeType || mimeType || "audio/webm");
      };
      recorder.start();
      setStatus("recording");
      timeoutRef.current = window.setTimeout(stopRecording, MAX_RECORDING_MS);
    } catch {
      stopTracks(streamRef.current);
      streamRef.current = null;
      setStatus("error");
    }
  }

  function stopRecording(): void {
    if (timeoutRef.current !== undefined) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }

  async function uploadRecording(chunks: readonly Blob[], mimeType: string): Promise<void> {
    setStatus("transcribing");
    const extension = mimeType.includes("mp4") ? "m4a" : mimeType.includes("mpeg") ? "mp3" : "webm";
    const audio = new File([...chunks], `furniture-query.${extension}`, { type: mimeType });
    const formData = new FormData();
    formData.set("audio", audio);

    try {
      const response = await fetch("/api/transcribe", { method: "POST", body: formData });
      if (!response.ok) {
        setStatus("error");
        return;
      }
      const data = (await response.json()) as { readonly text?: unknown };
      if (typeof data.text !== "string" || data.text.trim().length === 0) {
        setStatus("error");
        return;
      }
      onTranscript(data.text.trim());
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  const isBusy = status === "recording" || status === "transcribing";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-pressed={status === "recording"}
        disabled={status === "transcribing"}
        onClick={() => {
          if (status === "recording") {
            stopRecording();
          } else {
            void startRecording();
          }
        }}
        className="min-h-11 rounded-xl border border-[#cfc7ba] bg-white px-4 text-sm font-bold text-[#4f493f] disabled:cursor-wait disabled:opacity-60"
      >
        {status === "recording"
          ? "Stop recording"
          : status === "transcribing"
            ? "Transcribing…"
            : "Push to talk"}
      </button>
      <span aria-live="polite" className="text-xs font-semibold text-[#766e61]">
        {status === "recording"
          ? "Listening · stops after 20 seconds"
          : status === "error"
            ? "Voice unavailable. Type your search instead."
            : isBusy
              ? "Processing voice"
              : "Optional"}
      </span>
    </div>
  );
}

function pickMimeType(): string | undefined {
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((mimeType) =>
    MediaRecorder.isTypeSupported(mimeType),
  );
}

function stopTracks(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}
