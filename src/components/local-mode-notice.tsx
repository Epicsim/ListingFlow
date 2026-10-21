import { HardDrive } from "lucide-react";
import { getBackend } from "@/lib/config";
import { Notice } from "./ui/display";

/** Visible reminder that local mode keeps data on this machine with a development-only sign-in. */
export function LocalModeNotice({ className = "" }: { className?: string }) {
  if (getBackend() !== "local") return null;
  return (
    <Notice tone="neutral" icon={<HardDrive />} className={className} title="Local mode">
      Accounts and data are stored only on this computer (in the project&rsquo;s <code>.data</code> folder) using a
      development sign-in. Connect Supabase before inviting real users.
    </Notice>
  );
}
