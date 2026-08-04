import { useEffect, useRef } from "react";

/**
 * AntigravityParticles — Google Antigravity-inspired interactive particle canvas.
 *
 * Renders a radial / constellation field of colorful dash capsules and micro-dots
 * in Google AI brand colors. When the user moves their cursor, particles dynamically
 * repel, swirl, and follow with elastic spring-damping physics and floating antigravity inertia.
 */
export default function AntigravityParticles({
  className = "",
  density = 220,
  particleType = "mixed", // "mixed" | "dashes" | "dots"
  interactiveRadius = 200,
  pushStrength = 14,
  springK = 0.045,
  damping = 0.88,
  glowEffect = true,
  originOffset = { x: 0.62, y: 0.42 }
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId;
    let width = 0;
    let height = 0;

    const PALETTE = [
      { color: "#8B5CF6", glow: "rgba(139, 92, 246, 0.45)" },
      { color: "#6366F1", glow: "rgba(99, 102, 241, 0.45)" },
      { color: "#EC4899", glow: "rgba(236, 72, 153, 0.45)" },
      { color: "#F43F5E", glow: "rgba(244, 63, 94, 0.45)" },
      { color: "#F59E0B", glow: "rgba(245, 158, 11, 0.45)" },
      { color: "#FB923C", glow: "rgba(251, 146, 60, 0.45)" },
      { color: "#10B981", glow: "rgba(16, 185, 129, 0.45)" },
      { color: "#06B6D4", glow: "rgba(6, 182, 212, 0.45)" },
      { color: "#3B82F6", glow: "rgba(59, 130, 246, 0.45)" },
      { color: "#475569", glow: "rgba(71, 85, 105, 0.25)" },
      { color: "#334155", glow: "rgba(51, 65, 85, 0.2)" },
      { color: "#64748B", glow: "rgba(100, 116, 139, 0.25)" },
    ];

    const mouse = {
      x: -9999, y: -9999, prevX: -9999, prevY: -9999,
      vx: 0, vy: 0, isHovered: false, lastMoveTime: 0
    };

    const shockwaves = [];

    class Particle {
      constructor(baseX, baseY, radialAngle, distFromCenter, maxDist) {
        this.baseX = baseX;
        this.baseY = baseY;
        this.x = baseX;
        this.y = baseY;
        this.vx = 0;
        this.vy = 0;
        this.baseAngle = radialAngle;
        this.angle = radialAngle;
        this.vAngle = 0;

        const pick = PALETTE[Math.floor(Math.random() * PALETTE.length)];
        this.color = pick.color;
        this.glow = pick.glow;

        this.isDash = particleType === "dots" ? false : (particleType === "dashes" ? true : Math.random() > 0.32);

        const sizeVariance = 0.75 + Math.random() * 0.55;
        this.length = (8 + Math.random() * 8) * sizeVariance;
        this.thickness = (2.5 + Math.random() * 2) * sizeVariance;
        this.radius = (2 + Math.random() * 2) * sizeVariance;

        this.floatSpeed = 0.0012 + Math.random() * 0.0018;
        this.floatPhase = Math.random() * Math.PI * 2;
        this.floatAmplitudeX = 4 + Math.random() * 7;
        this.floatAmplitudeY = 4 + Math.random() * 7;
        this.floatAngleSpeed = 0.001 + Math.random() * 0.0015;

        const normDist = Math.min(1, distFromCenter / (maxDist || 1));
        this.baseAlpha = 0.45 + (1 - normDist * 0.4) * 0.45;
        this.alpha = this.baseAlpha;
      }

      update(time) {
        const ambientOffsetX = Math.cos(time * this.floatSpeed + this.floatPhase) * this.floatAmplitudeX;
        const ambientOffsetY = Math.sin(time * this.floatSpeed * 1.2 + this.floatPhase) * this.floatAmplitudeY;
        const ambientAngleOffset = Math.sin(time * this.floatAngleSpeed + this.floatPhase) * 0.15;

        const targetX = this.baseX + ambientOffsetX;
        const targetY = this.baseY + ambientOffsetY;
        const targetAngle = this.baseAngle + ambientAngleOffset;

        if (mouse.isHovered) {
          const dx = this.x - mouse.x;
          const dy = this.y - mouse.y;
          const dist = Math.hypot(dx, dy);

          if (dist < interactiveRadius && dist > 0.1) {
            const factor = Math.pow(1 - dist / interactiveRadius, 1.6);
            const force = factor * pushStrength;
            const normalX = dx / dist;
            const normalY = dy / dist;

            this.vx += normalX * force;
            this.vy += normalY * force;
            this.vx += mouse.vx * 0.12 * factor;
            this.vy += mouse.vy * 0.12 * factor;

            const pushAngle = Math.atan2(dy, dx);
            this.vAngle += (pushAngle - this.angle) * 0.08 * factor;
            this.alpha = Math.min(1, this.baseAlpha + factor * 0.4);
          } else {
            this.alpha += (this.baseAlpha - this.alpha) * 0.05;
          }
        } else {
          this.alpha += (this.baseAlpha - this.alpha) * 0.05;
        }

        for (let i = 0; i < shockwaves.length; i++) {
          const sw = shockwaves[i];
          const dx = this.x - sw.x;
          const dy = this.y - sw.y;
          const dist = Math.hypot(dx, dy);
          const diff = Math.abs(dist - sw.radius);
          if (diff < sw.thickness) {
            const shockFactor = (1 - diff / sw.thickness) * sw.strength;
            const nx = dx / (dist || 1);
            const ny = dy / (dist || 1);
            this.vx += nx * shockFactor * 6;
            this.vy += ny * shockFactor * 6;
            this.vAngle += 0.3 * shockFactor;
          }
        }

        const springX = (targetX - this.x) * springK;
        const springY = (targetY - this.y) * springK;
        this.vx = (this.vx + springX) * damping;
        this.vy = (this.vy + springY) * damping;
        this.x += this.vx;
        this.y += this.vy;

        const angleDiff = targetAngle - this.angle;
        this.vAngle = (this.vAngle + angleDiff * (springK * 1.2)) * damping;
        this.angle += this.vAngle;
      }

      draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.globalAlpha = Math.max(0.05, Math.min(1, this.alpha));

        if (glowEffect && this.alpha > 0.6) {
          ctx.shadowColor = this.glow;
          ctx.shadowBlur = 8;
        }

        ctx.fillStyle = this.color;

        if (this.isDash) {
          const l = this.length;
          const t = this.thickness;
          const r = t / 2;
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(-l / 2, -t / 2, l, t, r);
          } else {
            ctx.arc(-l / 2 + r, 0, r, Math.PI / 2, Math.PI * 1.5);
            ctx.arc(l / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2);
          }
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
    }

    let particles = [];

    const initParticles = () => {
      particles = [];
      const centerX = width * originOffset.x;
      const centerY = height * originOffset.y;
      const maxRadius = Math.hypot(width, height) * 0.68;
      const count = Math.round(density * (Math.min(width, 1600) / 1000));
      const goldenAngle = 137.5 * (Math.PI / 180);

      for (let i = 0; i < count; i++) {
        const norm = i / count;
        const radius = Math.pow(norm, 0.72) * maxRadius + (Math.random() * 24 - 12);
        const theta = i * goldenAngle + (Math.random() * 0.25 - 0.125);
        const x = centerX + Math.cos(theta) * radius;
        const y = centerY + Math.sin(theta) * radius;
        if (x < -60 || x > width + 60 || y < -60 || y > height + 60) continue;
        const radialAngle = theta + Math.PI / 4 + (Math.random() * 0.3 - 0.15);
        particles.push(new Particle(x, y, radialAngle, radius, maxRadius));
      }

      const ambientCount = Math.round(count * 0.35);
      for (let j = 0; j < ambientCount; j++) {
        const ax = Math.random() * width;
        const ay = Math.random() * height;
        const dx = ax - centerX;
        const dy = ay - centerY;
        const aDist = Math.hypot(dx, dy);
        const aAngle = Math.atan2(dy, dx) + (Math.random() * 0.4 - 0.2);
        particles.push(new Particle(ax, ay, aAngle, aDist, maxRadius));
      }
    };

    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width || window.innerWidth;
      height = rect.height || window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
      initParticles();
    };

    handleResize();
    window.addEventListener("resize", handleResize, { passive: true });

    const onMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;
      if (mouse.prevX !== -9999) {
        mouse.vx = (clientX - mouse.prevX) * 0.6;
        mouse.vy = (clientY - mouse.prevY) * 0.6;
      } else {
        mouse.vx = 0;
        mouse.vy = 0;
      }
      mouse.prevX = mouse.x;
      mouse.prevY = mouse.y;
      mouse.x = clientX;
      mouse.y = clientY;
      mouse.isHovered = true;
      mouse.lastMoveTime = performance.now();
    };

    const onTouchMove = (e) => {
      if (!e.touches || e.touches.length === 0) return;
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const clientX = touch.clientX - rect.left;
      const clientY = touch.clientY - rect.top;
      mouse.vx = clientX - (mouse.x || clientX);
      mouse.vy = clientY - (mouse.y || clientY);
      mouse.x = clientX;
      mouse.y = clientY;
      mouse.isHovered = true;
      mouse.lastMoveTime = performance.now();
    };

    const onMouseLeave = () => {
      mouse.isHovered = false;
      mouse.x = -9999;
      mouse.y = -9999;
      mouse.prevX = -9999;
      mouse.prevY = -9999;
      mouse.vx = 0;
      mouse.vy = 0;
    };

    const onClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      shockwaves.push({ x, y, radius: 0, maxRadius: 280, speed: 9, thickness: 55, strength: 2.2 });
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onMouseLeave, { passive: true });
    window.addEventListener("mouseleave", onMouseLeave, { passive: true });
    window.addEventListener("click", onClick, { passive: true });

    let lastTime = performance.now();

    const animate = (now) => {
      const dt = Math.min(32, now - lastTime);
      lastTime = now;

      if (now - mouse.lastMoveTime > 40) {
        mouse.vx *= 0.85;
        mouse.vy *= 0.85;
      }

      ctx.clearRect(0, 0, width, height);

      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.radius += sw.speed * (dt / 16);
        sw.strength *= 0.96;
        if (sw.radius >= sw.maxRadius || sw.strength <= 0.05) {
          shockwaves.splice(i, 1);
        }
      }

      for (let i = 0; i < particles.length; i++) {
        particles[i].update(now);
        particles[i].draw(ctx);
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onMouseLeave);
      window.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("click", onClick);
    };
  }, [density, particleType, interactiveRadius, pushStrength, springK, damping, glowEffect, originOffset.x, originOffset.y]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none w-full h-full ${className}`}
      style={{ zIndex: 1 }}
      aria-hidden="true"
    />
  );
}
