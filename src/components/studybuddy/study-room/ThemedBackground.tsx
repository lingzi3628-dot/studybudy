"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ThemedBackground — Phase 15 animated room background.
 *
 * Renders CSS gradient + floating particles + optional parallax.
 * Performance: limits particles on mobile, disables parallax on small screens.
 */
export function ThemedBackground({ theme }: { theme: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
  }, []);

  // Particle animation
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const particleCount = isMobile ? 15 : 40;
    const particles = Array.from({ length: particleCount }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -Math.random() * 0.5 - 0.1,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.4 + 0.1,
    }));

    const colors: Record<string, string> = {
      cozy_library: "#d4a574",
      futuristic_lab: "#06b6d4",
      space_station: "#a855f7",
      beach_study: "#f59e0b",
      dark_academia: "#a16207",
      cherry_blossom: "#ec4899",
      mint_garden: "#10b981",
      sunset_loft: "#f97316",
    };
    const color = colors[theme] ?? "#8b5cf6";

    let animId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -10) {
          p.y = canvas.height + 10;
          p.x = Math.random() * canvas.width;
        }
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = color + Math.round(p.opacity * 255).toString(16).padStart(2, "0");
        ctx.fill();
      }
      animId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, [theme, isMobile]);

  // Theme gradients
  const gradients: Record<string, string> = {
    cozy_library: "linear-gradient(135deg, #f5e6d3 0%, #e8d5b7 50%, #d4c4a8 100%)",
    futuristic_lab: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
    space_station: "linear-gradient(135deg, #0c0a1e 0%, #1a0f3e 50%, #0c0a1e 100%)",
    beach_study: "linear-gradient(135deg, #fef3c7 0%, #fde68a 30%, #a7f3d0 70%, #67e8f9 100%)",
    dark_academia: "linear-gradient(135deg, #1c1917 0%, #292524 50%, #1c1917 100%)",
    cherry_blossom: "linear-gradient(135deg, #fce7f3 0%, #fbcfe8 50%, #f9a8d4 100%)",
    mint_garden: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 50%, #6ee7b7 100%)",
    sunset_loft: "linear-gradient(135deg, #fef3c7 0%, #fdba74 30%, #fb7185 60%, #c084fc 100%)",
  };

  const isDark = ["futuristic_lab", "space_station", "dark_academia"].includes(theme);

  return (
    <div className="fixed inset-0 -z-10" style={{ background: gradients[theme] ?? gradients.cozy_library }}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      {/* Subtle vignette for depth */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at center, transparent 0%, ${isDark ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.1)"} 100%)`,
        }}
      />
    </div>
  );
}
