"use client";

import { useActionState } from "react";
import { unsubscribeAction } from "@/app/(legal)/unsubscribe/actions";
import { Button } from "./ui/button";

/** Unsubscribing takes a click, so email link scanners that open the page can't unsubscribe anyone. */
export function UnsubscribeForm({ token }: { token: string }) {
  const [state, dispatch, pending] = useActionState(unsubscribeAction, { ok: false });
  return (
    <div aria-live="polite">
      {state.ok ? (
        <p className="rounded-lg bg-accent-soft px-4 py-3 font-medium text-accent-ink">{state.message}</p>
      ) : (
        <form action={dispatch} className="space-y-3">
          <input type="hidden" name="t" value={token} />
          <Button type="submit" disabled={pending}>
            {pending ? "Unsubscribing…" : "Unsubscribe"}
          </Button>
          {state.message ? <p className="text-sm text-danger">{state.message}</p> : null}
        </form>
      )}
    </div>
  );
}
