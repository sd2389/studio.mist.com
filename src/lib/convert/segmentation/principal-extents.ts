/**
 * Extents of a point cloud along its principal axes (PCA of the covariance matrix), sorted
 * longest first. Axis-aligned boxes misjudge tilted prongs; principal axes do not.
 */

type Matrix3 = [number, number, number, number, number, number, number, number, number];

const PAIRS: ReadonlyArray<readonly [number, number]> = [[0, 1], [0, 2], [1, 2]];

function covarianceOf(points: ArrayLike<number>, count: number): Matrix3 {
  let mx = 0, my = 0, mz = 0;
  for (let i = 0; i < count; i++) {
    mx += points[i * 3];
    my += points[i * 3 + 1];
    mz += points[i * 3 + 2];
  }
  mx /= count; my /= count; mz /= count;
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (let i = 0; i < count; i++) {
    const x = points[i * 3] - mx, y = points[i * 3 + 1] - my, z = points[i * 3 + 2] - mz;
    xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z;
  }
  return [xx, xy, xz, xy, yy, yz, xz, yz, zz];
}

/** One Jacobi rotation zeroing a[p][q]; accumulates the rotation into eigenvector matrix v. */
function rotate(a: Matrix3, v: Matrix3, p: number, q: number): void {
  const apq = a[p * 3 + q];
  if (Math.abs(apq) < 1e-30) return;
  const theta = (a[q * 3 + q] - a[p * 3 + p]) / (2 * apq);
  const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
  const c = 1 / Math.sqrt(t * t + 1);
  const s = t * c;
  for (let k = 0; k < 3; k++) {
    const akp = a[k * 3 + p], akq = a[k * 3 + q];
    a[k * 3 + p] = c * akp - s * akq;
    a[k * 3 + q] = s * akp + c * akq;
  }
  for (let k = 0; k < 3; k++) {
    const apk = a[p * 3 + k], aqk = a[q * 3 + k];
    a[p * 3 + k] = c * apk - s * aqk;
    a[q * 3 + k] = s * apk + c * aqk;
  }
  for (let k = 0; k < 3; k++) {
    const vkp = v[k * 3 + p], vkq = v[k * 3 + q];
    v[k * 3 + p] = c * vkp - s * vkq;
    v[k * 3 + q] = s * vkp + c * vkq;
  }
}

/** Eigenvectors (columns of the returned matrix) of a symmetric 3×3 matrix. */
function symmetricEigenvectors(matrix: Matrix3): Matrix3 {
  const a = [...matrix] as Matrix3;
  const v: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let sweep = 0; sweep < 24; sweep++) {
    const offDiagonal = Math.abs(a[1]) + Math.abs(a[2]) + Math.abs(a[5]);
    if (offDiagonal < 1e-14 * (Math.abs(a[0]) + Math.abs(a[4]) + Math.abs(a[8]) + 1e-30)) break;
    for (const [p, q] of PAIRS) rotate(a, v, p, q);
  }
  return v;
}

/** Point-cloud extents along its three principal axes, longest first. */
export function principalExtents(points: ArrayLike<number>, count: number): [number, number, number] {
  if (count < 2) return [0, 0, 0];
  const axes = symmetricEigenvectors(covarianceOf(points, count));
  const extents: number[] = [];
  for (let axis = 0; axis < 3; axis++) {
    const ax = axes[axis], ay = axes[3 + axis], az = axes[6 + axis];
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < count; i++) {
      const d = points[i * 3] * ax + points[i * 3 + 1] * ay + points[i * 3 + 2] * az;
      if (d < min) min = d;
      if (d > max) max = d;
    }
    extents.push(max - min);
  }
  extents.sort((x, y) => y - x);
  return [extents[0], extents[1], extents[2]];
}
