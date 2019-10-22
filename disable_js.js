console.log('i am here!!!!');


var javascript_enabled = true;
var tabToUrlMap = {};

/*
function clear_changes_listener(details) {
    clear_changes();
}

function add_clear_changes_listener() {
    chrome.webNavigation.onBeforeNavigate.addListener(clear_changes_listener,
                                                      {url: [{hostSuffix: "nytimes.com"}, {hostSuffix: "washingtonpost.com"}]});
    console.log('add listener');
}

function remove_clear_changes_listener() {
    chrome.webNavigation.onBeforeNavigate.removeListener(clear_changes_listener);
    console.log('remove listener');
}
*/

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
    if (!javascript_enabled) {
        clear_changes();
        //add_clear_changes_listener();
    }
}, {url: [{hostSuffix: "nytimes.com"}, {hostSuffix: "washingtonpost.com"}]});

chrome.pageAction.onClicked.addListener(function(tab) {
    var hostname = new URL(tab.url).hostname;
    if (hostname.includes('nytimes')) {
        disable_nytimes();
        chrome.tabs.reload(tab.id);
    } else if (hostname.includes('washingtonpost')) {
        var last_url = tabToUrlMap[tab.id];
        disable_washingtonpost(() => {
            if (last_url) {
                chrome.tabs.update(tab.id, {url: last_url});
            } else {
                chrome.tabs.reload(tab.id)
            }
        });
        /*var last_url = tabToUrlMap[tab.id];
        if (last_url) {
            chrome.tabs.update(tab.id, {url: last_url});
        } else {
            chrome.tabs.reload(tab.id);
        }*/
    }
});

function clear_changes() {
    console.log('enable javascript');
    chrome.contentSettings.javascript.clear({});
    javascript_enabled = true;
}

function disable_nytimes(callback) {
    console.log('disable javascript');
    disable_javascript("https://*.nytimes.com/*");
    remove_cookies(".nytimes.com", callback);
}

function disable_washingtonpost(callback) {
    remove_cookies(".washingtonpost.com", callback);
}

function disable_javascript(url_pattern) {
    javascript_enabled = false;
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
