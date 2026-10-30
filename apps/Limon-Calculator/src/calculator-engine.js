const operatorSymbols = {
  "+": "+",
  "-": "−",
  "*": "×",
  "/": "÷",
};

export function createCalculatorState() {
  return {
    display: "0",
    expression: "",
    previousValue: null,
    operator: null,
    waitingForOperand: false,
    error: false,
  };
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "Ошибка";
  const rounded = Number(value.toPrecision(12));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function calculate(left, right, operator) {
  switch (operator) {
    case "+": return left + right;
    case "-": return left - right;
    case "*": return left * right;
    case "/": return right === 0 ? NaN : left / right;
    default: throw new Error(`Unknown calculator operator: ${operator}`);
  }
}

function applyResult(state, value) {
  if (!Number.isFinite(value)) {
    state.display = "Ошибка";
    state.expression = "На ноль делить нельзя";
    state.previousValue = null;
    state.operator = null;
    state.waitingForOperand = true;
    state.error = true;
    return;
  }
  state.display = formatNumber(value);
}

export function applyCalculatorInput(state, action, value = "") {
  if (action === "clear") {
    Object.assign(state, createCalculatorState());
    return state;
  }

  if (action === "digit") {
    if (!/^\d$/.test(value)) return state;
    if (state.error || state.waitingForOperand) {
      state.display = value;
      state.expression = "";
      state.error = false;
      state.waitingForOperand = false;
    } else if (state.display.replace(/\D/g, "").length < 15) {
      state.display = state.display === "0" ? value : `${state.display}${value}`;
    }
    return state;
  }

  if (action === "decimal") {
    if (state.error || state.waitingForOperand) {
      state.display = "0.";
      state.expression = "";
      state.error = false;
      state.waitingForOperand = false;
    } else if (!state.display.includes(".")) {
      state.display += ".";
    }
    return state;
  }

  if (action === "delete") {
    if (state.error || state.waitingForOperand) return state;
    state.display = state.display.length > 1 ? state.display.slice(0, -1) : "0";
    if (state.display === "-") state.display = "0";
    return state;
  }

  if (action === "sign" || action === "percent") {
    if (state.error) return state;
    const current = Number(state.display);
    state.display = formatNumber(action === "sign" ? -current : current / 100);
    state.waitingForOperand = false;
    return state;
  }

  if (action === "operator") {
    if (state.error) return state;
    const current = Number(state.display);
    if (state.operator && !state.waitingForOperand) {
      const result = calculate(state.previousValue, current, state.operator);
      applyResult(state, result);
      if (state.error) return state;
      state.previousValue = result;
    } else {
      state.previousValue = current;
    }
    state.operator = value;
    state.expression = `${formatNumber(state.previousValue)} ${operatorSymbols[value]}`;
    state.waitingForOperand = true;
    return state;
  }

  if (action === "equals" && state.operator && state.previousValue !== null) {
    const left = state.previousValue;
    const right = Number(state.display);
    const operator = state.operator;
    state.expression = `${formatNumber(left)} ${operatorSymbols[operator]} ${formatNumber(right)} =`;
    applyResult(state, calculate(left, right, operator));
    state.previousValue = null;
    state.operator = null;
    state.waitingForOperand = true;
  }

  return state;
}
