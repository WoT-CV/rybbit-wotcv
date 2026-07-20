import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  getCanonicalUserId,
  getUserAvatarUrl,
  getUserDisplayName,
  getUserIdentityIds,
  isSafeAvatarUrl,
} from "./userIdentity";

describe("user identity", () => {
  it("uses the preferred display trait and a safe avatar URL", () => {
    const user = {
      identified_user_id: "user-42",
      traits: {
        avatarUrl: "https://cdn.example.com/clan.png",
        email: "fallback@example.com",
        username: "[WOT] Gracz",
      },
    };

    expect(getUserDisplayName(user)).toBe("[WOT] Gracz");
    expect(getUserAvatarUrl(user)).toBe("https://cdn.example.com/clan.png");
  });

  it("rejects unsafe avatar protocols", () => {
    expect(isSafeAvatarUrl("javascript:alert(1)")).toBe(false);
    expect(getUserAvatarUrl({ traits: { avatarUrl: "data:image/svg+xml,test" } })).toBeUndefined();
  });

  it("uses the identified account ID as the canonical route and query identity", () => {
    expect(getCanonicalUserId({ user_id: "anonymous-device", identified_user_id: "account-42" })).toBe("account-42");
    expect(getCanonicalUserId({ user_id: "anonymous-device" })).toBe("anonymous-device");
  });

  it("keeps the canonical account and every linked device available to identity filters", () => {
    expect(
      getUserIdentityIds({
        user_id: "device-a",
        identified_user_id: "account-42",
        linked_devices: [{ anonymous_id: "device-a" }, { anonymous_id: "device-b" }, { anonymous_id: "device-a" }],
      })
    ).toEqual(["account-42", "device-a", "device-b"]);
  });

  it("escapes values embedded in globe markup", () => {
    expect(escapeHtml(`Clan <b>"A&B"</b>`)).toBe("Clan &lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;");
  });
});
