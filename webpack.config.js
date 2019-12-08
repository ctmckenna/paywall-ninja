const path = require('path');
const ManifestPlugin = require('./src/manifest_plugin.js');

module.exports = {
    mode: 'production',
    entry: './src/background.js',
    output: {
        filename: 'background.js',
        path: path.resolve(__dirname, 'paywall-ninja-chrome'),
    },
    plugins: [
        new ManifestPlugin(),
    ]
};
