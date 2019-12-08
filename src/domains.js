const parseDomain = require('parse-domain');

var bot_domains=[
    "wsj.com",
    "theathletic.com"
]

var cookie_domains=[
    "nytimes.com",
    "washingtonpost.com",
    "wired.com",
    "bloomberg.com"
]

var js_domains=[
    "nytimes.com",
    "latimes.com",
    "sfchronicle.com",
    "economist.com"
]

var all_domains = joinDomains([
    cookie_domains,
    bot_domains,
    js_domains,
    "businessinsider.com"
]);

function joinDomains(domains) {
    domains = domains.map((el) => {
        if (!Array.isArray(el) && typeof el == 'object' && el != null) {
            return Object.keys(el);
        }
        return el;
    });
    domains = domains.flat();
    var set = new Set();
    var all = [];
    for (var i = 0; i < domains.length; ++i) {
        set.add(domains[i]);
    }
    return Array.from(set);
}

function domainToRegex(domain) {
    return "*://*." + domain + "/*";
}

//eg bot_sites to
//    *://*.wsj.com/*
function domainsToRegex(domains) {
    var arr = [];
    for (var i = 0; i < domains.length; ++i) {
        arr.push(domainToRegex(domains[i]));
    }
    return arr;
}

function toRegex(domains) {
    if (!Array.isArray(domains)) {
        return domainToRegex(domains);
    } else {
        return domainsToRegex(domains);
    }
}

function fromUrl(url) {
    if (!url) {
        return null;
    }
    var hostname = new URL(url).hostname;
    var parsed = parseDomain(hostname);
    if (!parsed) {
        return null;
    }
    return parsed.domain + '.' + parsed.tld;
}

module.exports = {
    bots: bot_domains,
    cookies: cookie_domains,
    js: js_domains,
    all: all_domains,
    fromUrl,
    toRegex
}
