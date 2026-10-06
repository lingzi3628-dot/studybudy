"use client";
import { useState, useEffect, useRef } from "react";

export function PhysicsSimPanel({ spec }: { spec: any }) {
  const simType = spec?.simType || spec?.subtype || "pendulum";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [running, setRunning] = useState(false);
  const [params, setParams] = useState({
    length: spec?.length || 2,
    angle: spec?.initialAngle || 30,
    gravity: spec?.gravity || 9.81,
    mass: spec?.mass || 1,
    velocity: spec?.initialVelocity || 0,
    height: spec?.height || 50,
  });
  const stateRef = useRef<{ angle: number; velocity: number; time: number; x: number; y: number }>({ angle: params.angle * Math.PI / 180, velocity: params.velocity, time: 0, x: 0, y: 0 });

  useEffect(() => {
    if (!running) return;
    let raf: number;
    let lastTime = performance.now();

    const animate = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      if (simType === "pendulum") {
        const { length, gravity } = params;
        const s = stateRef.current;
        const acc = -(gravity / length) * Math.sin(s.angle);
        s.velocity += acc * dt;
        s.angle += s.velocity * dt;
        s.time += dt;
      } else if (simType === "projectile") {
        const { velocity, angle: angleDeg, gravity } = params;
        const s = stateRef.current;
        const rad = (angleDeg * Math.PI) / 180;
        const vx = velocity * Math.cos(rad);
        const vy = velocity * Math.sin(rad) - gravity * s.time;
        s.x = vx * s.time;
        s.y = vy * s.time + 0.5 * (-gravity) * s.time * s.time;
        if (s.y < 0) { s.y = 0; setRunning(false); }
        s.time += dt;
      }

      draw();
      raf = requestAnimationFrame(animate);
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [running, params, simType]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = "#E5E7EB";
    ctx.lineWidth = 0.5;
    for (let x = 0; x < w; x += 25) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 25) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    if (simType === "pendulum") {
      const cx = w / 2;
      const cy = 30;
      const len = Math.min(params.length * 50, h - 60);
      const s = stateRef.current;
      const px = cx + len * Math.sin(s.angle);
      const py = cy + len * Math.cos(s.angle);

      ctx.strokeStyle = "#9CA3AF";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();

      ctx.fillStyle = "#3B82F6";
      ctx.beginPath(); ctx.arc(px, py, params.mass * 8, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = "#6B7280";
      ctx.fillRect(cx - 20, cy - 5, 40, 5);
    } else if (simType === "projectile") {
      const s = stateRef.current;
      const scale = 3;
      const x = 50 + (s.x || 0) * scale;
      const y = h - 50 - ((s.y || 0) * scale);

      // Ground
      ctx.strokeStyle = "#9CA3AF"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, h - 50); ctx.lineTo(w, h - 50); ctx.stroke();

      // Trajectory
      ctx.strokeStyle = "#E5E7EB"; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let t = 0; t < s.time; t += 0.05) {
        const rad = (params.angle * Math.PI) / 180;
        const vx = params.velocity * Math.cos(rad);
        const vy = params.velocity * Math.sin(rad) - params.gravity * t;
        const px = 50 + vx * t * scale;
        const py = h - 50 - (vy * t + 0.5 * (-params.gravity) * t * t) * scale;
        if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Ball
      ctx.fillStyle = "#EF4444";
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
    }
  };

  const reset = () => {
    stateRef.current = { angle: params.angle * Math.PI / 180, velocity: params.velocity, time: 0, x: 0, y: 0 };
    setRunning(false);
    draw();
  };

  return (
    <div className="flex flex-col">
      <div className="flex gap-2 p-2 bg-gray-50 border-b border-gray-200">
        <button onClick={() => setRunning(r => !r)} className="px-3 py-1 rounded-full text-[10px] font-bold bg-indigo-600 text-white">
          {running ? "⏸ Pause" : "▶ Play"}
        </button>
        <button onClick={reset} className="px-3 py-1 rounded-full text-[10px] font-bold bg-gray-200 text-gray-700">↺ Reset</button>
        <span className="text-[10px] text-gray-400 self-center ml-auto">Physics Simulation · {simType}</span>
      </div>
      <canvas ref={canvasRef} width={500} height={350} className="w-full" style={{ maxHeight: "350px" }} />
    </div>
  );
}
