"use client";
import { useState } from "react";
import { Check, Copy, ExternalLink, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function IntakeFormShare() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/intake`
      : "/intake";

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Form link copied");
    setTimeout(() => setCopied(false), 1500);
  }

  const mailtoSubject = encodeURIComponent("Brand intake — Surroundings Group");
  const mailtoBody = encodeURIComponent(
    `Hi,\n\nWhenever you have a few minutes, please fill out our brand intake form so we can get started on your brand kit and video assets:\n\n${url}\n\nIt only asks for what you have on hand — anything you don't know, just skip.\n\nThanks!\nSurroundings Group`
  );
  const mailto = `mailto:?subject=${mailtoSubject}&body=${mailtoBody}`;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Send className="h-4 w-4" />
        Share intake form
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share intake form with a client</DialogTitle>
            <DialogDescription>
              Anyone with this link can submit a brand intake. Once they do, the record shows up in this dashboard.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 rounded-md border border-input bg-secondary/40 px-3 py-2">
            <Send className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 bg-transparent text-xs outline-none"
            />
            <Button variant="ghost" size="icon" onClick={copy} aria-label="Copy">
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" asChild aria-label="Open">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={copy}>
              <Copy className="h-3.5 w-3.5" />
              Copy link
            </Button>
            <Button variant="outline" asChild>
              <a href={mailto}>
                <Mail className="h-3.5 w-3.5" />
                Email with link
              </a>
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Tip: drop this link into Slack, a text, or your kickoff email. The client doesn't need an SG account.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
