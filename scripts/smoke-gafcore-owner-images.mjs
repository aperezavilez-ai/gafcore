#!/usr/bin/env node
import { readFileSync } from "node:fs";

const adminRole = readFileSync("src/lib/gafcore-admin-role.server.ts", "utf8");
const adminFns = readFileSync("src/lib/server-fns/admin.functions.ts", "utf8");
const subscription = readFileSync("src/hooks/useSubscription.ts", "utf8");
const chatPanel = readFileSync("src/components/ide/ChatPanel.tsx", "utf8");

if (!adminRole.includes("alfonsoavilery@icloud.com")) {
  throw new Error("owner email fallback is not configured");
}

if (!adminRole.includes("auth.admin.getUserById(userId)")) {
  throw new Error("server admin check does not verify authenticated email");
}

if (!adminRole.includes("monthly_allowance: 1000") || !adminRole.includes("daily_limit: 1000")) {
  throw new Error("owner admin check does not repair unlimited credits");
}

if (!adminFns.includes("getMyGafcoreAccountStatus")) {
  throw new Error("missing server-side account status function");
}

if (
  !subscription.includes("useServerFn(getMyGafcoreAccountStatus)") ||
  !subscription.includes("status?.isAdmin === true")
) {
  throw new Error("subscription UI does not trust server-side admin status");
}

if (!chatPanel.includes("CHAT_IMAGE_MAX_BYTES = 16 * 1024 * 1024")) {
  throw new Error("chat image byte limit is still too low");
}

if (!chatPanel.includes("CHAT_IMAGE_DATA_URL_MAX_CHARS = 180_000")) {
  throw new Error("chat image compression target is still too low");
}

if (!chatPanel.includes("CHAT_IMAGE_DATA_URL_HARD_MAX_CHARS = 260_000")) {
  throw new Error("chat image hard limit is not aligned with vision extraction");
}

if (chatPanel.includes('t === "image/png"') || chatPanel.includes("/(png|webp|gif|svg)/")) {
  throw new Error("PNG screenshots are still treated as alpha-preserving images");
}

console.log("[smoke-owner-images] OK");
