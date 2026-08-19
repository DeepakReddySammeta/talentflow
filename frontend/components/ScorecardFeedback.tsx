"use client";

import { Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Interview, Recommendation } from "@/lib/types";

// Single source of truth for how a recommendation reads/colors — three
// pages (candidate detail, job detail, interviews list) all show this same
// value, and previously each had its own slightly-different copy of it.
export const RECOMMENDATION_META: Record<Recommendation, { label: string; color: string }> = {
  STRONG_HIRE: { label: "Strong Hire", color: "text-green-600" },
  HIRE: { label: "Hire", color: "text-green-500" },
  NO_HIRE: { label: "No Hire", color: "text-orange-500" },
  STRONG_NO_HIRE: { label: "Strong No Hire", color: "text-destructive" },
};

/**
 * The recommendation, rendered as a clickable label when a scorecard
 * exists (opening the full feedback — KRA ratings + notes — via onView),
 * or a plain "Pending" note when the round hasn't been scored yet. This
 * was previously just inert text everywhere it appeared — the ratings and
 * notes an interviewer actually writes were captured but never surfaced.
 */
export function RecommendationCell({ interview, onView }: { interview: Interview; onView: (interview: Interview) => void }) {
  const rec = interview.scorecard?.recommendation;
  if (!rec) return <span className="text-xs text-muted-foreground italic">Pending</span>;
  const { label, color } = RECOMMENDATION_META[rec] ?? { label: rec, color: "" };
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onView(interview);
      }}
      className={`text-sm font-medium underline-offset-2 hover:underline ${color}`}
    >
      {label}
    </button>
  );
}

export function ScorecardDetailDialog({
  interview,
  open,
  onClose,
}: {
  interview: Interview | null;
  open: boolean;
  onClose: () => void;
}) {
  const scorecard = interview?.scorecard;
  const ratings = Object.entries(scorecard?.kraRatings ?? {});

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {interview ? `Round ${interview.round} feedback` : "Feedback"}
            {interview?.stage?.name ? ` · ${interview.stage.name}` : ""}
          </DialogTitle>
        </DialogHeader>
        {scorecard && (
          <div className="space-y-4 pt-1">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Recommendation</p>
              <p className={`text-base font-semibold ${RECOMMENDATION_META[scorecard.recommendation]?.color ?? ""}`}>
                {RECOMMENDATION_META[scorecard.recommendation]?.label ?? scorecard.recommendation}
              </p>
            </div>
            {ratings.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">KRA ratings</p>
                <div className="space-y-1.5">
                  {ratings.map(([kra, rating]) => (
                    <div key={kra} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-foreground truncate">{kra}</span>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            className={`h-3.5 w-3.5 ${
                              n <= rating ? "fill-warning text-warning" : "text-muted-foreground/30"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {scorecard.notes && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Notes</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{scorecard.notes}</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground pt-1 border-t border-border">
              Submitted by {interview?.interviewer?.name ?? "—"}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
