import test from "node:test";
import assert from "node:assert/strict";
import { applyCalculatorInput, createCalculatorState } from "./calculator-engine.js";

function calculate(actions) {
  const state = createCalculatorState();
  for (const [action, value] of actions) applyCalculatorInput(state, action, value);
  return state;
}

test("calculates decimal addition without floating-point noise", () => {
  const state = calculate([
    ["digit", "0"], ["decimal"], ["digit", "1"],
    ["operator", "+"],
    ["digit", "0"], ["decimal"], ["digit", "2"],
    ["equals"],
  ]);
  assert.equal(state.display, "0.3");
});

test("chains operations in calculator order", () => {
  const state = calculate([
    ["digit", "5"], ["operator", "+"], ["digit", "3"],
    ["operator", "*"], ["digit", "2"], ["equals"],
  ]);
  assert.equal(state.display, "16");
});

test("shows a recoverable error for division by zero", () => {
  const state = calculate([["digit", "8"], ["operator", "/"], ["digit", "0"], ["equals"]]);
  assert.equal(state.display, "Ошибка");
  assert.equal(state.error, true);
  applyCalculatorInput(state, "digit", "4");
  assert.equal(state.display, "4");
  assert.equal(state.error, false);
});

test("supports percentage, sign change, and deletion", () => {
  const state = calculate([["digit", "5"], ["digit", "0"], ["percent"], ["sign"], ["delete"]]);
  assert.equal(state.display, "-0.");
  applyCalculatorInput(state, "clear");
  assert.equal(state.display, "0");
  assert.equal(state.expression, "");
});
