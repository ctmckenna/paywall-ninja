var bypass = false;
var tabToUrlMap = {};

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
}, {url: [
    {hostSuffix: "nytimes.com"},
    {hostSuffix: "washingtonpost.com"},
    {hostSuffix: "wsj.com"}
]});

chrome.webRequest.onBeforeSendHeaders.addListener(function(details) {
    if (!bypass) {
        return;
    }
    var requestHeaders = details.requestHeaders;
    removeHeaders(requestHeaders, ['Referer', 'User-Agent', 'X-Forwarded-For']);
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
    urls: ["*://*.wsj.com/*"]
}, ["blocking", "requestHeaders"]);

chrome.pageAction.onClicked.addListener(function(tab) {
    var hostname = new URL(tab.url).hostname;
    if (hostname.includes('nytimes')) {
        bypass = true;
        disable_nytimes();
        chrome.tabs.reload(tab.id);
    } else if (hostname.includes('washingtonpost')) {
        bypass = true;
        var last_url = tabToUrlMap[tab.id];
        disable_washingtonpost(() => {
            reloadTab(tab, last_url);
        });
    } else if (hostname.includes('wsj')) {
        bypass = true;
        disable_wsj(() => {
            chrome.tabs.reload(tab.id);
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

function disable_nytimes(callback) {
    disable_javascript("https://*.nytimes.com/*");
    remove_cookies(".nytimes.com", callback);
}

function disable_wsj(callback) {
    remove_cookies(".wsj.com", callback);
}

function disable_washingtonpost(callback) {
    remove_cookies(".washingtonpost.com", callback);
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
        Promise.all(promises).then(() => {
            if (callback) {
                callback();
            }
        });
    });
}

function open(tab) {
    var hostname = new URL(tab.url).hostname;
    var pattern = "*://" + hostname + "/*";
    chrome.contentSettings.javascript.set({
        "primaryPattern": hostname,
        "setting": "block"
    });
    chrome.cookies.getAll({
        "domain": hostname
    }, function (cookies) {
        for (var i = 0; i < cookies.length; ++i) {
            var cookie = cookies[i];
            chrome.cookies.remove({
                url: "https://" + cookie.domain + cookie.path,
                name: cookie.name
            });
        }
    });
}

/*
var patterns = ["https://*.nytimes.com/*"];
for (var i = 0; i < patterns.length; ++i) {
    chrome.contentSettings.javascript.set({
        "primaryPattern": patterns[i],
        "setting": "block"
    });
}
Var domains = [".nytimes.com", ".washingtonpost.com"];
for (var i = 0; i < domains.length; ++i) {
    chrome.cookies.getAll({
        "domain": domains[i]
    }, function (cookies) {
        for (var i = 0; i < cookies.length; ++i) {
            var cookie = cookies[i];
            chrome.cookies.remove({
                url: "https://" + cookie.domain + cookie.path,
                name: cookie.name
            });
        }
    });

}
*/
