const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

// Promisify fs.readFile and fs.stat for convenience
const readFileAsync = promisify(fs.readFile);
const statAsync = promisify(fs.stat);

/**
 * Generates a Base64 encoded icon file.
 * It checks if the output file already exists and is up-to-date before generating a new one.
 */
async function generateBase64Icon() {
  const iconPath = path.join(__dirname, 'icon.png');
  const outputPath = path.join(__dirname, 'src', 'iconBase64.ts');

  try {
    const [iconStat, outputStat] = await Promise.all([
      statAsync(iconPath).catch(() => null),
      statAsync(outputPath).catch(() => null)
    ]);

    // Check if output file exists and is newer than the icon file
    if (outputStat && iconStat && outputStat.mtime > iconStat.mtime) {
      console.log('Base64 icon file is up-to-date.');
      return;
    }

    const fileBuffer = await readFileAsync(iconPath);
    const base64Icon = `data:image/png;base64,${fileBuffer.toString('base64')}`;

    const outputContent = `// This is a generated file. Do not edit directly.
// This is a Base64 encoded version of the plugin's icon ('icon.png') used in the plugin's config.
// This file is automatically generated by esBuild.js whenever the icon is changed.
// There is no need to add it to version control.

export const iconBase64 = "${base64Icon}";\n`;

    fs.writeFileSync(outputPath, outputContent);
    console.log('Base64 icon file generated successfully.');
  } catch (error) {
    console.error(`Failed to generate base64 icon: ${error.message}`);
    process.exit(1);
  }
}

async function build() {
  await generateBase64Icon();

  esbuild
    .build({
      entryPoints: ['src/index.ts'],
      outdir: 'dist',
      bundle: true,
      sourcemap: true,
      minify: false, // might want to use true for production build
      format: 'cjs', // needs to be CJS for now
      target: ['es2020'] // don't go over es2020 because quickjs doesn't support it
    }).catch(() => process.exit(1));
}

build();