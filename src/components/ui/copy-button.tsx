"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "./button";

/** Legacy copy path for browsers or embedded views that block the async Clipboard API. */
function copyWithSelection(value: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  textarea.remove();
  return ok;
}

/** Copies text to the clipboard and announces the result to screen readers. */
export function CopyButton({
  value,
  label = "Copy link",
  copiedLabel = "Copied",
  size = "sm",
  variant = "secondary",
  className = "",
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  size?: "sm" | "md";
  variant?: "secondary" | "primary" | "ghost";
  className?: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      ok = copyWithSelection(value);
    }
    setStatus(ok ? "copied" : "failed");
    window.setTimeout(() => setStatus("idle"), ok ? 2000 : 4000);
  }

  return (
    <Button variant={variant} size={size} onClick={copy} className={className}>
      {status === "copied" ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
      <span aria-live="polite">
        {status === "copied" ? copiedLabel : status === "failed" ? "Couldn't copy – select the link instead" : label}
      </span>
    </Button>
  );
}
