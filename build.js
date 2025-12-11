// build.js
const fs = require('fs');
const archiver = require('archiver');

console.log("Starting the packaging process...");

// Define the name of the output ZIP file
const output = fs.createWriteStream(__dirname + '/tab-group-sync.zip');
const archive = archiver('zip', {
  zlib: { level: 9 } // Set the compression level
});

// --- Listen for events ---
output.on('close', function() {
  console.log(`Package created successfully: ${archive.pointer()} total bytes`);
  console.log('firefox-group-sync.zip is ready for submission.');
});

archive.on('warning', function(err) {
  if (err.code === 'ENOENT') {
    console.warn('Warning:', err);
  } else {
    throw err;
  }
});

archive.on('error', function(err) {
  throw err;
});

// --- Pipe the archive data to the file ---
archive.pipe(output);

// --- Add files to the archive ---
// These are the essential files for your extension to run.
const filesToInclude = [
  'manifest.json',
  'background.js',
  'popup.html',
  'popup.js',
  'README.md',
  'PRIVACY.md'
];

filesToInclude.forEach(file => {
  console.log(`Adding ${file}...`);
  archive.file(file, { name: file });
});

// Add the entire 'icons' directory
console.log("Adding icons directory...");
archive.directory('icons/', 'icons');

// --- Finalize the archive ---
// This is an asynchronous operation that will trigger the 'close' event when done.
archive.finalize();
