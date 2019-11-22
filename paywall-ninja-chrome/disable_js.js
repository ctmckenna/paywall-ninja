var bypass = false;
var tabToUrlMap = {};

var bot_domains=[
    "wsj.com",
    "theathletic.com"
]

var cookie_domains=[
    "nytimes.com",
    "washingtonpost.com"
]

var js_domains=[
    "nytimes.com",
    "latimes.com"
]

var all_domains = joinDomains([cookie_domains, bot_domains, js_domains])

function joinDomains(domains) {
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

function domainsToHostSuffixFilter(domains) {
    var filter = [];
    for (var i = 0; i < domains.length; ++i) {
        filter.push({
            hostSuffix: domains[i]
        });
    }
    return filter;
}

function saveWashingtonPostUrl(tab) {
    if (!tab || !tab.url) {
        return;
    }
    var pathname = new URL(tab.url).pathname;
    if (!pathname || pathname == '/') {
        return;
    }
    tabToUrlMap[tab.id] = tab.url;
}

chrome.webNavigation.onBeforeNavigate.addListener(function(details) {
    chrome.tabs.get(details.tabId, saveWashingtonPostUrl);
}, {url: [{hostSuffix: "washingtonpost.com"}]});

chrome.webNavigation.onCompleted.addListener(function(details) {
    chrome.pageAction.show(details.tabId);
    if (bypass) {
        clear_changes();
        bypass = false;
    }
}, {url: domainsToHostSuffixFilter(all_domains)});

chrome.webRequest.onBeforeSendHeaders.addListener(function(details) {
    if (!bypass) {
        return;
    }
    var requestHeaders = details.requestHeaders;
    removeHeaders(requestHeaders, ['User-Agent', 'X-Forwarded-For']);
    requestHeaders.push({
        name: 'User-Agent',
        value: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
    });
    requestHeaders.push({
        name: 'X-Forwarded-For',
        value: '66.249.66.2'
    });
    return { requestHeaders: requestHeaders };
}, {
    urls: domainsToRegex(bot_domains)
}, ["blocking", "requestHeaders"]);

chrome.pageAction.onClicked.addListener(function(tab) {
    var hostname = new URL(tab.url).hostname;
    var domain = all_domains.find(d => hostname.includes(d));
    var promises = [];
    var urlToLoad = null;
    if (cookie_domains.includes(domain)) {
        promises.push(remove_cookies("." + domain, () => promise.resolve()))
    }
    if (bot_domains.includes(domain)) {
        promises.push(Promise.resolve());
    }
    if (js_domains.includes(domain)) {
        disable_javascript(domainToRegex(domain));
        promises.push(Promise.resolve());
    }
    if (domain === 'washingtonpost.com') {
        urlToLoad = tabToUrlMap[tab.id];
    }
    if (promises.length > 0) {
        Promise.all(promises).then(() => {
            bypass = true;
            reloadTab(tab, urlToLoad);
        });
    }
});

function removeHeaders(headers, headerNames) {
    for (var i = 0; i < headers.length;) {
        var header = headers[i];
        if (headerNames.includes(header.name)) {
            headers.splice(i, 1);
        } else {
            ++i;
        }
    }
}

function reloadTab(tab, url) {
    if (url) {
        chrome.tabs.update(tab.id, {url: url});
    } else {
        chrome.tabs.reload(tab.id);
    }
}

function clear_changes() {
    chrome.contentSettings.javascript.clear({});
}

function disable_javascript(url_pattern) {
    chrome.contentSettings.javascript.set({
        "primaryPattern": url_pattern,
        "setting": "block"
    });
}

function remove_cookies(domain, callback) {
    chrome.cookies.getAll({
        "domain": domain
    }, function (cookies) {
        var promises = [];
        for (var i = 0; i < cookies.length; ++i) {
            var cookie = cookies[i];
            var promise = new Promise((resolve, reject) => {
                var domain = cookie.domain;
                if (domain.startsWith(".")) {
                    domain = domain.substring(1);
                }
                var url = "http" + (cookie.secure ? "s" : "") + "://" + domain + cookie.path;
                chrome.cookies.remove({
                    url: url,
                    name: cookie.name
                }, (details) => {
                    if (details == null) {
                        console.log(chrome.runtime.lastError);
                    } else {
                        resolve();
                    }
                });
            });
            promises.push(promise);
        }
        return Promise.all(promises);
    });
}
