import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

// ─── Google Font injection ──────────────────────────────────────────────────
const fontLink = document.createElement('link');
fontLink.rel = 'stylesheet';
fontLink.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400&family=Inter:wght@300;400;500;600&display=swap';
if (!document.querySelector('link[href*="Cormorant"]')) document.head.appendChild(fontLink);

// ─── Three.js Hero Scene ────────────────────────────────────────────────────
const HeroCanvas: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth;
    const H = mount.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x060a12, 0.018);

    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 200);
    camera.position.set(0, 4, 18);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x060a12, 1);
    mount.appendChild(renderer.domElement);

    // ── Lighting ──────────────────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0x0a1a2e, 1.2);
    scene.add(ambient);

    const sunLight = new THREE.DirectionalLight(0xc9922a, 2.5); // golden/bronze
    sunLight.position.set(5, 10, 5);
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x1a6b6e, 1.5); // teal rim
    rimLight.position.set(-8, 3, -5);
    scene.add(rimLight);

    const fillLight = new THREE.PointLight(0xc9922a, 0.8, 30);
    fillLight.position.set(0, 8, 2);
    scene.add(fillLight);

    // ── Stars ─────────────────────────────────────────────────────────────
    const starCount = 1800;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i++) {
      starPositions[i] = (Math.random() - 0.5) * 180;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xd4c8a8, size: 0.15, sizeAttenuation: true });
    scene.add(new THREE.Points(starGeo, starMat));

    // ── Water surface ─────────────────────────────────────────────────────
    const waterGeo = new THREE.PlaneGeometry(60, 60, 80, 80);
    const waterMat = new THREE.MeshPhongMaterial({
      color: 0x0a2a3a,
      shininess: 120,
      specular: new THREE.Color(0x1a6b6e),
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -3.5;
    scene.add(water);

    // Water vertex animation
    const wPos = waterGeo.attributes.position;
    const wBaseY = new Float32Array(wPos.count);
    for (let i = 0; i < wPos.count; i++) wBaseY[i] = wPos.getY(i);

    // ── Dugout Canoe (lathe geometry) ─────────────────────────────────────
    const canoePts: THREE.Vector2[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const x = Math.sin(Math.PI * t) * 0.9;
      const y = t * 5 - 2.5;
      canoePts.push(new THREE.Vector2(x, y));
    }
    const canoeGeo = new THREE.LatheGeometry(canoePts, 12);
    const canoeMat = new THREE.MeshPhongMaterial({
      color: 0x3d1a08,
      shininess: 20,
      specular: new THREE.Color(0x4a2a10),
    });
    const canoe = new THREE.Mesh(canoeGeo, canoeMat);
    canoe.rotation.z = Math.PI / 2;
    canoe.rotation.y = 0.3;
    canoe.scale.set(0.7, 0.7, 0.7);
    canoe.position.set(-4, -3.1, 2);
    scene.add(canoe);

    // Oar / paddle
    const oarGeo = new THREE.CylinderGeometry(0.04, 0.04, 3.5, 6);
    const oarMat = new THREE.MeshPhongMaterial({ color: 0x2a1005 });
    const oar = new THREE.Mesh(oarGeo, oarMat);
    oar.rotation.z = Math.PI / 4;
    oar.position.set(-3.5, -2.4, 2.3);
    scene.add(oar);

    // ── Ijaw Mask (stylized) ──────────────────────────────────────────────
    const maskGroup = new THREE.Group();

    // Face base — flattened sphere
    const faceGeo = new THREE.SphereGeometry(1.3, 32, 24);
    const faceMat = new THREE.MeshPhongMaterial({
      color: 0x2e1505,
      shininess: 8,
      specular: new THREE.Color(0x5c2d0a),
    });
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.scale.set(1, 1.3, 0.6);
    maskGroup.add(face);

    // Forehead ridge
    const ridgeGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.4, 8);
    const ridge = new THREE.Mesh(ridgeGeo, faceMat);
    ridge.position.set(0, 0.3, 0.3);
    ridge.rotation.z = Math.PI / 2;
    ridge.scale.set(1, 0.3, 0.3);
    maskGroup.add(ridge);

    // Eye sockets (carved hollows)
    const eyeGeo = new THREE.SphereGeometry(0.22, 12, 12);
    const eyeMat = new THREE.MeshPhongMaterial({ color: 0x080400, shininess: 0 });
    [-0.5, 0.5].forEach(x => {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(x, 0.25, 0.65);
      eye.scale.set(1, 0.7, 0.5);
      maskGroup.add(eye);
      // Eye glint
      const glintGeo = new THREE.SphereGeometry(0.07, 6, 6);
      const glintMat = new THREE.MeshPhongMaterial({ color: 0xc9922a, emissive: new THREE.Color(0xc9922a), emissiveIntensity: 0.6 });
      const glint = new THREE.Mesh(glintGeo, glintMat);
      glint.position.set(x + 0.06, 0.28, 0.82);
      maskGroup.add(glint);
    });

    // Nose bridge
    const noseGeo = new THREE.BoxGeometry(0.18, 0.6, 0.2);
    const nose = new THREE.Mesh(noseGeo, faceMat);
    nose.position.set(0, -0.15, 0.68);
    maskGroup.add(nose);

    // Mouth slit
    const mouthGeo = new THREE.BoxGeometry(0.7, 0.1, 0.15);
    const mouth = new THREE.Mesh(mouthGeo, eyeMat);
    mouth.position.set(0, -0.65, 0.62);
    maskGroup.add(mouth);

    // Forehead tribal marks (3 vertical lines)
    [-0.3, 0, 0.3].forEach((x, i) => {
      const markGeo = new THREE.BoxGeometry(0.07, 0.4, 0.06);
      const markMat = new THREE.MeshPhongMaterial({ color: 0xc9922a, emissive: new THREE.Color(0xc9922a), emissiveIntensity: 0.3 });
      const mark = new THREE.Mesh(markGeo, markMat);
      mark.position.set(x, 0.8, 0.55 - Math.abs(x) * 0.15);
      maskGroup.add(mark);
    });

    // Headdress — stacked rings at top
    for (let i = 0; i < 4; i++) {
      const ringGeo = new THREE.TorusGeometry(0.55 - i * 0.08, 0.06, 8, 24);
      const ringMat = new THREE.MeshPhongMaterial({ color: 0xc9922a, shininess: 60, specular: new THREE.Color(0xffe0a0) });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(0, 1.4 + i * 0.22, 0);
      ring.rotation.x = Math.PI / 2 + 0.2;
      maskGroup.add(ring);
    }

    maskGroup.position.set(3, 1.5, 0);
    maskGroup.scale.set(1.1, 1.1, 1.1);
    scene.add(maskGroup);

    // ── Mangrove silhouette (background) ─────────────────────────────────
    const makeTree = (x: number, z: number, h: number, col: number) => {
      const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, h, 6);
      const trunkMat = new THREE.MeshPhongMaterial({ color: col });
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(x, -3.5 + h / 2, z);
      scene.add(trunk);
      // canopy blobs
      for (let i = 0; i < 3; i++) {
        const leafGeo = new THREE.SphereGeometry(0.5 + Math.random() * 0.5, 6, 6);
        const leafMat = new THREE.MeshPhongMaterial({ color: 0x0d2e1a, shininess: 0 });
        const leaf = new THREE.Mesh(leafGeo, leafMat);
        leaf.position.set(x + (Math.random() - 0.5) * 1.2, -3.5 + h + 0.3 + Math.random() * 0.8, z + (Math.random() - 0.5) * 1.2);
        scene.add(leaf);
      }
    };

    [[-12, -8, 5, 0x1a0a03], [-15, -5, 7, 0x1a0a03], [14, -10, 6, 0x1a0a03], [16, -6, 8, 0x1a0a03], [-10, -12, 4, 0x1a0a03]].forEach(
      ([x, z, h, c]) => makeTree(x, z, h, c)
    );

    // ── Firefly particles ─────────────────────────────────────────────────
    const ffCount = 160;
    const ffPos = new Float32Array(ffCount * 3);
    const ffSpeeds = new Float32Array(ffCount);
    const ffPhases = new Float32Array(ffCount);
    for (let i = 0; i < ffCount; i++) {
      ffPos[i * 3] = (Math.random() - 0.5) * 28;
      ffPos[i * 3 + 1] = Math.random() * 10 - 2;
      ffPos[i * 3 + 2] = (Math.random() - 0.5) * 20;
      ffSpeeds[i] = 0.003 + Math.random() * 0.005;
      ffPhases[i] = Math.random() * Math.PI * 2;
    }
    const ffGeo = new THREE.BufferGeometry();
    ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
    const ffMat = new THREE.PointsMaterial({ color: 0xd4c84a, size: 0.12, sizeAttenuation: true, transparent: true, opacity: 0.9 });
    const fireflies = new THREE.Points(ffGeo, ffMat);
    scene.add(fireflies);

    // ── Ripple rings on water ─────────────────────────────────────────────
    const ripples: { ring: THREE.Mesh; age: number; maxAge: number }[] = [];
    const addRipple = (x: number, z: number) => {
      const geo = new THREE.RingGeometry(0.1, 0.2, 32);
      const mat = new THREE.MeshBasicMaterial({ color: 0x4da6c0, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
      const ring = new THREE.Mesh(geo, mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, -3.42, z);
      scene.add(ring);
      ripples.push({ ring, age: 0, maxAge: 140 });
    };
    // Spawn initial ripples at canoe position
    addRipple(-4, 2);
    addRipple(-2, 3);
    addRipple(-5, 0.5);

    // ── Animation loop ────────────────────────────────────────────────────
    let frame = 0;
    let animId: number;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      frame++;
      const t = frame * 0.01;

      // Animate water surface
      for (let i = 0; i < wPos.count; i++) {
        const x = wPos.getX(i);
        const z = wPos.getZ(i);
        wPos.setY(i, wBaseY[i] + Math.sin(x * 0.6 + t) * 0.12 + Math.sin(z * 0.4 + t * 0.7) * 0.08);
      }
      wPos.needsUpdate = true;
      waterGeo.computeVertexNormals();

      // Float canoe on water
      canoe.position.y = -3.1 + Math.sin(t * 0.6) * 0.06;
      canoe.rotation.z = Math.sin(t * 0.4) * 0.04;
      oar.position.y = -2.4 + Math.sin(t * 0.6) * 0.06;

      // Rotate mask slowly, gentle bob
      maskGroup.rotation.y = Math.sin(t * 0.3) * 0.25;
      maskGroup.rotation.x = Math.sin(t * 0.2) * 0.05;
      maskGroup.position.y = 1.5 + Math.sin(t * 0.4) * 0.12;
      fillLight.position.x = Math.sin(t * 0.5) * 3;

      // Animate fireflies
      const ffArr = ffGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < ffCount; i++) {
        ffArr[i * 3 + 1] += ffSpeeds[i];
        ffArr[i * 3] += Math.sin(t + ffPhases[i]) * 0.008;
        if (ffArr[i * 3 + 1] > 8) {
          ffArr[i * 3 + 1] = -2;
          ffArr[i * 3] = (Math.random() - 0.5) * 28;
          ffArr[i * 3 + 2] = (Math.random() - 0.5) * 20;
        }
      }
      ffGeo.attributes.position.needsUpdate = true;
      ffMat.opacity = 0.5 + Math.sin(t * 2) * 0.3;

      // Ripple expand & fade
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.age++;
        const progress = r.age / r.maxAge;
        r.ring.scale.setScalar(1 + progress * 8);
        (r.ring.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - progress);
        if (r.age >= r.maxAge) {
          scene.remove(r.ring);
          ripples.splice(i, 1);
        }
      }
      // Occasionally spawn new ripples
      if (frame % 90 === 0) addRipple((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10);

      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const handleResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Subtle parallax on mouse
    const handleMouse = (e: MouseEvent) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2;
      const ny = (e.clientY / window.innerHeight - 0.5) * 2;
      camera.position.x = nx * 1.2;
      camera.position.y = 4 - ny * 0.6;
      camera.lookAt(0, 0, 0);
    };
    window.addEventListener('mousemove', handleMouse);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouse);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0 w-full h-full" />;
};

