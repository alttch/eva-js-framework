# JavaScript Framework for EVA ICS

Universal JavaScript Framework for [EVA ICS](https://www.eva-ics.com/) - open
source platform for home and industrial IoT.

The library works both in web browsers and Node.js.

## Installation

### For web browsers

Download

Framework only:

https://raw.githubusercontent.com/alttch/eva-js-framework/master/dist/eva.framework.min.js

Framework with chart and other utility functions:

https://raw.githubusercontent.com/alttch/eva-js-framework/master/dist/eva.min.js

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
// $eva.debug = true;

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

## Watching states and performing API calls

```javascript
// watch example. Each item can have multiple watchers, masks '*' are possible.

$eva.watch('unit:tests/unit1', function(state) {
      document.getElementById('u').innerHTML = state.status?'ON':'OFF';
    });

// action example

document.getElementById('u').addEventListener('click', function() {
  $eva.call('action_toggle', 'unit:tests/unit1', { w: 30 })
    then(function(data) {
      console.log('action completed, uuid: ' + data.uuid)
    }).catch(function(err) {
      console.log('action failed, code: ' + err.code + ', ' + err.message);
    });
```

Any [EVA ICS API method](https://www.eva-ics.com/doc) can be called. Methods
are called with JSON RPC.

Function *call* returns Promise object, on success = API call result, on error
= object with props:

* **code** error code (equal to EVA ICS API client error codes)
* **message** error message
* **data** full server response

## Calling API methods

All API methods are called with *call* function:

```javascript
    *$eva.call('action', 'unit:tests/lamp1', { s: 1 })
    // or 
    *$eva.call('action', { i: 'unit:tests/lamp1', s: 1 })
```

If first parameter is a string, it's automatically set to "i" argument of API
request.

## Setting intervals

Intervals are set by *interval* method, e.g. *$eva.interval("reload", 5)*,
value means seconds. Available intervals:

* **ajax_reload** reload item states when working in AJAX mode
* **ajax_log_reload** reload server log records when working in AJAX mode
* **heartbeat** server heartbeat interval
* **reload** force reload items when working in web socket mode.
* **restart** interval between automatic restart attempts.

## Handling events

Event handlers are set by *on(event, func)* and fired on:

* **login.success** successful login
* **login.failed** login failure
* **ws.event** WebSocket event. If handler return false, event is skipped by
  framework.
* **server.reload** server asked clients to reload UI
* **server.restart** server is being restarting
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
* **apikey** API key
* **api_uri** API URI (don't need to be set if working in web browser)
* **set_auth_cookies** if true (default), *auth* cookie is used to store API
  token.

### Item processing, special

* **debug** if true, Framework enters debug mode and everything's logged to
  console.

* **global_cvars** if true (default), all server cvars are set as globals.

* **log.records** set max. log records to retrieve from the server.

* **state_updates** Possible values:
  * true (default) - get states of all items API key has access to
  * {'p': [types], 'g': [groups]} - subscribe to specified types and groups
  * false - disable state updates

* **ws_mode** use web sockets. Set automatically if WebSocket object is
  detected, can be set to "false" manually before framework start.

### Read-only

* **version** Framework version (also available as *eva_framework_version* in
  browsers)
* **api_token** current API token
* **authorized_user** current authorized user
* **logged_in** boolean, set to true when user is logged in
* **ws** Framework web socket object
* **log.level** current log level of records to retrieve from the server.
* **log_level_nwmes** dictionary of log level names (code: name)
* **server_info** contains actual server info (output of API *test* method)
* **tsdiff** time difference between client and server

## Framework functions

* **start()** start Framework and log in
* **restart()** restart Framework (default handler for heartbeat error)
* **stop(keep_auth** stop Framework. If keep_auth is set to true, logout API
  method is not called.
* **erase_token_cookies()** should be called when login window is displayed to
  make sure auth cookies are cleared.
* **log_start(log_level)** start processing of server logs
* **log_level(log_level)** change log level of records read from the server
* **status**, **value**, **state** get item state by oid
* **expires_in** get lvar expiration time in seconds

## Server custom variables

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

* **ctx** html <canvas /> element or id to generate QR code in
* **params** object with additional parameters:
  * size - QR code size in px (default: 200px)
  * url - override UI url (default: document.location)
  * user - override user (default: authorized_user)
  * password - override (or exclude) password

Example:

```javascript
  $eva.hiQR('evaccqr', {password: null});
```
