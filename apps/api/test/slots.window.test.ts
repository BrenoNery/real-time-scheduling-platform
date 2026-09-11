import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCandidates, overlaps, utcDateRange } from "../src/services/slot-window.js";

describe("slot window helpers", () => {
  it("tiles a 09:00–12:00 window into 30-minute slots", () => {
    const candidates = buildCandidates("2032-03-01", "09:00", "12:00", 30);
    assert.equal(candidates.length, 6);
    assert.equal(candidates[0]!.startsAt.toISOString(), "2032-03-01T09:00:00.000Z");
    assert.equal(candidates[5]!.endsAt.toISOString(), "2032-03-01T12:00:00.000Z");
  });

  it("drops a trailing remainder shorter than the duration", () => {
    const candidates = buildCandidates("2032-03-03", "09:00", "10:20", 30);
    assert.equal(candidates.length, 2);
    assert.equal(candidates[1]!.endsAt.toISOString(), "2032-03-03T10:00:00.000Z");
  });

  it("rejects a non-positive duration before looping", () => {
    assert.throws(() => buildCandidates("2032-03-01", "09:00", "12:00", 0), RangeError);
    assert.throws(() => buildCandidates("2032-03-01", "09:00", "12:00", -30), RangeError);
  });

  it("treats ranges as half-open so adjacent slots do not overlap", () => {
    const morning = {
      startsAt: new Date("2032-03-01T09:00:00.000Z"),
      endsAt: new Date("2032-03-01T09:30:00.000Z"),
    };
    const next = {
      startsAt: new Date("2032-03-01T09:30:00.000Z"),
      endsAt: new Date("2032-03-01T10:00:00.000Z"),
    };
    const overlap = {
      startsAt: new Date("2032-03-01T09:15:00.000Z"),
      endsAt: new Date("2032-03-01T09:45:00.000Z"),
    };

    assert.equal(overlaps(morning, next), false);
    assert.equal(overlaps(morning, overlap), true);
    assert.equal(overlaps(next, overlap), true);
  });

  it("lists inclusive UTC calendar dates", () => {
    assert.deepEqual(utcDateRange("2032-03-01", "2032-03-01"), ["2032-03-01"]);
    assert.deepEqual(utcDateRange("2032-03-01", "2032-03-03"), [
      "2032-03-01",
      "2032-03-02",
      "2032-03-03",
    ]);
  });
});
