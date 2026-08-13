"use client";

import { useState, FormEvent, useRef } from "react";
import { Mic, MicOff } from "lucide-react";
import { useAgenticSearch, useFeatureFlags } from "@/lib/hooks";
import { SearchResultRenderer } from "./SearchResultRenderer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const EXAMPLE_PROMPTS = [
  "show open jobs",
  "candidates with React skills",
  "who cleared round 2 for the SDE - Frontend role",
];

export function SearchBar() {
  const [prompt, setPrompt] = useState("");
  const [listening, setListening] = useState(false);
  const search = useAgenticSearch();
  const { data: flags } = useFeatureFlags();
  const recognitionRef = useRef<any>(null);

  const voiceEnabled = flags?.find((f) => f.key === "voice_search_enabled")?.enabled ?? false;
  const SpeechRecognitionCtor =
    typeof window !== "undefined" ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;
  const voiceSupported = voiceEnabled && !!SpeechRecognitionCtor;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    search.mutate(prompt);
  }

  function toggleListening() {
    if (!SpeechRecognitionCtor) return;

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setPrompt(transcript);
      search.mutate(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex-1 relative">
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask anything — e.g. who cleared round 2 for the SDE role"
            className={voiceSupported ? "pr-10" : ""}
          />
          {voiceSupported && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleListening}
              title={listening ? "Stop listening" : "Search by voice"}
              className={`absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 ${
                listening ? "bg-warning text-warning-foreground animate-pulse" : "text-muted-foreground"
              }`}
            >
              {listening ? <MicOff size={15} /> : <Mic size={15} />}
            </Button>
          )}
        </div>
        <Button type="submit" disabled={search.isPending}>
          {search.isPending ? "Thinking..." : "Search"}
        </Button>
      </form>

      <div className="flex flex-wrap gap-2 mt-3">
        {EXAMPLE_PROMPTS.map((p) => (
          <Button
            key={p}
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setPrompt(p);
              search.mutate(p);
            }}
            className="rounded-full text-xs"
          >
            {p}
          </Button>
        ))}
      </div>

      <div className="mt-6">
        {search.isError && <p className="text-sm text-destructive">{(search.error as Error).message}</p>}
        {search.data && <SearchResultRenderer result={search.data} />}
      </div>
    </div>
  );
}
