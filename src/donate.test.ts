import assert from "node:assert/strict";
import { test } from "node:test";
import { DONATE_COPY, DONATE_HREF, DONATE_LABEL } from "./donate.ts";

test("donate link is a Stripe Payment Link with pulsefield reference", () => {
  const url = new URL(DONATE_HREF);
  assert.equal(url.protocol, "https:");
  assert.equal(url.hostname, "donate.stripe.com");
  assert.equal(url.searchParams.get("client_reference_id"), "pulsefield");
  assert.match(url.pathname, /^\/[A-Za-z0-9]+$/);
});

test("donate copy stays German, unobtrusive, and without Gedankenstriche", () => {
  assert.equal(DONATE_LABEL, "Projekt unterstützen");
  assert.equal(
    DONATE_COPY,
    "Demos bleiben free. Wenn du willst, kannst du das Studio kurz unterstützen.",
  );
  assert.doesNotMatch(`${DONATE_LABEL}${DONATE_COPY}`, /[—–]/);
  assert.doesNotMatch(DONATE_COPY.toLowerCase(), /paywall|pflicht|jetzt zahlen/);
});
