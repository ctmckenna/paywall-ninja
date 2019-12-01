var GA_CLIENT_KEY = 'ga:clientId';

var analyticsReadyPromise = new Promise((resolve, reject) => {
    fetch_client_id()
        .then(create_ga_tracker)
        .then(save_client_id)
        .then(resolve);
});

var bypass = false;
var tabToUrlMap = {};
var tabToListeners = {};
var optionalPermissions = []

var bot_domains=[
    "wsj.com",
    "theathletic.com"
]

var cookie_domains=[
    "nytimes.com",
    "washingtonpost.com",
    "wired.com"
]

var js_domains=[
    "nytimes.com",
    "latimes.com",
    "sfchronicle.com",
    "economist.com"
]

var all_domains = joinDomains([cookie_domains, bot_domains, js_domains])

chrome.contextMenus.create({
    title: "Attempt to break this paywall 🤞",
    contexts: ["page_action"],
    onclick: request_permission_and_bypass_site
});

function appendTabToListeners(tabId, listener) {
    var listeners = tabToListeners[tabId] || [];
    listeners.push(listener);
    tabToListeners[tabId] = listeners;
}

function request_permission_and_bypass_site(info, tab) {
    var hostname = new URL(tab.url).hostname;
    var parsed = ninja.parseDomain(hostname);
    if (!parsed) {
        return;
    }
    var domain = parsed.domain + '.' + parsed.tld;
    var permission = {
        origins: [domainToRegex(domain)]
    };
    chrome.permissions.request(permission, function(granted) {
        if (granted) {
            optionalPermissions.push(permission);
            try_bypass_site(tab, domain);
        }
    });
}

function try_bypass_site(tab, domain) {
    ga('send', 'event', 'Attempt', domain, domain);
    var promises = [];
    promises.push(remove_cookies("." + domain));
    disable_javascript(domainToRegex(domain));
    bypass_as_google_bot(tab.id, domain);

    var completedListener = (details) => navigationCompletedListener(details);
    setupNavigationCompleted([domain], completedListener);
    appendTabToListeners(tab.id, completedListener);

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

function create_ga_tracker(clientId) {
    var createOptions = {
        storage: 'none',
        storeGac: false
    }
    if (clientId) {
        createOptions['clientId'] = clientId;
    }
    ga('create', 'UA-39947032-2', createOptions);
    ga('set', 'checkProtocolTask', function(){ /* nothing */ });
    return new Promise((resolve, reject) => {
        ga(function(tracker) {
            resolve(tracker.get('clientId'));
        });
    });
}

function save_client_id(clientId) {
    console.log('saving client id: ' + clientId);
    chrome.storage.local.set({
        GA_CLIENT_KEY: clientId
    });
}

function fetch_client_id() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get([GA_CLIENT_KEY], function(result) {
            var clientId = result[GA_CLIENT_KEY];
            console.log('fetched client id: ' + clientId);
            resolve(clientId);
        });
    });
}

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
    if (chrome.runtime.lastError) {
        ga('send', 'event', 'Error', 'Tab', chrome.runtime.lastError.message);
    }
    if (!tab || !tab.url) {
        return;
    }
    var pathname = new URL(tab.url).pathname;
    if (!pathname || pathname == '/') {
        return;
    }
    tabToUrlMap[tab.id] = tab.url;
}

chrome.runtime.onInstalled.addListener(function (details) {
    analyticsReadyPromise.then(() => {
        ga('send', 'event', 'Install', details.reason, details.reason);
    });
});

chrome.webNavigation.onBeforeNavigate.addListener(function(details) {
    chrome.tabs.get(details.tabId, saveWashingtonPostUrl);
}, {url: [{hostSuffix: "washingtonpost.com"}]});

function navigationCompletedListener(details) {
    if (!tabToListeners[details.tabId]) {
        //show pageAction on supported domains
        chrome.pageAction.show(details.tabId);
    }
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

setupNavigationCompleted(all_domains, navigationCompletedListener);

function modifyToGoogleBotHeaders(details) {
    if (!bypass) {
        return;
    }
    console.log('modifying headers');
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
        urls: domainsToRegex(domains)
    }, ["blocking", "requestHeaders"]);
}

setup_bot(bot_domains, modifyToGoogleBotHeaders);

chrome.pageAction.onClicked.addListener(function(tab) {
    var hostname = new URL(tab.url).hostname;
    var domain = all_domains.find(d => hostname.includes(d));
    ga('send', 'event', 'Bypass', domain, domain);

    var promises = [];
    var urlToLoad = null;
    if (cookie_domains.includes(domain)) {
        promises.push(remove_cookies("." + domain));
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
