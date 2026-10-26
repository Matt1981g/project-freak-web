import { useState } from "react";
import {
  selected_intensity,
  type TrainingIntensity,
} from "../../application/workout/trainingIntensity";
export function TrainingIntensityControl() {
  const [mode, setMode] = useState(() => selected_intensity(""));
  return (
    <label
      style={{ display: "flex", gap: 12, alignItems: "center", padding: 12 }}
    >
      Training intensity{" "}
      <select
        aria-label="Training intensity"
        style={{ minHeight: 48, fontSize: 16 }}
        value={mode}
        onChange={(e) => {
          const next = e.target.value as TrainingIntensity;
          localStorage.setItem("project-freak:training-intensity", next);
          setMode(next);
        }}
      >
        <option value="normal">Normal</option>
        <option value="freak">FREAK</option>
        <option value="recovery">Light / Recovery</option>
      </select>
      <small>Applies when starting a workout.</small>
    </label>
  );
}
