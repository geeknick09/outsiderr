"use client";

/* eslint-disable react/no-unescaped-entities */

import { useState } from "react";
import { FileText, ImageIcon, Info, Monitor, Smartphone } from "lucide-react";

import { Modal } from "@/components/ui/modal";

/**
 * Click-to-open poster + description guidelines for the event form.
 * Helps organizers upload the right images and write good descriptions.
 */
export function PosterGuidelines() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="glass rounded-3xl border border-zinc-200 dark:border-white/10">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-between gap-2 p-4 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-bold">
            <ImageIcon className="h-4 w-4 text-violet-neon" />
            Poster & Description Guidelines
          </span>
          <span className="text-xs font-semibold text-violet-neon">View</span>
        </button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Poster & Description Guidelines"
        className="sm:max-w-2xl"
      >
        <div className="space-y-6">
          <section>
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <Smartphone className="h-4 w-4 text-violet-neon" />
              Card Poster — Mobile & Event Cards
            </h3>
            <p className="mt-1 text-xs text-muted">
              This is the first thing people see. Make it count.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <tbody>
                  <tr className="border-b border-zinc-100 dark:border-white/5">
                    <td className="py-1.5 pr-4 font-semibold">Aspect ratio</td>
                    <td className="py-1.5 text-muted">3:4 (portrait)</td>
                  </tr>
                  <tr className="border-b border-zinc-100 dark:border-white/5">
                    <td className="py-1.5 pr-4 font-semibold">Recommended size</td>
                    <td className="py-1.5 text-muted">900 × 1200 px</td>
                  </tr>
                  <tr className="border-b border-zinc-100 dark:border-white/5">
                    <td className="py-1.5 pr-4 font-semibold">Max file size</td>
                    <td className="py-1.5 text-muted">1.5 MB</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-4 font-semibold">Format</td>
                    <td className="py-1.5 text-muted">.png or .jpg</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">
              <strong>Safe area:</strong> Keep key elements centred. We may crop
              to a square on some screens — don&apos;t put important details near
              the edges.
            </p>
          </section>

          <section>
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <Monitor className="h-4 w-4 text-violet-neon" />
              Banner Poster — Laptop / Tablet / Desktop
            </h3>
            <p className="mt-1 text-xs text-muted">
              Shown on the event page and featured carousels on larger screens.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <tbody>
                  <tr className="border-b border-zinc-100 dark:border-white/5">
                    <td className="py-1.5 pr-4 font-semibold">Aspect ratio</td>
                    <td className="py-1.5 text-muted">16:9 (landscape)</td>
                  </tr>
                  <tr className="border-b border-zinc-100 dark:border-white/5">
                    <td className="py-1.5 pr-4 font-semibold">Recommended size</td>
                    <td className="py-1.5 text-muted">1920 × 1080 px</td>
                  </tr>
                  <tr className="border-b border-zinc-100 dark:border-white/5">
                    <td className="py-1.5 pr-4 font-semibold">Max file size</td>
                    <td className="py-1.5 text-muted">1.5 MB</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-4 font-semibold">Format</td>
                    <td className="py-1.5 text-muted">.png or .jpg</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">
              <strong>Safe area:</strong> Centre key elements. On very wide
              screens the banner may be cropped — avoid placing text near the
              far left or right edges.
            </p>
          </section>

          <section>
            <h3 className="text-sm font-bold">Image Quality — Do&apos;s & Don&apos;ts</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/5">
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">✓ Do</p>
                <ul className="mt-2 space-y-1 text-xs text-muted">
                  <li>High resolution, free of pixelation</li>
                  <li>Clutter-free composition</li>
                  <li>Images you own or have permission to use</li>
                  <li>Readable text with balanced contrast</li>
                  <li>Place sponsor logos in the bottom 30% only</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-red-200 bg-red-50/50 p-3 dark:border-red-500/20 dark:bg-red-500/5">
                <p className="text-xs font-bold text-red-600 dark:text-red-400">✗ Don&apos;t</p>
                <ul className="mt-2 space-y-1 text-xs text-muted">
                  <li>Date, time, or full venue address</li>
                  <li>Phone numbers, email IDs, QR codes</li>
                  <li>Social media handles or website links</li>
                  <li>Ticket prices, bank details, UPI IDs</li>
                  <li>Outsiderr logos or competitor brand logos</li>
                  <li>Watermarks, stretched, or blurry images</li>
                  <li>CTAs like &quot;Book Now&quot;, &quot;Register&quot;, &quot;Free Entry&quot;</li>
                  <li>Athlete/celebrity images without rights</li>
                  <li>National flags or team/league logos without rights</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <FileText className="h-4 w-4 text-violet-neon" />
              Event Description
            </h3>
            <p className="mt-1 text-xs text-muted">
              Write a detailed, engaging description that highlights what makes
              your event unique. Keep it concise — around 200 words, one screen
              scroll on mobile.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/5">
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">✓ Do include</p>
                <ul className="mt-2 space-y-1 text-xs text-muted">
                  <li>Event overview — what is it?</li>
                  <li>Highlights & experiences</li>
                  <li>Activities & engagement</li>
                  <li>Lineup, performers, or instructors</li>
                  <li>Language, duration, age restrictions</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-red-200 bg-red-50/50 p-3 dark:border-red-500/20 dark:bg-red-500/5">
                <p className="text-xs font-bold text-red-600 dark:text-red-400">✗ Don&apos;t include</p>
                <ul className="mt-2 space-y-1 text-xs text-muted">
                  <li>Date, time, or phone numbers</li>
                  <li>Social media handles or external links</li>
                  <li>Hashtags or redirects to other platforms</li>
                  <li>Ticket prices, bank or UPI details</li>
                  <li>One-liner descriptions</li>
                  <li>&quot;Get tickets on Outsiderr&quot; phrases</li>
                </ul>
              </div>
            </div>
            <div className="mt-3 rounded-2xl border border-violet-neon/20 bg-violet-neon/5 p-3">
              <p className="text-xs font-bold text-violet-neon">Tips by event type</p>
              <ul className="mt-2 space-y-1.5 text-xs text-muted">
                <li><strong>Music:</strong> Highlight performing artists, genre, and special features like meet & greets.</li>
                <li><strong>Workshops:</strong> Highlight skills attendees will learn, instructor expertise, and materials provided/required.</li>
                <li><strong>Sports:</strong> Highlight match significance, squads, key players, and head-to-head stats.</li>
                <li><strong>Educational:</strong> Highlight key topics, featured speakers, and learning outcomes.</li>
                <li><strong>Culture / Community:</strong> Highlight the scene, community values, and what makes this gathering unique.</li>
              </ul>
            </div>
          </section>
        </div>
      </Modal>
    </>
  );
}
