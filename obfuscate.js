const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

// Configuration for obfuscation
const obfuscationOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: true,
  debugProtectionInterval: 4000,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayEncoding: ['rc4'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: 'function',
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false
};

// Files to obfuscate (add more as needed)
const filesToObfuscate = [
  'server.js',
  'config/database.js',
  'routes/regionRoutes.js',
  'routes/zoneRoutes.js',
  'routes/woredaRoutes.js',
  'routes/oversightOfficeRoutes.js',
  'routes/roleRoutes.js',
  'routes/admistrativeUnitRoutes.js',
  'routes/landRecordRoutes.js',
  'routes/userRoutes.js',
  'routes/authRoutes.js',
  'routes/documentRoutes.js',
  'routes/landPaymentRoutes.js'
];

// Create dist folder if it doesn't exist
const distFolder = path.join(__dirname, 'dist-server');
if (!fs.existsSync(distFolder)) {
  fs.mkdirSync(distFolder);
}

// Obfuscate each file
filesToObfuscate.forEach(file => {
  try {
    const filePath = path.join(__dirname, file);
    
    if (fs.existsSync(filePath)) {
      const code = fs.readFileSync(filePath, 'utf8');
      const obfuscatedCode = JavaScriptObfuscator.obfuscate(code, obfuscationOptions).getObfuscatedCode();
      
      // Create the same directory structure in dist
      const relativeDir = path.dirname(file);
      const distDir = path.join(distFolder, relativeDir);
      
      if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
      }
      
      const outputPath = path.join(distDir, path.basename(file));
      fs.writeFileSync(outputPath, obfuscatedCode);
      console.log(`Obfuscated: ${file}`);
    }
  } catch (error) {
    console.error(`Error obfuscating ${file}:`, error.message);
  }
});

// Copy other necessary files (package.json, uploads, etc.)
const filesToCopy = [
  'package.json',
  '.env'
];

filesToCopy.forEach(file => {
  try {
    const sourcePath = path.join(__dirname, file);
    const destPath = path.join(distFolder, file);
    
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, destPath);
      console.log(`Copied: ${file}`);
    }
  } catch (error) {
    console.error(`Error copying ${file}:`, error.message);
  }
});

// Copy uploads directory recursively
function copyDirRecursive(source, destination) {
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
  }
  
  const items = fs.readdirSync(source);
  
  items.forEach(item => {
    const sourcePath = path.join(source, item);
    const destPath = path.join(destination, item);
    
    if (fs.statSync(sourcePath).isDirectory()) {
      copyDirRecursive(sourcePath, destPath);
    } else {
      fs.copyFileSync(sourcePath, destPath);
    }
  });
}

// Copy uploads folder
const uploadsSource = path.join(__dirname, 'uploads');
const uploadsDest = path.join(distFolder, 'uploads');
if (fs.existsSync(uploadsSource)) {
  copyDirRecursive(uploadsSource, uploadsDest);
  console.log('Copied: uploads directory');
}

console.log('Obfuscation completed!');