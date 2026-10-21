import "server-only";
import { cache } from "react";
import { getPublicCampaign } from "@/lib/data/public";
import { asAnon } from "@/lib/db";

/** Published campaign for this request (deduplicated between metadata and page). */
export const loadPublicCampaign = cache((slug: string) => asAnon((tx) => getPublicCampaign(tx, slug)));
