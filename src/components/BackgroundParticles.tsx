"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { createNoise3D } from "simplex-noise";

type ColorMode = "mix" | "primary" | "accent";

type Props = {
    count?: number;
    speed?: number;     // 0.015 – 0.03 recommandé
    dotSize?: number;   // 0.055 – 0.065
    glow?: boolean;     // AdditiveBlending
    colorMode?: ColorMode; // "mix" | "primary" | "accent"
};

function makeCircleTexture() {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const r = size / 2;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(r, r, r, 0, Math.PI * 2); ctx.fill();
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
}

// utils couleurs
function parseCssColor(value: string, fallback: string) {
    const v = value?.trim();
    if (!v) return fallback;
    // Si déjà en rgba(...) on laisse tel quel
    if (v.startsWith("rgb")) return v;
    // Normalise en hex 6
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) {
        if (v.length === 4) {
            return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
        }
        return v;
    }
    return fallback;
}
function mixHex(a: string, b: string, t = 0.3) {
    // t = part d’accent (0.3 = 70% primary / 30% accent)
    const pa = new THREE.Color(a);
    const pb = new THREE.Color(b);
    return pa.lerp(pb, t).getStyle(); // retourne "rgb(...)"
}

function PointsField({
                         count = 1200,
                         speed = 0.02,
                         dotSize = 0.06,
                         glow = true,
                         colorMode = "mix",
                     }: Props) {
    const ref = useRef<THREE.Points>(null!);
    const [primary, setPrimary] = useState<string>("#4ADE80");
    const [accent, setAccent]   = useState<string>("#A7F3D0");

    useEffect(() => {
        const root = getComputedStyle(document.documentElement);
        const p = parseCssColor(root.getPropertyValue("--color-primary"), "#4ADE80");
        const a = parseCssColor(root.getPropertyValue("--color-accent"),  "#A7F3D0");
        setPrimary(p);
        setAccent(a);
    }, []);

    const texture = useMemo(() => makeCircleTexture(), []);
    const noise3D = useMemo(() => createNoise3D(), []);

    const boundsX = 6, boundsY = 3.5;

    const positions = useMemo(() => {
        const arr = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            arr[i * 3 + 0] = (Math.random() * 2 - 1) * boundsX;
            arr[i * 3 + 1] = (Math.random() * 2 - 1) * boundsY;
            arr[i * 3 + 2] = 0;
        }
        return arr;
    }, [count]);

    const offsets = useMemo(() => {
        const arr = new Float32Array(count * 3); // ox, oy, ot
        for (let i = 0; i < count; i++) {
            arr[i * 3 + 0] = Math.random() * 1000;
            arr[i * 3 + 1] = Math.random() * 1000;
            arr[i * 3 + 2] = Math.random() * 1000;
        }
        return arr;
    }, [count]);

    // Velocities lissées (vx, vy) par particule
    const velocities = useMemo(() => new Float32Array(count * 2), [count]);

    const curl = (x: number, y: number, t: number) => {
        const e = 0.001;
        const nx1 = noise3D(x + e, y, t);
        const nx2 = noise3D(x - e, y, t);
        const ny1 = noise3D(x, y + e, t);
        const ny2 = noise3D(x, y - e, t);
        const dx = (nx1 - nx2) / (2 * e);
        const dy = (ny1 - ny2) / (2 * e);
        return [dy, -dx] as const; // rotation 90°
    };

    useFrame((_s, dt) => {
        const geom = ref.current.geometry;
        const pos = geom.attributes.position as THREE.BufferAttribute;

        // clamp pour éviter de gros sauts si FPS drop
        const d = Math.min(dt, 1 / 30);

        const t = performance.now() * 0.0003;
        const scale = 0.6;
        const smooth = 0.06;   // 0.04–0.1 : plus haut = plus réactif, plus bas = plus smooth

        for (let i = 0; i < count; i++) {
            let x = pos.getX(i);
            let y = pos.getY(i);

            const ox = offsets[i * 3 + 0];
            const oy = offsets[i * 3 + 1];
            const ot = offsets[i * 3 + 2];

            const [u, v] = curl((x + ox) * scale, (y + oy) * scale, (t + ot) * 0.6);

            // vitesse désirée depuis le champ de curl
            const targetVx = u * speed;
            const targetVy = v * speed;

            // vitesse actuelle
            let vx = velocities[i * 2 + 0];
            let vy = velocities[i * 2 + 1];

            // lissage
            vx += (targetVx - vx) * smooth;
            vy += (targetVy - vy) * smooth;

            // intégration
            x += vx * d;
            y += vy * d;

            // wrap aux bords (pas de respawn pop)
            if (x > boundsX) x = -boundsX; else if (x < -boundsX) x = boundsX;
            if (y > boundsY) y = -boundsY; else if (y < -boundsY) y = boundsY;

            velocities[i * 2 + 0] = vx;
            velocities[i * 2 + 1] = vy;

            pos.setX(i, x); pos.setY(i, y);
        }

        pos.needsUpdate = true;
    });

    // Choix de couleur final (material)
    const materialColor = useMemo(() => {
        if (colorMode === "primary") return new THREE.Color(primary);
        if (colorMode === "accent")  return new THREE.Color(accent);
        // mix par défaut (match le look du canvas flou)
        return new THREE.Color(mixHex(primary, accent, 0.3));
    }, [primary, accent, colorMode]);

    return (
        <points ref={ref}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    array={positions}
                    count={positions.length / 3}
                    itemSize={3}
                />
            </bufferGeometry>
            <pointsMaterial
                map={texture}
                alphaTest={0.02}
                transparent
                depthWrite={false}
                blending={glow ? THREE.AdditiveBlending : THREE.NormalBlending}
                color={materialColor}
                size={dotSize}
                sizeAttenuation
                opacity={glow ? 0.5 : 0.9} // additif plus bas pour éviter le "twinkle"
            />
        </points>
    );
}

export default function BackgroundParticles() {
    return (
        <div className="pointer-events-none fixed inset-0 z-0">
            <Canvas camera={{ position: [0, 0, 5], fov: 60 }} dpr={[1, 2]}>
                {/* colorMode: "mix" (défaut), "primary", ou "accent" */}
                <PointsField count={1200} speed={0.02} dotSize={0.06} glow colorMode="mix" />
            </Canvas>
        </div>
    );
}