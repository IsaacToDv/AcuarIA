// Weights for the prototype's three geometric representations.
const smoothstep = (x, min, max) => {
  const t = Math.max(0, Math.min(1, (x - min) / (max - min)));
  return t * t * (3 - 2 * t);
};
export function lodWeights(distance) {
  const near = smoothstep(distance, 2.3, 3.5);
  const far = smoothstep(distance, 6.3, 7.8);
  return [1 - near, near * (1 - far), far];
}
