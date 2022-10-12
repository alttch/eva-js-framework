# JavaScript Framework for EVA ICS

JavaScript Framework for [EVA
ICS](https://www.bohemia-automation.com/software/eva4/) - open source platform
for industrial and home IoT.

The library works both in web browsers and Node.js.

* Download: https://pub.bma.ai/eva-js-framework/

* Source code: https://github.com/alttch/eva-js-framework

* NPM packages: [Framework](https://www.npmjs.com/package/@eva-ics/framework),
  [Toolbox](https://www.npmjs.com/package/@eva-ics/toolbox)

## Installation

### For web browsers

Download from https://pub.bma.ai/eva-js-framework/ or
https://github.com/alttch/eva-js-framework/releases

Framework only: *eva.framework.min.js*

Framework with chart and other utility functions: *eva.min.js*

### For Node.js

```bash
  npm i @eva-ics/framework
  // additional utility functions
  npm i @eva-ics/toolbox
```

Description of utility functions can be found in
[EVA ICS toolbox](https://www.npmjs.com/package/@eva-ics/toolbox) help.

## Examples

### Initialization

Init (for Node.js):

```javascript
eva_framework = require('@eva-ics/framework');

// default object
$eva = eva_framework.$eva;

// or for multiple targets
// $eva = new eva_framework.EVA();
```

Init (for web browsers):

```html
  <script src="eva.framework.min.js"></script>
```

### Configuration

```javascript
$eva.login = 'operator';
$eva.password = '123';

// not required for web browsers
$eva.api_uri = 'http://localhost:8828';

// turn on debug mode
// $eva.debug = 1;

$eva.on('login.success', function() {
  // called when login is successful, states and server info are loaded
});

$eva.on('login.failed', function(err) {
  // do some stuff
  console.log('LOGIN FAILED');
  // login failed not due to invalid credentials - will retry soon
  if (err.code != 2) {
    setTimeout(function(){$eva.start()}, 2000);
  }
});

// start framework and log in
$eva.start();
```

Note: for EVA ICS v4, the framework must be forcibly switched to the new API
version:

```javascript
$eva.api_version = 4;
```

## Watching states and performing API calls

```javascript
// watch example. Each item can have multiple watchers, masks '*' are possible.

$eva.watch('unit:tests/unit1', function(state) {
      document.getElementById('u').innerHTML = state.status?'ON':'OFF';
    });

// action example
document.getElementById('u').addEventListener('click', function() {
  $eva.call('action_toggle', 'unit:tests/unit1', { w: 30 }
    ).then(function(data) {
      console.log('action sent to server, uuid: ' + data.uuid)
      // watch action result
      $eva.watch_action(data.uuid, function(action) {
        if (action.uuid) {
            if (action.finished) {
                console.log('action is finished, status: ' + action.status);
            }
        } else {
            console.log('server error');
        }
      });
    }).catch(function(err) {
      console.log('action failed, code: ' + err.code + ', ' + err.message);
    });
```

Any EVA ICS API method can be called. Methods are called with JSON RPC.

Function *call* returns Promise object, on success = API call result, on error
= object with props:

* **code** error code (equal to EVA ICS API client error codes)
* **message** error message
* **data** full server response

## Calling API methods

All API methods are called with *call* function:

```javascript
    $eva.call('action', 'unit:tests/lamp1', { s: 1 })
    // or 
    $eva.call('action', { i: 'unit:tests/lamp1', s: 1 })
```

If first parameter is a string, it's automatically set to "i" argument of API
request.

## Setting intervals

Intervals are set by *interval* method, e.g. *$eva.interval("reload", 5)*,
value means seconds. Available intervals:

* **action_watch** action result watcher interval
* **ajax_reload** reload item states when working in AJAX mode
* **ajax_log_reload** reload server log records when working in AJAX mode
* **heartbeat** server heartbeat interval
* **reload** force reload items when working in web socket mode.
* **restart** interval between automatic restart attempts.
* **ws_buf_ttl** group WebSocket events in buffers with the desired TTL (sec)

## Handling events

Event handlers are set by *on(event, func)* and fired on:

* **login.success** successful login
* **login.failed** login failure
* **login.otp_required** OTP code is required for login
* **login.otp_invalid** OTP code is provided but invalid
* **login.otp_setup** OTP setup is required, the parameter contains OTP secret
* **ws.event** WebSocket event. If handler return false, event is skipped by
  framework.
* **server.reload** server asked clients to reload UI
* **server.restart** server is being restarted
* **server.EVENT** other server events
* **supervisor.EVENT** supervisor events (message, lock, unlock)
* **heartbeat.success** successful heartbeat
* **heartbeat.error** heartbeat error (default: *$eva.restart*)
* **log.record** new log record to toss
* **log.postprocess** log processing is finished (e.g. scroll viewer down)

Each event can have only one handler. Methods *call* and *stop* return
*Promise* objects.

## Class variables

Class variables are get and set directly, e.g. *$eva.login = "operator";*

### API and Authentication

Authentication variables should set before *start()* method is called - either
login/password or apikey. If there is *auth* cookie set, API token variable is
filled by framework automatically.

* **login** user login
* **password** user password
* **xopts** extra login options (EVA ICS v4 only)
* **apikey** API key
* **client_id** Report custom client id to the server (e.g. a custom-defined ID
  of the current UI page)
* **api_uri** API URI (don't need to be set if working in web browser)
* **set_auth_cookies** if true (default), *auth* cookie is used to store API
  token.
* **set_readonly** ask server to set the current API token to read-only (EVA
  ICS 3.3.2+)
* **set_normal** ask server to return the current API token to normal (EVA ICS
  3.3.2+)

### Item processing, special

* **debug** enable debug mode (1), enable verbose debug mode (2)

* **global_cvars** if true (default), all server cvars are set as globals (EVA ICS v3).

* **log.records** set max. log records to retrieve from the server.

* **state_updates** Possible values:

  * true (default) - get states of all items API key has access to

  * {'p': [types], 'g': [groups]} - (V3) subscribe to specified types and groups

  * [ 'oidmask1', 'oidmask2' ] - (v4) specified subscriptions for EVA ICS v4 (e.g. 'sensor:env/#')

  * false - disable state updates

* **ws_mode** use web sockets. Set automatically if WebSocket object is
  detected, can be set to "false" manually before framework start.

* **clear_unavailable** if true, item state is set to null, if the one is no
  longer available on the back-end (default: false).

### Read-only

* **version** Framework version (also available as *eva_framework_version* in
  browsers)
* **api_token** current API token
* **authorized_user** current authorized user
* **logged_in** boolean, set to true when user is logged in
* **ws** Framework web socket object
* **log.level** current log level of records to retrieve from the server
* **log_level_names** dictionary of log level names (code: name)
* **in_evaHI** true if framework runs in evaHI-based web client
* **server_info** contains actual server info (output of API *test* method)
* **tsdiff** time difference between client and server

## Framework functions

* **start()** start Framework and log in

* **restart()** restart Framework (default handler for heartbeat error)

* **stop(keep_auth)** stop Framework. If keep_auth is set to true, logout API
  method is not called.

* **erase_token_cookies()** should be called when login window is displayed to
  make sure auth cookies are cleared.

* **log_start(log_level)** start processing of server logs

* **log_level(log_level)** change log level of records read from the server

* **status(oid)**, **value(oid)**, **state(oid)** get item state by oid

* **expires_in** get lvar expiration time in seconds

* **unwatch(oid, func)** stop watching item. If item oid or function is not
  specified, all watching functions are removed for a single oid (mask) or for
  all

* **parse_svc_message(msg)** parses string-encoded service messages, returning
  object with fields *kind*, *svc*, *message*, *value* or null if the message
  is invalid.

## Server custom variables (EVA ICS v3)

All defined CVARs are set as globals after successful log in. CVARs can be also
read with method

```javascript
var myCVAR = $eva.cvar('myCVAR');
```

## QR code for evaHI-based apps

Method *hiQR* generates QR code for evaHI-compatible apps (e.g. for EVA ICS
Control Center mobile app for Android). Current framework session must be
authorized using user login. If $eva.password is defined, QR code also contain
password value.

Parameters:

* **ctx** html canvas element or id to generate QR code in
* **params** object with additional parameters:
  * size - QR code size in px (default: 200px)
  * url - override UI url (default: document.location)
  * user - override user (default: authorized_user)
  * password - override (or exclude) password

Example:

```javascript
  $eva.hiQR('evaccqr', {password: null});
```

## QR code for OTP

Method *otpQR* generates QR code for OTP authenticators (e.g. Google
Authenticator or Microsoft Authenticator).

Parameters:

* **ctx** html canvas element or id to generate QR code in
* **params** object with additional parameters:
  * size - QR code size in px (default: 200px)
  * issuer - override issuer (default: HMI document.location.hostname)
  * user - override user (default: $eva.login)
  * xtr - extra parameters (added as-is)

## Multi-page interfaces, external authentication

### Primary page

If multi-page navigation contains links back to the main page, it should
perform a single authentication attempt to re-use existing token:

```javascript
    var first_time_login = true;

    $eva.on('login.failed', function(err) {
      if (err.code == 2) {
        // show login window
        if (first_time_login) {
          first_time_login = false;
        } else {
          // display err.message
        }
      } else {
        // handle server error
      }
    });
```

The same method is used when client can authenticate itself with basic
authentication on front-end sever or uses [EVA ICS Smartphone
application](/eva4/evahi.rst).

### Secondary pages

By default, the interface should be programmed in a single HTML/J2 document
*ui/index.html* or *ui/index.j2*, however sometimes it's useful to split parts
of the interface to different html page files.

Each HTML document should initialize/login SFA framework to access its
functions. However if *eva_sfa_set_auth_cookies* is set to *true*, the
secondary page can log in user with the existing token:

```javascript
    $eva.on('login.failed', function(err) {
        // token is invalid or expired, redirect user to main page
        document.location = '/ui/';
    }
```

## Authentication with front-end server

If you have front-end server installed before UI and it handles HTTP basic
authentication, you can leave **$eva.login** and **$eva.password** variables
empty and let framework log in without them.

In this case authorization data will be parsed by SFA server from Authorization
HTTP header (front-end server should pass it as-is to back-end SFA).
