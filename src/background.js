const Domains = require('./domains');
const Analytics = require('./analytics');

var bypass = false;
var tabToUrlMap = {};
var tabToListeners = {};
var optionalPermissions = [];
var bypassContextMenuItemId = chrome.contextMenus.create({
    title: 'Attempt to break this paywall 🤞',
    contexts: ["page_action"]
});
chrome.contextMenus.create({
    title: '🍪 Clear site data',
    parentId: bypassContextMenuItemId,
    contexts: ["page_action"],
    onclick: bypassOnClick(tryBypassPassively)
});
chrome.contextMenus.create({
    title: '🛑 Disable javascript',
    parentId: bypassContextMenuItemId,
    contexts: ["page_action"],
    onclick: bypassOnClick(tryBypassAggressively)
});


function appendTabToListeners(tabId, listener) {
    var listeners = tabToListeners[tabId] || [];
    listeners.push(listener);
    tabToListeners[tabId] = listeners;
}

function requestBypassPermission(tab) {
    return new Promise((resolve, reject) => {
        var domain = Domains.fromUrl(tab.url);
        if (!domain) {
            reject();
        }
        var permission = {
            origins: [Domains.toRegex(domain)]
        };
        chrome.permissions.request(permission, function(granted) {
            if (granted) {
                optionalPermissions.push(permission);
                resolve(domain);
            } else {
                reject();
            }
        });
    });
}

function bypassOnClick(bypassFn) {
    return (info, tab) => {
        requestBypassPermission(tab).then((domain) => {
            bypassFn(tab, domain);
        });
    };
}

chrome.tabs.onActivated.addListener(function(details) {
    chrome.tabs.get(details.tabId, function(tab) {
        if (!tab) return;
        var domain = Domains.fromUrl(tab.url);
        if (domain && Domains.all.includes(domain)) {
            chrome.pageAction.show(tab.id);
        }
    });
});

function listenOnce(objectToListenOn, listener) {
    var self = {fn: null};
    var wrapper = (details) => {
        if (listener(details)) {
            objectToListenOn.removeListener(self.fn);
        }
    };
    self.fn = wrapper;
    objectToListenOn.addListener(wrapper);
}

function tryBypassPassively(tab, domain) {
    Analytics.logAttempt(domain);
    var promises = [];
    promises.push(remove_cookies("." + domain));
    promises.push(clear_localstorage(tab));
    bypass_as_google_bot(tab.id, domain);

    setupNavigationCompletedForBypassAttempt(tab, domain);
    Promise.all(promises).then(() => {
        bypass = true;
        reloadTab(tab);
    });
}

function setupNavigationCompletedForBypassAttempt(tab, domain) {
    var completedListener = (details) => navigationCompletedListener(details);
    setupNavigationCompleted([domain], completedListener);
    appendTabToListeners(tab.id, completedListener);
}

function tryBypassAggressively(tab, domain) {
    Analytics.logAttempt(domain);
    var promises = [];
    promises.push(remove_cookies("." + domain));
    promises.push(clear_localstorage(tab));
    bypass_as_google_bot(tab.id, domain);
    disable_javascript(Domains.toRegex(domain));

    setupNavigationCompletedForBypassAttempt(tab, domain);
    Promise.all(promises).then(() => {
        bypass = true;
        reloadTab(tab);
    });
}

function bypass_as_google_bot(tabId, domain) {
    var listener = (details) => modifyToGoogleBotHeaders(details);
    setup_bot([domain], listener);
    appendTabToListeners(tabId, listener);
}

function domainsToHostSuffixFilter(domains) {
    var filter = [];
    if (typeof domains === 'string') {
        domains = [domains];
    }
    for (var domain of domains) {
        filter.push({
            hostSuffix: domain
        });
    }
    return filter;
}

function saveWashingtonPostUrl(tabId, url) {
    if (!tabId || !url) {
        return;
    }
    var pathname = new URL(url).pathname;
    if (!pathname || pathname == '/') {
        return;
    }
    tabToUrlMap[tabId] = url;
}

chrome.webNavigation.onBeforeNavigate.addListener(function(details) {
    if (details.tabId && details.frameId === 0) {
        saveWashingtonPostUrl(details.tabId, details.url);
    }
}, {url: domainsToHostSuffixFilter("washingtonpost.com")});

function navigationCompletedListener(details) {
    if (bypass) {
        clear_changes(details.tabId);
        bypass = false;
    }
}

function setupNavigationCompleted(domains, listener) {
    chrome.webNavigation.onCompleted.addListener(listener, {
        url: domainsToHostSuffixFilter(domains)
    });
}

setupNavigationCompleted(Domains.all, navigationCompletedListener);
setupNavigationCompleted(Domains.all, (details) => chrome.pageAction.show(details.tabId));

function modifyToGoogleBotHeaders(details) {
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
}

function setup_bot(domains, listener) {
    chrome.webRequest.onBeforeSendHeaders.addListener(listener, {
        urls: Domains.toRegex(domains)
    }, ["blocking", "requestHeaders"]);
}

setup_bot(Domains.bots, modifyToGoogleBotHeaders);

chrome.webRequest.onBeforeSendHeaders.addListener(function(details) {
    if (!bypass) {
        return;
    }
    return { cancel: true };
}, {
    urls: ["*://*.tinypass.com/*.js"]
}, ["blocking"]);

chrome.pageAction.onClicked.addListener(function(tab) {
    var hostname = new URL(tab.url).hostname;
    var domain = Domains.all.find(d => hostname.includes(d));
    Analytics.logBypass(domain);

    var promises = [Promise.resolve()];
    var urlToLoad = null;
    if (Domains.cookies.includes(domain)) {
        promises.push(remove_cookies("." + domain));
        promises.push(clear_localstorage(tab));
    }
    if (Domains.js.includes(domain)) {
        disable_javascript(Domains.toRegex(domain));
    }
    if (domain === 'washingtonpost.com') {
        urlToLoad = tabToUrlMap[tab.id];
    }
    Promise.all(promises).then(() => {
        bypass = true;
        reloadTab(tab, urlToLoad);
    });
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

function clear_changes(tabId) {
    chrome.contentSettings.javascript.clear({});
    var listeners = tabToListeners[tabId] || [];
    listeners.forEach(listener => {
        if (chrome.webRequest.onBeforeSendHeaders.hasListener(listener)) {
            chrome.webRequest.onBeforeSendHeaders.removeListener(listener);
        } else if (chrome.webNavigation.onCompleted.hasListener(listener)) {
            chrome.webNavigation.onCompleted.removeListener(listener);
        }
    });
    delete tabToListeners[tabId];
    optionalPermissions.forEach(permission => {
        chrome.permissions.remove(permission);
    });
}

function disable_javascript(url_pattern) {
    chrome.contentSettings.javascript.set({
        "primaryPattern": url_pattern,
        "setting": "block"
    });
}

function clear_localstorage(tab) {
    return new Promise((resolve, reject) => {
        chrome.tabs.executeScript(tab.id, {
            code: "window.localStorage.clear()",
            allFrames: true
        }, function() {
            resolve();
        });
    });
}

function remove_cookies(domain) {
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

