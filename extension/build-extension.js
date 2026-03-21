/**
 * Build script for Chrome Extension CRX packaging
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ExtensionBuilder {
  constructor() {
    this.extensionDir = path.resolve(__dirname);
    this.buildDir = path.resolve(__dirname, 'build');
    this.distDir = path.resolve(__dirname, 'dist');
  }

  async build() {
    console.log('🔨 Building Chrome Extension...');
    
    try {
      // Clean build directory
      await this.cleanBuildDir();
      
      // Copy essential files
      await this.copyEssentialFiles();
      
      // Copy built UI files
      await this.copyUIFiles();
      
      // Copy skills and utilities
      await this.copySkills();
      await this.copyUtilities();
      
      // Copy background files
      await this.copyBackground();
      
      // Copy assets
      await this.copyAssets();
      
      // Generate CRX info
      await this.generateBuildInfo();
      
      console.log('✅ Extension built successfully!');
      console.log(`📁 Build directory: ${this.buildDir}`);
      console.log('📦 Ready to load as unpacked extension in Chrome DevTools');
      
    } catch (error) {
      console.error('❌ Build failed:', error.message);
      process.exit(1);
    }
  }

  async cleanBuildDir() {
    console.log('🧹 Cleaning build directory...');
    
    if (fs.existsSync(this.buildDir)) {
      fs.rmSync(this.buildDir, { recursive: true, force: true });
    }
    
    fs.mkdirSync(this.buildDir, { recursive: true });
  }

  async copyEssentialFiles() {
    console.log('📋 Copying essential files...');
    
    const essentialFiles = [
      'manifest.json',
      'README.md',
      'CODE_REVIEW.md',
      'IMPLEMENTATION_TIMELINE.md'
    ];

    for (const file of essentialFiles) {
      const src = path.join(this.extensionDir, file);
      const dest = path.join(this.buildDir, file);
      
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(`  ✓ Copied ${file}`);
      } else {
        console.log(`  ⚠️  ${file} not found, skipping`);
      }
    }
  }

  async copyUIFiles() {
    console.log('🎨 Copying UI files...');
    
    // Copy built JS files from dist
    const distFiles = fs.readdirSync(this.distDir);
    for (const file of distFiles) {
      const src = path.join(this.distDir, file);
      const dest = path.join(this.buildDir, file);
      
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        // Copy directory recursively
        this.copyDirectory(src, dest);
      } else {
        // Copy file
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }
    }

    // Copy content scripts directory
    const contentScriptsSrc = path.join(this.extensionDir, 'content-scripts');
    const contentScriptsDest = path.join(this.buildDir, 'content-scripts');
    
    if (fs.existsSync(contentScriptsSrc)) {
      this.copyDirectory(contentScriptsSrc, contentScriptsDest);
      console.log('  ✓ Copied content scripts');
    }

    // Copy popup HTML
    const popupSrc = path.join(this.extensionDir, 'popup', 'popup-fixed.html');
    const popupDest = path.join(this.buildDir, 'popup', 'popup.html');
    
    if (fs.existsSync(popupSrc)) {
      fs.mkdirSync(path.dirname(popupDest), { recursive: true });
      fs.copyFileSync(popupSrc, popupDest);
      console.log('  ✓ Copied popup HTML');
    }

    // Copy offscreen HTML
    const offscreenSrc = path.join(this.extensionDir, 'offscreen', 'offscreen.html');
    const offscreenDest = path.join(this.buildDir, 'offscreen', 'offscreen.html');
    
    if (fs.existsSync(offscreenSrc)) {
      fs.mkdirSync(path.dirname(offscreenDest), { recursive: true });
      fs.copyFileSync(offscreenSrc, offscreenDest);
      console.log('  ✓ Copied offscreen HTML');
    }

    // Copy newtab HTML
    const newtabSrc = path.join(this.extensionDir, 'newtab', 'newtab.html');
    const newtabDest = path.join(this.buildDir, 'newtab', 'newtab.html');
    
    if (fs.existsSync(newtabSrc)) {
      fs.mkdirSync(path.dirname(newtabDest), { recursive: true });
      let content = fs.readFileSync(newtabSrc, 'utf8');
      // Fix script paths for newtab directory (go up to extension root)
      content = content.replace(
        /<script defer src="vendors\//g, 
        '<script defer src="../vendors/'
      );
      content = content.replace(
        /<script defer src="698\//g, 
        '<script defer src="../698/'
      );
      content = content.replace(
        /<script defer src="newtab\//g, 
        '<script defer src="'
      );
      fs.writeFileSync(newtabDest, content);
      console.log('  ✓ Copied newtab HTML');
    }

    // Copy settings HTML
    const settingsSrc = path.join(this.extensionDir, 'settings', 'settings.html');
    const settingsDest = path.join(this.buildDir, 'settings', 'settings.html');
    
    if (fs.existsSync(settingsSrc)) {
      fs.mkdirSync(path.dirname(settingsDest), { recursive: true });
      let content = fs.readFileSync(settingsSrc, 'utf8');
      // Fix script paths for settings directory (go up to extension root)
      content = content.replace(
        /<script defer src="vendors\//g, 
        '<script defer src="../vendors/'
      );
      content = content.replace(
        /<script defer src="settings\//g, 
        '<script defer src="'
      );
      fs.writeFileSync(settingsDest, content);
      console.log('  ✓ Copied settings HTML');
    }

    // Copy offscreen JS (the one we created)
    const offscreenJSSrc = path.join(this.extensionDir, 'offscreen', 'offscreen.js');
    const offscreenJSDest = path.join(this.buildDir, 'offscreen', 'offscreen.js');
    
    if (fs.existsSync(offscreenJSSrc)) {
      fs.copyFileSync(offscreenJSSrc, offscreenJSDest);
      console.log('  ✓ Copied offscreen JS');
    }
  }

  async copySkills() {
    console.log('⚡ Copying skills...');
    
    const skillsDir = path.join(this.buildDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    
    const sourceSkillsDir = path.join(this.extensionDir, 'skills');
    const skillFolders = fs.readdirSync(sourceSkillsDir);
    
    for (const skillFolder of skillFolders) {
      const skillPath = path.join(sourceSkillsDir, skillFolder);
      const stat = fs.statSync(skillPath);
      
      if (stat.isDirectory()) {
        const destSkillPath = path.join(skillsDir, skillFolder);
        this.copyDirectory(skillPath, destSkillPath);
        console.log(`  ✓ Copied skill: ${skillFolder}`);
      }
    }
  }

  async copyUtilities() {
    console.log('🛠️  Copying utilities...');
    
    const sharedDir = path.join(this.buildDir, 'shared');
    fs.mkdirSync(sharedDir, { recursive: true });
    
    const sourceSharedDir = path.join(this.extensionDir, 'shared');
    this.copyDirectory(sourceSharedDir, sharedDir);
    console.log('  ✓ Copied shared utilities');
  }

  async copyBackground() {
    console.log('🔧 Copying background files...');
    
    const backgroundDir = path.join(this.buildDir, 'background');
    fs.mkdirSync(backgroundDir, { recursive: true });
    
    const sourceBackgroundDir = path.join(this.extensionDir, 'background');
    const backgroundFiles = fs.readdirSync(sourceBackgroundDir);
    
    for (const file of backgroundFiles) {
      const src = path.join(sourceBackgroundDir, file);
      const dest = path.join(backgroundDir, file);
      fs.copyFileSync(src, dest);
    }
    
    console.log('  ✓ Copied background scripts');
  }

  async copyAssets() {
    console.log('🎭 Copying assets...');
    
    const assetsSrc = path.join(this.extensionDir, 'assets');
    if (fs.existsSync(assetsSrc)) {
      const assetsDest = path.join(this.buildDir, 'assets');
      this.copyDirectory(assetsSrc, assetsDest);
      console.log('  ✓ Copied assets');
    } else {
      console.log('  ⚠️  No assets directory found, creating character icons');
      
      // Create character icons instead of generic placeholders
      await this.createCharacterIcons();
    }
  }

  async createCharacterIcons() {
    const CharacterIconGenerator = require('./create-character-icons.js');
    const generator = new CharacterIconGenerator();
    await generator.generate();
  }

  async createPlaceholderIcons() {
    const assetsDir = path.join(this.buildDir, 'assets', 'icons');
    fs.mkdirSync(assetsDir, { recursive: true });
    
    // Create simple SVG placeholders
    const sizes = [16, 32, 48, 128];
    const svgTemplate = `<svg width="SIZE" height="SIZE" viewBox="0 0 SIZE SIZE" xmlns="http://www.w3.org/2000/svg">
      <rect width="SIZE" height="SIZE" fill="#4F46E5"/>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="white" font-family="Arial" font-size="SIZE/4">AI</text>
    </svg>`;
    
    for (const size of sizes) {
      const svg = svgTemplate.replace(/SIZE/g, size);
      const filePath = path.join(assetsDir, `icon-${size}.png`);
      
      // For now, create a simple text file as placeholder
      // In production, you'd want actual PNG files
      fs.writeFileSync(filePath.replace('.png', '.svg'), svg);
      console.log(`  ✓ Created placeholder icon-${size}.svg`);
    }
  }

  async generateBuildInfo() {
    console.log('📊 Generating build info...');
    
    const buildInfo = {
      buildTime: new Date().toISOString(),
      version: '1.0.0',
      manifest: JSON.parse(fs.readFileSync(path.join(this.buildDir, 'manifest.json'), 'utf8')),
      files: this.getAllFiles(this.buildDir)
    };
    
    fs.writeFileSync(
      path.join(this.buildDir, 'build-info.json'),
      JSON.stringify(buildInfo, null, 2)
    );
    
    console.log('  ✓ Build info generated');
  }

  copyDirectory(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const files = fs.readdirSync(src);
    
    for (const file of files) {
      const srcPath = path.join(src, file);
      const destPath = path.join(dest, file);
      const stat = fs.statSync(srcPath);
      
      if (stat.isDirectory()) {
        this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  getAllFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        this.getAllFiles(filePath, fileList);
      } else {
        fileList.push(path.relative(this.buildDir, filePath));
      }
    }
    
    return fileList;
  }
}

// Run the build
if (require.main === module) {
  const builder = new ExtensionBuilder();
  builder.build().catch(console.error);
}

module.exports = ExtensionBuilder;
