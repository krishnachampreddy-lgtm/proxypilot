import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { N8AOPass } from 'n8ao';

/*
  Camera-like finishing:
  ambient occlusion (soft contact shadows under every ledge, sill and tree),
  gentle bloom on bright highlights, filmic tone mapping, a light lens vignette,
  fine film grain and anti-aliasing.
*/

const FilmShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.035 },
    uWarm: { value: 0.0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVignette; uniform float uGrain; uniform float uWarm;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // slight S-curve and a touch of warmth, like a real camera profile
      c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), 0.18);
      c.rgb *= vec3(1.0 + uWarm * 0.06, 1.0 + uWarm * 0.01, 1.0 - uWarm * 0.07);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - uVignette * dot(d, d) * 1.6;
      c.rgb += (hash(vUv * 1000.0 + uTime) - 0.5) * uGrain;
      gl_FragColor = c;
    }`,
};

export function createPost(renderer, scene, camera, { quality = 'high' } = {}) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target);

  let ao = null;
  if (quality !== 'low') {
    ao = new N8AOPass(scene, camera, size.x, size.y);
    ao.configuration.aoRadius = 2.2;
    ao.configuration.distanceFalloff = 1.0;
    ao.configuration.intensity = 2.6;
    ao.configuration.color = new THREE.Color(0, 0, 0);
    ao.configuration.gammaCorrection = false;
    ao.configuration.halfRes = quality !== 'high' && quality !== 'still';
    ao.setQualityMode(quality === 'still' ? 'Ultra' : quality === 'high' ? 'Medium' : 'Low');
    composer.addPass(ao);
  } else {
    composer.addPass(new RenderPass(scene, camera));
  }

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.22, 0.55, 0.93);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const film = new ShaderPass(FilmShader);
  composer.addPass(film);
  const smaa = new SMAAPass(size.x, size.y);
  composer.addPass(smaa);

  return {
    composer,
    film,
    bloom,
    setSize(w, h) {
      composer.setSize(w, h);
      const s = renderer.getDrawingBufferSize(new THREE.Vector2());
      ao?.setSize(s.x, s.y);
    },
    render(t, warm) {
      film.uniforms.uTime.value = t % 100;
      film.uniforms.uWarm.value = warm;
      composer.render();
    },
    dispose() {
      composer.dispose();
      target.dispose();
    },
  };
}
