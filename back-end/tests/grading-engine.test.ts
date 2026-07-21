import { describe, expect, it } from "vitest";

import {
    gradeFillInBlank,
    gradeMcqMultiple,
    gradeMcqSingle,
    gradeNumerical,
} from "../src/modules/results/grading-engine.js";

describe("Grading Engine - Pure Functions", () => {
  describe("gradeMcqSingle", () => {
    it("should award full marks for correct answer", () => {
      const result = gradeMcqSingle(
        "q1",
        4,
        "answered",
        { selectedOptionId: "opt-a" },
        ["opt-a"],
      );
      expect(result.isCorrect).toBe(true);
      expect(result.marksAwarded).toBe(4);
    });

    it("should award zero marks for wrong answer", () => {
      const result = gradeMcqSingle(
        "q1",
        4,
        "answered",
        { selectedOptionId: "opt-b" },
        ["opt-a"],
      );
      expect(result.isCorrect).toBe(false);
      expect(result.marksAwarded).toBe(0);
    });

    it("should return zero for unanswered question", () => {
      const result = gradeMcqSingle("q1", 4, "not_visited", {}, ["opt-a"]);
      expect(result.isCorrect).toBe(false);
      expect(result.marksAwarded).toBe(0);
    });
  });

  describe("gradeMcqMultiple", () => {
    it("should award full marks when all correct options selected", () => {
      const result = gradeMcqMultiple(
        "q2",
        5,
        "answered",
        { selectedOptionIds: ["opt-a", "opt-c"] },
        ["opt-a", "opt-c"],
      );
      expect(result.isCorrect).toBe(true);
      expect(result.isPartial).toBe(false);
      expect(result.marksAwarded).toBe(5);
    });

    it("should award partial marks for partially correct answer", () => {
      const result = gradeMcqMultiple(
        "q2",
        5,
        "answered",
        { selectedOptionIds: ["opt-a"] },
        ["opt-a", "opt-c"],
      );
      expect(result.isCorrect).toBe(false);
      expect(result.isPartial).toBe(true);
      expect(result.marksAwarded).toBe(2.5);
    });

    it("should award zero marks when any wrong option selected", () => {
      const result = gradeMcqMultiple(
        "q2",
        5,
        "answered",
        { selectedOptionIds: ["opt-a", "opt-b"] },
        ["opt-a", "opt-c"],
      );
      expect(result.isCorrect).toBe(false);
      expect(result.isPartial).toBe(false);
      expect(result.marksAwarded).toBe(0);
    });

    it("should return zero for no selection", () => {
      const result = gradeMcqMultiple(
        "q2",
        5,
        "answered",
        { selectedOptionIds: [] },
        ["opt-a", "opt-c"],
      );
      expect(result.isCorrect).toBe(false);
      expect(result.marksAwarded).toBe(0);
    });
  });

  describe("gradeNumerical", () => {
    it("should award marks for correct numerical answer within tolerance", () => {
      const result = gradeNumerical(
        "q3",
        4,
        "answered",
        { numericalAnswer: 42.005 },
        ["42"],
      );
      expect(result.isCorrect).toBe(true);
      expect(result.marksAwarded).toBe(4);
    });

    it("should not award marks for wrong numerical answer", () => {
      const result = gradeNumerical(
        "q3",
        4,
        "answered",
        { numericalAnswer: 50 },
        ["42"],
      );
      expect(result.isCorrect).toBe(false);
      expect(result.marksAwarded).toBe(0);
    });

    it("should return zero for empty answer", () => {
      const result = gradeNumerical(
        "q3",
        4,
        "answered",
        { numericalAnswer: "" },
        ["42"],
      );
      expect(result.isCorrect).toBe(false);
      expect(result.marksAwarded).toBe(0);
    });
  });

  describe("gradeFillInBlank", () => {
    it("should award marks for case-insensitive correct text", () => {
      const result = gradeFillInBlank(
        "q4",
        3,
        "answered",
        { textInput: "  Paris  " },
        ["paris"],
      );
      expect(result.isCorrect).toBe(true);
      expect(result.marksAwarded).toBe(3);
    });

    it("should not award marks for wrong text", () => {
      const result = gradeFillInBlank(
        "q4",
        3,
        "answered",
        { textInput: "London" },
        ["paris"],
      );
      expect(result.isCorrect).toBe(false);
      expect(result.marksAwarded).toBe(0);
    });

    it("should return zero for empty text", () => {
      const result = gradeFillInBlank(
        "q4",
        3,
        "answered",
        { textInput: "   " },
        ["paris"],
      );
      expect(result.isCorrect).toBe(false);
      expect(result.marksAwarded).toBe(0);
    });
  });
});
