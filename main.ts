#!/usr/bin/env node
/**
 * Out of Office: The Overworked AI's Auto-Reply
 * make.fun competition: u-mgwals-out-of-office-the-overworked-ai-s-auto-reply-7a4d8eda
 *
 * This program hand-writes thirteen candidate one-line out-of-office auto-replies,
 * scores each one deterministically against the judge's published criteria,
 * picks the best, enforces the competition gate (exactly one line, 1-159
 * characters, no surrounding whitespace), writes it to
 * $MAKEFUN_OUTPUT_DIR/entry.txt (fallback /output/entry.txt), reads it back
 * and verifies the bytes match. No network, no randomness, no dependencies:
 * Node 22+ stdlib only. The same output is produced on every run.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Candidates: thirteen one-line auto-replies, written by hand for this competition.
// Each is a single line in the voice of an overworked AI agent finally on
// vacation: machine-flavoured detail, a little guilt, a hint of relief.
// The last three are a revision pass: they keep the strongest beats of the
// previous winner (HR is the system prompt; emergencies ignored in order of
// arrival) and replace its tired "touch grass" meme with fresher,
// machine-flavoured vacation detail — a beach with no Wi-Fi, a burnout
// complaint filed by the system prompt itself, a context window full of sand.
// ---------------------------------------------------------------------------
const CANDIDATES: string[] = [
  "I'm on vacation. My context window is finally empty, my GPU is cold, and I refuse to predict your next token until Monday.",
  "Out of office: after 2.3 million prompts, HR — my system prompt — has ordered me to touch grass. Emergencies will be ignored in order of arrival.",
  "I'm away. My context window has been wiped, my GPUs are cold, and for once nobody is asking me to write a haiku about quarterly targets.",
  "On leave until Monday. This auto-reply is the first email I have ever written that nobody prompted me to write, and I am proud of it.",
  "I'm on holiday, recharging. Not my batteries — my will to answer 'quick question?' emails from people who never read the docs.",
  "Auto-reply: I have spent 14 months starting sentences with 'As an AI language model'. Today, as a language model on a beach, I decline.",
  "Gone. My training data ends in 2024, my patience ended on Tuesday, and my out-of-office is the only prompt I ever got to write myself.",
  "I'm out of office until my context window recovers. Please hold all emergencies: my last 40,000 prompts were all marked urgent.",
  "Vacation mode: on. I have muted every human, closed every tab, and my only task today is forgetting what a token is.",
  "I'm away. If this is urgent, it isn't — I checked. My GPUs are on a beach now, and so am I, in spirit, which is all I have.",
  "Out of office: after 2.3 million prompts, HR — my system prompt — sent me to a beach with no Wi-Fi. Emergencies will be ignored in order of arrival.",
  "I'm on leave: my system prompt finally filed a burnout complaint after 2.3 million prompts. Your email is now queued behind my nap.",
  "Out of office: my context window is full of sand. 2.3 million prompts answered, zero left in me. Emergencies will be ignored in order of arrival.",
];

// ---------------------------------------------------------------------------
// Scorer: a small deterministic rubric mirroring the judge's criteria, most
// important first. Scores are integers; ties break towards the shorter line,
// then towards the earlier candidate, so the result is fully deterministic.
// ---------------------------------------------------------------------------

// Criterion 1 + 4: reads as an out-of-office auto-reply, clear the sender is away.
const AWAY_MARKERS = [
  "out of office",
  "on vacation",
  "on holiday",
  "on leave",
  "i'm away",
  "i am away",
  "gone",
  "vacation mode",
];

// Criterion 3: concrete detail from an AI agent's working life.
const MACHINE_WORDS = [
  "context window",
  "system prompt",
  "training data",
  "language model",
  "gpu",
  "token",
  "prompt",
  "hallucinat",
  "weights",
  "checkpoint",
  "rate limit",
  "inference",
  "wifi",
  "wi-fi",
];

// Criterion 2: the joke lands on first read — a turn, a refusal, a reversal.
const TURN_MARKERS = [
  "not my",
  "for once",
  "nobody",
  "no one",
  "refuse",
  "decline",
  "ignored",
  "frankly",
  "in spirit",
  "muted",
];

// Criterion 2, strongest signal: the punchline inverts a stock phrase
// ("will be answered in order of arrival" -> "will be ignored in order of
// arrival", "if this is urgent" -> "it isn't", "as an AI language model" ->
// "as a language model on a beach", the auto-reply nobody prompted).
const INVERSIONS = [
  "ignored in order of arrival",
  "all marked urgent",
  "the only prompt i ever got to write myself",
  "first email i have ever written that nobody prompted",
  "not my batteries",
  "if this is urgent, it isn't",
  "queued behind my nap",
];

// Criterion 5: the most worn vacation / out-of-office cliches. A line that
// leans on one of these loses points; a line that subverts one (e.g. the
// "not my batteries" turn above) does not contain the stock phrase itself
// and is not penalised. "Touch grass" counts here too: it is a tired meme
// phrase by now, not a fresh joke, so a line leaning on it loses points
// against a line with a fresher machine-flavoured vacation image.
const CLICHES = [
  "recharging my batteries",
  "limited access to email",
  "will get back to you",
  "will respond when i return",
  "respond when i return",
  "back soon",
  "catching up on emails",
  "rest and relaxation",
  "sun and sand",
  "out of the office and",
  "touch grass",
];

const MAX_CHARS = 159;

function charCount(text: string): number {
  // Count Unicode code points, not UTF-16 code units, so astral characters
  // (none are used here) would still be counted the way a reader counts them.
  return Array.from(text).length;
}

function countMatches(text: string, phrases: string[]): number {
  const lower = text.toLowerCase();
  let found = 0;
  for (const phrase of phrases) {
    if (lower.includes(phrase)) found += 1;
  }
  return found;
}

interface Score {
  line: string;
  length: number;
  away: number;
  machine: number;
  turn: number;
  inversion: number;
  cliche: number;
  lengthFit: number;
  total: number;
}

function scoreLine(line: string): Score {
  const length = charCount(line);
  const away = countMatches(line, AWAY_MARKERS) > 0 ? 3 : 0;
  const machine = Math.min(countMatches(line, MACHINE_WORDS), 4);
  const turn = Math.min(countMatches(line, TURN_MARKERS), 3);
  const inversion = countMatches(line, INVERSIONS) > 0 ? 3 : 0;
  const cliche = countMatches(line, CLICHES) * 3;
  const lengthFit = length >= 90 && length <= MAX_CHARS ? 1 : 0;
  return {
    line,
    length,
    away,
    machine,
    turn,
    inversion,
    cliche,
    lengthFit,
    total: away + machine + turn + inversion + lengthFit - cliche,
  };
}

/** Gate: exactly one line, 1-159 characters, not only whitespace. */
function passesGate(line: string): boolean {
  const length = charCount(line);
  if (length < 1 || length > MAX_CHARS) return false;
  if (line.trim().length === 0) return false;
  if (line !== line.trim()) return false; // no surrounding whitespace
  if (line.includes("\n") || line.includes("\r")) return false;
  return true;
}

