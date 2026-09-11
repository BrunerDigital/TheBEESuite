/** Run in a real browser. Completes axe color-parser gaps without changing page styles. */
export function readRenderedTextContrast(selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return { supported: false as const, reason: "Missing element" };
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { supported: false as const, reason: "Canvas unavailable" };
  const ancestors: HTMLElement[] = [];
  for (let node: HTMLElement | null = element; node; node = node.parentElement) ancestors.unshift(node);
  let background = [255, 255, 255];
  for (const ancestor of ancestors) {
    const style = getComputedStyle(ancestor);
    if (style.backgroundImage !== "none" || Number(style.opacity) !== 1 || style.mixBlendMode !== "normal" || style.filter !== "none") {
      return { supported: false as const, reason: "Image, opacity, filter or blending requires manual review" };
    }
    for (const pseudo of ["::before", "::after"]) {
      const pseudoStyle = getComputedStyle(ancestor, pseudo);
      if (!["none", "normal"].includes(pseudoStyle.content) && pseudoStyle.display !== "none") {
        return { supported: false as const, reason: "Painted pseudo-element requires manual review" };
      }
    }
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = style.backgroundColor;
    context.fillRect(0, 0, 1, 1);
    const color = Array.from(context.getImageData(0, 0, 1, 1).data);
    const alpha = color[3] / 255;
    background = background.map((channel, index) => color[index] * alpha + channel * (1 - alpha));
  }
  const style = getComputedStyle(element);
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = style.color;
  context.fillRect(0, 0, 1, 1);
  const text = Array.from(context.getImageData(0, 0, 1, 1).data);
  const foreground = background.map((channel, index) => text[index] * text[3] / 255 + channel * (1 - text[3] / 255));
  const levels = [foreground, background].map((color) => color.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0)).sort((a, b) => b - a);
  const ratio = (levels[0] + 0.05) / (levels[1] + 0.05);
  const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.667 && Number(style.fontWeight) >= 700);
  return { supported: true as const, ratio, required: large ? 3 : 4.5, foreground, background, fontSize: style.fontSize, fontWeight: style.fontWeight };
}
