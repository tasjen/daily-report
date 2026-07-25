import { browser } from "@wdio/globals";

describe("flexi-report", () => {
  it("launches and renders the UI", async () => {
    await browser.waitUntil(() => browser.$("#root *").isExisting(), {
      timeout: 30_000,
      timeoutMsg: "app root never rendered",
    });
  });
});