// ─── Section fade-in wrapper ────────────────────────────────────────────────
const FadeIn: React.FC<{ children: React.ReactNode; delay?: number; className?: string }> = ({ children, delay = 0, className }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 36 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

// ─── Mini Three.js mask for culture section ──────────────────────────────────
const MaskCanvas: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const W = mount.clientWidth, H = mount.clientHeight;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 0, 7);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const amb = new THREE.AmbientLight(0x1a0a03, 2);
    scene.add(amb);
    const key = new THREE.DirectionalLight(0xc9922a, 4);
    key.position.set(3, 5, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x1a6b6e, 2);
    rim.position.set(-4, -2, -3);
    scene.add(rim);

    const g = new THREE.Group();

    const faceGeo = new THREE.SphereGeometry(1.4, 48, 36);
    const faceMat = new THREE.MeshPhongMaterial({ color: 0x3d1a08, shininess: 12, specular: new THREE.Color(0x7a3c10) });
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.scale.set(1, 1.35, 0.55);
    g.add(face);

    const eyeGeo = new THREE.SphereGeometry(0.26, 16, 16);
    const eyeMat = new THREE.MeshPhongMaterial({ color: 0x050200 });
    [-0.55, 0.55].forEach(x => {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(x, 0.3, 0.68);
      eye.scale.set(1, 0.72, 0.45);
      g.add(eye);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshPhongMaterial({ color: 0xc9922a, emissive: new THREE.Color(0xc9922a), emissiveIntensity: 1 }));
      glint.position.set(x + 0.07, 0.33, 0.9);
      g.add(glint);
    });

    const noseMat = new THREE.MeshPhongMaterial({ color: 0x3d1a08 });
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.22), noseMat);
    nose.position.set(0, -0.18, 0.7);
    g.add(nose);

    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.12, 0.14), eyeMat);
    mouth.position.set(0, -0.72, 0.64);
    g.add(mouth);

    [-0.35, 0, 0.35].forEach(x => {
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.46, 0.07),
        new THREE.MeshPhongMaterial({ color: 0xc9922a, emissive: new THREE.Color(0xc9922a), emissiveIntensity: 0.5 }));
      mark.position.set(x, 0.88, 0.56 - Math.abs(x) * 0.12);
      g.add(mark);
    });

    for (let i = 0; i < 5; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62 - i * 0.09, 0.07, 8, 28),
        new THREE.MeshPhongMaterial({ color: 0xc9922a, shininess: 80, specular: new THREE.Color(0xffe0a0) }));
      ring.position.set(0, 1.5 + i * 0.24, 0);
      ring.rotation.x = Math.PI / 2 + 0.15;
      g.add(ring);
    }

    // Chin decorative rows
    for (let row = 0; row < 2; row++) {
      for (let col = -2; col <= 2; col++) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6),
          new THREE.MeshPhongMaterial({ color: 0xc9922a, emissive: new THREE.Color(0xc9922a), emissiveIntensity: 0.4 }));
        dot.position.set(col * 0.18, -0.95 - row * 0.18, 0.58 - Math.abs(col) * 0.04);
        g.add(dot);
      }
    }

    scene.add(g);

    let frame = 0, id: number;
    const loop = () => {
      id = requestAnimationFrame(loop);
      frame++;
      g.rotation.y = Math.sin(frame * 0.008) * 0.55;
      g.rotation.x = Math.sin(frame * 0.005) * 0.06;
      renderer.render(scene, camera);
    };
    loop();

    const resize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', resize); renderer.dispose(); if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement); };
  }, []);
  return <div ref={mountRef} className="w-full h-full" />;
};

