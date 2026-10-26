import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';
import { C, lerp, deg } from './util.js';

/*
  Real sky and sunlight.
  - Atmospheric scattering sky (Preetham model) with the sun at the right height
  - The same sky is turned into image-based lighting, so every surface is lit by it
  - Soft, high-resolution sun shadows
  - A slow cloud layer, warm haze near the horizon and a lens flare when looking at the sun
*/

export const TIMES = {
  morning: {
    elevation: 34, azimuth: 128, turbidity: 3.2, rayleigh: 1.1, mie: 0.004, mieG: 0.8,
    sun: '#fff3e2', sunI: 4.4, fog: '#a2bad6', fogD: 0.00105, exposure: 0.82, envI: 0.9,
    hemiSky: '#cfe0f5', hemiGround: '#6b5d45', hemiI: 0.15, cloud: '#ffffff', cloudShade: '#aab4c2', lights: 0,
  },
  evening: {
    elevation: 3.2, azimuth: 252, turbidity: 9, rayleigh: 2.6, mie: 0.009, mieG: 0.9,
    sun: '#ff9c58', sunI: 3.2, fog: '#c99a83', fogD: 0.0016, exposure: 1.0, envI: 0.75,
    hemiSky: '#8d8bb8', hemiGround: '#3a2a20', hemiI: 0.15, cloud: '#ffc79e', cloudShade: '#6d5a72', lights: 1,
  },
};

