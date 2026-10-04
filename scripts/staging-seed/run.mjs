#!/usr/bin/env node
// Gives a staging account bowls to try things with.
//
//   STAGING_SUPABASE_URL=… STAGING_SUPABASE_SERVICE_ROLE_KEY=… \
//     npm run seed:staging -- you@example.com
//
// Staging starts empty, and an empty account can show the add sheet but not a
// draw between two people or a rotation's turn order. This adds three bowls,
// one per draw method (plan.mjs), with a second member, Robin, made in the
// staging project as your address tagged +member. Robin never signs in; the
// account exists so the shared bowls have two people in them.
//
// It runs on your machine with the staging service role key, because it writes
// rows for an account other than the one signing in. That key never goes in
// the repository or a workflow. It refuses to run against the Supabase project
// this checkout is linked to, which is production. Running it again only adds
// bowls the account does not already have by name.
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { MEMBER_DISPLAY_NAME, SEED_BOWLS, checkDetails, memberEmailFor, planBowl, seedTmdbIds } from "./plan.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const STAGING_APP = process.env.STAGING_URL || "https://staging.moviebowl.app";

function fail(message) {
  console.error(message);
  process.exit(1);
}

const url = process.env.STAGING_SUPABASE_URL;
const serviceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
const ownerEmail = process.argv[2]?.trim().toLowerCase();
if (!url || !serviceKey || !ownerEmail) {
  fail("Usage: STAGING_SUPABASE_URL=… STAGING_SUPABASE_SERVICE_ROLE_KEY=… npm run seed:staging -- <your staging email>");
}

const refFile = join(REPO, "supabase/.temp/project-ref");
const linkedRef = existsSync(refFile) ? readFileSync(refFile, "utf8").trim() : "";
if (linkedRef && new URL(url).hostname.startsWith(`${linkedRef}.`)) {
  fail(`${url} is the project this checkout is linked to, which is production. The seed only runs against staging.`);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUser(email) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`Could not list staging users: ${error.message}`);
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user || data.users.length < 200) return user ?? null;
  }
}

async function check(promise, what) {
  const { data, error } = await promise;
  if (error) fail(`Could not ${what}: ${error.message}`);
  return data;
}

// Titles come from staging's own TMDB proxy, the same route the app uses, so
// the seed needs no TMDB token of its own.
async function fetchDetails(id) {
  const response = await fetch(`${STAGING_APP}/api/tmdb/movie/details?id=${id}`);
  if (!response.ok) fail(`TMDB details for ${id} answered ${response.status}.`);
  return response.json();
}

const owner = await findUser(ownerEmail);
if (!owner) fail(`${ownerEmail} has no account on staging. Sign in there once first, or add it in the staging dashboard.`);

const memberEmail = memberEmailFor(ownerEmail);
let member = await findUser(memberEmail);
if (!member) {
  // Confirmed and passwordless: it never signs in, and making it sends no email.
  member = (await check(admin.auth.admin.createUser({ email: memberEmail, email_confirm: true }), "create the test member")).user;
  console.log(`Created ${memberEmail} as the test member.`);
}

// Profiles are made by the app on first sign-in, which Robin never does. The
// owner's row is only created if missing, so a display name you chose stays.
await check(admin.from("profiles").upsert({ id: owner.id, email: owner.email }, { onConflict: "id", ignoreDuplicates: true }), "save your profile");
await check(admin.from("profiles").upsert({ id: member.id, email: memberEmail, display_name: MEMBER_DISPLAY_NAME }, { onConflict: "id" }), "save the member's profile");

const existing = new Set((await check(admin.from("bowls").select("name").eq("owner_id", owner.id), "read your bowls")).map((bowl) => bowl.name));
const toSeed = SEED_BOWLS.filter((bowl) => !existing.has(bowl.name));
if (!toSeed.length) {
  console.log("Every seed bowl is already there. Nothing to add.");
  process.exit(0);
}

console.log(`Looking up ${seedTmdbIds().length} titles through ${STAGING_APP}...`);
const detailsById = new Map();
for (const id of seedTmdbIds()) detailsById.set(id, await fetchDetails(id));
const wrong = checkDetails(detailsById);
if (wrong.length) fail(`Some seed titles did not match TMDB, so nothing was written:\n  ${wrong.join("\n  ")}`);

const now = new Date().toISOString();
for (const bowl of toSeed) {
  const plan = planBowl(bowl, { bowlId: randomUUID(), ownerId: owner.id, memberId: member.id, detailsById, now });
  await check(admin.from("bowls").insert(plan.bowl), `create ${bowl.name}`);
  // Three requests, not one transaction, so a failure part way takes the bowl
  // back out: a half-made bowl would block the next run, which skips by name.
  for (const [table, rows, what] of [
    ["bowl_members", plan.members, `add the members of ${bowl.name}`],
    ["bowl_movies", plan.movies, `add the titles in ${bowl.name}`],
  ]) {
    const { error } = await admin.from(table).insert(rows);
    if (error) {
      await admin.from("bowls").delete().eq("id", plan.bowl.id);
      fail(`Could not ${what}: ${error.message}. ${bowl.name} was removed again.`);
    }
  }
  console.log(`Added ${bowl.name}: ${plan.movies.length} titles, ${plan.members.length === 2 ? "you and Robin" : "just you"}.`);
}
