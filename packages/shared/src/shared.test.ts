import { describe, expect, it } from "vitest";
import { CATEGORIES, WORD_TRIPLETS, categoryDict, languageFeatures, scoreConsistency, scoreFluency, scoreOrientation, scoreRecall, singular, storyRepetition, PRODUCT, keywordJudge } from "./index.js";

describe("stimuli", () => {
  it("has 40 triplets, 120 unique words, none shared", () => {
    expect(WORD_TRIPLETS.length).toBe(40);
    expect(new Set(WORD_TRIPLETS.flat()).size).toBe(120);
  });
  it("triplet words avoid every fluency category", () => {
    const bad: string[] = [];
    for (const [i, t] of WORD_TRIPLETS.entries()) for (const w of t) {
      if (i === 0 && w === "apple") continue; // demo triplet from the spec
      for (const c of CATEGORIES) if (categoryDict(c.id).has(singular(w))) bad.push(`${w}:${c.id}`);
    }
    expect(bad).toEqual([]);
  });
  it("has 12 categories with at least 60 members each", () => {
    expect(CATEGORIES.length).toBe(12);
    for (const c of CATEGORIES) expect(categoryDict(c.id).size, c.id).toBeGreaterThanOrEqual(60);
  });
  it("keeps the product name in one constant", () => { expect(PRODUCT.name).toBe("Lantern"); });
});

describe("scoreRecall", () => {
  const given = ["apple", "candle", "river"];
  it("scores all three", () => expect(scoreRecall(given, "apple candle and river").free).toBe(3));
  it("scores two and lists the miss", () => {
    const r = scoreRecall(given, "Apple... and river");
    expect(r.free).toBe(2); expect(r.missed).toEqual(["candle"]);
  });
  it("zero for none", () => expect(scoreRecall(given, "I don't remember").score).toBe(0));
  it("accepts plurals", () => expect(scoreRecall(given, "apples and candles").free).toBe(2));
  it("accepts a one-letter slip on long words", () => expect(scoreRecall(given, "aple, candl, rivver").free).toBe(2));
  it("does not let a near word steal credit (handle is not candle)", () => expect(scoreRecall(given, "handle").free).toBe(0));
  it("adds 0.5 per cued word", () => {
    const r = scoreRecall(given, "apple", "candle... and river");
    expect(r.free).toBe(1); expect(r.cued).toBe(1); expect(r.score).toBe(2);
  });
});

describe("scoreFluency", () => {
  it("counts distinct animals", () => expect(scoreFluency("animals", "dog, cat, horse, cow").distinct).toBe(4));
  it("normalizes plurals", () => { const r = scoreFluency("animals", "cats dogs cat"); expect(r.distinct).toBe(2); expect(r.repetitions).toBe(1); });
  it("tolerates misspelling", () => expect(scoreFluency("animals", "elefant, giraffe, zebbra").distinct).toBe(3));
  it("logs intrusions from other categories", () => {
    const r = scoreFluency("animals", "dog cat apple banana");
    expect(r.distinct).toBe(2); expect(r.intrusions).toBe(2); expect(r.intrusionWords).toContain("apple");
  });
  it("ignores filler talk", () => expect(scoreFluency("animals", "um let me see, dog, uh, cat").distinct).toBe(2));
  it("handles multi-word members", () => expect(scoreFluency("cities", "new york, los angeles, paris").distinct).toBe(3));
  it("is zero for nothing", () => expect(scoreFluency("fruits", "").distinct).toBe(0));
  it("works for every category", () => { for (const c of CATEGORIES) expect(scoreFluency(c.id, c.members.slice(0, 5).join(", ")).distinct).toBeGreaterThanOrEqual(4); });
});

describe("scoreOrientation", () => {
  const truth = { weekday: "tuesday", month: "october", season: "fall" } as const;
  it("full marks", () => expect(scoreOrientation(truth, "It's Tuesday, October, fall").score).toBe(3));
  it("accepts autumn", () => expect(scoreOrientation(truth, "autumn", ["season"]).score).toBe(1));
  it("accepts tues", () => expect(scoreOrientation(truth, "tues", ["weekday"]).score).toBe(1));
  it("wrong day scores zero", () => expect(scoreOrientation(truth, "Wednesday", ["weekday"]).score).toBe(0));
  it("hedging between two days is not correct", () => expect(scoreOrientation(truth, "Monday or Tuesday", ["weekday"]).score).toBe(0));
  it("sat down is not Saturday", () => expect(scoreOrientation(truth, "I sat down", ["weekday"]).score).toBe(0));
});

describe("consistency and repetition", () => {
  const prior = "My granddaughter called about her science fair.";
  it("2 when details are echoed", () => expect(scoreConsistency(prior, "Oh the science fair, my granddaughter won second place")).toBe(2));
  it("1 for an on-topic answer", () => expect(scoreConsistency(prior, "She won second place")).toBe(1));
  it("0 for denial", () => expect(scoreConsistency(prior, "I don't remember that")).toBe(0));
  it("0 for empty", () => expect(scoreConsistency(prior, "")).toBe(0));
  it("keywordJudge matches", async () => expect(await keywordJudge.consistency(prior, "the science fair")).toBe(2));
  it("storyRepetition high for a retold story", () => {
    expect(storyRepetition("The church bake sale was busy today", ["I walked the garden", "The church bake sale was busy today"])).toBeGreaterThan(0.9);
  });
  it("storyRepetition low for new story", () => expect(storyRepetition("I watered the tomatoes", ["The church bake sale was busy"])).toBeLessThan(0.2));
  it("storyRepetition 0 when no history", () => expect(storyRepetition("hello there friend", [])).toBe(0));
});

describe("languageFeatures", () => {
  it("counts fillers", () => {
    const f = languageFeatures("Um, I got the, uh, thing from the stuff. You know, the whatchamacallit.");
    expect(f.fillers).toBe(6);
  });
  it("counts self-corrections and repeats", () => {
    expect(languageFeatures("I went to the the store, I mean the market").selfCorrections).toBe(2);
  });
  it("computes words, ttr and sentence length", () => {
    const f = languageFeatures("The dog ran. The dog sat.");
    expect(f.wordCount).toBe(6); expect(f.meanSentenceLen).toBe(3); expect(f.ttr).toBeCloseTo(0.667, 2);
  });
  it("is safe on empty", () => expect(languageFeatures("")).toEqual({ wordCount: 0, ttr: 0, fillers: 0, selfCorrections: 0, meanSentenceLen: 0 }));
});
