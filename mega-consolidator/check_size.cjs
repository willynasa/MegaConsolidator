const fs = require('fs');
const buffer = fs.readFileSync('../graphics/CombinatorIcon.png');
const idx = buffer.indexOf(Buffer.from('IHDR')) + 4;
const width = buffer.readUInt32BE(idx);
const height = buffer.readUInt32BE(idx + 4);
console.log('Width: ' + width + ', Height: ' + height);
