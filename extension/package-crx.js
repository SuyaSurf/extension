/**
 * Package Chrome Extension as CRX file
 * Note: For development, use the unpacked build directory
 * CRX is mainly for distribution/Chrome Web Store
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

class CRXPackager {
  constructor() {
    this.buildDir = path.resolve(__dirname, 'build');
    this.outputDir = path.resolve(__dirname, 'dist-crx');
    this.privateKeyPath = path.resolve(__dirname, 'private-key.pem');
  }

  async package() {
    console.log('📦 Packaging Chrome Extension as CRX...');
    
    try {
      // Ensure build exists
      if (!fs.existsSync(this.buildDir)) {
        throw new Error('Build directory not found. Run build-extension.js first.');
      }
      
      // Create output directory
      fs.mkdirSync(this.outputDir, { recursive: true });
      
      // Generate private key if it doesn't exist
      await this.generatePrivateKey();
      
      // Create ZIP archive
      const zipPath = await this.createZip();
      
      // Generate CRX
      const crxPath = await this.createCRX(zipPath);
      
      // Generate update manifest
      await this.generateUpdateManifest(crxPath);
      
      console.log('✅ CRX package created successfully!');
      console.log(`📁 CRX file: ${crxPath}`);
      console.log(`🔑 Private key: ${this.privateKeyPath}`);
      console.log(`📋 Update manifest: ${path.join(this.outputDir, 'updates.xml')}`);
      
    } catch (error) {
      console.error('❌ Packaging failed:', error.message);
      process.exit(1);
    }
  }

  async generatePrivateKey() {
    if (!fs.existsSync(this.privateKeyPath)) {
      console.log('🔑 Generating private key...');
      
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: spki, format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });
      
      fs.writeFileSync(this.privateKeyPath, privateKey);
      console.log('  ✓ Private key generated');
    } else {
      console.log('  ✓ Using existing private key');
    }
  }

  async createZip() {
    console.log('🗜️  Creating ZIP archive...');
    
    const zipPath = path.join(this.outputDir, 'extension.zip');
    
    // Use Node.js built-in compression or external tool
    // For simplicity, we'll use a basic approach
    const archiver = require('archiver');
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    return new Promise((resolve, reject) => {
      output.on('close', () => {
        console.log(`  ✓ ZIP created: ${archive.pointer()} bytes`);
        resolve(zipPath);
      });
      
      archive.on('error', reject);
      archive.pipe(output);
      
      // Add all files from build directory
      archive.directory(this.buildDir, false);
      archive.finalize();
    });
  }

  async createCRX(zipPath) {
    console.log('🔐 Creating CRX file...');
    
    const privateKey = fs.readFileSync(this.privateKeyPath, 'utf8');
    const zipData = fs.readFileSync(zipPath);
    
    // Generate signature
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(zipData);
    const signature = sign.sign(privateKey);
    
    // Get public key
    const publicKey = crypto.createPublicKey(privateKey);
    const publicKeyDER = publicKey.export({ type: 'DER', format: 'SPKI' });
    
    // Create CRX header
    const version = 3; // CRX version
    const header = Buffer.alloc(16);
    
    header.writeUInt32LE(0x43727843, 0); // Magic number "CrxC"
    header.writeUInt32LE(version, 4);     // Version
    header.writeUInt32LE(publicKeyDER.length, 8);  // Public key length
    header.writeUInt32LE(signature.length, 12);   // Signature length
    
    // Combine header, public key, signature, and zip data
    const crxData = Buffer.concat([
      header,
      publicKeyDER,
      signature,
      zipData
    ]);
    
    const crxPath = path.join(this.outputDir, 'extension.crx');
    fs.writeFileSync(crxPath, crxData);
    
    console.log(`  ✓ CRX created: ${crxData.length} bytes`);
    return crxPath;
  }

  async generateUpdateManifest(crxPath) {
    console.log('📋 Generating update manifest...');
    
    // Get CRX file size and hash
    const crxData = fs.readFileSync(crxPath);
    const crxHash = crypto.createHash('sha256').update(crxData).digest('hex');
    
    // Read manifest for version
    const manifestFilePath = path.join(this.buildDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestFilePath, 'utf8'));
    
    const updateManifest = `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${this.generateAppID()}'>
    <updatecheck codebase='extension.crx' version='${manifest.version}' prodversionmin='${manifest.version}'>
      <packages>
        <package fp='${crxHash}' hash_sha256='${crxHash}' name='extension.crx' required='true' size='${crxData.length}' />
      </packages>
    </updatecheck>
  </app>
</gupdate>`;
    
    const updateManifestPath = path.join(this.outputDir, 'updates.xml');
    fs.writeFileSync(updateManifestPath, updateManifest);
    
    console.log('  ✓ Update manifest generated');
  }

  generateAppID() {
    // Generate app ID based on public key (Chrome's method)
    if (!fs.existsSync(this.privateKeyPath)) {
      return 'abcdefghijklmnopabcdefghijklmnop';
    }
    
    const privateKey = fs.readFileSync(this.privateKeyPath, 'utf8');
    const publicKey = crypto.createPublicKey(privateKey);
    const publicKeyDER = publicKey.export({ type: 'DER', format: 'SPKI' });
    
    const hash = crypto.createHash('sha256').update(publicKeyDER).digest();
    const hashHex = hash.toString('hex').substring(0, 32);
    
    // Convert to Chrome's 32-character app ID format
    let appID = '';
    for (let i = 0; i < hashHex.length; i += 2) {
      const byte = parseInt(hashHex.substr(i, 2), 16);
      const char = String.fromCharCode(byte + 'a'.charCodeAt(0));
      appID += char;
    }
    
    return appID;
  }
}

// Run the packaging
if (require.main === module) {
  const packager = new CRXPackager();
  
  // Check if archiver is available
  try {
    require('archiver');
  } catch (error) {
    console.log('⚠️  Archiver not found. Installing...');
    execSync('npm install archiver', { stdio: 'inherit' });
  }
  
  packager.package().catch(console.error);
}

module.exports = CRXPackager;
