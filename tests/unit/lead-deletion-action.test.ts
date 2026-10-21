import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteLeadAction } from "@/app/(app)/leads/actions";

const agentId = "11111111-1111-4111-8111-111111111111";
const contactId = "22222222-2222-4222-8222-222222222222";
const mocks = vi.hoisted(() => ({
  requireAgent: vi.fn(),
  asUser: vi.fn(),
  deleteLead: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireAgent: mocks.requireAgent }));
vi.mock("@/lib/db", () => ({ asUser: mocks.asUser }));
vi.mock("@/lib/data/leads", () => ({ deleteLead: mocks.deleteLead }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAgent.mockResolvedValue({ profile: { id: agentId } });
  mocks.asUser.mockImplementation(async (_agentId, fn) => fn({}));
  mocks.deleteLead.mockResolvedValue(true);
  mocks.redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
});

function form(confirmation: string | null = "delete", id = contactId) {
  const data = new FormData();
  data.set("contact_id", id);
  if (confirmation !== null) data.set("confirm_delete", confirmation);
  return data;
}

describe("delete lead action", () => {
  it.each([null, "", "false", "true", "on"])("refuses deletion without explicit confirmation (%s)", async (value) => {
    const result = await deleteLeadAction({ ok: false }, form(value));
    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.confirm_delete).toBeTruthy();
    expect(mocks.asUser).not.toHaveBeenCalled();
    expect(mocks.deleteLead).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("refuses malformed references before querying the database", async () => {
    expect((await deleteLeadAction({ ok: false }, form("delete", "not-a-uuid"))).ok).toBe(false);
    expect(mocks.asUser).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("requires authentication before deleting", async () => {
    mocks.requireAgent.mockRejectedValue(new Error("authentication_required"));
    await expect(deleteLeadAction({ ok: false }, form())).rejects.toThrow("authentication_required");
    expect(mocks.asUser).not.toHaveBeenCalled();
    expect(mocks.deleteLead).not.toHaveBeenCalled();
  });

  it("does not report success or refresh pages for a missing or foreign lead", async () => {
    mocks.deleteLead.mockResolvedValue(false);
    expect(await deleteLeadAction({ ok: false }, form())).toMatchObject({
      ok: false, message: "This lead could not be found.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("does not redirect to success when the database fails", async () => {
    mocks.deleteLead.mockRejectedValue(new Error("delete_failed"));
    await expect(deleteLeadAction({ ok: false }, form())).rejects.toThrow("delete_failed");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("deletes as the signed-in agent, refreshes affected pages and redirects after success", async () => {
    const data = form();
    data.set("agent_id", "33333333-3333-4333-8333-333333333333");
    await expect(deleteLeadAction({ ok: false }, data)).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.asUser).toHaveBeenCalledWith(agentId, expect.any(Function));
    expect(mocks.deleteLead).toHaveBeenCalledWith(expect.anything(), agentId, contactId);
    for (const path of [`/leads/${contactId}`, "/leads", "/dashboard", "/campaigns", "/outbox"]) {
      expect(mocks.revalidatePath).toHaveBeenCalledWith(path);
    }
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/campaigns/[id]", "page");
    expect(mocks.redirect).toHaveBeenCalledWith("/leads?deleted=1");
  });
});
