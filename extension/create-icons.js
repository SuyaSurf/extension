/**
 * Create PNG icons for the Chrome Extension
 */

const fs = require('fs');
const path = require('path');

// Simple 1x1 pixel PNG data (blue square)
const createPNGIcon = (size) => {
  // This is a minimal valid PNG file with a blue square
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);  // width
  ihdrData.writeUInt32BE(size, 4);  // height
  ihdrData[8] = 8;   // bit depth
  ihdrData[9] = 2;   // color type (RGB)
  ihdrData[10] = 0;  // compression
  ihdrData[11] = 0;  // filter
  ihdrData[12] = 0;  // interlace
  
  const ihdrCrc = crc32(Buffer.concat([Buffer.from('IHDR'), ihdrData]));
  const ihdrChunk = Buffer.concat([
    Buffer.from([ihdrData.length, 0, 0, 0]), // length
    Buffer.from('IHDR'),
    ihdrData,
    Buffer.from([ihdrCrc >> 24, ihdrCrc >> 16, ihdrCrc >> 8, ihdrCrc])
  ]);
  
  // IDAT chunk (simple blue square data)
  const pixelData = Buffer.alloc(size * size * 3);
  for (let i = 0; i < pixelData.length; i += 3) {
    pixelData[i] = 79;     // R (0x4F)
    pixelData[i + 1] = 70; // G (0x46) 
    pixelData[i + 2] = 225; // B (0xE5)
  }
  
  // Add filter bytes (0 for each scanline)
  const scanlines = [];
  for (let y = 0; y < size; y++) {
    const scanline = Buffer.alloc(1 + size * 3);
    scanline[0] = 0; // filter type
    pixelData.copy(scanline, 1, y * size * 3, (y + 1) * size * 3);
    scanlines.push(scanline);
  }
  
  const idatData = Buffer.concat(scanlines);
  const compressed = require('zlib').deflateSync(idatData);
  
  const idatCrc = crc32(Buffer.concat([Buffer.from('IDAT'), compressed]));
  const idatChunk = Buffer.concat([
    Buffer.from([compressed.length >> 24, compressed.length >> 16, compressed.length >> 8, compressed.length]),
    Buffer.from('IDAT'),
    compressed,
    Buffer.from([idatCrc >> 24, idatCrc >> 16, idatCrc >> 8, idatCrc])
  ]);
  
  // IEND chunk
  const iendCrc = crc32(Buffer.from('IEND'));
  const iendChunk = Buffer.concat([
    Buffer.from([0, 0, 0, 0]),
    Buffer.from('IEND'),
    Buffer.from([iendCrc >> 24, iendCrc >> 16, iendCrc >> 8, iendCrc])
  ]);
  
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
};

// Simple CRC32 implementation
function crc32(data) {
  let crc = 0xFFFFFFFF;
  const table = [];
  
  // Generate CRC table
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  
  // Calculate CRC
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Create icons
const sizes = [16, 32, 48, 128];
const assetsDir = path.join(__dirname, 'build', 'assets', 'icons');

console.log('🎨 Creating PNG icons...');

for (const size of sizes) {
  try {
    const pngData = createPNGIcon(size);
    const filePath = path.join(assetsDir, `icon-${size}.png`);
    fs.writeFileSync(filePath, pngData);
    console.log(`  ✓ Created icon-${size}.png`);
  } catch (error) {
    console.error(`  ❌ Failed to create icon-${size}.png:`, error.message);
  }
}

console.log('✅ Icons created successfully!');