// ─── Main Landing Page ───────────────────────────────────────────────────────
interface LandingPageProps {
  onEnter: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onEnter }) => {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [heroVisible, setHeroVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 120);
    return () => clearTimeout(t);
  }, []);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
      onEnter();
    } catch (err) {
      toast.error("Sign-in failed. Please try again.");
      setIsSigningIn(false);
    }
  };

  const stats = [
    { value: '5,000+', label: 'Years of history', sub: 'Izon language' },
    { value: '14M', label: 'Speakers', sub: 'across 6 states' },
    { value: '16', label: 'Living dialects', sub: 'being documented' },
    { value: '∞', label: 'Generations', sub: 'to preserve for' },
  ];

  const steps = [
    { num: '01', title: 'Generate', body: 'AI surfaces authentic Ijaw words, cross-checked against real linguistic sources and web references.', accent: '#c9922a' },
    { num: '02', title: 'Verify', body: 'Native speakers confirm, correct, and record proper pronunciation. Community consensus governs every entry.', accent: '#1a6b6e' },
    { num: '03', title: 'Record', body: 'Voice samples are uploaded - real voices, real dialects. Each recording is a piece of the oral tradition, preserved.', accent: '#c9922a' },
    { num: '04', title: 'Preserve', body: 'The curated dataset is open and permanent. Teachers, linguists, and children across millennia can access it.', accent: '#1a6b6e' },
  ];

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: '#060a12', color: '#f0ede4', overflowX: 'hidden' }}>

      {/* ── HERO ───────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <HeroCanvas />

        {/* Gradient overlay so text reads over canvas */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#060a12]/20 via-transparent to-[#060a12]/80 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#060a12]/50 via-transparent to-transparent pointer-events-none" />

        <div className="relative z-10 max-w-5xl mx-auto px-6 pt-24 pb-32">
          <AnimatePresence>
            {heroVisible && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1.4 }}
                className="space-y-8"
              >
                {/* Eyebrow */}
                <motion.p
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.9 }}
                  style={{ fontFamily: "'Inter', sans-serif", letterSpacing: '0.3em' }}
                  className="text-[11px] font-semibold text-[#c9922a] uppercase"
                >
                  Niger Delta: Bayelsa · Rivers · Delta State · Edo · Ondo · Akwa Ibom
                </motion.p>

                {/* Main headline */}
                <motion.h1
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                  style={{ fontFamily: "'Cormorant Garamond', serif", lineHeight: 1.05 }}
                  className="text-[clamp(3rem,9vw,7.5rem)] font-bold text-[#f0ede4] max-w-3xl"
                >
                  Woni ama,<br />
                  <span style={{ color: '#c9922a', fontStyle: 'italic' }}>woni igoh.</span>
                </motion.h1>

                {/* Translation */}
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.9, duration: 0.8 }}
                  style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic' }}
                  className="text-[#8b9bb4] text-xl"
                >
                  "Our language, our wealth."
                </motion.p>

                {/* Body text */}
                <motion.p
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.1, duration: 0.9 }}
                  className="text-[#c4bfb4] text-lg leading-relaxed max-w-xl font-light"
                >
                  The Ijaw people have spoken their language for over five thousand years.
                  Izonate exists so their great-grandchildren will too, crowdsourcing
                  every word, every dialect, every voice into a living archive for all eternity.

                </motion.p>

                {/* CTA buttons */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.3, duration: 0.8 }}
                  className="flex flex-wrap gap-4 pt-2"
                >
                  <button
                    onClick={handleSignIn}
                    disabled={isSigningIn}
                    className="group relative px-8 py-4 text-sm font-semibold tracking-wider uppercase overflow-hidden transition-all"
                    style={{
                      background: 'linear-gradient(135deg, #c9922a, #a87020)',
                      color: '#060a12',
                      borderRadius: '2px',
                      letterSpacing: '0.15em',
                    }}
                  >
                    <span className="relative z-10">
                      {isSigningIn ? 'Signing in…' : 'Join the Mission'}
                    </span>
                    <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12" />
                  </button>

                  <button
                    onClick={() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' })}
                    className="px-8 py-4 text-sm font-semibold tracking-wider uppercase border text-[#c4bfb4] hover:text-[#f0ede4] hover:border-[#c9922a]/50 transition-all"
                    style={{ borderColor: 'rgba(255,255,255,0.12)', borderRadius: '2px', letterSpacing: '0.15em' }}
                  >
                    Learn More
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          transition={{ delay: 2.2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        >
          <span style={{ letterSpacing: '0.25em', fontSize: '9px' }} className="text-[#8b9bb4] uppercase">Scroll</span>
          <div className="w-px h-12 bg-gradient-to-b from-[#c9922a]/60 to-transparent" />
        </motion.div>
      </section>

      {/* ── STATS BAR ──────────────────────────────────────────────────── */}
      <div style={{ background: '#0a0e1a', borderTop: '1px solid rgba(201,146,42,0.15)', borderBottom: '1px solid rgba(201,146,42,0.15)' }}>
        <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-0">
          {stats.map((s, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <div className={cn("px-6 py-4 flex flex-col gap-1", i < 3 && "border-r border-[rgba(255,255,255,0.06)]")}>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', lineHeight: 1, color: '#c9922a', fontWeight: 600 }}>{s.value}</span>
                <span className="text-[#f0ede4] text-sm font-medium">{s.label}</span>
                <span className="text-[#8b9bb4] text-xs">{s.sub}</span>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>

      {/* ── ABOUT THE IJAW ─────────────────────────────────────────────── */}
      <section id="about" className="py-32 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* 3D Mask */}
          <FadeIn className="order-2 lg:order-1">
            <div className="relative aspect-square max-w-[480px] mx-auto">
              {/* Glow ring behind mask */}
              <div className="absolute inset-8 rounded-full" style={{ background: 'radial-gradient(circle, rgba(201,146,42,0.12) 0%, transparent 70%)' }} />
              <div className="absolute inset-0 rounded-full border border-[rgba(201,146,42,0.1)]" />
              <MaskCanvas />
            </div>
          </FadeIn>

          <FadeIn delay={0.2} className="order-1 lg:order-2 space-y-8">
            <p style={{ letterSpacing: '0.3em', fontSize: '10px' }} className="text-[#c9922a] uppercase font-semibold">The People of the Izon</p>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", lineHeight: 1.1 }} className="text-[clamp(2.2rem,5vw,4rem)] font-bold text-[#f0ede4]">
              Africa's oldest living<br />civilization still speaks.
            </h2>
            <div className="space-y-4 text-[#a09890] text-base leading-relaxed font-light">
              <p>
                The Ijaw-Izon in their own tongue, have inhabited the Niger Delta
                since before 3000 BCE. For over five millennia, their voices have 
                carried the history of a people. Linguists date the Ijoid language
                family to at least 5,000 years of independent evolution, making it one of
                the oldest and most unique language branches in all of Africa.
              </p>
              <p>
                They are a people of deep tradition. Their legacy is etched in their 
                proverbs and oral histories, <em style={{ color: '#c4bfb4' }}>Woyingi</em>,
                the creator mother; <em style={{ color: '#c4bfb4' }}>Egbesu</em>, guardian
                of truth and justice. Their masquerades, the <em style={{ color: '#c4bfb4' }}>Owu</em>, are living 
                embodiments of an ancient heritage that must not be forgotten.
              </p>
              <p>
                Today, 14 million Ijaw people speak 16 distinct dialects. But 
                intergenerational transmission is fading. Without active 
                preservation, several of those dialects will fall silent 
                forever within our lifetime.
              </p>
            </div>
            <div style={{ width: '48px', height: '2px', background: '#c9922a' }} />
          </FadeIn>
        </div>
      </section>

      {/* ── QUOTE / EMOTIONAL SECTION ──────────────────────────────────── */}
      <section style={{ background: '#0a0e1a', borderTop: '1px solid rgba(255,255,255,0.05)' }} className="py-32 px-6 overflow-hidden">
        <div className="max-w-4xl mx-auto text-center space-y-8 relative">
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-px h-20 bg-gradient-to-b from-transparent to-[#c9922a]/40" />
          <FadeIn>
            <p style={{ letterSpacing: '0.3em', fontSize: '10px' }} className="text-[#c9922a] uppercase font-semibold">The Mission</p>
          </FadeIn>
          <FadeIn delay={0.1}>
            <blockquote style={{ fontFamily: "'Cormorant Garamond', serif", lineHeight: 1.3, color: '#f0ede4' }}
              className="text-[clamp(1.8rem,4.5vw,3.5rem)] font-light italic">
              "A language lost is not just a vocabulary gone,
              it is a way of seeing the world, a connection to 
              ancestry, a name for existence that no one will
              ever say again."
            </blockquote>
          </FadeIn>
          <FadeIn delay={0.2}>
            <p className="text-[#8b9bb4] text-sm font-light">For You. For Your Children. For their children's children.</p>
          </FadeIn>

          {/* Decorative divider — three Egbesu marks */}
          <FadeIn delay={0.3}>
            <div className="flex items-center justify-center gap-6 pt-4">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div style={{ width: '3px', height: i === 1 ? '28px' : '20px', background: '#c9922a', opacity: i === 1 ? 1 : 0.4 }} />
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── WHY IT MATTERS ─────────────────────────────────────────────── */}
      <section className="py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <FadeIn className="mb-20 max-w-2xl">
            <p style={{ letterSpacing: '0.3em', fontSize: '10px' }} className="text-[#c9922a] uppercase font-semibold mb-4">Why it matters</p>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", lineHeight: 1.1 }} className="text-[clamp(2rem,4.5vw,3.6rem)] font-bold text-[#f0ede4]">
              Language is the memory<br />of a people.
            </h2>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px" style={{ background: 'rgba(255,255,255,0.05)' }}>
            {[
              {
                icon: '📜',
                title: 'The Children',
                body: 'Right now, Ijaw children are growing up in cities, in schools that teach in English. Without materials, without recordings, without dictionaries, they have no bridge back to their ancestral heritage.',
              },
              {
                icon: '🗣️',
                title: 'The Oral Tradition',
                body: 'Ijaw culture lives in the voice, in the ancient stories, in funeral songs, in the wisdom of ancestral voices. Text alone cannot preserve it. Voice recordings can.',
              },
              {
                icon: '🛡️',
                title: 'The Dialects',
                body: 'Kolokuma. Nembe. Zarama. Kabowei. Each is a distinct world. Several have fewer than 10,000 living speakers. Every verified word in this dataset is a brick in a firewall against language death.',
              },
            ].map((card, i) => (
              <FadeIn key={i} delay={i * 0.12}>
                <div className="p-10 space-y-5" style={{ background: '#060a12' }}>
                  <span className="text-3xl">{card.icon}</span>
                  <h3 style={{ fontFamily: "'Cormorant Garamond', serif" }} className="text-2xl font-semibold text-[#f0ede4]">{card.title}</h3>
                  <p className="text-[#8b9bb4] leading-relaxed text-sm font-light">{card.body}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────────────────── */}
      <section style={{ background: '#0a0e1a', borderTop: '1px solid rgba(255,255,255,0.05)' }} className="py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <FadeIn className="mb-20 text-center">
            <p style={{ letterSpacing: '0.3em', fontSize: '10px' }} className="text-[#c9922a] uppercase font-semibold mb-4">How Izonate works</p>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", lineHeight: 1.1 }} className="text-[clamp(2rem,4vw,3.2rem)] font-bold text-[#f0ede4]">
              From AI draft to<br />living archive.
            </h2>
          </FadeIn>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, i) => (
              <FadeIn key={i} delay={i * 0.1}>
                <div className="group space-y-5 p-8 border border-[rgba(255,255,255,0.05)] hover:border-[rgba(201,146,42,0.25)] transition-colors duration-500" style={{ borderRadius: '1px' }}>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '3.5rem', lineHeight: 1, color: 'rgba(201,146,42,0.18)', fontWeight: 700 }}>{step.num}</div>
                  <div style={{ width: '24px', height: '2px', background: step.accent }} />
                  <h3 style={{ fontFamily: "'Cormorant Garamond', serif" }} className="text-xl font-semibold text-[#f0ede4]">{step.title}</h3>
                  <p className="text-[#8b9bb4] text-sm leading-relaxed font-light">{step.body}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── DIALECTS GRID ──────────────────────────────────────────────── */}
      <section className="py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <FadeIn className="mb-16">
            <p style={{ letterSpacing: '0.3em', fontSize: '10px' }} className="text-[#c9922a] uppercase font-semibold mb-4">16 Living Dialects</p>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif" }} className="text-[clamp(1.8rem,3.5vw,2.8rem)] font-bold text-[#f0ede4] max-w-xl">
              Each name is a community, a history, a living voice.
            </h2>
          </FadeIn>
          <div className="flex flex-wrap gap-3">
            {['Kolokuma', 'Nembe', 'Brass', 'Ekpetiama', 'Tarakiri', 'Oporoza', 'Olodiama', 'Gbarain', 'Mein', 'Boma', 'Kumbo', 'Buseni', 'Okordia', 'Zarama', 'Akita', 'Kabowei'].map((d, i) => (
              <FadeIn key={d} delay={i * 0.03}>
                <div
                  className="px-4 py-2 text-sm font-medium transition-all duration-300 hover:text-[#c9922a] cursor-default"
                  style={{
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#8b9bb4',
                    fontFamily: "'Inter', sans-serif",
                    letterSpacing: '0.05em',
                  }}
                >
                  {d}
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ───────────────────────────────────────────────────── */}
      <section className="relative py-40 px-6 overflow-hidden" style={{ background: '#0a0e1a' }}>
        {/* Background texture: faint water pattern */}
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg, #c9922a 0px, #c9922a 1px, transparent 1px, transparent 40px), repeating-linear-gradient(90deg, #c9922a 0px, #c9922a 1px, transparent 1px, transparent 40px)' }} />

        <div className="relative z-10 max-w-3xl mx-auto text-center space-y-10">
          <FadeIn>
            <div style={{ width: '1px', height: '60px', background: 'linear-gradient(to bottom, transparent, rgba(201,146,42,0.5))', margin: '0 auto 32px' }} />
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", lineHeight: 1.1 }} className="text-[clamp(2.5rem,6vw,5rem)] font-bold text-[#f0ede4]">
              Be part of something<br />
              <span style={{ color: '#c9922a', fontStyle: 'italic' }}>that lasts forever.</span>
            </h2>
          </FadeIn>
          <FadeIn delay={0.15}>
            <p className="text-[#a09890] text-lg font-light max-w-xl mx-auto leading-relaxed">
              Every word you verify, every dialect you record, every correction you contribute
              it all flows into a dataset that will outlive us. The Ijaw language will be spoken
              by a child a thousand years from now. Help make that possible.
            </p>
          </FadeIn>
          <FadeIn delay={0.25}>
            <button
              onClick={handleSignIn}
              disabled={isSigningIn}
              className="group relative inline-flex items-center gap-3 px-10 py-5 text-sm font-semibold uppercase tracking-widest overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #c9922a, #a87020)', color: '#060a12', borderRadius: '2px' }}
            >
              <span className="relative z-10">{isSigningIn ? 'Opening…' : 'Start Preserving Today'}</span>
              <span className="relative z-10 text-base group-hover:translate-x-1 transition-transform">→</span>
              <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12" />
            </button>
          </FadeIn>
          <FadeIn delay={0.3}>
            <p className="text-[#8b9bb4] text-xs font-light" style={{ letterSpacing: '0.05em' }}>
              Free to join · Sign in with Google · Takes 30 seconds
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: '#060a12' }} className="py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.4rem', fontWeight: 600, color: '#c9922a' }}>Izonate</p>
            <p className="text-[#8b9bb4] text-xs mt-1">Preserving the Izon language for eternity.</p>
          </div>
          <div className="text-center">
            <p style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', color: '#8b9bb4', fontSize: '0.9rem' }}>
              "Woyingi gave us the gift of speech to carry our history.<br />Let our ancestral voices echo forever."
            </p>
          </div>
          <p className="text-[#4a5568] text-xs text-right">
            Built to last.<br />
            Open dataset · Community-governed
          </p>
        </div>
      </footer>
    </div>
  );
};
;
;
;
