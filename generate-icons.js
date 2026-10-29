import sharp from 'sharp'
import fs from 'fs'

const sizes = [192, 512]

const svg = fs.readFileSync('./public/icon.svg')

for (const size of sizes) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(`./public/icon-${size}.png`)
  console.log(`Generated icon-${size}.png`)
}

console.log('All icons generated successfully')
