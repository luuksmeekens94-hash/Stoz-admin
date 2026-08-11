import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findEntry: vi.fn(),
  findAudit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    hourEntry: { findFirst: mocks.findEntry },
    auditEvent: { findFirst: mocks.findAudit },
  },
}));

import { DELETE, PATCH } from "@/app/api/hours/[id]/route";

const params = { params: Promise.resolve({ id: "entry-of-another-user" }) };

function patchRequest() {
  return new Request("http://localhost/api/hours/entry-of-another-user", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hours: 1 }),
  }) as NextRequest;
}

function deleteRequest() {
  return new Request("http://localhost/api/hours/entry-of-another-user", {
    method: "DELETE",
  }) as NextRequest;
}

describe("hour route authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "user-1", role: "TEAM" } });
    mocks.findEntry.mockResolvedValue(null);
  });

  it("filtert PATCH op eigenaar voordat reconstructieclassificatie wordt gelezen", async () => {
    const response = await PATCH(patchRequest(), params);

    expect(response.status).toBe(404);
    expect(mocks.findEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "entry-of-another-user", userId: "user-1" },
      }),
    );
    expect(mocks.findAudit).not.toHaveBeenCalled();
  });

  it("filtert DELETE op eigenaar voordat status of reconstructieclassificatie wordt gelezen", async () => {
    const response = await DELETE(deleteRequest(), params);

    expect(response.status).toBe(404);
    expect(mocks.findEntry).toHaveBeenCalledWith({
      where: { id: "entry-of-another-user", userId: "user-1" },
    });
    expect(mocks.findAudit).not.toHaveBeenCalled();
  });
});
