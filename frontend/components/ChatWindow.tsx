"use client";

import { Component, useEffect, useMemo, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Loader2, Send, Plus, Square, Mic, MicOff, Check, X } from "lucide-react";
import { A2uiSurface } from "@a2ui/react/v0_9";
import { useAuth } from "@/lib/authContext";
import { useAgenticSearchStream, type StreamedResult } from "@/lib/useAgenticSearchStream";
import { buildCatalog, surfaceMessagesToModel, SurfaceActionContext, type SurfaceActionEnvelope } from "@/lib/a2uiCatalog";
import { SearchResultRenderer } from "@/components/SearchResultRenderer";
import { ActionForm } from "@/components/ActionForm";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

class SurfaceErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[A2UI] Surface render error:", error, info);
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

const SUGGESTIONS = [
  "Show all open jobs",
  "Candidates with React skills",
  "Who cleared round 2 for SDE Frontend",
  "Interviews scheduled this week",
  "Candidates in offer stage",
];

// Friendly labels for surface-button-triggered actions (edit_job, archive_job,
// etc.) — these don't come with their own typed prompt, so we synthesize a
// chat bubble for them the same way a typed prompt gets one, giving the
// resulting form/confirmation a place to render "under the search bar".
const ACTION_LABELS: Record<string, string> = {
  view_candidate: "View candidate profile",
  schedule_interview: "Schedule interview",
  edit_job: "Edit job",
  archive_job: "Archive job",
  restore_job: "Restore job",
  edit_candidate: "Edit candidate",
  archive_candidate: "Archive candidate",
  restore_candidate: "Restore candidate",
  reschedule_interview: "Reschedule interview",
  archive_interview: "Archive interview",
  restore_interview: "Restore interview",
  submit_scorecard: "Submit scorecard",
  edit_offer: "Edit offer",
  approve_offer: "Approve offer",
  archive_offer: "Archive offer",
  restore_offer: "Restore offer",
  edit_skill: "Edit skill",
  delete_skill: "Delete skill",
  edit_user: "Edit user",
  archive_user: "Archive user",
  restore_user: "Restore user",
};

function actionLabel(name: string): string {
  return ACTION_LABELS[name] ?? name.replace(/_/g, " ");
}

interface HistoryEntry {
  prompt: string;
  result: StreamedResult | null;
  notice?: { text: string; ok: boolean };
}

