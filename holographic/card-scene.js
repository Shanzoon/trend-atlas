import * as THREE from "./vendor.js";
import {
  CARD_BACK_FRAGMENT_SHADER,
  CARD_EDGE_FRAGMENT_SHADER,
  CARD_EFFECTS_FRAGMENT_SHADER,
  CARD_FRONT_FRAGMENT_SHADER,
  CARD_SUBJECT_FRAGMENT_SHADER,
  CARD_TEXT_FRAGMENT_SHADER,
  CARD_VERTEX_SHADER,
} from "./shaders.js";

const PARAMETER_UNIFORMS = {
  foil: "uFoil",
  scale: "uScale",
  depth: "uDepth",
  "fx-depth": "uFxDepth",
  "bg-depth": "uBgDepth",
};
const FINISH_VALUES = { pearl: 0, silver: 1, original: 2, gold: 3 };
const RELIEF_STEP = 0.22;
const INITIAL_X = -0.035;
const INITIAL_Y = -0.15;

function abortError(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  return new DOMException("The operation was aborted", "AbortError");
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError(signal);
}

function assetUrl(value, baseUrl, name) {
  if (!value) throw new Error(`Card asset is missing: ${name}`);
  return new URL(value, baseUrl).href;
}

async function fetchChecked(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Card asset failed (${response.status}): ${url}`);
  return response;
}

function configureTexture(texture, anisotropy) {
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

async function loadBitmapTexture(url, signal, anisotropy) {
  const response = await fetchChecked(url, signal);
  const blob = await response.blob();
  throwIfAborted(signal);
  let bitmap = null;
  try {
    bitmap = await createImageBitmap(blob, {
      imageOrientation: "flipY",
      premultiplyAlpha: "none",
    });
    if (signal?.aborted) throw abortError(signal);
    const texture = configureTexture(new THREE.Texture(bitmap), anisotropy);
    // ImageBitmap uploads ignore Texture.flipY, so decode it in TextureLoader's
    // default orientation and prevent a second flip on other upload paths.
    texture.flipY = false;
    texture.userData.ownedImageBitmap = bitmap;
    return texture;
  } catch (error) {
    bitmap?.close();
    throw error;
  }
}

function dataTexture(pixel, anisotropy) {
  return configureTexture(
    new THREE.DataTexture(new Uint8Array(pixel), 1, 1),
    anisotropy,
  );
}

function canvasTexture(canvas, anisotropy) {
  return configureTexture(new THREE.CanvasTexture(canvas), anisotropy);
}

function createBackTexture(config, anisotropy) {
  const canvas = document.createElement("canvas");
  canvas.width = config.textureResolution || 1024;
  canvas.height = canvas.width * 1.5;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create card-back canvas");
  context.scale(canvas.width / 1024, canvas.width / 1024);

  context.strokeStyle = "#777269";
  context.lineWidth = 1.5;
  context.strokeRect(56, 56, 912, 1424);
  context.strokeRect(72, 72, 880, 1392);
  context.textAlign = "center";
  context.fillStyle = "#f3eee5";
  context.font = '500 420px Futura, "Avenir Next", Arial, sans-serif';
  context.fillText((config.title || "A").slice(0, 1), 512, 846);
  context.font = '24px Futura, "Avenir Next", Arial, sans-serif';
  context.fillStyle = "#aaa399";
  context.fillText(config.collection || "WHITE ATELIER", 512, 245);
  context.font = '34px "Avenir Next", Futura, Arial, sans-serif';
  context.fillText(config.subtitle || config.title, 512, 1020);
  context.font = '18px Futura, "Avenir Next", Arial, sans-serif';
  context.fillText(config.edition || "ART STUDY", 512, 1337);
  context.beginPath();
  context.moveTo(460, 1113);
  context.lineTo(564, 1113);
  context.stroke();
  return canvasTexture(canvas, anisotropy);
}

function createShadow(anisotropy) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create card-shadow canvas");
  const gradient = context.createRadialGradient(128, 128, 6, 128, 128, 128);
  gradient.addColorStop(0, "rgba(29,35,25,0.13)");
  gradient.addColorStop(0.4, "rgba(29,35,25,0.055)");
  gradient.addColorStop(1, "rgba(29,35,25,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = canvasTexture(canvas, anisotropy);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(8.8, 11.8),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );
  shadow.position.set(0.28, -0.48, -0.5);
  return { shadow, texture };
}

function imageDimensions(texture) {
  return {
    width: texture.image?.width || 1,
    height: texture.image?.height || 1,
  };
}

function disposeMaterial(material, disposedMaterials) {
  if (!material) return;
  const list = Array.isArray(material) ? material : [material];
  for (const item of list) {
    if (!item || disposedMaterials.has(item)) continue;
    disposedMaterials.add(item);
    item.dispose();
  }
}

function disposeTexture(texture, disposedTextures) {
  if (!texture || disposedTextures.has(texture)) return;
  disposedTextures.add(texture);
  texture.dispose();
  texture.userData?.ownedImageBitmap?.close?.();
}

export async function createCardScene({ config, baseUrl, renderer, signal }) {
  if (!config?.assets) throw new TypeError("Card config.assets is required");
  const resolvedBaseUrl = new URL(baseUrl).href;
  throwIfAborted(signal);

  const maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
  const anisotropy = Math.min(4, maxAnisotropy);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 100);
  camera.position.set(0, 0, 20);
  const inverse = new THREE.Matrix4();
  const ownedTextures = new Set();
  const ownedMaterials = new Set();
  const ownedGeometries = new Set();
  const reliefLayers = { subject: [], effects: [], text: [] };
  let root = null;
  let shadow = null;
  let uniforms = null;
  let disposed = false;
  let auto = true;
  let flipped = false;
  let finish = config.appearance?.finish || "pearl";
  let zoom = 1;
  let targetX = INITIAL_X;
  let targetY = INITIAL_Y;
  let viewportWidth = 0;
  let viewportHeight = 0;

  const defaults = {
    foil: config.parameters?.foil ?? 0.52,
    scale: config.parameters?.subjectScale ?? 1,
    depth: config.parameters?.subjectDepth ?? 0.32,
    "fx-depth": config.parameters?.effectsDepth ?? 0.14,
    "bg-depth": config.parameters?.backgroundDepth ?? -0.18,
  };
  const parameterValues = { ...defaults };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    scene.traverse((object) => {
      if (object.geometry && !ownedGeometries.has(object.geometry)) {
        ownedGeometries.add(object.geometry);
      }
      if (object.material) {
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => ownedMaterials.add(material));
      }
    });
    for (const geometry of ownedGeometries) geometry.dispose();
    const disposedMaterials = new Set();
    for (const material of ownedMaterials) disposeMaterial(material, disposedMaterials);
    const disposedTextures = new Set();
    for (const texture of ownedTextures) disposeTexture(texture, disposedTextures);
    scene.clear();
  };

  try {
    const hasLine = Boolean(config.assets.lineart);
    const hasFx = Boolean(config.assets.effects);
    const textureRequests = [
      ["subject", config.assets.subject],
      ["background", config.assets.background],
      ["text", config.assets.text],
      ...(hasLine ? [["lineart", config.assets.lineart]] : []),
      ...(hasFx ? [["effects", config.assets.effects]] : []),
    ];
    const textureResults = await Promise.allSettled(
      textureRequests.map(async ([name, value]) => [
        name,
        await loadBitmapTexture(
          assetUrl(value, resolvedBaseUrl, name),
          signal,
          anisotropy,
        ),
      ]),
    );
    const loadedTextures = {};
    let textureError = null;
    for (const result of textureResults) {
      if (result.status === "fulfilled") {
        loadedTextures[result.value[0]] = result.value[1];
        ownedTextures.add(result.value[1]);
      } else if (!textureError) {
        textureError = result.reason;
      }
    }
    if (textureError) throw textureError;
    throwIfAborted(signal);

    const line = loadedTextures.lineart || dataTexture([255, 255, 255, 255], anisotropy);
    const effects = loadedTextures.effects || dataTexture([0, 0, 0, 0], anisotropy);
    ownedTextures.add(line);
    ownedTextures.add(effects);
    const back = createBackTexture(config, anisotropy);
    ownedTextures.add(back);
    const subjectSize = imageDimensions(loadedTextures.subject);
    const imageAspect = subjectSize.width / subjectSize.height;
    const fit =
      config.artworkFit ||
      (config.sourceMode === "reference"
        ? [
            Math.min(0.87, (0.87 * imageAspect) / (2 / 3)),
            Math.min(0.87, (0.87 * (2 / 3)) / imageAspect),
          ]
        : [1, 1]);

    uniforms = {
      tSubject: { value: loadedTextures.subject },
      tBackground: { value: loadedTextures.background },
      tText: { value: loadedTextures.text },
      tLine: { value: line },
      tEffects: { value: effects },
      tBack: { value: back },
      uTime: { value: 0 },
      uView: { value: new THREE.Vector3(0, 0, 1) },
      uFit: { value: new THREE.Vector2(...fit) },
      uFoil: { value: defaults.foil },
      uScale: { value: defaults.scale },
      uDepth: { value: defaults.depth },
      uBgDepth: { value: defaults["bg-depth"] },
      uSafeScale: { value: config.safeArea?.scale ?? 1 },
      uSafeOffset: {
        value: new THREE.Vector2(
          config.safeArea?.offset?.[0] ?? 0,
          1 -
            (config.safeArea?.scale ?? 1) -
            (config.safeArea?.offset?.[1] ?? 0),
        ),
      },
      uFxDepth: { value: defaults["fx-depth"] },
      uHasFx: { value: hasFx ? 1 : 0 },
      uFinish: { value: FINISH_VALUES[finish] ?? FINISH_VALUES.gold },
      uHasLine: { value: hasLine ? 1 : 0 },
      uRelief: { value: config.sourceMode === "relief" ? 1 : 0 },
    };

    const shaderMaterial = (fragmentShader) =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: CARD_VERTEX_SHADER,
        fragmentShader,
        side: THREE.FrontSide,
      });
    const materials = {
      web_front: shaderMaterial(CARD_FRONT_FRAGMENT_SHADER),
      web_back: shaderMaterial(CARD_BACK_FRAGMENT_SHADER),
      web_edge: shaderMaterial(CARD_EDGE_FRAGMENT_SHADER),
      web_gold: new THREE.MeshBasicMaterial({ color: "#c9a24a" }),
    };
    for (const [role, fragmentShader] of [
      ["web_subject", CARD_SUBJECT_FRAGMENT_SHADER],
      ["web_effects", CARD_EFFECTS_FRAGMENT_SHADER],
      ["web_text", CARD_TEXT_FRAGMENT_SHADER],
    ]) {
      materials[role] = shaderMaterial(fragmentShader);
      materials[role].transparent = true;
      materials[role].depthWrite = role !== "web_effects";
    }
    Object.values(materials).forEach((material) => ownedMaterials.add(material));

    const modelUrl = assetUrl(config.assets.model, resolvedBaseUrl, "model");
    const modelResponse = await fetchChecked(modelUrl, signal);
    const modelData = await modelResponse.arrayBuffer();
    throwIfAborted(signal);
    const Loader = THREE.GLTFLoader;
    if (typeof Loader !== "function") {
      throw new Error("vendor.js must export GLTFLoader");
    }
    const gltf = await new Loader().parseAsync(
      modelData,
      new URL(".", modelUrl).href,
    );

    root = new THREE.Group();
    root.add(gltf.scene);
    scene.add(root);
    const importedMaterials = new Set();
    let faces = 0;
    gltf.scene.traverse((object) => {
      if (!object.isMesh) return;
      ownedGeometries.add(object.geometry);
      const originalMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      originalMaterials.forEach((material) => {
        importedMaterials.add(material);
        if (!material) return;
        for (const value of Object.values(material)) {
          if (value?.isTexture) ownedTextures.add(value);
        }
      });
      const role = originalMaterials[0]?.name;
      if (role === "web_front") faces += 1;
      object.material = materials[role] || materials.web_edge;
      if (role === "web_text" && config.sourceMode !== "relief") {
        object.visible = false;
      }
      if (role === "web_subject") reliefLayers.subject.push(object);
      if (role === "web_effects") reliefLayers.effects.push(object);
      if (role === "web_text") reliefLayers.text.push(object);
    });
    importedMaterials.forEach((material) => material?.dispose());
    throwIfAborted(signal);
    if (!faces) throw new Error("卡片模型缺少正面材质");

    root.updateMatrixWorld(true);
    for (const meshes of Object.values(reliefLayers)) {
      for (const mesh of meshes) {
        root.attach(mesh);
        mesh.userData.basePosition = mesh.position.clone();
        mesh.userData.baseScale = mesh.scale.clone();
      }
    }
    if (config.sourceMode === "relief" && !reliefLayers.subject.length) {
      throw new Error("缺少独立人物层，请重新生成模型");
    }

    const shadowParts = createShadow(anisotropy);
    shadow = shadowParts.shadow;
    ownedTextures.add(shadowParts.texture);
    ownedGeometries.add(shadow.geometry);
    ownedMaterials.add(shadow.material);
    scene.add(shadow);
    root.rotation.set(targetX, targetY, 0);

    const layoutRelief = () => {
      if (config.sourceMode !== "relief") return;
      const z = parameterValues.depth;
      const inverseScale = 1 / parameterValues.scale;
      const place = (meshes, offset) => {
        for (const mesh of meshes) {
          mesh.position.z = z + offset;
          mesh.scale.copy(mesh.userData.baseScale).multiplyScalar(inverseScale);
        }
      };
      place(reliefLayers.subject, 0);
      place(reliefLayers.effects, RELIEF_STEP);
      place(reliefLayers.text, RELIEF_STEP * 2);
    };
    layoutRelief();

    const resize = (width, height) => {
      if (!(width > 0) || !(height > 0)) return;
      viewportWidth = width;
      viewportHeight = height;
      const aspect = width / height;
      const halfHeight =
        Math.max(config.sourceMode === "relief" ? 6.25 : 5.45, 4.5 / aspect) /
        zoom;
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
    };

    const setAuto = (value) => {
      auto = Boolean(value);
    };

    const flip = (value = !flipped) => {
      flipped = Boolean(value);
      setAuto(false);
      targetY = flipped ? Math.PI : 0;
      targetX = 0;
    };

    const setFinish = (value) => {
      finish = value;
      uniforms.uFinish.value = FINISH_VALUES[value] ?? FINISH_VALUES.gold;
    };

    const setParameter = (key, value) => {
      const uniformName = PARAMETER_UNIFORMS[key];
      const numericValue = Number(value);
      if (!uniformName) throw new RangeError(`Unknown card parameter: ${key}`);
      if (!Number.isFinite(numericValue)) {
        throw new TypeError(`Card parameter must be finite: ${key}`);
      }
      parameterValues[key] = numericValue;
      uniforms[uniformName].value = numericValue;
      layoutRelief();
    };

    const setZoom = (value) => {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) throw new TypeError("Card zoom must be finite");
      zoom = THREE.MathUtils.clamp(numericValue, 0.82, 1.05);
      if (viewportWidth && viewportHeight) resize(viewportWidth, viewportHeight);
    };

    const rotate = (dx, dy) => {
      setAuto(false);
      const base = flipped ? Math.PI : 0;
      targetY = THREE.MathUtils.clamp(
        targetY + Number(dx || 0) * 0.006,
        base - 0.65,
        base + 0.65,
      );
      targetX = THREE.MathUtils.clamp(
        targetX + Number(dy || 0) * 0.004,
        -0.36,
        0.36,
      );
    };

    const reset = () => {
      targetX = INITIAL_X;
      targetY = INITIAL_Y;
      zoom = 1;
      flipped = false;
      setAuto(false);
      for (const [key, value] of Object.entries(defaults)) setParameter(key, value);
      setFinish(config.appearance?.finish || "pearl");
      if (viewportWidth && viewportHeight) resize(viewportWidth, viewportHeight);
    };

    const update = (dt, elapsed, reducedMotion = false) => {
      if (disposed) return false;
      const frameDelta = Math.max(0, Number(dt) || 0);
      const timeline = Math.max(0, Number(elapsed) || 0);
      if (auto) {
        targetY = Math.sin(timeline * 0.42) * 0.23 - 0.055;
        targetX = Math.sin(timeline * 0.53) * 0.055 - 0.018;
      }
      const ease = reducedMotion ? 1 : 1 - Math.exp(-frameDelta * 8);
      root.rotation.x += (targetX - root.rotation.x) * ease;
      root.rotation.y += (targetY - root.rotation.y) * ease;
      root.updateMatrixWorld(true);
      uniforms.uView.value
        .copy(camera.position)
        .applyMatrix4(inverse.copy(root.matrixWorld).invert())
        .normalize();
      uniforms.uTime.value = reducedMotion && !auto ? 0 : timeline;
      shadow.scale.x = 1 - Math.abs(Math.sin(root.rotation.y)) * 0.14;
      return (
        auto ||
        Math.abs(targetX - root.rotation.x) > 0.0005 ||
        Math.abs(targetY - root.rotation.y) > 0.0005
      );
    };

    const state = Object.freeze({
      get auto() {
        return auto;
      },
      get flipped() {
        return flipped;
      },
      get finish() {
        return finish;
      },
      get zoom() {
        return zoom;
      },
      get targetX() {
        return targetX;
      },
      get targetY() {
        return targetY;
      },
    });

    return {
      scene,
      camera,
      root,
      uniforms,
      state,
      resize,
      update,
      rotate,
      flip,
      setAuto,
      setFinish,
      setParameter,
      setZoom,
      reset,
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
