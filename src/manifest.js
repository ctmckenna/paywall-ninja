#!/usr/bin/env node

const config = require('../webpack.config.js');
const path = require('path');
const fs = require('fs');
const argv = require('yargs').argv

var mode = argv.mode;
if (mode == null) {
    mode = 'production';
}

var manifest = {
    "name": "Paywall Ninja",
    "manifest_version": 2,
    "version": "1.7",
    "description": "Click emoji to bypass newspaper paywalls",
    "permissions": [
        "contentSettings",
        "cookies",
        "webNavigation",
        "webRequest",
        "webRequestBlocking",
        "storage",
        "contextMenus",
        "*://*.nytimes.com/*",
        "*://*.washingtonpost.com/*",
        "*://*.theathletic.com/*",
        "*://*.wsj.com/*",
        "*://*.latimes.com/*",
        "*://*.sfchronicle.com/*",
        "*://*.economist.com/*",
        "*://*.wired.com/*",
        "*://*.businessinsider.com/*",
        "*://*.bloomberg.com/*",

        //problematic scripts
        "*://*.tinypass.com/*.js"
    ],
    "optional_permissions": [
        "*://*/"
    ],
    "background": {
        "scripts": ["analytics.js", "ninja-dist.js", "background.js"],
        "persistent": true
    },
    "page_action": {
        "default_icon": {
            "16": "emoji16.png",
            "48": "emoji48.png",
            "128": "emoji128.png"
        },
        "default_title": "Click to bypass paywall"
    },
    "icons" : {
        "16": "emoji16.png",
        "48": "emoji48.png",
        "128": "emoji128.png"
    }
};
if (mode !== 'production') {
    manifest['content_security_policy'] = "script-src 'self' 'unsafe-eval'; object-src 'self'";
}

const manifest_filename = path.resolve(__dirname, '../paywall-ninja-chrome/manifest.json')
fs.writeFileSync(manifest_filename, JSON.stringify(manifest, null, 4));


require('child_process').fork('node webpack --mode='+mode);
