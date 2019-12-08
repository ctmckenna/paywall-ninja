const Domains = require('./domains');
const Analytics = require('./analytics');

var bypass = false;
var tabToUrlMap = {};
var tabToListeners = {};
var optionalPermissions = [];
var attemptBypassMap = {};
var bypassDispatch = [tryBypassPassively, tryBypassAggressively];
var bypassTitles = ['Attempt to break this paywall 🤞', 'Try bypassing another way 🤷', "Create an issue on github to support this site"];

var bypassContextMenuItemId = chrome.contextMenus.create({
    title: bypassContextMenuItemTitle(),
    contexts: ["page_action"],
    onclick: request_permission_and_bypass_site
});


function appendTabToListeners(tabId, listener) {
    var listeners = tabToListeners[tabId] || [];
    listeners.push(listener);
    tabToListeners[tabId] = listeners;
}

function request_permission_and_bypass_site(info, tab) {
    var domain = Domains.fromUrl(tab.url);
    if (!domain) {
        return;
    }
    var permission = {
        origins: [Domains.toRegex(domain)]
    };
    chrome.permissions.request(permission, function(granted) {
        if (granted) {
            optionalPermissions.push(permission);
            dispatchToBypass(tab, domain);
        }
    });
}

function bypassContextMenuItemTitle(tab) {
    var idx = bypassIdx(tab);
    return bypassTitles[idx];
}

function bypassContextMenuItemEnabled(tab) {
    var idx = bypassIdx(tab);
    return idx < bypassDispatch.length;
}

function updateContextMenuItemTitle(tabId) {
    chrome.tabs.get(tabId, function(tab) {
        chrome.contextMenus.update(bypassContextMenuItemId, {
            title: bypassContextMenuItemTitle(tab),
            enabled: bypassContextMenuItemEnabled(tab)
        });
    });
}

chrome.tabs.onActivated.addListener(function(details) {
    updateContextMenuItemTitle(details.tabId);
    chrome.tabs.get(details.tabId, function(tab) {
        var domain = Domains.fromUrl(tab.url);
        if (domain && Domains.all.includes(domain)) {
            chrome.pageAction.show(tab.id);
        }
    });
});

function bypassIdx(tab) {
    if (tab && attemptBypassMap[tab.id]) {
        return attemptBypassMap[tab.id]['next'];
    }
    return 0;
}

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

function dispatchToBypass(tab, domain) {
    var idx = bypassIdx(tab);
    bypassDispatch[idx](tab, domain);
    attemptBypassMap[tab.id] = {'url': tab.url, 'next': idx + 1};
    updateContextMenuItemTitle(tab.id);
    listenOnce(chrome.webNavigation.onBeforeNavigate, function(details) {
        if (details.frameId !== 0) {
            return false;
        }
        if (details.tabId === tab.id && Domains.fromUrl(details.url) != null && details.url !== tab.url) {
            delete attemptBypassMap[tab.id];
            return true;
        }
        updateContextMenuItemTitle(details.tabId);
        return false;//dont remove
    });
}

function tryBypassPassively(tab, domain) {
    ga('send', 'event', 'Attempt', 'Passive', domain);
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
    ga('send', 'event', 'Attempt', 'Aggressive', domain);
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
    ga('send', 'event', 'Bypass', domain, domain);

    var promises = [Promise.resolve()];
    var urlToLoad = null;
    if (Domains.cookies.includes(domain)) {
        promises.push(remove_cookies("." + domain));
        promises.push(clear_localstorage(tab));
    }
    if (Domains.js.includes(domain)) {
        disable_javascript(domain.toRegex(domain));
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

