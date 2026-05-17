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

      // Apply environment-specific manifest configuration
      await this.configureManifest();
      
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

  async configureManifest() {
    console.log('🧩 Configuring manifest...');

    const manifestPath = path.join(this.buildDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const googleClientId = process.env.SUYASURF_GOOGLE_CLIENT_ID;
    const distFiles = fs.existsSync(this.distDir)
      ? this.getAllFiles(this.distDir, [], this.distDir).map(file => file.replace(/\\/g, '/'))
      : [];
    const contentScriptMatches = [
      'http://localhost/*',
      'http://127.0.0.1/*',
      'https://*.gmail.com/*',
      'https://mail.google.com/*',
      'https://*.outlook.com/*',
      'https://*.venmail.com/*',
      'https://web.whatsapp.com/*',
      'https://web.telegram.org/*',
      'https://docs.google.com/*',
      'https://slides.google.com/*',
      'https://*.youtube.com/*',
      'https://rsvp.withgoogle.com/*'
    ];
    const initialContentScriptBundles = [
      'vendors/vendors.bundle.js',
      'common/common.bundle.js',
      ...distFiles.filter(file => /^\d+\/[^/]+\.bundle\.js$/.test(file)),
      'content-script/content-script.bundle.js'
    ].filter((file, index, list) => distFiles.includes(file) && list.indexOf(file) === index);

    if (!initialContentScriptBundles.includes('content-script/content-script.bundle.js')) {
      throw new Error('UI build is missing content-script/content-script.bundle.js. Run npm run build:ui first.');
    }

    manifest.content_scripts = [
      {
        matches: contentScriptMatches,
        js: ['content-scripts/universal-handler.js'],
        run_at: 'document_idle'
      },
      {
        matches: contentScriptMatches,
        js: initialContentScriptBundles,
        run_at: 'document_idle'
      }
    ];

    const dynamicResourceGlobs = Array.from(new Set(
      distFiles
        .map(file => file.split('/')[0])
        .filter(dir => dir && !['popup', 'newtab', 'settings', 'offscreen', 'content-script'].includes(dir))
        .map(dir => `${dir}/*`)
    ));

    manifest.web_accessible_resources = [
      {
        resources: [
          'assets/*',
          'shared/*',
          'shared/*/*',
          'skills/application-writing/*',
          'skills/application-writing/utils/*',
          'skills/qa-testing/*',
          ...dynamicResourceGlobs,
          'content-script/*',
          'ui/review-scheduler.html',
          'ui/review-scheduler.js'
        ],
        matches: ['http://*/*', 'https://*/*']
      }
    ];

    if (googleClientId) {
      if (!/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(googleClientId)) {
        throw new Error('SUYASURF_GOOGLE_CLIENT_ID must be a Google OAuth client ID ending in .apps.googleusercontent.com');
      }

      manifest.oauth2 = {
        client_id: googleClientId,
        scopes: [
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/calendar.events.readonly'
        ]
      };
      console.log('  ✓ Google OAuth configured from SUYASURF_GOOGLE_CLIENT_ID');
    } else {
      delete manifest.oauth2;
      console.log('  ⚠️  Google OAuth disabled; set SUYASURF_GOOGLE_CLIENT_ID for Gmail/Calendar notifications');
    }

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
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

    for (const htmlFile of ['popup/popup.html', 'offscreen/offscreen.html', 'newtab/newtab.html', 'settings/settings.html']) {
      if (!fs.existsSync(path.join(this.buildDir, htmlFile))) {
        throw new Error(`UI build is missing ${htmlFile}. Run npm run build:ui first.`);
      }
    }

    console.log('  ✓ Copied generated extension HTML');

    // Copy review scheduler page referenced by QA/review flows.
    const reviewSchedulerSrc = path.join(this.extensionDir, 'ui', 'review-scheduler.html');
    const reviewSchedulerDest = path.join(this.buildDir, 'ui', 'review-scheduler.html');
    if (fs.existsSync(reviewSchedulerSrc)) {
      fs.mkdirSync(path.dirname(reviewSchedulerDest), { recursive: true });
      fs.copyFileSync(reviewSchedulerSrc, reviewSchedulerDest);
      console.log('  ✓ Copied review scheduler HTML');
    }

    const reviewSchedulerScriptSrc = path.join(this.extensionDir, 'ui', 'review-scheduler.js');
    const reviewSchedulerScriptDest = path.join(this.buildDir, 'ui', 'review-scheduler.js');
    if (fs.existsSync(reviewSchedulerScriptSrc)) {
      fs.mkdirSync(path.dirname(reviewSchedulerScriptDest), { recursive: true });
      fs.copyFileSync(reviewSchedulerScriptSrc, reviewSchedulerScriptDest);
      console.log('  ✓ Copied review scheduler JS');
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
    const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH;
    const buildTime = sourceDateEpoch
      ? new Date(Number(sourceDateEpoch) * 1000).toISOString()
      : new Date().toISOString();
    
    const buildInfo = {
      buildTime,
      sourceDateEpoch: sourceDateEpoch || null,
      gitCommit: this.getGitCommit(),
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

  getAllFiles(dir, fileList = [], baseDir = this.buildDir) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        this.getAllFiles(filePath, fileList, baseDir);
      } else {
        fileList.push(path.relative(baseDir, filePath));
      }
    }
    
    return fileList;
  }

  getGitCommit() {
    try {
      return execSync('git rev-parse HEAD', {
        cwd: this.extensionDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();
    } catch {
      return null;
    }
  }
}

// Run the build
if (require.main === module) {
  const builder = new ExtensionBuilder();
  builder.build().catch(console.error);
}

module.exports = ExtensionBuilder;
