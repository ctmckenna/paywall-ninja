const pluginName = 'ManifestPlugin';
const fs = require('fs');
const path = require('path');
const Domains = require('./domains.js');

class ManifestPlugin {
    buildManifest(mode, outputDir) {
        var manifest = require('./manifest.json');
        if (mode !== 'production') {
            process.stdout.write('relaxed dev security policy...');
            manifest['content_security_policy'] = "script-src 'self' 'unsafe-eval'; object-src 'self'";
        } else {
            manifest.background.scripts.unshift('ga_tracking_id.js');
        }
        manifest.permissions.push(...Domains.toRegex(Domains.all));
        fs.writeFileSync(path.resolve(outputDir, 'manifest.json'), JSON.stringify(manifest));
        process.stdout.write('Done\n');
    }

    apply(compiler) {
        compiler.hooks.afterEmit.tap(pluginName, compilation => {
            process.stdout.write('Building manifest...');
            const options = compilation.options;
            this.buildManifest(options.mode, options.output.path);
        });
    }
}

module.exports = ManifestPlugin;
