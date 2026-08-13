import { useEffect, useRef } from "react";

/**
 * Full-viewport ambient rain rendered on a fixed canvas behind the app.
 * The dashboard cards use translucent surfaces, so the rain subtly shows
 * through every widget as well as in the gaps between them.
 *
 * Cheap to run: a few hundred thin streaks plus short-lived splash ripples,
 * tinted with the neon-teal / blue accent palette. Fully skipped when the
 * user prefers reduced motion.
 */
export function RainBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduce) return;

    const canvas: HTMLCanvasElement | null = canvasRef.current;
    if (!canvas) return;
    const ctx: CanvasRenderingContext2D | null = canvas.getContext("2d");
    if (!ctx) return;
    // Non-null bindings so the narrowing survives into the nested closures.
    const cv: HTMLCanvasElement = canvas;
    const g2d: CanvasRenderingContext2D = ctx;

    let width = 0;
    let height = 0;
    let dpr = 1;

    type Drop = {
      x: number;
      y: number;
      len: number;
      speed: number;
      thickness: number;
      alpha: number;
    };
    type Splash = { x: number; y: number; r: number; alpha: number };

    let drops: Drop[] = [];
    const splashes: Splash[] = [];

    // Alternate between the two accent hues so the rain reads as "neon".
    const tints = [
      "rgba(30, 200, 200,", // --accent teal
      "rgba(74, 140, 240,", // blue
    ];

    const rand = (min: number, max: number) => min + Math.random() * (max - min);

    function makeDrop(atTop = false): Drop {
      return {
        x: Math.random() * width,
        y: atTop ? rand(-height, 0) : Math.random() * height,
        len: rand(14, 34),
        speed: rand(750, 1500), // px per second
        thickness: rand(0.6, 1.6),
        alpha: rand(0.22, 0.62),
      };
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      cv.width = Math.floor(width * dpr);
      cv.height = Math.floor(height * dpr);
      cv.style.width = width + "px";
      cv.style.height = height + "px";
      g2d.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Density scales with viewport area, capped so large screens stay light.
      const count = Math.min(340, Math.round((width * height) / 6500));
      drops = Array.from({ length: count }, () => makeDrop());
    }

    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();
    let raf = 0;

    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      g2d.clearRect(0, 0, width, height);

      for (const d of drops) {
        const tint = tints[(d.x | 0) % 2];
        const grad = g2d.createLinearGradient(d.x, d.y, d.x, d.y + d.len);
        grad.addColorStop(0, `${tint} 0)`);
        grad.addColorStop(1, `${tint} ${d.alpha})`);
        g2d.strokeStyle = grad;
        g2d.lineWidth = d.thickness;
        g2d.beginPath();
        g2d.moveTo(d.x, d.y);
        g2d.lineTo(d.x, d.y + d.len);
        g2d.stroke();

        d.y += d.speed * dt;

        if (d.y > height) {
          // Occasional splash ripple where the drop lands.
          if (Math.random() < 0.5) {
            splashes.push({ x: d.x, y: height - rand(0, 4), r: 0, alpha: 0.35 });
          }
          Object.assign(d, makeDrop(true));
        }
      }

      for (let i = splashes.length - 1; i >= 0; i--) {
        const s = splashes[i];
        s.r += 26 * dt * 3;
        s.alpha -= dt * 1.6;
        if (s.alpha <= 0) {
          splashes.splice(i, 1);
          continue;
        }
        g2d.strokeStyle = `rgba(30, 200, 200, ${s.alpha})`;
        g2d.lineWidth = 1;
        g2d.beginPath();
        g2d.ellipse(s.x, s.y, s.r, s.r * 0.35, 0, 0, Math.PI * 2);
        g2d.stroke();
      }

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="rain-bg" aria-hidden="true" />;
}
