import { describe, expect, it, vi } from "vitest";
import {
  attemptUploadSignIn,
  createGuestSaveAuth,
} from "@/features/upload/lib/guest-save-auth";

describe("guest Save auth gate", () => {
  it("opens sign-in and does not persist when session probe is unauthenticated", async () => {
    const persist = vi.fn(async () => undefined);
    const gate = createGuestSaveAuth({
      fetchMe: async () => {
        throw new Error("Not authenticated");
      },
      persist,
    });

    const result = await gate.handleSave();
    expect(result).toBe("needs-auth");
    expect(gate.snapshot()).toEqual({
      authDialogOpen: true,
      pendingSaveAfterAuth: true,
      saveFlowActive: true,
    });
    expect(persist).toHaveBeenCalledTimes(0);
  });

  it("retries persistence exactly once after successful login", async () => {
    const persist = vi.fn(async () => undefined);
    const gate = createGuestSaveAuth({
      fetchMe: async () => {
        throw new Error("Authentication required");
      },
      persist,
    });

    await gate.handleSave();
    expect(persist).toHaveBeenCalledTimes(0);

    const afterLogin = await gate.handleAuthSuccess();
    expect(afterLogin).toBe("persisted");
    expect(persist).toHaveBeenCalledTimes(1);
    expect(gate.snapshot()).toEqual({
      authDialogOpen: false,
      pendingSaveAfterAuth: false,
      saveFlowActive: false,
    });

    const again = await gate.handleAuthSuccess();
    expect(again).toBe("noop");
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("cancel clears pending retry and never persists", async () => {
    const persist = vi.fn(async () => undefined);
    const prepared = { name: "Ring", sku: "SKU-1" };
    const gate = createGuestSaveAuth({
      fetchMe: async () => {
        throw new Error("Not authenticated");
      },
      persist,
    });

    await gate.handleSave();
    gate.handleAuthDialogOpenChange(false);

    expect(gate.snapshot()).toEqual({
      authDialogOpen: false,
      pendingSaveAfterAuth: false,
      saveFlowActive: false,
    });
    expect(persist).toHaveBeenCalledTimes(0);
    expect(prepared).toEqual({ name: "Ring", sku: "SKU-1" });

    const afterCancelSuccess = await gate.handleAuthSuccess();
    expect(afterCancelSuccess).toBe("noop");
    expect(persist).toHaveBeenCalledTimes(0);
  });

  it("bad login does not persist and surfaces the error", async () => {
    const persist = vi.fn(async () => undefined);
    const onSuccess = vi.fn(async () => {
      await persist();
    });
    const prepared = { cad: "in-memory" };

    const result = await attemptUploadSignIn({
      email: "user@example.com",
      password: "wrong",
      logIn: async () => {
        throw new Error("Invalid credentials");
      },
      onSuccess,
    });

    expect(result).toEqual({ ok: false, error: "Invalid credentials" });
    expect(onSuccess).toHaveBeenCalledTimes(0);
    expect(persist).toHaveBeenCalledTimes(0);
    expect(prepared).toEqual({ cad: "in-memory" });
  });

  it("does not open dialog for non-auth save failures", async () => {
    const persist = vi.fn(async () => {
      throw new Error("SKU already exists");
    });
    const gate = createGuestSaveAuth({
      fetchMe: async () => ({ id: 1 }),
      persist,
    });

    const caught = await gate.persistCatchingAuth();
    expect(caught).toBe("save-error");
    expect(gate.snapshot().authDialogOpen).toBe(false);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("opens dialog only when persist throws auth-classified errors", async () => {
    const persist = vi.fn(async () => {
      throw new Error("Authentication required");
    });
    const gate = createGuestSaveAuth({
      fetchMe: async () => ({ id: 1 }),
      persist,
    });

    const caught = await gate.persistCatchingAuth();
    expect(caught).toBe("needs-auth");
    expect(gate.snapshot()).toEqual({
      authDialogOpen: true,
      pendingSaveAfterAuth: true,
      saveFlowActive: false,
    });
  });

  it("authenticated Save persists once", async () => {
    const persist = vi.fn(async () => undefined);
    const gate = createGuestSaveAuth({
      fetchMe: async () => ({ id: 1 }),
      persist,
    });

    const result = await gate.handleSave();
    expect(result).toBe("persisted");
    expect(persist).toHaveBeenCalledTimes(1);
    expect(gate.snapshot().saveFlowActive).toBe(false);
  });
});

describe("Save flow serialization", () => {
  it("overlapping Save while fetchMe is pending persists exactly once", async () => {
    let release!: () => void;
    const fetchMeBarrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const persist = vi.fn(async () => undefined);
    const onRequestSignIn = vi.fn();

    const gate = createGuestSaveAuth({
      fetchMe: async () => {
        await fetchMeBarrier;
        return { id: 1 };
      },
      persist,
      onRequestSignIn,
    });

    const first = gate.handleSave();
    const second = gate.handleSave();
    expect(gate.snapshot().saveFlowActive).toBe(true);

    release();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toBe("persisted");
    expect(secondResult).toBe("busy");
    expect(persist).toHaveBeenCalledTimes(1);
    expect(onRequestSignIn).toHaveBeenCalledTimes(0);
    expect(gate.snapshot()).toEqual({
      authDialogOpen: false,
      pendingSaveAfterAuth: false,
      saveFlowActive: false,
    });
  });

  it("overlapping guest Save while fetchMe pending opens auth once", async () => {
    let rejectFetch!: (err: Error) => void;
    const fetchMeBarrier = new Promise<never>((_, reject) => {
      rejectFetch = reject;
    });
    const persist = vi.fn(async () => undefined);
    const onRequestSignIn = vi.fn();

    const gate = createGuestSaveAuth({
      fetchMe: async () => {
        await fetchMeBarrier;
      },
      persist,
      onRequestSignIn,
    });

    const first = gate.handleSave();
    const second = gate.handleSave();
    rejectFetch(new Error("Not authenticated"));
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toBe("needs-auth");
    expect(secondResult).toBe("busy");
    expect(persist).toHaveBeenCalledTimes(0);
    expect(onRequestSignIn).toHaveBeenCalledTimes(1);
    expect(gate.snapshot()).toEqual({
      authDialogOpen: true,
      pendingSaveAfterAuth: true,
      saveFlowActive: true,
    });
  });

  it("overlapping authenticated Saves persist exactly once", async () => {
    let release!: () => void;
    const fetchMeBarrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const persist = vi.fn(async () => undefined);
    const gate = createGuestSaveAuth({
      fetchMe: async () => {
        await fetchMeBarrier;
        return { id: 1 };
      },
      persist,
    });

    const saves = Promise.all([gate.handleSave(), gate.handleSave(), gate.handleSave()]);
    release();
    const results = await saves;

    expect(results.filter((r) => r === "persisted")).toHaveLength(1);
    expect(results.filter((r) => r === "busy")).toHaveLength(2);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("allows a new Save after a completed authenticated Save", async () => {
    const persist = vi.fn(async () => undefined);
    const gate = createGuestSaveAuth({
      fetchMe: async () => ({ id: 1 }),
      persist,
    });

    expect(await gate.handleSave()).toBe("persisted");
    expect(await gate.handleSave()).toBe("persisted");
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("allows a new Save after cancel", async () => {
    const persist = vi.fn(async () => undefined);
    let authed = false;
    const gate = createGuestSaveAuth({
      fetchMe: async () => {
        if (!authed) throw new Error("Not authenticated");
        return { id: 1 };
      },
      persist,
    });

    expect(await gate.handleSave()).toBe("needs-auth");
    gate.handleAuthDialogOpenChange(false);
    authed = true;
    expect(await gate.handleSave()).toBe("persisted");
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("allows a new Save after failed login then cancel", async () => {
    const persist = vi.fn(async () => undefined);
    const gate = createGuestSaveAuth({
      fetchMe: async () => {
        throw new Error("Not authenticated");
      },
      persist,
    });

    expect(await gate.handleSave()).toBe("needs-auth");

    const login = await attemptUploadSignIn({
      email: "user@example.com",
      password: "wrong",
      logIn: async () => {
        throw new Error("Invalid credentials");
      },
      onSuccess: async () => {
        await gate.handleAuthSuccess();
      },
    });
    expect(login.ok).toBe(false);
    expect(persist).toHaveBeenCalledTimes(0);

    gate.handleAuthDialogOpenChange(false);
    expect(gate.snapshot().saveFlowActive).toBe(false);

    expect(await gate.handleSave()).toBe("needs-auth");
    expect(persist).toHaveBeenCalledTimes(0);
    expect(gate.snapshot().pendingSaveAfterAuth).toBe(true);
  });

  it("allows a new Save after non-auth session probe failure", async () => {
    const persist = vi.fn(async () => undefined);
    let failOnce = true;
    const gate = createGuestSaveAuth({
      fetchMe: async () => {
        if (failOnce) {
          failOnce = false;
          throw new Error("network down");
        }
        return { id: 1 };
      },
      persist,
    });

    expect(await gate.handleSave()).toBe("session-error");
    expect(gate.snapshot().saveFlowActive).toBe(false);
    expect(await gate.handleSave()).toBe("persisted");
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
