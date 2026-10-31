import { sampleDay } from "./model.js";
const axis = (x, y, text, color = "#98a5af", anchor = "start") =>
  `<text x="${x}" y="${y}" fill="${color}" text-anchor="${anchor}">${text}</text>`;
const path = (points) =>
  points
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
const shell = (label, body, height = 200) =>
  `<svg class="chart multichart" viewBox="0 0 380 ${height}" role="img" aria-label="${label}">${body}</svg>`;
export function performanceChart(range = "W", offset = 0) {
  const count = range === "W" ? 7 : range === "M" ? 14 : 26,
    span = range === "W" ? 7 : range === "M" ? 30 : 180;
  const data = Array.from({ length: count }, (_, i) =>
    sampleDay(offset - Math.round(((count - 1 - i) * span) / count)),
  );
  const x = (i) => 27 + (i * 319) / (count - 1),
    strain = data.map((d, i) => [x(i), 169 - (d.strain / 21) * 145]),
    recovery = data.map((d, i) => [x(i), 169 - (d.recovery / 100) * 145]);
  const lines = [0, 7, 14, 21]
    .map(
      (v) =>
        `<line x1="27" x2="346" y1="${169 - (v / 21) * 145}" y2="${169 - (v / 21) * 145}"/>${axis(4, 173 - (v / 21) * 145, v, "#5896df")}`,
    )
    .join("");
  const ticks = [0, 33, 66, 100]
    .map((v, i) =>
      axis(
        374,
        173 - (v / 100) * 145,
        `${v}%`,
        ["#e25f5a", "#e25f5a", "#dfcc51", "#8ddd45"][i],
        "end",
      ),
    )
    .join("");
  return `<div class="multi-chart-legend"><span><i style="background:#649ae0"></i>DAY STRAIN</span><span><i style="background:#8bdd4b"></i>RECOVERY</span></div>${shell("Day Strain and Recovery on separate labelled axes", `${lines}<path d="${path(recovery)}" fill="none" stroke="#505960" stroke-width="1.5"/><path d="${path(strain)}" fill="none" stroke="#6195d7" stroke-width="1.6"/>${data.map((d, i) => `<circle cx="${x(i)}" cy="${strain[i][1]}" r="3.5" fill="#1d252b" stroke="#679ee7" stroke-width="1.7"/><circle cx="${x(i)}" cy="${recovery[i][1]}" r="3.8" fill="#1d252b" stroke="${d.recovery >= 67 ? "#99df4e" : d.recovery >= 34 ? "#e2cc52" : "#e36461"}" stroke-width="1.7"/>`).join("")}${ticks}${[0, Math.floor((count - 1) / 2), count - 1].map((i, j) => axis(x(i), 192, range === "W" ? ["SUN", "WED", "SAT"][j] : range === "M" ? ["OCT 1", "OCT 15", "OCT 31"][j] : ["MAY", "AUG", "OCT"][j], "#98a5af", "middle")).join("")}`)}<div class="distribution-pair"><div><h4>DAY STRAIN</h4>${histogram(
    data.map((d) => d.strain),
    [0, 10, 14, 18, 21.1],
    ["#6394d7", "#6394d7", "#6394d7", "#6394d7"],
    ["&lt;10.0", "10–14", "14–18", "18–21"],
  )}</div><div><h4>RECOVERY</h4>${histogram(
    data.map((d) => d.recovery),
    [0, 34, 67, 101],
    ["#d26660", "#e0c95b", "#98dc4d"],
    ["0–33%", "34–66%", "67–100%"],
  )}</div></div>`;
}
function histogram(values, bins, colors, labels) {
  const counts = bins
      .slice(0, -1)
      .map((b, i) => values.filter((v) => v >= b && v < bins[i + 1]).length),
    max = Math.max(1, ...counts);
  return `<svg viewBox="0 0 170 100" role="img" aria-label="Score distribution">${counts
    .map((count, i) => {
      const width = 140 / counts.length,
        x = 12 + i * width,
        h = (count / max) * 64;
      return `<rect x="${x}" y="${70 - h}" width="${width - 3}" height="${h}" fill="${colors[i]}"/>${Array.from({ length: count }, (_, j) => `<line x1="${x}" x2="${x + width - 3}" y1="${70 - (j * h) / count}" y2="${70 - (j * h) / count}" stroke="#19242d" stroke-width="1"/>`).join("")}${axis(x + (width - 3) / 2, 87, labels[i], "#9caab4", "middle")}`;
    })
    .join("")}</svg>`;
}
export function sleepStackChart(range = "W", offset = 0) {
  const count = range === "W" ? 7 : range === "M" ? 14 : 26;
  return `<div class="multi-chart-legend">${[
    ["#a5a0de", "LIGHT"],
    ["#d69fe4", "DEEP"],
    ["#9c65cf", "REM"],
  ]
    .map(([c, n]) => `<span><i style="background:${c}"></i>${n}</span>`)
    .join("")}</div>${shell(
    "Sleep stages across your selected sample time range",
    `${[0, 4, 8].map((v) => `<line x1="25" x2="367" y1="${166 - v * 16}" y2="${166 - v * 16}"/>${axis(4, 170 - v * 16, v + "h")}`).join("")}${Array.from(
      { length: count },
      (_, i) => {
        const d = sampleDay(offset - count + 1 + i),
          hours = d.sleepMinutes / 60,
          x = 29 + (i * 334) / count,
          w = Math.max(3, 334 / count - 7);
        let y = 166;
        return [0.49, 0.23, 0.28]
          .map((part, j) => {
            const h = hours * part * 16;
            y -= h;
            return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${["#a5a0de", "#d69fe4", "#9c65cf"][j]}"/>`;
          })
          .join("");
      },
    ).join(
      "",
    )}${axis(25, 191, range === "W" ? "SUN" : "START")}${axis(184, 191, range === "W" ? "WED" : "MIDPOINT")}${axis(345, 191, range === "W" ? "SAT" : "END")}`,
  )}`;
}
export function heartRateChart(
  values,
  label = "Heart rate by training zone",
  min = 70,
  max = 200,
) {
  const data = values?.length
    ? values
    : Array.from({ length: 100 }, (_, i) =>
        i < 12
          ? 105 + i * 4
          : 150 + Math.sin(i * 0.14) * 21 + Math.sin(i * 1.7) * 8,
      );
  const x = (i) => 28 + (i * 330) / Math.max(data.length - 1, 1),
    y = (v) => 169 - ((v - min) / (max - min)) * 145;
  const colors = [
    "#9aa5b2",
    "#7697c7",
    "#81a9db",
    "#a6d9b3",
    "#d6bd72",
    "#cc8a61",
  ];
  const zone = (v) =>
    Math.min(5, Math.max(0, Math.floor((v / 190 - 0.5) * 10) + 1));
  return shell(
    label,
    `${[min, Math.round((max + min) / 2), max].map((v) => `<line x1="28" x2="358" y1="${y(v)}" y2="${y(v)}"/>${axis(3, y(v) + 4, v)}`).join("")}<defs><linearGradient id="hr-fill" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#6a9ad5" stop-opacity=".19"/><stop offset="1" stop-color="#6a9ad5" stop-opacity="0"/></linearGradient></defs><path d="${path(data.map((v, i) => [x(i), y(Math.max(min, Math.min(max, v)))]))}L358,169 L28,169Z" fill="url(#hr-fill)"/>${data
      .slice(1)
      .map(
        (v, i) =>
          `<path d="M${x(i)},${y(Math.max(min, Math.min(max, data[i])))}L${x(i + 1)},${y(Math.max(min, Math.min(max, v)))}" fill="none" stroke="${colors[zone(v)]}" stroke-width="1.5"/>`,
      )
      .join(
        "",
      )}${axis(28, 193, "START")}${axis(175, 193, "MIDPOINT")}${axis(337, 193, "END")}`,
  );
}
export function stressChart() {
  const data = Array.from({ length: 160 }, (_, i) => {
    const asleep = i > 42 && i < 100;
    return asleep
      ? 0.2 + Math.abs(Math.sin(i * 0.8) * Math.cos(i * 0.31)) * 0.4
      : 0.4 + Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.27)) * 2.2;
  });
  const x = (i) => 29 + (i * 329) / 159,
    y = (v) => 165 - (v / 3) * 140;
  return shell(
    "Sample stress through the day, blue low, green medium and gold high",
    `<defs><linearGradient id="stress-line" x1="0" x2="0" y1="1" y2="0"><stop stop-color="#8baed7"/><stop offset=".4" stop-color="#9cd9b3"/><stop offset="1" stop-color="#d7ba6b"/></linearGradient></defs><rect x="${x(43)}" y="25" width="${x(100) - x(43)}" height="140" fill="#80a1c2" fill-opacity=".07"/>${[0, 1, 2, 3].map((v) => `<line x1="29" x2="358" y1="${y(v)}" y2="${y(v)}"/>${axis(5, y(v) + 4, v + ".0")}`).join("")}<path d="${path(data.map((v, i) => [x(i), y(v)]))}" fill="none" stroke="url(#stress-line)" stroke-width="1.5"/><path d="M358 13V168" stroke="#c1c8cf" stroke-dasharray="4 4"/>${axis(29, 194, "16:59")}${axis(143, 194, "01:00")}${axis(249, 194, "09:00")}${axis(335, 194, "16:59")}`,
    205,
  );
}
