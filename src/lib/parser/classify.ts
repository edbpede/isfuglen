import type { Confidence } from "../model/types";
import { rulesFor } from "./rules";
import type { Classified, Line, ParseContext, Rule } from "./types";

/**
 * Stage 3 — score every line against the active rule packs (§11.5, §11.6).
 *
 * Highest score wins; ties break toward the earlier rule, and the rule order
 * from `rulesFor` already puts Danish ahead of English. Only `low` confidence is
 * ever surfaced to the user: flagging `medium` would flood the review strip and
 * teach people to ignore it.
 */

const HIGH_SCORE = 80;
const MEDIUM_SCORE = 40;
const AMBIGUITY_WINDOW = 10;

interface Match {
  rule: Rule;
  score: number;
}

export function classifyLine(
  line: Line,
  ctx: ParseContext,
  rules = rulesFor(ctx.lang),
): Classified {
  const matches: Match[] = [];
  for (const rule of rules) {
    if (rule.test(line, ctx)) matches.push({ rule, score: rule.score });
  }

  // Stable: `sort` in V8 and JavaScriptCore is stable, so equal scores keep the
  // registry order rather than shuffling between runs.
  matches.sort((a, b) => b.score - a.score);

  const best = matches[0];
  if (!best) {
    return {
      line,
      kind: "paragraph",
      score: 0,
      confidence: "low",
      ruleId: `${ctx.lang}.structure.paragraph`,
      extraction: {},
    };
  }

  const contenders = matches.filter((match) => match.score >= MEDIUM_SCORE && !match.rule.fallback);
  const ambiguous =
    contenders.length > 1 &&
    contenders[0] !== undefined &&
    contenders[1] !== undefined &&
    contenders[0].rule.kind !== contenders[1].rule.kind &&
    contenders[0].score - contenders[1].score < AMBIGUITY_WINDOW;

  return {
    line,
    kind: best.rule.kind,
    score: best.score,
    confidence: best.rule.uncertain ? "low" : confidenceFor(best.score, ambiguous),
    ruleId: best.rule.id,
    extraction: best.rule.extract?.(line, ctx) ?? {},
  };
}

function confidenceFor(score: number, ambiguous: boolean): Confidence {
  if (ambiguous) return "low";
  if (score >= HIGH_SCORE) return "high";
  if (score >= MEDIUM_SCORE) return "medium";
  return "low";
}

export function classify(ctx: ParseContext): Classified[] {
  const rules = rulesFor(ctx.lang);
  return ctx.lines.map((line) => classifyLine(line, ctx, rules));
}
