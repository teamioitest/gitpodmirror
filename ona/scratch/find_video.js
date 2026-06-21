const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'cases', 'automations', 'index.html');
if (!fs.existsSync(filePath)) {
  console.log('File does not exist:', filePath);
  process.exit(1);
}
const content = fs.readFileSync(filePath, 'utf8');

const videoIndex = content.indexOf('<video');
if (videoIndex === -1) {
  console.log('No <video tag found in HTML');
} else {
  console.log('--- FOUND <video AT INDEX', videoIndex, '---');
  console.log(content.substring(videoIndex - 100, videoIndex + 400));
}

const muxIndex = content.indexOf('SwztiMnsdhsK02AwRjXECO00yj6kQ1l4VdVgU00qPeOG500');
if (muxIndex !== -1) {
  console.log('--- FOUND MUX AT INDEX', muxIndex, '---');
  console.log(content.substring(muxIndex - 100, muxIndex + 200));
}
