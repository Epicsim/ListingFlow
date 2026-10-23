import { describe, expect, it } from "vitest";
import { planDueAt, planSchema, planStepSchema, STARTER_PLANS, stepLimitError } from "@/lib/follow-up-plans";

describe("plan due dates", () => {
  it("keeps Day 0 at the exact start instant", () => {
    const now = new Date("2026-10-23T04:32:10.123Z");
    expect(planDueAt(now, 0, "America/Los_Angeles")).toEqual(now);
  });
  it("uses the agent's calendar date instead of the UTC date", () => {
    expect(planDueAt(new Date("2026-10-23T04:00:00Z"), 1, "America/Los_Angeles").toISOString()).toBe("2026-10-23T16:00:00.000Z");
  });
  it.each([
    ["2026-03-07T18:00:00Z", "2026-03-08T16:00:00.000Z"],
    ["2026-10-31T18:00:00Z", "2026-11-01T17:00:00.000Z"],
  ])("keeps 9am across DST from %s", (start, expected) => {
    expect(planDueAt(new Date(start), 1, "America/Los_Angeles").toISOString()).toBe(expected);
  });
  it("keeps weekend steps and supports zones ahead of UTC", () => {
    expect(planDueAt(new Date("2026-10-23T23:00:00Z"), 1, "Asia/Tokyo").toISOString()).toBe("2026-10-25T00:00:00.000Z");
  });
});
describe("builder validation", () => {
  const plan = { name: "Example plan", is_active: false, timelines: ["soon"], campaign_id: null };
  it("requires a name and at least one supported timeline", () => {
    expect(planSchema.safeParse(plan).success).toBe(true);
    for (const patch of [{ name: "" }, { name: "a".repeat(81) }, { timelines: [] }, { timelines: ["invalid"] }]) expect(planSchema.safeParse({ ...plan, ...patch }).success).toBe(false);
  });
  it("validates whole-number days and type-specific text limits", () => {
    for (const day of [-1, 366, 1.5, "", null, undefined]) expect(planStepSchema.safeParse({ kind: "call", title: "Call", day_offset: day }).success).toBe(false);
    expect(planStepSchema.safeParse({ kind: "email", day_offset: 0, email_subject: "Hello", email_body: "Body" }).success).toBe(true);
    expect(planStepSchema.safeParse({ kind: "email", day_offset: 0, email_subject: "a".repeat(201), email_body: "Body" }).success).toBe(false);
    expect(planStepSchema.safeParse({ kind: "email", day_offset: 0, email_subject: "Hello", email_body: "a".repeat(5001) }).success).toBe(false);
    expect(planStepSchema.safeParse({ kind: "text", day_offset: 0, title: "" }).success).toBe(false);
  });
  it("enforces plan-wide limits, including equal-day emails", () => {
    expect(stepLimitError(Array.from({ length: 13 }, () => ({ day_offset: 0, kind: "call" })))).toMatch(/12/);
    expect(stepLimitError(Array.from({ length: 7 }, (_, i) => ({ day_offset: i * 2, kind: "email" })))).toMatch(/6/);
    expect(stepLimitError([{ day_offset: 2, kind: "email" }, { day_offset: 3, kind: "email" }])).toMatch(/2 days/);
    expect(stepLimitError([{ day_offset: 2, kind: "email" }, { day_offset: 2, kind: "email" }])).toMatch(/2 days/);
    for (const starter of STARTER_PLANS) expect(stepLimitError(starter.steps)).toBeNull();
  });
});
