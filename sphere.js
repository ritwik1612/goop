// Original flowing light ribbons with travelling accents.
export function createHealthspanSphere(canvas) {
  const ctx = canvas?.getContext("2d");
  if (!ctx) return () => {};
  const size = 600,
    centre = size / 2;
  canvas.width = size;
  canvas.height = size;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let seed = 197671;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const particles = Array.from({ length: 1450 }, () => {
    const z = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const radius = 213 + random() * 22;
    const plane = Math.sqrt(1 - z * z);
    return {
      x: Math.cos(angle) * plane * radius,
      y: Math.sin(angle) * plane * radius,
      z: z * radius,
      size: 1.05 + Math.pow(random(), 2) * 2.0,
      phase: random() * Math.PI * 2,
      brightness: random(),
    };
  });
  let frame = 0,
    stopped = false,
    last = 0,
    start = performance.now(),
    pointerX = 0,
    pointerY = 0,
    tiltX = 0,
    tiltY = 0;
  const gradient = ctx.createLinearGradient(90, 90, 515, 510);
  gradient.addColorStop(0, "#b9ffdc");
  gradient.addColorStop(0.27, "#71e5bc");
  gradient.addColorStop(0.6, "#4ea995");
  gradient.addColorStop(0.84, "#73c6d0");
  gradient.addColorStop(1, "#b2f4cc");
  function position(theta, layer, t) {
    const phase = layer * 0.235;
    const breathe = Math.sin(t * 0.5) * 2.4;
    const ribbon =
      Math.sin(theta * 3 + t * 0.37 + phase) * 8 +
      Math.cos(theta * 2 - t * 0.28 + phase * 0.55) * 5;
    const radius =
      239 + breathe + Math.sin(phase + theta * 2 + t * 0.22) * 18 + ribbon;
    const twist = Math.sin(theta * 2 - t * 0.36 + phase) * 19;
    return [
      centre + Math.cos(theta) * radius + tiltX * 12,
      centre + Math.sin(theta) * (radius * 0.91) + twist + tiltY * 10,
    ];
  }
  function draw(now) {
    if (stopped || !canvas.isConnected) return;
    if (!reduced.matches) frame = requestAnimationFrame(draw);
    if (!reduced.matches && (document.hidden || now - last < 32)) return;
    last = now;
    const t = reduced.matches ? 1.7 : (now - start) / 1000;
    tiltX += (pointerX - tiltX) * 0.06;
    tiltY += (pointerY - tiltY) * 0.06;
    ctx.clearRect(0, 0, size, size);
    const atmosphere = ctx.createRadialGradient(
      centre,
      centre,
      155,
      centre,
      centre,
      285,
    );
    atmosphere.addColorStop(0, "rgba(95,203,171,0)");
    atmosphere.addColorStop(0.65, "rgba(117,221,193,.055)");
    atmosphere.addColorStop(1, "rgba(95,203,171,0)");
    ctx.fillStyle = atmosphere;
    ctx.fillRect(0, 0, size, size);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let layer = 0; layer < 29; layer++) {
      const phase = layer * 0.235;
      ctx.beginPath();
      for (let step = 0; step <= 180; step++) {
        const [x, y] = position((step / 180) * Math.PI * 2, layer, t);
        if (step === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = gradient;
      ctx.lineWidth = layer % 7 === 0 ? 1.7 : 0.85;
      ctx.globalAlpha = 0.2 + 0.19 * (0.5 + 0.5 * Math.sin(phase + t * 0.35));
      ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      for (let trail = 0; trail < 28; trail++) {
        const [x, y] = position(
          t * (i % 2 ? -0.25 : 0.21) + i * 1.257 - trail * 0.012,
          i * 6,
          t,
        );
        ctx.globalAlpha = (1 - trail / 28) * 0.9;
        ctx.fillStyle = i % 2 ? "#91d8dd" : "#ccffe5";
        ctx.beginPath();
        ctx.arc(x, y, trail === 0 ? 2.8 : 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  function pointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointerX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    pointerY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
  }
  function reset() {
    pointerX = 0;
    pointerY = 0;
  }
  function motionChanged() {
    cancelAnimationFrame(frame);
    draw(performance.now());
  }
  canvas.addEventListener("pointermove", pointer);
  canvas.addEventListener("pointerleave", reset);
  reduced.addEventListener("change", motionChanged);
  draw(performance.now() + 33);
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    canvas.removeEventListener("pointermove", pointer);
    canvas.removeEventListener("pointerleave", reset);
    reduced.removeEventListener("change", motionChanged);
  };
}