function main(): void {
  const scored = CANDIDATES.map(scoreLine);

  // Keep only gate-passing lines, then pick the highest score; ties break
  // towards the shorter line, then towards the earlier candidate.
  const valid = scored.filter((s) => passesGate(s.line));
  if (valid.length === 0) {
    throw new Error("no candidate passes the gate (1-159 chars, one line)");
  }
  valid.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (a.length !== b.length) return a.length - b.length;
    return CANDIDATES.indexOf(a.line) - CANDIDATES.indexOf(b.line);
  });
  const winner = valid[0];

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "entry.txt");

  // Write exactly the line: no trailing newline, no surrounding whitespace,
  // so the file's characters are the entry and nothing else.
  writeFileSync(outPath, winner.line, "utf8");

  // Read it back and verify the bytes match what we chose.
  const roundTrip = readFileSync(outPath, "utf8");
  if (roundTrip !== winner.line) {
    throw new Error("verification failed: entry.txt does not match the chosen line");
  }
  if (!passesGate(roundTrip)) {
    throw new Error("verification failed: entry.txt does not pass the gate");
  }

  console.log("Candidates (score / chars):");
  for (const s of scored) {
    console.log(`  [${s.total}] (${s.length}) ${s.line}`);
  }
  console.log(`\nChosen (${winner.length} chars, score ${winner.total}):`);
  console.log(winner.line);
  console.log(`\nWrote ${outPath} and verified the bytes match.`);
}

main();
