import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const container = document.querySelector("#scene");
const loaderElement = document.querySelector("#loader");
const loaderBar = document.querySelector("#loader-bar");
const loaderValue = document.querySelector("#loader-value");
const message = document.querySelector("#message");

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x061015, 0.068);

const camera = new THREE.PerspectiveCamera(37, innerWidth / innerHeight, 0.1, 120);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.append(renderer.domElement);

const root = new THREE.Group();
const modelGroup = new THREE.Group();
root.add(modelGroup);
scene.add(root);

scene.add(new THREE.HemisphereLight(0x79d8e2, 0x071014, 1.15));
const key = new THREE.SpotLight(0xc3ffff, 620, 40, Math.PI / 5, 0.65, 1.45);
key.position.set(6, 9, 8); key.target.position.set(0, 0.8, 0); scene.add(key, key.target);
const cyanRim = new THREE.DirectionalLight(0x3af3e4, 5.5); cyanRim.position.set(-7, 4, -4); scene.add(cyanRim);
const deepFill = new THREE.DirectionalLight(0x2d7aac, 2.1); deepFill.position.set(-4, -1, 5); scene.add(deepFill);

const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 96), new THREE.MeshBasicMaterial({ color: 0x0a2429, transparent: true, opacity: 0.2 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -3.1; scene.add(floor);

const models = new Map();
const solidMaterials = [];
const lineMaterials = [];
let activeModel = null;
let modelRadius = 4;
let revealStartedAt = 0;
let desiredAngle = -0.38;
let autoRotate = true;
let linesVisible = true;
let dragging = false;
let lastPointer = { x: 0, y: 0 };
let cameraDistance = 13;
let isSwitching = false;

const clock = new THREE.Clock();
const gltfLoader = new GLTFLoader();
const paths = {
  head: "./models/models/cabeca/scene.gltf",
  body: "./models/models/corpo todo/scene.gltf"
};

function smoothstep(value) { const t = THREE.MathUtils.clamp(value, 0, 1); return t * t * (3 - 2 * t); }
function setProgress(value) { const percent = Math.round(value * 100); loaderBar.style.width = `${percent}%`; loaderValue.textContent = `${percent}%`; }

function createPresentation(gltf) {
  const presentation = new THREE.Group();
  const sculpture = gltf.scene;
  const box = new THREE.Box3().setFromObject(sculpture);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  sculpture.position.sub(center);
  const materials = [];
  const outlines = [];

  sculpture.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: 0x5b9697, metalness: 0.18, roughness: 0.43,
      transparent: true, opacity: 0, side: THREE.DoubleSide
    });
    child.material = material;
    materials.push(material); solidMaterials.push(material);

    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(child.geometry, 32),
      new THREE.LineBasicMaterial({ color: 0x80f4ec, transparent: true, opacity: 0, toneMapped: false })
    );
    outline.renderOrder = 2;
    child.add(outline);
    outlines.push(outline); lineMaterials.push(outline.material);
  });
  presentation.add(sculpture);
  presentation.userData = { radius: Math.max(size.x, size.y, size.z) / 2, materials, outlines };
  return presentation;
}

function loadModel(keyName) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(paths[keyName], (gltf) => resolve(createPresentation(gltf)), (xhr) => {
      if (xhr.total) setProgress(xhr.loaded / xhr.total);
    }, reject);
  });
}

function fitCamera(radius) {
  modelRadius = radius;
  const fov = THREE.MathUtils.degToRad(camera.fov);
  cameraDistance = Math.max((radius / Math.tan(fov / 2)) * 1.18, radius * 2.35);
  camera.position.set(0, radius * 0.04, cameraDistance);
  camera.lookAt(0, 0, 0);
  floor.position.y = -radius * 1.05;
  floor.scale.setScalar(radius / 3.4);
}

