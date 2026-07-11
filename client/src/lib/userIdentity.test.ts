import { describe, expect, it } from "vitest";
import { escapeHtml, getUserAvatarUrl, getUserDisplayName, isSafeAvatarUrl } from "./userIdentity";

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

  it("escapes values embedded in globe markup", () => {
    expect(escapeHtml(`Clan <b>"A&B"</b>`)).toBe("Clan &lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;");
  });
});
