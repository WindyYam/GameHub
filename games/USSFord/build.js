import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve esbuild
let esbuild;
try {
    esbuild = require('esbuild');
} catch {
    esbuild = require('C:/MySource/Inspection_Assistant/node_modules/esbuild');
}

export function build() {
    console.log('[USSFord] Bundling modular sources from js/ into index.html...');
    const result = esbuild.buildSync({
        entryPoints: [path.join(__dirname, 'js', 'main.js')],
        bundle: true,
        format: 'esm',
        write: false,
        external: ['three', 'three/addons/*']
    });

    const bundledJs = result.outputFiles[0].text;

    // Write to js/bundle.js as well
    fs.writeFileSync(path.join(__dirname, 'js', 'bundle.js'), bundledJs, 'utf8');

    // Also write re-export config.js at root to prevent any legacy 404s
    fs.writeFileSync(path.join(__dirname, 'config.js'), "export * from './js/config.js';\n", 'utf8');

    const indexPath = path.join(__dirname, 'index.html');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    const headPart = indexContent.split(/<script type="module"[\s\S]*?<\/script>/i)[0];

    const updatedHtml = headPart +
`<script type="module">
${bundledJs}
</script>
</body>
</html>
`;

    fs.writeFileSync(indexPath, updatedHtml, 'utf8');
    console.log('[USSFord] Build complete! index.html updated successfully.');
}

if (process.argv.includes('--watch')) {
    build();
    console.log('[USSFord] Watching js/ for changes...');
    fs.watch(path.join(__dirname, 'js'), (eventType, filename) => {
        if (filename && filename.endsWith('.js') && filename !== 'bundle.js') {
            console.log(`[USSFord] Change detected in js/${filename}`);
            try { build(); } catch (err) { console.error(err); }
        }
    });
} else {
    build();
}
