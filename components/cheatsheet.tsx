"use client";

import { BookOpenIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { letterRows, nikudRows } from "@/lib/cheatsheet-data";
import { cn } from "@/lib/utils";

interface CheatsheetFabProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CheatsheetFab({ open, onOpenChange }: CheatsheetFabProps) {
  return (
    <Sheet
      {...(typeof open === "boolean" ? { open } : {})}
      onOpenChange={(next) => onOpenChange?.(next)}
    >
      <SheetTrigger
        className={cn(
          buttonVariants({ variant: "secondary", size: "lg" }),
          "fixed right-4 bottom-4 z-50 shadow-lg sm:right-6 sm:bottom-6",
        )}
      >
        <BookOpenIcon data-icon="inline-start" className="size-4" />
        Letters &amp; nikud
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Pronunciation cheatsheet</SheetTitle>
          <SheetDescription>
            Hebrew letters (including finals) and vowel marks (nikud) with
            English-style sounds.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-8 px-4 pb-8">
          <section>
            <h3 className="mb-2 font-medium">Letters</h3>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className="bg-muted/80">
                  <tr>
                    <th className="px-2 py-2">Letter</th>
                    <th className="px-2 py-2">Final</th>
                    <th className="px-2 py-2">Name</th>
                    <th className="px-2 py-2">Sound</th>
                    <th className="px-2 py-2">Example</th>
                  </tr>
                </thead>
                <tbody>
                  {letterRows.map((row) => (
                    <tr key={row.letter} className="border-t">
                      <td className="px-2 py-1.5 font-hebrew text-lg" dir="rtl">
                        {row.letter}
                      </td>
                      <td className="px-2 py-1.5 font-hebrew text-lg" dir="rtl">
                        {row.final ?? "—"}
                      </td>
                      <td className="px-2 py-1.5">{row.name}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {row.translit}
                      </td>
                      <td className="px-2 py-1.5 text-xs">{row.example}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <h3 className="mb-2 font-medium">Nikud (vowels)</h3>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[22rem] text-left text-sm">
                <thead className="bg-muted/80">
                  <tr>
                    <th className="px-2 py-2">Mark</th>
                    <th className="px-2 py-2">Name</th>
                    <th className="px-2 py-2">Sound</th>
                    <th className="px-2 py-2">Example</th>
                  </tr>
                </thead>
                <tbody>
                  {nikudRows.map((row) => (
                    <tr key={row.mark + row.name} className="border-t">
                      <td className="px-2 py-1.5 font-hebrew text-2xl" dir="rtl">
                        א{row.mark}
                      </td>
                      <td className="px-2 py-1.5">{row.name}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {row.sound}
                      </td>
                      <td className="px-2 py-1.5 font-hebrew text-sm" dir="rtl">
                        {row.example}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
