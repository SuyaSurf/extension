/**
 * Create Chrome Extension icons using the Suya character
 * Uses different expressions for different icon sizes
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Suya character SVG templates for different expressions
const getCharacterSVG = (size, expression = 'happy') => {
  const scale = size / 56; // Original viewBox is 56x54
  
  return `<svg width="${size}" height="${size}" viewBox="0 0 56 54" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="G_skin" cx="38%" cy="28%" r="68%">
        <stop offset="0%" stopColor="#FFF0DC"/>
        <stop offset="50%" stopColor="#FFD49A"/>
        <stop offset="100%" stopColor="#F0A860"/>
      </radialGradient>
      <radialGradient id="G_iris" cx="28%" cy="25%" r="68%">
        <stop offset="0%" stopColor="#7EC4F4"/>
        <stop offset="50%" stopColor="#1E6EC0"/>
        <stop offset="100%" stopColor="#0C3880"/>
      </radialGradient>
      <radialGradient id="G_iris_shock" cx="28%" cy="25%" r="68%">
        <stop offset="0%" stopColor="#FFE87A"/>
        <stop offset="50%" stopColor="#F0B000"/>
        <stop offset="100%" stopColor="#B07000"/>
      </radialGradient>
      <radialGradient id="G_iris_listen" cx="28%" cy="25%" r="68%">
        <stop offset="0%" stopColor="#B0ECFF"/>
        <stop offset="50%" stopColor="#18B0E8"/>
        <stop offset="100%" stopColor="#0870B8"/>
      </radialGradient>
      <radialGradient id="G_iris_focus" cx="28%" cy="25%" r="68%">
        <stop offset="0%" stopColor="#FF9858"/>
        <stop offset="50%" stopColor="#D84010"/>
        <stop offset="100%" stopColor="#801808"/>
      </radialGradient>
      <radialGradient id="G_blush" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="rgba(255,110,80,.45)"/>
        <stop offset="100%" stopColor="rgba(255,110,80,0)"/>
      </radialGradient>
      <radialGradient id="G_orb" cx="32%" cy="28%" r="65%">
        <stop offset="0%" stopColor="#FFE070"/>
        <stop offset="100%" stopColor="#FF6B1A"/>
      </radialGradient>
    </defs>

    <line x1="28" y1="4.5" x2="28" y2="10" stroke="#C8804A" strokeWidth="1.8" strokeLinecap="round"/>
    <circle cx="28" cy="3.2" r="2.8" fill="url(#G_orb)"/>
    <circle cx="26.8" cy="2.2" r="0.9" fill="rgba(255,255,255,.65)"/>
    <circle cx="28" cy="30" r="24" fill="url(#G_skin)" stroke="#D88040" strokeWidth="1"/>
    <ellipse cx="22" cy="20" rx="9" ry="5" fill="rgba(255,255,255,.15)" transform="rotate(-14 22 20)"/>

    ${getExpressionSVG(expression)}
  </svg>`;
};

const getExpressionSVG = (expression) => {
  switch (expression) {
    case 'happy':
      return `
      <ellipse cx="19" cy="27" rx="9.5" ry="10.5" fill="#1A0A02"/>
      <ellipse cx="19" cy="27" rx="8" ry="9" fill="white"/>
      <path d="M10.5 27 Q19 18 27.5 27" fill="#1A0A02"/>
      <ellipse cx="37" cy="27" rx="9.5" ry="10.5" fill="#1A0A02"/>
      <ellipse cx="37" cy="27" rx="8" ry="9" fill="white"/>
      <path d="M28.5 27 Q37 18 45.5 27" fill="#1A0A02"/>
      <path d="M10 14 Q18.5 10.5 25 13" stroke="#7A3A10" strokeWidth="3" strokeLinecap="round" fill="none"/>
      <path d="M31 13 Q37.5 10.5 46 14" stroke="#7A3A10" strokeWidth="3" strokeLinecap="round" fill="none"/>
      <path d="M17 40 Q28 50 39 40" stroke="#903A14" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
      <ellipse cx="9" cy="34" rx="5.5" ry="4" fill="url(#G_blush)"/>
      <ellipse cx="47" cy="34" rx="5.5" ry="4" fill="url(#G_blush)"/>
      <path d="M45 8 L46 6 L47 8 L45 9 Z" fill="#FFD060" opacity=".75"/>`;

    case 'thinking':
      return `
      <ellipse cx="19" cy="27" rx="9.5" ry="10.5" fill="#1A0A02"/>
      <ellipse cx="19" cy="27" rx="8" ry="9" fill="white"/>
      <ellipse cx="19" cy="27" rx="5.5" ry="6" fill="url(#G_iris)"/>
      <circle cx="19" cy="27" r="3.2" fill="#05152A"/>
      <circle cx="21" cy="24.2" r="1.8" fill="rgba(255,255,255,.95)"/>
      <ellipse cx="37" cy="27" rx="9.5" ry="10.5" fill="#1A0A02"/>
      <ellipse cx="37" cy="27" rx="8" ry="9" fill="white"/>
      <ellipse cx="35" cy="25" rx="5.5" ry="6" fill="url(#G_iris)"/>
      <circle cx="34" cy="24" r="3.2" fill="#05152A"/>
      <circle cx="35.5" cy="22.5" r="1.8" fill="rgba(255,255,255,.95)"/>
      <path d="M10.5 16 Q18.5 13.5 24.5 15.5" stroke="#7A3A10" strokeWidth="2.8" strokeLinecap="round" fill="none"/>
      <path d="M31.5 13 Q37.5 10 45.5 12.5" stroke="#7A3A10" strokeWidth="2.8" strokeLinecap="round" fill="none"/>
      <path d="M19 42 Q24 40.5 28 42 Q31 43.5 34 41" stroke="#A04820" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      <circle cx="43" cy="16" r="1.6" fill="#FFD4A0" opacity=".6"/>
      <circle cx="47" cy="11" r="2.2" fill="#FFD4A0" opacity=".72"/>
      <circle cx="51" cy="7" r="2.9" fill="#FFD4A0" opacity=".82"/>`;

    case 'listening':
      return `
      <ellipse cx="19" cy="27" rx="10.5" ry="12" fill="#1A0A02"/>
      <ellipse cx="19" cy="27" rx="9" ry="10.5" fill="white"/>
      <ellipse cx="19" cy="27" rx="6.5" ry="7.5" fill="url(#G_iris_listen)"/>
      <circle cx="19" cy="27" r="4" fill="#021C30"/>
      <circle cx="21.5" cy="23.8" r="2.2" fill="rgba(255,255,255,.95)"/>
      <ellipse cx="37" cy="27" rx="10.5" ry="12" fill="#1A0A02"/>
      <ellipse cx="37" cy="27" rx="9" ry="10.5" fill="white"/>
      <ellipse cx="37" cy="27" rx="6.5" ry="7.5" fill="url(#G_iris_listen)"/>
      <circle cx="37" cy="27" r="4" fill="#021C30"/>
      <circle cx="39.5" cy="23.8" r="2.2" fill="rgba(255,255,255,.95)"/>
      <path d="M10 15.5 Q18.5 13 25 15" stroke="#6898B8" strokeWidth="2.6" strokeLinecap="round" fill="none"/>
      <path d="M31 15 Q37.5 13 46 15.5" stroke="#6898B8" strokeWidth="2.6" strokeLinecap="round" fill="none"/>
      <ellipse cx="28" cy="43" rx="4.2" ry="3.5" fill="#8C3010"/>
      <ellipse cx="28" cy="42.5" rx="2.6" ry="2.2" fill="#5A1808"/>`;

    case 'neutral':
    default:
      return `
      <ellipse cx="19" cy="27" rx="9.5" ry="10.5" fill="#1A0A02"/>
      <ellipse cx="19" cy="27" rx="8" ry="9" fill="white"/>
      <ellipse cx="19" cy="27" rx="5.5" ry="6" fill="url(#G_iris)"/>
      <circle cx="19" cy="27" r="3.2" fill="#05152A"/>
      <circle cx="21" cy="24.2" r="1.8" fill="rgba(255,255,255,.95)"/>
      <circle cx="17.5" cy="28.8" r=".7" fill="rgba(255,255,255,.4)"/>
      <ellipse cx="37" cy="27" rx="9.5" ry="10.5" fill="#1A0A02"/>
      <ellipse cx="37" cy="27" rx="8" ry="9" fill="white"/>
      <ellipse cx="37" cy="27" rx="5.5" ry="6" fill="url(#G_iris)"/>
      <circle cx="37" cy="27" r="3.2" fill="#05152A"/>
      <circle cx="39" cy="24.2" r="1.8" fill="rgba(255,255,255,.95)"/>
      <circle cx="35.5" cy="28.8" r=".7" fill="rgba(255,255,255,.4)"/>
      <path d="M10.5 16 Q18.5 13.5 24.5 15.5" stroke="#7A3A10" strokeWidth="2.8" strokeLinecap="round" fill="none"/>
      <path d="M31.5 15.5 Q37.5 13.5 45.5 16" stroke="#7A3A10" strokeWidth="2.8" strokeLinecap="round" fill="none"/>
      <path d="M21 42 Q28 44.5 35 42" stroke="#A04820" strokeWidth="1.8" strokeLinecap="round" fill="none"/>`;
  }
};

// Convert SVG to PNG using Node.js canvas (simplified approach)
const createIconPNG = (size, expression) => {
  // For now, create SVG files that can be converted to PNG later
  // In production, you'd use a library like sharp or canvas to render SVG to PNG
  const svgContent = getCharacterSVG(size, expression);
  
  return {
    svg: svgContent,
    // Placeholder for PNG conversion
    png: Buffer.from(svgContent) // This would be actual PNG data
  };
};

// Create icons with different expressions for different sizes
const iconConfigs = [
  { size: 16, expression: 'neutral' },
  { size: 32, expression: 'thinking' },
  { size: 48, expression: 'happy' },
  { size: 128, expression: 'listening' }
];

class CharacterIconGenerator {
  constructor() {
    this.assetsDir = path.resolve(__dirname, 'build', 'assets', 'icons');
  }

  async generate() {
    console.log('🎭 Creating Suya character icons...');
    
    // Ensure directory exists
    fs.mkdirSync(this.assetsDir, { recursive: true });
    
    for (const config of iconConfigs) {
      const { size, expression } = config;
      
      // Create SVG version
      const svgContent = getCharacterSVG(size, expression);
      const svgPath = path.join(this.assetsDir, `icon-${size}.svg`);
      fs.writeFileSync(svgPath, svgContent);
      
      // Convert SVG to PNG using sharp for crisp raster icons
      const pngPath = path.join(this.assetsDir, `icon-${size}.png`);
      await this.generatePNGFromSVG(svgContent, size, pngPath);
      
      console.log(`  ✓ Created icon-${size} (${expression})`);
    }
    
    console.log('✅ Character icons created successfully!');
  }

  async generatePNGFromSVG(svgContent, size, outputPath) {
    const svgBuffer = Buffer.from(svgContent);
    await sharp(svgBuffer)
      .png({ width: size, height: size })
      .toFile(outputPath);
  }
}

// Run the generator
if (require.main === module) {
  const generator = new CharacterIconGenerator();
  generator.generate().catch(console.error);
}

module.exports = CharacterIconGenerator;
