window.ninja = window.ninja || {}
const GA_CLIENT_KEY = 'ga:clientId';
var analyticsReadyPromise = new Promise((resolve, reject) => {
    fetch_client_id()
        .then(create_ga_tracker)
        .then(save_client_id)
        .then(resolve);
});

function create_ga_tracker(clientId) {
    var createOptions = {
        storage: 'none',
        storeGac: false
    }
    if (clientId) {
        createOptions['clientId'] = clientId;
    }
    if (ninja.GA_TRACKING_ID) {
        ga('create', ninja.GA_TRACKING_ID, createOptions);
    } else {
        console.log('Skip creating google analytics (dev)');
    }
    ga('set', 'checkProtocolTask', function(){ /* nothing */ });
    return new Promise((resolve, reject) => {
        ga(function(tracker) {
            resolve(tracker.get('clientId'));
        });
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

function save_client_id(clientId) {
    console.log('saving client id: ' + clientId);
    chrome.storage.local.set({
        GA_CLIENT_KEY: clientId
    });
}

chrome.runtime.onInstalled.addListener(function (details) {
    analyticsReadyPromise.then(() => {
        ga('send', 'event', 'Install', details.reason, details.reason);
    });
});

function logBypass(domain) {
    ga('send', 'event', 'Bypass', domain, domain);
}

function logAttempt(domain) {
    ga('send', 'event', 'Attempt', domain, domain);
}

module.exports = {
    logBypass,
    logAttempt
}
