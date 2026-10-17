// Hardening for the public test: random passwords for admin and test user, event log on.
import fs from "node:fs"; import crypto from "node:crypto";
import { admin, KC } from "../../lib/kc-lib.mjs";
const rnd = () => crypto.randomBytes(12).toString("base64url");
const adminPw = rnd(), alicePw = rnd();
const mu = (await admin("/users?username=admin&exact=true", { realm: "master" }))[0];
await admin(`/users/${mu.id}/reset-password`, { method: "PUT", realm: "master", body: { type: "password", value: adminPw, temporary: false } });
const au = (await admin("/users?username=alice&exact=true"))[0];
await admin(`/users/${au.id}/reset-password`, { method: "PUT", body: { type: "password", value: alicePw, temporary: false } });
await admin("/events/config", { method: "PUT", body: { eventsEnabled: true, eventsExpiration: 172800, eventsListeners: ["jboss-logging"], adminEventsEnabled: true, adminEventsDetailsEnabled: true } });
fs.writeFileSync("secrets/kc.json", JSON.stringify({ adminPassword: adminPw, alice: alicePw }, null, 1));
console.log("Passwords set (secrets/kc.json), event log on.\nalice password:", alicePw);
