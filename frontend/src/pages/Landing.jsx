import { useState, useRef, useMemo, Suspense } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, Database, ArrowRight, Eye, Sparkles
} from 'lucide-react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF, Float, useTexture } from '@react-three/drei';
import * as THREE from 'three';

// 3D Anatomical Brain Mesh with Ultra-Detailed Realistic Cortical Textures & Sulci
function BrainMesh({ skinMode }) {
  const { scene } = useGLTF('/human_brain.glb');
  const [diffuseMap, normalMap, specMap] = useTexture([
    '/textures/brain_diffuse.png',
    '/textures/brain_normal.png',
    '/textures/brain_spec.png',
  ]);

  useMemo(() => {
    if (diffuseMap) {
      diffuseMap.colorSpace = THREE.SRGBColorSpace;
      diffuseMap.needsUpdate = true;
    }
    if (normalMap) {
      normalMap.needsUpdate = true;
    }

    scene.traverse((child) => {
      if (child.isMesh) {
        if (skinMode === 'wireframe') {
          // Holographic neural network lattice
          child.material = new THREE.MeshBasicMaterial({
            color: '#00E599',
            wireframe: true,
            transparent: true,
            opacity: 0.45,
          });
        } else if (skinMode === 'clinical') {
          // Bioluminescent Medical Diagnostic Mode with highlighted sulci & gyri convolutions
          child.material = new THREE.MeshStandardMaterial({
            map: diffuseMap,
            normalMap: normalMap,
            normalScale: new THREE.Vector2(2.0, 2.0),
            color: new THREE.Color('#38d9a9'),
            emissive: new THREE.Color('#004d40'),
            emissiveIntensity: 0.45,
            roughness: 0.32,
            metalness: 0.2,
          });
        } else {
          // Photorealistic Anatomical Human Cortex: true gyri, sulci, nerves, capillaries & folds
          child.material = new THREE.MeshStandardMaterial({
            map: diffuseMap,
            normalMap: normalMap,
            normalScale: new THREE.Vector2(2.4, 2.4),
            roughnessMap: specMap,
            roughness: 0.36,
            metalness: 0.05,
            emissive: new THREE.Color('#220505'),
            emissiveIntensity: 0.12,
          });
        }
      }
    });
  }, [scene, skinMode, diffuseMap, normalMap, specMap]);

  return <primitive object={scene} scale={1.4} position={[0, -0.22, 0]} />;
}

// Preload assets for instantaneous rendering
useGLTF.preload('/human_brain.glb');
useTexture.preload([
  '/textures/brain_diffuse.png',
  '/textures/brain_normal.png',
  '/textures/brain_spec.png',
]);

