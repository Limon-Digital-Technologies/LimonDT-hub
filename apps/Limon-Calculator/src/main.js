import "./style.css";
import { applyCalculatorInput, createCalculatorState } from "./calculator-engine.js";

const root = document.querySelector("#app");
const state = createCalculatorState();
const keys = [
  { label: "AC", action: "clear", kind: "utility" },
  { label: "±", action: "sign", kind: "utility" },
  { label: "%", action: "percent", kind: "utility" },
  { label: "÷", action: "operator", value: "/", kind: "operator" },
  { label: "7", action: "digit" }, { label: "8", action: "digit" }, { label: "9", action: "digit" },
  { label: "×", action: "operator", value: "*", kind: "operator" },
  { label: "4", action: "digit" }, { label: "5", action: "digit" }, { label: "6", action: "digit" },
  { label: "−", action: "operator", value: "-", kind: "operator" },
  { label: "1", action: "digit" }, { label: "2", action: "digit" }, { label: "3", action: "digit" },
  { label: "+", action: "operator", value: "+", kind: "operator" },
  { label: "0", action: "digit", kind: "calculator-key--zero" },
  { label: ".", action: "decimal" }, { label: "=", action: "equals", kind: "operator" },
];

root.innerHTML = `
  <main class="calculator-shell">
    <header class="calculator-header">
      <img class="calculator-logo" src="/assets/HubLogo.png" alt="" />
      <span><strong>Limon Calculator</strong><small>Утилита Limon Digital Technologies</small></span>
    </header>
    <section class="calculator-display" aria-live="polite">
      <div class="calculator-expression" data-calculator-expression></div>
      <output class="calculator-value" data-calculator-display>0</output>
    </section>
    <section class="calculator-keys" aria-label="Клавиши калькулятора">
      ${keys.map((key) => {
        const value = key.value ?? (key.action === "digit" ? key.label : null);
        return `<button class="calculator-key ${key.kind || ""}" data-calculator-action="${key.action}" ${value !== null ? `data-value="${value}"` : ""} aria-label="${key.action === "operator" ? `Операция ${key.label}` : key.label}">${key.label}</button>`;
      }).join("")}
    </section>
    <footer>Простые вычисления, где бы вы ни работали.</footer>
  </main>`;

function updateDisplay() {
  root.querySelector("[data-calculator-display]").textContent = state.display;
  root.querySelector("[data-calculator-expression]").textContent = state.expression;
}

root.addEventListener("click", (event) => {
  const key = event.target.closest("[data-calculator-action]");
  if (!key) return;
  applyCalculatorInput(state, key.dataset.calculatorAction, key.dataset.value);
  updateDisplay();
});

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (/^\d$/.test(event.key)) applyCalculatorInput(state, "digit", event.key);
  else if (event.key === ".") applyCalculatorInput(state, "decimal");
  else if (["+", "-", "*", "/"].includes(event.key)) applyCalculatorInput(state, "operator", event.key);
  else if (event.key === "Enter" || event.key === "=") applyCalculatorInput(state, "equals");
  else if (event.key === "Backspace") applyCalculatorInput(state, "delete");
  else if (event.key === "Escape") applyCalculatorInput(state, "clear");
  else return;
  updateDisplay();
});
