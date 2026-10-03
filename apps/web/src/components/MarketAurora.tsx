import { useEffect, useRef } from "react";

interface MarketAuroraProps {
  className?: string;
}

interface Point {
  x: number;
  y: number;
  z: number;
  speed: number;
  size: number;
}

export function MarketAurora({ className = "" }: MarketAuroraProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const points: Point[] = [];
    let animationFrame = 0;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let time = 0;

    function resize() {
      const bounds = canvas!.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = width * pixelRatio;
      canvas!.height = height * pixelRatio;
      context!.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    }

    function seedPoints() {
      points.length = 0;
      const count = Math.min(95, Math.max(40, Math.floor(width / 13)));
      for (let index = 0; index < count; index += 1) {
        points.push({
          x: Math.random() * width,
          y: Math.random() * height,
          z: Math.random(),
          speed: 0.12 + Math.random() * 0.45,
          size: 0.5 + Math.random() * 1.8,
        });
      }
    }

    function project(point: Point) {
      const depth = 0.55 + point.z * 0.95;
      return {
        x: width / 2 + (point.x - width / 2) / depth,
        y: height / 2 + (point.y - height / 2) / depth,
        scale: 1 / depth,
      };
    }

    function draw() {
      context!.clearRect(0, 0, width, height);
      const horizon = height * 0.57;

      context!.save();
      context!.globalAlpha = 0.34;
      context!.strokeStyle = "rgba(214, 173, 96, 0.2)";
      context!.lineWidth = 1;
      context!.beginPath();
      for (let row = 0; row < 11; row += 1) {
        const y = horizon + row * row * 4.4;
        context!.moveTo(0, y);
        context!.lineTo(width, y);
      }
      for (let column = -12; column <= 12; column += 1) {
        context!.moveTo(width / 2 + column * 28, horizon);
        context!.lineTo(width / 2 + column * 160, height);
      }
      context!.stroke();
      context!.restore();

      const sorted = [...points].sort((first, second) => first.z - second.z);
      for (const point of sorted) {
        if (!reducedMotion) {
          point.z += point.speed * 0.0017;
          if (point.z > 1.12) {
            point.z = 0.02;
            point.x = Math.random() * width;
            point.y = Math.random() * height;
          }
        }
        const projected = project(point);
        const alpha = 0.18 + point.z * 0.58;
        context!.fillStyle = `rgba(240, ${170 + Math.round(point.z * 40)}, 92, ${alpha})`;
        context!.beginPath();
        context!.arc(projected.x, projected.y, point.size * projected.scale, 0, Math.PI * 2);
        context!.fill();
      }

      const waveBase = height * 0.47;
      context!.save();
      context!.globalCompositeOperation = "screen";
      context!.lineWidth = 1.5;
      context!.strokeStyle = "rgba(79, 179, 255, 0.72)";
      context!.beginPath();
      for (let x = 0; x <= width; x += 8) {
        const normalized = x / width;
        const wave = Math.sin(normalized * 17 + time * 0.001) * 13 + Math.sin(normalized * 41) * 5;
        const y = waveBase + wave + normalized * 70;
        if (x === 0) context!.moveTo(x, y);
        else context!.lineTo(x, y);
      }
      context!.stroke();
      context!.restore();

      if (!reducedMotion) {
        time += 16;
        animationFrame = requestAnimationFrame(draw);
      }
    }

    resize();
    seedPoints();
    draw();
    window.addEventListener("resize", resize);
    window.addEventListener("resize", seedPoints);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("resize", seedPoints);
    };
  }, []);

  return <canvas ref={canvasRef} className={`market-aurora ${className}`} aria-hidden="true" />;
}