// Ultra-Attractive Holographic Laser CT Scanning System
function ScanLaserBeam({ active }) {
  const groupRef = useRef();
  const outerRingRef = useRef();
  const innerRingRef = useRef();
  const lightRef = useRef();

  useFrame(({ clock }) => {
    if (!active || !groupRef.current) return;
    const t = clock.elapsedTime || clock.getElapsedTime();
    
    // Smooth, realistic axial CT laser sweep along cranial vertical axis
    const yPos = Math.sin(t * 1.5) * 0.72;
    groupRef.current.position.y = yPos;

    // Counter-rotating telemetry reticle rings
    if (outerRingRef.current) {
      outerRingRef.current.rotation.z = t * 0.7;
    }
    if (innerRingRef.current) {
      innerRingRef.current.rotation.z = -t * 1.1;
    }
    // Dynamic luminous pulse matching scan pass
    if (lightRef.current) {
      lightRef.current.intensity = 1.5 + Math.sin(t * 6) * 0.5;
    }
  });

  if (!active) return null;

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {/* Dynamic Laser Point Light illuminating the cortical folds at the exact scan plane */}
      <pointLight ref={lightRef} distance={2.2} intensity={1.8} color="#00F5A0" />

      {/* Primary High-Intensity Laser Ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.32, 1.40, 64]} />
        <meshBasicMaterial color="#00F5A0" side={THREE.DoubleSide} transparent opacity={0.95} />
      </mesh>

      {/* Luminous Neon Atmospheric Halo */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.26, 1.50, 64]} />
        <meshBasicMaterial color="#00D4FF" side={THREE.DoubleSide} transparent opacity={0.4} />
      </mesh>

      {/* Translucent Volumetric Laser Slicing Disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.32, 64]} />
        <meshBasicMaterial color="#00F5A0" side={THREE.DoubleSide} transparent opacity={0.12} />
      </mesh>

      {/* Outer Telemetry Ring with Stereotactic Ticks */}
      <group ref={outerRingRef}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.52, 1.56, 48]} />
          <meshBasicMaterial color="#00E599" side={THREE.DoubleSide} transparent opacity={0.5} />
        </mesh>
        {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((angle, idx) => (
          <mesh
            key={idx}
            position={[Math.cos(angle) * 1.54, 0, Math.sin(angle) * 1.54]}
            rotation={[-Math.PI / 2, 0, angle]}
          >
            <planeGeometry args={[0.11, 0.024]} />
            <meshBasicMaterial color="#00F5A0" side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>

      {/* Inner Rotating Medical Localizer Ticks */}
      <group ref={innerRingRef}>
        {[Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4].map((angle, idx) => (
          <mesh
            key={idx}
            position={[Math.cos(angle) * 1.18, 0, Math.sin(angle) * 1.18]}
            rotation={[-Math.PI / 2, 0, angle]}
          >
            <planeGeometry args={[0.05, 0.018]} />
            <meshBasicMaterial color="#00D4FF" side={THREE.DoubleSide} transparent opacity={0.7} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// Freely Floating 3D Scene (No Container Frame / Border)
function BrainScene({ skinMode, scanBeam }) {
  const controlsRef = useRef();

  return (
    <Canvas
      camera={{ position: [0, 0.25, 2.75], fov: 42 }}
      style={{ width: '100%', height: '100%', cursor: 'grab' }}
      dpr={[1, 1.5]}
      fallback={<div className="h-full w-full flex items-center justify-center text-xs font-mono text-subtext0">3D preview unavailable</div>}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
    >
      <ambientLight intensity={0.95} />
      <directionalLight position={[4, 5, 4]} intensity={1.7} color="#fff1eb" />
      <directionalLight position={[-4, 2, -3]} intensity={1.1} color="#00E5FF" />
      <pointLight position={[0, -2, 2]} intensity={0.8} color="#fca5a5" />

      <Suspense fallback={null}>
        <Float speed={1.2} rotationIntensity={0.12} floatIntensity={0.2}>
          <BrainMesh skinMode={skinMode} />
        </Float>
        <ScanLaserBeam active={scanBeam} />
      </Suspense>

      <OrbitControls
        ref={controlsRef}
        enableZoom={false}
        autoRotate={true}
        autoRotateSpeed={0.9}
        enablePan={false}
        minPolarAngle={Math.PI / 3.4}
        maxPolarAngle={Math.PI / 1.7}
      />
    </Canvas>
  );
}

export default function Landing() {
  const [skinMode, setSkinMode] = useState('anatomical'); // 'anatomical' | 'clinical' | 'wireframe'
  const [scanBeam, setScanBeam] = useState(true);

  return (
    <div className="relative min-h-[calc(100vh-65px)] w-full flex flex-col items-center justify-between px-4 sm:px-6 lg:px-8 py-4 overflow-y-auto bg-black select-none">
      
      {/* 1. ATMOSPHERIC NEON UNDERGLOW BEAM (Fades from bottom to top) */}
      <div className="absolute inset-x-0 bottom-0 h-[480px] pointer-events-none z-0 overflow-hidden">
        {/* Soft diffused neon vertical glow rising upward */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#00E599]/25 via-[#00E599]/8 via-35% to-transparent blur-3xl" />
        
        {/* Deep radiant cyan-emerald radial ground pool at bottom center */}
        <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-[85vw] max-w-[1300px] h-[360px] rounded-full bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-[#00E599]/35 via-[#00D4FF]/15 to-transparent blur-3xl" />
        
        {/* Subtle luminous neon horizon line along the very bottom */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[70vw] max-w-[1000px] h-[2px] bg-gradient-to-r from-transparent via-[#00FF99]/80 to-transparent blur-sm" />
      </div>

      {/* 2. REFINED, CLEAN HERO TITLE HEADER */}
      <div className="relative z-10 w-full flex flex-col items-center text-center max-w-4xl pt-1">
        {/* Academic Publication Pill */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-surface0/60 border border-teal/25 text-teal text-xs font-mono mb-2 backdrop-blur-md shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-teal" />
          <span>IEEE Publication • Kongu Engineering College</span>
        </div>

        {/* Brand Main Title */}
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-white mb-1.5 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
          Neuro<span className="text-[#00E599] drop-shadow-[0_0_20px_rgba(0,229,153,0.6)]">Scan</span>
        </h1>

        {/* Sleek, Readable Framework Subtitle */}
        <h2 className="text-sm md:text-base lg:text-lg font-bold text-teal tracking-wide font-mono mb-1">
          A Robust Brain CT Classification Framework
        </h2>

        {/* Subtitle description */}
        <p className="text-xs md:text-sm text-subtext0 max-w-2xl font-mono tracking-wide leading-relaxed">
          Integrating Deterministic Quality Gating, Global–Local Contralateral Asymmetry, and Fail-Closed Decision Engine
        </p>
      </div>

      {/* 3. FREELY FLOATING ENLARGED 3D BRAIN (Uncluttered, freely rotating) */}
      <div className="relative z-10 w-full max-w-2xl h-[300px] sm:h-[340px] md:h-[380px] my-3 flex flex-col items-center justify-center">
        {/* Soft atmospheric radial glow beneath the brain */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-teal/20 via-transparent to-transparent rounded-full blur-3xl pointer-events-none" />

        {/* 3D Scene */}
        <div className="w-full h-full">
          <BrainScene skinMode={skinMode} scanBeam={scanBeam} />
        </div>

        {/* Floating Mode Switchers */}
        <div className="absolute bottom-0 flex flex-wrap items-center justify-center gap-2 z-10 font-mono text-xs">
          <div className="flex gap-1.5 bg-black/85 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-surface1 shadow-xl">
            <button
              onClick={() => setSkinMode('anatomical')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                skinMode === 'anatomical'
                  ? 'bg-[#df9b85] text-black shadow font-bold'
                  : 'text-subtext0 hover:text-white'
              }`}
            >
              Anatomical Cortex
            </button>
            <button
              onClick={() => setSkinMode('clinical')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                skinMode === 'clinical'
                  ? 'bg-[#00E599] text-black shadow font-bold'
                  : 'text-subtext0 hover:text-white'
              }`}
            >
              Clinical Teal
            </button>
            <button
              onClick={() => setSkinMode('wireframe')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                skinMode === 'wireframe'
                  ? 'bg-[#00E599] text-black shadow font-bold'
                  : 'text-subtext0 hover:text-white'
              }`}
            >
              Neural Mesh
            </button>
          </div>

          <button
            onClick={() => setScanBeam(!scanBeam)}
            className={`px-3 py-1.5 rounded-xl border text-xs backdrop-blur-md transition-all flex items-center gap-1.5 font-semibold ${
              scanBeam
                ? 'bg-teal/20 text-[#00E599] border-teal/40'
                : 'bg-black/85 text-subtext0 border-surface1'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Laser Scan: {scanBeam ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* 4. TWO ACTION LAUNCH CONTAINERS */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-4xl my-3">
        
        {/* Container 1: Diagnostic Ingestion Cockpit */}
        <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between text-left hover:border-teal/50 transition-all border border-surface1/60 shadow-xl bg-surface0/40 backdrop-blur-md">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="w-10 h-10 rounded-xl bg-teal/15 border border-teal/30 flex items-center justify-center">
                <Activity className="w-6 h-6 text-[#00E599]" />
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-teal/15 text-teal border border-teal/30">
                PRIMARY SCANNER
              </span>
            </div>
            <h3 className="text-base font-bold text-white mb-1">Diagnostic Ingestion Cockpit</h3>
            <p className="text-xs text-subtext0 leading-relaxed mb-4">
              Instant non-contrast CT upload, dual-stage Otsu &amp; alignment quality gating, and 4-class neural classification.
            </p>
          </div>
          <Link
            to="/diagnosis"
            className="w-full py-3 px-4 rounded-xl font-bold font-mono text-xs flex items-center justify-center gap-2 transition-all bg-[#00E599] hover:bg-[#00F5A0] text-black shadow-md shadow-teal/20 hover:scale-[1.01]"
          >
            <span>Launch Scan &amp; Diagnosis</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Container 2: PACS Clinical Archive & Registry */}
        <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between text-left hover:border-blue/50 transition-all border border-surface1/60 shadow-xl bg-surface0/40 backdrop-blur-md">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="w-10 h-10 rounded-xl bg-blue/15 border border-blue/30 flex items-center justify-center">
                <Database className="w-6 h-6 text-blue" />
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-blue/15 text-blue border border-blue/30">
                MONGODB PACS
              </span>
            </div>
            <h3 className="text-base font-bold text-white mb-1">PACS Clinical Archive</h3>
            <p className="text-xs text-subtext0 leading-relaxed mb-4">
              MongoDB-synchronized patient records, quality audit logs, infarct volume calculations, and complete delete controls.
            </p>
          </div>
          <Link
            to="/archive"
            className="w-full py-3 px-4 rounded-xl font-bold font-mono text-xs flex items-center justify-center gap-2 transition-all bg-[#2563EB] hover:bg-[#1D4ED8] text-white shadow-md shadow-blue/20 hover:scale-[1.01]"
          >
            <Database className="w-4 h-4 text-white" />
            <span>Clinical Archive &amp; Registry</span>
          </Link>
        </div>

      </div>

      {/* 5. BOTTOM TELEMETRY STATUS BAR */}
      <div className="relative z-10 w-full max-w-4xl py-2 px-4 rounded-xl bg-surface0/30 border border-surface1/40 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-subtext0 backdrop-blur-md mb-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#00E599] animate-pulse" />
          <span className="text-white font-semibold">NeuroScan MED-AI v4.2</span>
          <span className="text-subtext0/50">•</span>
          <span className="text-[10px]">Clinical Gated Engine Active</span>
        </div>
        <div className="flex items-center gap-4 text-[10px]">
          <span className="text-teal">Deterministic Otsu Gating</span>
          <span className="text-subtext0/40">|</span>
          <span className="text-blue">DICOM 3.0 Ready</span>
          <span className="text-subtext0/40">|</span>
          <span className="text-green">Zero-Cloud Latency</span>
        </div>
      </div>

    </div>
  );
}
