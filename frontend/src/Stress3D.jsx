import { useEffect, useRef } from "react";
import * as THREE from "three";

function getParamInt(name, fallback) {
  const u = new URL(window.location.href);
  const v = parseInt(u.searchParams.get(name), 10);
  return Number.isFinite(v) ? v : fallback;
}
function getParamFloat(name, fallback) {
  const u = new URL(window.location.href);
  const v = parseFloat(u.searchParams.get(name));
  return Number.isFinite(v) ? v : fallback;
}

/**
 * /stress3d?count=30000&size=1.2&speed=1.0
 * - count: 인스턴스 개수 (기본 20000)
 * - size : 큐브 크기 스케일 (기본 1.0)
 * - speed: 회전 속도 배수 (기본 1.0)
 */
export default function Stress3D() {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const animRef = useRef(0);

  useEffect(() => {
    const mountEl = mountRef.current;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: "high-performance",
      alpha: false,
      preserveDrawingBuffer: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountEl.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene & Camera
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f1a);

    const camera = new THREE.PerspectiveCamera(60, mountEl.clientWidth / mountEl.clientHeight, 0.1, 1000);
    camera.position.set(0, 0, 120);
    scene.add(camera);

    // Light
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(1, 1, 1);
    scene.add(dirLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.2));

    // Params
    const count = getParamInt("count", 20000);
    const size = getParamFloat("size", 1.0);
    const speed = getParamFloat("speed", 1.0);

    // Instanced Mesh
    const geometry = new THREE.BoxGeometry(size, size, size);
    const material = new THREE.MeshStandardMaterial({
      metalness: 0.1,
      roughness: 0.7,
      color: 0x66aaff,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);

    // Initial placement
    const dummy = new THREE.Object3D();
    const radius = 60;
    for (let i = 0; i < count; i++) {
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = 2 * Math.PI * Math.random();
      const r = radius * (0.5 + Math.random() * 0.5);
      dummy.position.set(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi));
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const color = new THREE.Color().setHSL(i / count, 0.6, 0.55);
      mesh.setColorAt(i, color);
    }
    mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;

    // ======== 성능 측정 준비 ========
    // 간단 FPS/프레임시간 측정
    let last = performance.now();
    let frames = 0;
    let acc = 0; // 누적 ms
    let fps = 0;
    let ms = 0; // 최근 프레임 시간
    let minMs = Infinity;
    let maxMs = 0;

    // Moving average for fps
    const fpsWindow = [];
    const FPS_WIN_SIZE = 60;

    // GPU 타이머 (가능한 경우)
    const gl = renderer.getContext();
    const isWebGL2 = gl instanceof WebGL2RenderingContext;
    const ext = isWebGL2 && (gl.getExtension("EXT_disjoint_timer_query_webgl2") || gl.getExtension("EXT_disjoint_timer_query"));
    let gpuQuery = null;
    let lastGpuMs = null; // ns -> ms
    function beginGpuTimer() {
      if (!ext || !isWebGL2) return;
      gpuQuery = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, gpuQuery);
    }
    function endGpuTimer() {
      if (!ext || !isWebGL2 || !gpuQuery) return;
      gl.endQuery(ext.TIME_ELAPSED_EXT);
    }
    function pollGpuTimer() {
      if (!ext || !isWebGL2 || !gpuQuery) return;
      const available = gl.getQueryParameter(gpuQuery, gl.QUERY_RESULT_AVAILABLE);
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      if (available && !disjoint) {
        const ns = gl.getQueryParameter(gpuQuery, gl.QUERY_RESULT);
        lastGpuMs = ns / 1e6;
        gl.deleteQuery(gpuQuery);
        gpuQuery = null;
      }
    }

    // Overlay(UI)
    const hud = document.createElement("div");
    hud.style.position = "absolute";
    hud.style.top = "12px";
    hud.style.left = "12px";
    hud.style.padding = "10px 12px";
    hud.style.background = "rgba(0,0,0,0.50)";
    hud.style.color = "#fff";
    hud.style.borderRadius = "10px";
    hud.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    hud.style.fontSize = "12px";
    hud.style.lineHeight = "1.4";
    hud.style.whiteSpace = "pre";
    mountEl.appendChild(hud);

    function human(num, digits = 1) {
      if (num === null || num === undefined || Number.isNaN(num)) return "-";
      return num.toFixed(digits);
    }

    // Animation
    const clock = new THREE.Clock();

    const animate = () => {
      const now = performance.now();
      const dt = now - last; // ms
      last = now;
      ms = dt;
      minMs = Math.min(minMs, dt);
      maxMs = Math.max(maxMs, dt);

      frames++;
      acc += dt;
      if (acc >= 1000) {
        // 1초마다 fps 갱신
        fps = (frames * 1000) / acc;
        fpsWindow.push(fps);
        if (fpsWindow.length > FPS_WIN_SIZE) fpsWindow.shift();
        frames = 0;
        acc = 0;
      }

      const t = clock.getElapsedTime() * speed;

      // camera motion
      camera.position.x = Math.sin(t * 0.3) * 10;
      camera.position.y = Math.cos(t * 0.2) * 10;
      camera.lookAt(0, 0, 0);

      mesh.rotation.x += 0.0015 * speed;
      mesh.rotation.y += 0.002 * speed;

      // CPU 측 업데이트: 일부 인스턴스 perturbation
      const subset = Math.min(500, count);
      for (let i = 0; i < subset; i++) {
        mesh.getMatrixAt(i, dummy.matrix);
        dummy.position.setFromMatrixPosition(dummy.matrix);
        dummy.position.x += Math.sin(t + i) * 0.01;
        dummy.position.y += Math.cos(t * 0.9 + i * 0.5) * 0.01;
        dummy.rotation.x += 0.01;
        dummy.rotation.y += 0.008;
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;

      // GPU timer begin
      beginGpuTimer();

      renderer.render(scene, camera);

      // GPU timer end + poll
      endGpuTimer();
      pollGpuTimer();

      // HUD 갱신
      const avgFps = fpsWindow.length > 0 ? fpsWindow.reduce((a, b) => a + b, 0) / fpsWindow.length : fps;

      const info = renderer.info;
      const mem = performance && performance.memory ? performance.memory : null;

      const lines = [
        `3D Stress Test (InstancedMesh)`,
        `count=${count}, size=${size}, speed=${speed}`,
        ``,
        `FPS:  ${human(fps, 1)} (avg ${human(avgFps, 1)})`,
        `CPU:  ${human(ms, 2)} ms (min ${human(minMs, 2)} / max ${human(maxMs, 2)})`,
        `GPU:  ${lastGpuMs != null ? human(lastGpuMs, 2) + " ms" : "n/a"}`,
        ``,
        `DrawCalls: ${info.render.calls}`,
        `Triangles: ${info.render.triangles}`,
        `Points:    ${info.render.points}  Lines: ${info.render.lines}`,
        ``,
        `PixelRatio: ${window.devicePixelRatio}`,
        mem
          ? `Memory: usedJS ${human(mem.usedJSHeapSize / 1048576, 1)}MB / totalJS ${human(mem.totalJSHeapSize / 1048576, 1)}MB (limit ~${human(
              mem.jsHeapSizeLimit / 1048576,
              0
            )}MB)`
          : `Memory: (performance.memory 미지원)`,
        ``,
        `Tips: /stress3d?count=40000&speed=1.5`,
      ];
      hud.textContent = lines.join("\n");

      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);

    // Resize
    const onResize = () => {
      const { clientWidth, clientHeight } = mountEl;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight);
    };
    window.addEventListener("resize", onResize);

    // Cleanup
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", onResize);
      mesh.geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (hud && hud.parentElement) hud.parentElement.removeChild(hud);
      if (renderer.domElement && renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }} ref={mountRef}>
      {/* HUD는 스크립트에서 생성 */}
    </div>
  );
}
