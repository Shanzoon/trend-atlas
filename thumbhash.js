// Decoder adapted from evanw/thumbhash (MIT), kept local so the static site has no runtime dependency.
export function thumbHashToRGBA(hash) {
  const { PI, min, max, cos, round } = Math;
  const header24 = hash[0] | (hash[1] << 8) | (hash[2] << 16);
  const header16 = hash[3] | (hash[4] << 8);
  const lDc = (header24 & 63) / 63;
  const pDc = ((header24 >> 6) & 63) / 31.5 - 1;
  const qDc = ((header24 >> 12) & 63) / 31.5 - 1;
  const lScale = ((header24 >> 18) & 31) / 31;
  const hasAlpha = header24 >> 23;
  const pScale = ((header16 >> 3) & 63) / 63;
  const qScale = ((header16 >> 9) & 63) / 63;
  const isLandscape = header16 >> 15;
  const lx = max(3, isLandscape ? (hasAlpha ? 5 : 7) : header16 & 7);
  const ly = max(3, isLandscape ? header16 & 7 : (hasAlpha ? 5 : 7));
  const aDc = hasAlpha ? (hash[5] & 15) / 15 : 1;
  const aScale = (hash[5] >> 4) / 15;
  const acStart = hasAlpha ? 6 : 5;
  let acIndex = 0;

  const decodeChannel = (nx, ny, scale) => {
    const ac = [];
    for (let cy = 0; cy < ny; cy += 1) {
      for (let cx = cy ? 0 : 1; cx * ny < nx * (ny - cy); cx += 1) {
        const value = (hash[acStart + (acIndex >> 1)] >> ((acIndex++ & 1) << 2)) & 15;
        ac.push((value / 7.5 - 1) * scale);
      }
    }
    return ac;
  };

  const lAc = decodeChannel(lx, ly, lScale);
  const pAc = decodeChannel(3, 3, pScale * 1.25);
  const qAc = decodeChannel(3, 3, qScale * 1.25);
  const aAc = hasAlpha ? decodeChannel(5, 5, aScale) : null;
  const ratio = thumbHashToApproximateAspectRatio(hash);
  const width = round(ratio > 1 ? 32 : 32 * ratio);
  const height = round(ratio > 1 ? 32 / ratio : 32);
  const rgba = new Uint8ClampedArray(width * height * 4);
  const fx = [];
  const fy = [];

  for (let y = 0, index = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1, index += 4) {
      let l = lDc;
      let p = pDc;
      let q = qDc;
      let a = aDc;

      for (let cx = 0, count = max(lx, hasAlpha ? 5 : 3); cx < count; cx += 1) {
        fx[cx] = cos((PI / width) * (x + 0.5) * cx);
      }
      for (let cy = 0, count = max(ly, hasAlpha ? 5 : 3); cy < count; cy += 1) {
        fy[cy] = cos((PI / height) * (y + 0.5) * cy);
      }

      for (let cy = 0, coefficient = 0; cy < ly; cy += 1) {
        for (let cx = cy ? 0 : 1, fy2 = fy[cy] * 2; cx * ly < lx * (ly - cy); cx += 1, coefficient += 1) {
          l += lAc[coefficient] * fx[cx] * fy2;
        }
      }
      for (let cy = 0, coefficient = 0; cy < 3; cy += 1) {
        for (let cx = cy ? 0 : 1, fy2 = fy[cy] * 2; cx < 3 - cy; cx += 1, coefficient += 1) {
          const factor = fx[cx] * fy2;
          p += pAc[coefficient] * factor;
          q += qAc[coefficient] * factor;
        }
      }
      if (hasAlpha) {
        for (let cy = 0, coefficient = 0; cy < 5; cy += 1) {
          for (let cx = cy ? 0 : 1, fy2 = fy[cy] * 2; cx < 5 - cy; cx += 1, coefficient += 1) {
            a += aAc[coefficient] * fx[cx] * fy2;
          }
        }
      }

      const b = l - (2 / 3) * p;
      const r = (3 * l - b + q) / 2;
      const g = r - q;
      rgba[index] = max(0, 255 * min(1, r));
      rgba[index + 1] = max(0, 255 * min(1, g));
      rgba[index + 2] = max(0, 255 * min(1, b));
      rgba[index + 3] = max(0, 255 * min(1, a));
    }
  }
  return { width, height, rgba };
}

export function thumbHashToApproximateAspectRatio(hash) {
  const header = hash[3];
  const hasAlpha = hash[2] & 0x80;
  const isLandscape = hash[4] & 0x80;
  const lx = isLandscape ? (hasAlpha ? 5 : 7) : header & 7;
  const ly = isLandscape ? header & 7 : (hasAlpha ? 5 : 7);
  return lx / ly;
}

export function renderThumbHash(canvas, encodedHash) {
  canvas.width = 1;
  canvas.height = 1;
  canvas.dataset.hasThumbhash = "false";
  if (typeof encodedHash !== "string" || !encodedHash) return false;

  try {
    const binary = atob(encodedHash);
    if (binary.length < 5) return false;
    const hash = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const { width, height, rgba } = thumbHashToRGBA(hash);
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return false;
    context.putImageData(new ImageData(rgba, width, height), 0, 0);
    canvas.dataset.hasThumbhash = "true";
    return true;
  } catch {
    return false;
  }
}