export function createSky(renderer, scene, { quality = 'high', flare = true } = {}) {
  // the sky model is very bright; scale it so it sits naturally next to the lit scene
  // and melt the bottom of the sky into the haze so the horizon has no hard edge
  const gain = (skyObj, value) => {
    skyObj.material.uniforms.uGain = { value };
    skyObj.material.uniforms.uHaze = { value: new THREE.Color('#b9c9d8') };
    skyObj.material.fragmentShader = skyObj.material.fragmentShader
      .replace('uniform vec3 up;', 'uniform vec3 up;\nuniform float uGain;\nuniform vec3 uHaze;')
      .replace(
        'gl_FragColor = vec4( retColor, 1.0 );',
        'vec3 skyCol = retColor * uGain;\n\t\t\tskyCol = mix(uHaze, skyCol, smoothstep(-0.02, 0.09, direction.y));\n\t\t\tgl_FragColor = vec4( skyCol, 1.0 );'
      );
  };
  const sky = new Sky();
  gain(sky, 0.5);
  sky.scale.setScalar(2500);
  sky.material.depthWrite = false;
  sky.renderOrder = -10;
  scene.add(sky);
  const U = sky.material.uniforms;

  // a second sky used only to build the environment lighting
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  gain(envSky, 0.75);
  envSky.scale.setScalar(900);
  envScene.add(envSky);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(800, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#5d6a4a' }));
  ground.position.y = -2;
  envScene.add(ground);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;

  // sunlight
  const sun = new THREE.DirectionalLight('#ffffff', 3);
  const size = quality === 'high' ? 4096 : quality === 'medium' ? 2048 : 1024;
  sun.castShadow = true;
  sun.shadow.mapSize.set(size, size);
  const sc = sun.shadow.camera;
  sc.left = -150; sc.right = 150; sc.top = 130; sc.bottom = -130; sc.near = 20; sc.far = 900;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.35;
  sun.shadow.radius = 2.5;
  sun.target.position.set(10, 0, -10);
  scene.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight('#cfe0f5', '#6b5d45', 0.35);
  scene.add(hemi);

  scene.fog = new THREE.FogExp2('#cdd6dc', 0.0016);

  // cloud layer: soft drifting cumulus painted with noise, lit from the sun side
  const cloudMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uLit: { value: C('#ffffff') },
      uShade: { value: C('#aab4c2') },
      uCover: { value: 0.6 },
    },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uSunDir; uniform vec3 uLit; uniform vec3 uShade; uniform float uCover;
      varying vec3 vW;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
      float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<6;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }
      void main(){
        vec2 p = vW.xz * 0.0011 + vec2(uTime * 0.004, uTime * 0.0013);
        float n = fbm(p);
        float d = smoothstep(uCover, uCover + 0.22, n);
        float lightN = fbm(p + uSunDir.xz * 0.06);
        float lit = clamp(0.55 + (n - lightN) * 3.0, 0.0, 1.0);
        vec3 col = mix(uShade, uLit, lit);
        float r = length(vW.xz - cameraPosition.xz);
        float fade = 1.0 - smoothstep(1400.0, 2400.0, r);
        gl_FragColor = vec4(col, d * 0.92 * fade);
        #include <colorspace_fragment>
      }`,
  });
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(Math.PI / 2), cloudMat);
  clouds.position.y = 650;
  clouds.renderOrder = -5;
  scene.add(clouds);

  // lens flare (only shows when the sun is in view)
  if (flare) {
    const L = new THREE.TextureLoader();
    const t0 = L.load('/campus/tex/flare0.png');
    const t3 = L.load('/campus/tex/flare3.png');
    const lf = new Lensflare();
    lf.addElement(new LensflareElement(t0, 420, 0, C('#fff2d8')));
    lf.addElement(new LensflareElement(t3, 50, 0.6));
    lf.addElement(new LensflareElement(t3, 70, 0.7));
    lf.addElement(new LensflareElement(t3, 110, 0.9));
    lf.addElement(new LensflareElement(t3, 60, 1.0));
    sun.add(lf);
  }

  const sunDir = new THREE.Vector3();
  const tmp = new THREE.Color();
  let lastEnvK = -1;

  /** k = 0 morning … 1 evening */
  const apply = (k, { rebuildEnv = true } = {}) => {
    const A = TIMES.morning;
    const B = TIMES.evening;
    const el = lerp(A.elevation, B.elevation, k);
    const az = lerp(A.azimuth, B.azimuth, k);
    const phi = deg(90 - el);
    const theta = deg(az);
    sunDir.setFromSphericalCoords(1, phi, theta);
    for (const u of [U, envSky.material.uniforms]) {
      u.sunPosition.value.copy(sunDir);
      u.turbidity.value = lerp(A.turbidity, B.turbidity, k);
      u.rayleigh.value = lerp(A.rayleigh, B.rayleigh, k);
      u.mieCoefficient.value = lerp(A.mie, B.mie, k);
      u.mieDirectionalG.value = lerp(A.mieG, B.mieG, k);
    }
    sun.position.copy(sun.target.position).addScaledVector(sunDir, 500);
    sun.color.copy(tmp.set(A.sun).lerp(C(B.sun), k));
    sun.intensity = lerp(A.sunI, B.sunI, k);
    hemi.color.set(A.hemiSky).lerp(C(B.hemiSky), k);
    hemi.groundColor.set(A.hemiGround).lerp(C(B.hemiGround), k);
    hemi.intensity = lerp(A.hemiI, B.hemiI, k);
    scene.fog.color.set(A.fog).lerp(C(B.fog), k);
    U.uHaze.value.copy(scene.fog.color);
    envSky.material.uniforms.uHaze.value.copy(scene.fog.color);
    U.uGain.value = lerp(0.58, 0.85, k);
    scene.fog.density = lerp(A.fogD, B.fogD, k);
    renderer.toneMappingExposure = lerp(A.exposure, B.exposure, k);
    scene.environmentIntensity = lerp(A.envI, B.envI, k);
    cloudMat.uniforms.uSunDir.value.copy(sunDir);
    cloudMat.uniforms.uLit.value.set(A.cloud).lerp(C(B.cloud), k);
    cloudMat.uniforms.uShade.value.set(A.cloudShade).lerp(C(B.cloudShade), k);

    if (rebuildEnv && Math.abs(k - lastEnvK) > 0.02) {
      lastEnvK = k;
      const rt = pmrem.fromScene(envScene, 0.02, 1, 2000);
      scene.environment = rt.texture;
      envRT?.dispose();
      envRT = rt;
    }
  };

  return {
    sun,
    sunDir,
    apply,
    update(t) {
      cloudMat.uniforms.uTime.value = t;
    },
    dispose() {
      envRT?.dispose();
      pmrem.dispose();
      cloudMat.dispose();
      sky.material.dispose();
      envSky.material.dispose();
    },
  };
}
