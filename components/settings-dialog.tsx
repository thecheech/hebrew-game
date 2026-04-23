"use client";

import { SettingsIcon } from "lucide-react";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  getDefaultTimerSeconds,
  getLevelTitle,
  type LevelId,
} from "@/lib/levels";
import {
  loadSettings,
  saveSettings,
  TIMER_OVERRIDE_MAX,
  TIMER_OVERRIDE_MIN,
} from "@/lib/settings";
import { cn } from "@/lib/utils";

interface SettingsDialogProps {
  /** Current game level — used to show default timer hint. */
  level: LevelId;
}

export function SettingsDialog({ level }: SettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [useOverride, setUseOverride] = useState(false);
  const [seconds, setSeconds] = useState(15);
  const [noTimer, setNoTimer] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);

  function syncFromStorage(nextOpen: boolean) {
    if (!nextOpen) {
      setOpen(false);
      return;
    }
    setOpen(true);
    const s = loadSettings();
    const def = getDefaultTimerSeconds(level);
    setNoTimer(Boolean(s.noTimer));
    const o = s.timerSecondsOverride;
    if (
      o != null &&
      Number.isFinite(o) &&
      o >= TIMER_OVERRIDE_MIN &&
      o <= TIMER_OVERRIDE_MAX
    ) {
      setUseOverride(true);
      setSeconds(o);
    } else if (o != null && Number.isFinite(o) && o >= 3 && o < TIMER_OVERRIDE_MIN) {
      // Legacy saves (3–14s): show minimum valid range in the UI.
      setUseOverride(true);
      setSeconds(TIMER_OVERRIDE_MIN);
    } else {
      setUseOverride(false);
      setSeconds(
        Math.min(TIMER_OVERRIDE_MAX, Math.max(TIMER_OVERRIDE_MIN, def)),
      );
    }
    setAutoAdvance(s.autoAdvance);
  }

  function handleSave() {
    saveSettings({
      noTimer,
      timerSecondsOverride: useOverride ? seconds : null,
      autoAdvance,
    });
    setOpen(false);
  }

  const def = getDefaultTimerSeconds(level);

  return (
    <Dialog open={open} onOpenChange={syncFromStorage}>
      <DialogTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "shrink-0",
        )}
        aria-label="Game settings"
      >
        <SettingsIcon className="size-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Set seconds per word (15–60), or disable the timer entirely. If
            custom timer is off and no-timer is off, each level uses its own
            default ({getLevelTitle(level)} default: {def}s).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="no-timer">No timer</Label>
              <p className="text-muted-foreground text-xs">
                Turn this on to remove the countdown and answer at your own pace.
              </p>
            </div>
            <Button
              id="no-timer"
              type="button"
              variant={noTimer ? "default" : "outline"}
              size="sm"
              onClick={() => setNoTimer((v) => !v)}
            >
              {noTimer ? "On" : "Off"}
            </Button>
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="use-override">Use custom timer</Label>
            <Button
              id="use-override"
              type="button"
              variant={useOverride ? "default" : "outline"}
              size="sm"
              onClick={() => setUseOverride((v) => !v)}
            >
              {useOverride ? "On" : "Off"}
            </Button>
          </div>
          <div
            className={!useOverride || noTimer ? "pointer-events-none opacity-50" : ""}
          >
            <div className="mb-2 flex justify-between text-sm">
              <Label>Seconds per word</Label>
              <span className="text-muted-foreground tabular-nums">{seconds}s</span>
            </div>
            <Slider
              min={TIMER_OVERRIDE_MIN}
              max={TIMER_OVERRIDE_MAX}
              step={1}
              value={[seconds]}
              onValueChange={(v) => {
                const next = Array.isArray(v) ? v[0] : v;
                if (typeof next === "number" && !Number.isNaN(next)) {
                  setSeconds(next);
                }
              }}
            />
          </div>
          <div className="flex items-start justify-between gap-4 border-t pt-4">
            <div className="space-y-1">
              <Label htmlFor="auto-advance">Auto-advance after answer</Label>
              <p className="text-muted-foreground text-xs">
                When off, the next word waits for you to press Space / Enter or
                click <em>Next</em>, so you can read the meaning.
              </p>
            </div>
            <Button
              id="auto-advance"
              type="button"
              variant={autoAdvance ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoAdvance((v) => !v)}
            >
              {autoAdvance ? "On" : "Off"}
            </Button>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              saveSettings({
                noTimer: false,
                timerSecondsOverride: null,
                autoAdvance: true,
              });
              setNoTimer(false);
              setUseOverride(false);
              setSeconds(
                Math.min(TIMER_OVERRIDE_MAX, Math.max(TIMER_OVERRIDE_MIN, def)),
              );
              setAutoAdvance(true);
            }}
          >
            Reset to level defaults
          </Button>
          <Button type="button" onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
