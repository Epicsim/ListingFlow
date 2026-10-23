import { beforeEach, describe, expect, it, vi } from "vitest";
import { planOperationAction } from "@/app/(app)/settings/follow-up-plans/actions";

const agent = "11111111-1111-4111-8111-111111111111";
const plan = "22222222-2222-4222-8222-222222222222";
const mocks = vi.hoisted(() => ({ asUser: vi.fn(), changePlan: vi.fn(), redirect: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireWorkspaceAgent: async () => ({ profile: { id: agent } }) }));
vi.mock("@/lib/db", () => ({ asUser: mocks.asUser }));
vi.mock("@/lib/data/plans", async (original) => ({ ...await original<typeof import("@/lib/data/plans")>(), changePlan: mocks.changePlan }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.asUser.mockImplementation(async (_id, fn) => fn({}));
  mocks.redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
});
function form(confirmation: string | null) {
  const data = new FormData(); data.set("operation", "delete"); data.set("plan_id", plan);
  if (confirmation !== null) data.set("confirm_delete", confirmation);
  return data;
}
describe("delete plan confirmation", () => {
  it.each([null, "", "on", "true"])("requires explicit confirmation (%s) before any mutation", async (confirmation) => {
    expect(await planOperationAction({ ok: false }, form(confirmation))).toMatchObject({ ok: false, fieldErrors: { confirm_delete: expect.any(String) } });
    expect(mocks.asUser).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("deletes the selected plan as the authenticated agent after confirmation", async () => {
    await expect(planOperationAction({ ok: false }, form("delete"))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.asUser).toHaveBeenCalledWith(agent, expect.any(Function));
    expect(mocks.changePlan).toHaveBeenCalledWith(expect.anything(), agent, plan, "delete");
    expect(mocks.redirect).toHaveBeenCalledWith("/settings/follow-up-plans");
  });
});
