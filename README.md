JavaScript Framework for EVA ICS
================================

Universal JavaScript Framework for [EVA ICS](https://www.eva-ics.com/) open
source platform for home and industrial IoT.

The library works both in web browsers and Node.js.

Installation
============

For web browsers
----------------

Download
https://raw.githubusercontent.com/alttch/eva-js-framework/master/dist/eva.min.js

For Node.js
-----------

```bash
  npm i @eva-ics/framework
```

Examples
========

Initialization
--------------

Init (for Node.js):

```javascript
$eva = new eva_sfa.EVA();
```

Init (for web browsers):

```html
  <script src="eva.min.js"></script>
```

Configuration
-------------

```javascript
$eva.login = 'operator';
$eva.password = '123';

// not required for web browsers
$eva.api_uri = http://localhost:8828'; 

// turn on debug mode
// $eva.debug = true;

$eva.on('login.success', function() {
  // called when login is successful, states and server info are loaded
}

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

Watching states and performing API calls
----------------------------------------

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

Function return Promise object, on success = API call result, on error = object
with props:

* **code** error code
* **message** error message
* **data** full server response

Handling events
---------------

Event handlers are fired on:

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

Class variables
---------------

Description is coming soon.
