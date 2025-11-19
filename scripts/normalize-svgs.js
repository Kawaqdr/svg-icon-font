// scripts/normalize-svgs.js
const fs = require('fs');
const path = require('path');
const SvgPath = require('svgpath');

// --- Simple CLI args parsing ---
const args = process.argv.slice(2);
let folder = './icons-src';
let newSize = 24;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir' && args[i + 1]) {
    folder = args[i + 1];
    i++;
  } else if (args[i] === '--size' && args[i + 1]) {
    newSize = Number(args[i + 1]) || newSize;
    i++;
  }
}

if (!fs.existsSync(folder)) {
  console.error(`Input folder does not exist: ${folder}`);
  process.exit(1);
}

console.log(`Normalizing SVGs in "${folder}" to ${newSize}×${newSize}...`);

fs.readdirSync(folder).forEach((file) => {
  if (path.extname(file).toLowerCase() !== '.svg') return;

  const filePath = path.join(folder, file);
  let content = fs.readFileSync(filePath, 'utf8');

  let minX = 0;
  let minY = 0;
  let oldWidth = null;
  let oldHeight = null;

  // 1) Try to read from viewBox
  const vbMatch = content.match(/viewBox="([^"]+)"/i);
  if (vbMatch) {
    const parts = vbMatch[1]
      .trim()
      .split(/\s+/)
      .map(Number);
    if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
      [minX, minY, oldWidth, oldHeight] = parts;
    }
  }

  // 2) Fallback: try width/height attributes
  if (oldWidth == null || oldHeight == null) {
    const wMatch = content.match(/\swidth="([\d.]+)(px)?"/i);
    const hMatch = content.match(/\sheight="([\d.]+)(px)?"/i);
    if (wMatch && hMatch) {
      oldWidth = parseFloat(wMatch[1]);
      oldHeight = parseFloat(hMatch[1]);
      minX = 0;
      minY = 0;
    }
  }

  // If we still don't know the original size, skip this file
  if (!oldWidth || !oldHeight) {
    console.warn(`Skipping ${file}: couldn't detect original size`);
    return;
  }

  // 3) Compute scale factors
  const scaleX = newSize / oldWidth;
  const scaleY = newSize / oldHeight;

  // 4) Transform all <path> d attributes
  content = content.replace(
    /<path([^>]*)d="([^"]+)"([^>]*)>/gi,
    (match, pre, d, post) => {
      let p = new SvgPath(d);

      // If viewBox starts at non-zero, normalize origin to (0, 0)
      if (minX !== 0 || minY !== 0) {
        p = p.translate(-minX, -minY);
      }

      // Scale into the new coordinate system
      p = p.scale(scaleX, scaleY);

      const newD = p.toString();

      // preserve self-closing if present
      const selfClosing = /\/\s*>$/.test(match);
      const closing = selfClosing ? ' />' : '>';

      return `<path${pre}d="${newD}"${post}${closing}`;
    }
  );

  // 5) Normalize the <svg> tag: remove old width/height/viewBox and set new ones
  content = content.replace(/\s(width|height|viewBox)="[^"]*"/gi, '');
  content = content.replace(
    /<svg([^>]*)>/i,
    `<svg$1 width="${newSize}" height="${newSize}" viewBox="0 0 ${newSize} ${newSize}">`
  );

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Scaled to ${newSize}×${newSize}: ${file}`);
});

console.log('Done normalizing SVGs.');