function activateModel(keyName, replay = true) {
  if (!models.has(keyName) || isSwitching) return;
  isSwitching = true;
  const next = models.get(keyName);
  if (activeModel) modelGroup.remove(activeModel);
  activeModel = next;
  modelGroup.add(activeModel);
  fitCamera(next.userData.radius);
  if (replay) revealStartedAt = clock.getElapsedTime();
  updateChoices(keyName);
  window.setTimeout(() => { isSwitching = false; }, 200);
}

function updateChoices(current) {
  document.querySelectorAll(".choice").forEach((button) => {
    const chosen = button.dataset.model === current;
    button.classList.toggle("is-active", chosen);
    button.setAttribute("aria-pressed", String(chosen));
  });
  document.querySelector(".footer__index").innerHTML = current === "head" ? "01 <span>/</span> 02" : "02 <span>/</span> 02";
}

function replay() { if (activeModel) { revealStartedAt = clock.getElapsedTime(); activeModel.rotation.y = -0.15; desiredAngle = -0.15; } }

function reveal(time) {
  if (!activeModel) return;
  const elapsed = time - revealStartedAt;
  const linesIn = smoothstep(elapsed / 1.25);
  const solidIn = smoothstep((elapsed - 0.72) / 2.8);
  const linesOut = 1 - smoothstep((elapsed - 2.35) / 2.4);
  const lineOpacity = linesVisible ? linesIn * linesOut * 0.30 : 0;
  activeModel.userData.materials.forEach((material) => { material.opacity = solidIn; material.transparent = solidIn < 0.995; material.depthWrite = solidIn > 0.96; });
  activeModel.userData.outlines.forEach((outline) => { outline.visible = lineOpacity > 0.004; outline.material.opacity = lineOpacity; });
}

function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();
  if (activeModel) {
    reveal(elapsed);
    if (autoRotate && !dragging) desiredAngle += 0.0021;
    activeModel.rotation.y += (desiredAngle - activeModel.rotation.y) * 0.045;
    modelGroup.position.y = Math.sin(elapsed * 0.7) * modelRadius * 0.008;
  }
  renderer.render(scene, camera);
}

function showError() {
  loaderElement.classList.add("is-complete");
  message.hidden = false;
  message.textContent = "Não foi possível carregar a escultura. Abra o projeto por um servidor local para permitir o carregamento dos modelos.";
}

Promise.all([loadModel("head"), loadModel("body")]).then(([head, body]) => {
  models.set("head", head); models.set("body", body);
  setProgress(1); activateModel("head", true);
  window.setTimeout(() => loaderElement.classList.add("is-complete"), 360);
}).catch((error) => { console.error(error); showError(); });

document.querySelector("#replay").addEventListener("click", replay);
document.querySelectorAll(".choice").forEach((button) => button.addEventListener("click", () => activateModel(button.dataset.model)));
document.querySelector("#wire-toggle").addEventListener("click", (event) => {
  linesVisible = !linesVisible; event.currentTarget.classList.toggle("is-active", linesVisible); event.currentTarget.setAttribute("aria-pressed", String(linesVisible));
});
document.querySelector("#rotate-toggle").addEventListener("click", (event) => {
  autoRotate = !autoRotate; event.currentTarget.classList.toggle("is-active", autoRotate); event.currentTarget.setAttribute("aria-pressed", String(autoRotate));
});

renderer.domElement.addEventListener("pointerdown", (event) => { dragging = true; autoRotate = false; lastPointer = { x: event.clientX, y: event.clientY }; renderer.domElement.setPointerCapture(event.pointerId); });
renderer.domElement.addEventListener("pointermove", (event) => { if (!dragging) return; desiredAngle += (event.clientX - lastPointer.x) * 0.012; lastPointer = { x: event.clientX, y: event.clientY }; });
renderer.domElement.addEventListener("pointerup", () => { dragging = false; });
renderer.domElement.addEventListener("wheel", (event) => { event.preventDefault(); const amount = Math.sign(event.deltaY) * modelRadius * 0.16; cameraDistance = THREE.MathUtils.clamp(cameraDistance + amount, modelRadius * 1.4, modelRadius * 4.5); }, { passive: false });
window.addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); if (activeModel) fitCamera(activeModel.userData.radius); });
animate();