export function ChatWindow({ greeting }: { greeting?: string }) {
  const { user } = useAuth();
  const catalog = useMemo(() => buildCatalog(user?.role ?? "HR"), [user?.role]);

  const {
    status, progress, result, pendingAction, error,
    send, stop, dispatchSurfaceAction, confirmAction, cancelAction, clearPendingAction, startNewConversation,
  } = useAgenticSearchStream(catalog);

  const [input, setInput] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [listening, setListening] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string | number>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastPromptRef = useRef<string>("");
  const recognitionRef = useRef<any>(null);

  const SpeechRecognitionCtor =
    typeof window !== "undefined"
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;

  const isActive = status === "connecting" || status === "streaming";
  const isEmpty = history.length === 0 && status === "idle";

  // Append latest result into history when streaming completes
  useEffect(() => {
    if (status === "done" && result) {
      setHistory((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.result === null) {
          updated[updated.length - 1] = { ...last, result };
        }
        return updated;
      });
    }
  }, [status, result]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, progress, pendingAction]);

  function setLatestNotice(notice: { text: string; ok: boolean }) {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      updated[updated.length - 1] = { ...updated[updated.length - 1], notice };
      return updated;
    });
  }

  // Seed local edit state whenever a new proposal comes in (keyed on
  // actionId so re-renders of the same proposal don't clobber user edits).
  useEffect(() => {
    if (pendingAction?.kind === "form" && pendingAction.fields) {
      const seeded: Record<string, string | number> = {};
      for (const f of pendingAction.fields) seeded[f.key] = f.value;
      setFormValues(seeded);
    } else {
      setFormValues({});
    }
  }, [pendingAction?.actionId]);

  function submitPrompt(prompt: string) {
    if (!prompt.trim() || isActive) return;
    setInput("");
    lastPromptRef.current = prompt;
    setHistory((prev) => [...prev, { prompt, result: null }]);
    send(prompt);
  }

  function handleSend() {
    if (isActive) {
      stop();
      return;
    }
    submitPrompt(input);
  }

  function handleSurfaceAction(envelope: SurfaceActionEnvelope) {
    // filter_changed is now handled entirely by the DataModel reactive layer —
    // ChoicePicker.setValue writes the signal, all bound components update locally.
    // Only non-filter actions need a WS round trip.
    if (envelope.name === "filter_changed" || isActive) return;
    setHistory((prev) => [...prev, { prompt: actionLabel(envelope.name), result: null }]);
    dispatchSurfaceAction(envelope);
  }

  function handleNewConversation() {
    stop();
    startNewConversation();
    setHistory([]);
    setInput("");
  }

  function toggleVoice() {
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
      setInput(transcript);
      submitPrompt(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  async function handleConfirm() {
    if (!pendingAction) return;
    setConfirming(true);
    try {
      await confirmAction(pendingAction.actionId, pendingAction.kind === "form" ? formValues : undefined);
      setLatestNotice({ text: `${pendingAction.submitLabel} — done.`, ok: true });
      clearPendingAction();
    } catch (e: any) {
      setLatestNotice({ text: e?.message || "That didn't go through — try again.", ok: false });
    } finally {
      setConfirming(false);
    }
  }

  function setField(key: string, value: string | number) {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCancel() {
    if (!pendingAction) return;
    await cancelAction(pendingAction.actionId);
    setLatestNotice({ text: "Cancelled.", ok: true });
    clearPendingAction();
  }

  return (
    <SurfaceActionContext.Provider value={handleSurfaceAction}>
      {/* Full-height column: messages scroll, input pinned to bottom */}
      <div className="flex flex-col h-full min-h-0">

        {/* ── Message area ── */}
        <div className={`overflow-y-auto space-y-4 pb-4 ${isEmpty ? "hidden" : "flex-1"}`}>


          {/* Conversation history — all entries render their result so previous
              results remain visible after a new query starts. */}
          {history.map((entry, i) => {
            const isLatest = i === history.length - 1;
            return (
              <div key={i} className="space-y-3">
                <div className="flex justify-end">
                  <div className="max-w-xl rounded-2xl bg-primary text-primary-foreground px-4 py-2 text-sm">
                    {entry.prompt}
                  </div>
                </div>
                {/* Response column — left-aligned with room on the right, same
                    "prompt right / response left" shape as WhatsApp/Google Chat,
                    rather than stretching edge-to-edge. */}
                <div className="max-w-[85%] space-y-3">
                  {/* Show stored result for all past entries; show live result for
                      the latest entry once streaming is done. */}
                  {entry.result && !isLatest && (
                    <AgentResult result={entry.result} catalog={catalog} />
                  )}
                  {isLatest && status === "done" && result && !pendingAction && (
                    <AgentResult result={result} catalog={catalog} />
                  )}
                  {/* Create/update/schedule proposals render inline, right here
                      under the turn that proposed them — no modal. Archive/
                      restore/approve/delete stay in the modal below. */}
                  {isLatest && pendingAction?.kind === "form" && (
                    <ActionForm
                      pendingAction={pendingAction}
                      values={formValues}
                      onChange={setField}
                      onSubmit={handleConfirm}
                      onCancel={handleCancel}
                      submitting={confirming}
                    />
                  )}
                  {entry.notice && !(isLatest && pendingAction) && (
                    <div className={`flex items-center gap-1.5 text-sm ${entry.notice.ok ? "text-muted-foreground" : "text-destructive"}`}>
                      {entry.notice.ok ? <Check size={14} /> : <X size={14} />}
                      {entry.notice.text}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Live status */}
          {isActive && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={13} className="animate-spin shrink-0 text-primary" />
                <span className="text-foreground">
                  {progress.length > 0 ? progress[progress.length - 1] : "Connecting…"}
                </span>
              </div>
              <ResultSkeleton />
            </div>
          )}

          {/* Error */}
          {status === "error" && error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Input area ── */}
        <div className={`space-y-2 w-full max-w-2xl mx-auto ${isEmpty ? "my-auto" : "pt-3 border-t border-border"}`}>

          {/* Suggestion cards (empty state) or chips (active conversation) */}
          {isEmpty ? (
            <div className="space-y-3">
              {greeting && (
                <div>
                  <p className="text-xl font-medium text-foreground">{greeting}</p>
                  <p className="text-sm text-muted-foreground">Ask for what you need — the agent will search, filter, and chain lookups for you.</p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => submitPrompt(s)}
                    className="text-left rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.slice(0, 4).map((s) => (
                <button
                  key={s}
                  onClick={() => !isActive && submitPrompt(s)}
                  disabled={isActive}
                  className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input row */}
          <div className="flex items-center gap-2">
            {/* Voice button */}
            {SpeechRecognitionCtor && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={toggleVoice}
                disabled={isActive}
                title={listening ? "Stop listening" : "Voice input"}
                className={listening ? "text-primary animate-pulse" : "text-muted-foreground"}
              >
                {listening ? <MicOff size={18} /> : <Mic size={18} />}
              </Button>
            )}

            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask anything — candidates, jobs, interviews…"
              className="flex-1"
            />

            {/* Send / Stop button */}
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!isActive && !input.trim()}
              title={isActive ? "Stop" : "Send"}
            >
              {isActive ? <Square size={15} /> : <Send size={15} />}
            </Button>

            {/* New conversation */}
            {history.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNewConversation}
                title="New conversation"
              >
                <Plus size={16} />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Confirm modal — reserved for archive/restore/approve/delete: nothing
          to edit, just a brief look at what's affected and a yes/no. */}
      <Dialog open={pendingAction?.kind === "confirm"}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm action</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground py-2">{pendingAction?.description}</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCancel} disabled={confirming}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={confirming}
              variant={pendingAction?.submitLabel === "Delete" ? "destructive" : "default"}
            >
              {confirming && <Loader2 size={14} className="animate-spin mr-1" />}
              {pendingAction?.submitLabel ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SurfaceActionContext.Provider>
  );
}

// Shared frame for a completed turn's response — one shadowed card holding
// the summary + whatever surface rendered, with a soft entrance animation
// so new results don't just pop in.
const RESPONSE_CARD_CLASS =
  "space-y-3 rounded-xl border border-border bg-card p-4 shadow-md animate-in fade-in slide-in-from-bottom-2 duration-300";

function SummaryBanner({ summary }: { summary: string }) {
  const text = summary.replace(/\*\*/g, "").replace(/^[-*]\s+/gm, "");
  if (!text.trim()) return null;
  return (
    <div className="rounded-lg bg-primary/10 px-4 py-3 text-sm text-foreground">{text}</div>
  );
}

// Loading placeholder shown while a query is in flight — a rough shimmer of
// the summary line + a card grid, standing in for whichever pattern
// (grid/table/accordion) ends up rendering once the turn completes.
function ResultSkeleton() {
  return (
    <div className={`${RESPONSE_CARD_CLASS} max-w-[85%]`}>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-border p-4 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <div className="flex gap-1.5 pt-1">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentResult({
  result,
  catalog,
}: {
  result: StreamedResult;
  catalog: ReturnType<typeof buildCatalog>;
}) {
  const fallback = <SearchResultRenderer result={result} />;

  if (result.surfaceModel) {
    return (
      <div className={RESPONSE_CARD_CLASS}>
        <SummaryBanner summary={result.summary} />
        <SurfaceErrorBoundary fallback={fallback}>
          <div className="space-y-2"><A2uiSurface surface={result.surfaceModel} /></div>
        </SurfaceErrorBoundary>
      </div>
    );
  }
  if (result.a2uiMessages) {
    const model = surfaceMessagesToModel(result.a2uiMessages, catalog);
    if (model) {
      return (
        <div className={RESPONSE_CARD_CLASS}>
          <SummaryBanner summary={result.summary} />
          <SurfaceErrorBoundary fallback={fallback}>
            <div className="space-y-2"><A2uiSurface surface={model} /></div>
          </SurfaceErrorBoundary>
        </div>
      );
    }
  }
  return fallback;
}
