"use client";
import React, { useState } from "react";
export default function ProjectTypeFields() {
  const [mode, setMode] = useState("shopping");
  return (
    <>
      <label className="qc-field qc-wide">
        <span>Tipo de checklist</span>
        <select
          name="mode"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="shopping">Compras: preços, pagamento e pontos</option>
          <option value="checklist">
            Checklist simples: sem valores obrigatórios
          </option>
        </select>
      </label>
      {mode === "shopping" && (
        <label className="qc-field qc-wide">
          <span>Orçamento total (R$; opcional)</span>
          <input
            name="budget"
            type="number"
            min="0"
            max="10000000000"
            step="0.01"
          />
        </label>
      )}
    </>
  );
}
