'use strict';

const eva_sfa_framework_version = '0.1.0';

var inProcess = typeof process !== 'undefined' && process.title != 'browser';

if (inProcess) {
  var fetch = require('node-fetch');
  var WebSocket = require('ws');
}

class EVA {
  constructor() {
    this.version = eva_sfa_framework_version;
    this.login = '';
    this.password = '';
    this.apikey = '';
    this.set_auth_cookies = true;
    this.api_token = '';
    this.authorized_user = null;
    this.logged_in = false;
    this.api_uri = '';
    this.debug = false;
    // login.success, login.failed, ws.event, server.reload, server.restart,
    // heartbeat.success, heartbeat.error, log.record, log.postprocess
    this._handlers = {'heartbeat.error': this.restart};
    this._intervals = {
      ajax_reload: 2,
      log_reload: 2,
      ajax_log_reloader: 2,
      reload: 5,
      heartbeat: 5,
      restart: 1
    };
    this.state_updates = true;
    try {
      this.ws_mode = WebSocket ? true : false;
    } catch (err) {
      this.ws_mode = false;
    }
    this.ws = null;
    this.log = {
      level: 20,
      records: 200
    };
    this._popup_active = null;
    this._popup_tick_closer = null;
    this._popup_key_listener = null;
    this.log_level_names = {
      10: 'DEBUG',
      20: 'INFO',
      30: 'WARNING',
      40: 'ERROR',
      50: 'CRITICAL'
    };
    this._heartbeat_reloader = null;
    this._ajax_reloader = null;
    this._log_reloader = null;
    this._clear();
    this._update_state_functions = [];
    this._update_state_mask_functions = [];
  }

  _clear() {
    this.server_info = null;
    this.tsdiff = null;
    this._states = [];
    this._cvars = {};
    this._log_subscribed = false;
    this._log_first_load = true;
    this._log_loaded = false;
    this._log_started = false;
    this._lr2p = [];
    this._last_ping = null;
    this._last_pong = null;
  }

  log_start(log_level) {
    this._log_started = true;
    if (log_level !== undefined) {
      this.log.level = log_level;
    }
    if (!this.ws_mode || this._log_first_load) {
      this._log_loaded = false;
      this._load_log_entries(true);
      if (!this.ws_mode) {
        var me = this;
        this._log_reloader = setInterval(function() {
          me._load_log_entries(false, me);
        }, this._intervals.log_reload * 1000);
      }
    }
  }

  start() {
    this._debug('framework', `version: ${this.version}`);
    try {
      var f = fetch;
    } catch (err) {
      var f = null;
    }
    if (!f) {
      eva_log_error(
        '"fetch" function is unavailable. Upgrade your web browser or ' +
          'connect polyfill (lib/polyfill/fetch.js)'
      );
      return false;
    }
    if (this.logged_in) {
      this._debug('start', 'already logged in');
      return true;
    }
    this._last_ping = null;
    this._last_pong = null;
    var q = {};
    if (this.apikey) {
      q = {k: this.apikey};
      this._debug('start', 'logging in with API key');
    } else if (this.password) {
      q = {u: this.login, p: this.password};
      this._debug('start', 'logging in with password');
    } else if (this.set_auth_cookies) {
      var token = eva_read_cookie('auth');
      if (token) {
        q = {a: token};
        this._debug('start', 'logging in with auth token');
      } else {
        this._debug('start', 'logging in without credentials');
      }
    }
    var me = this;
    var user;
    this._api_call('login', q)
      .then(function(data) {
        me.api_token = data.token;
        user = data.user;
        me._set_token_cookie();
        return Promise.all([
          me._load_states(),
          me._heartbeat(me, true),
          me._start_ws()
        ]);
      })
      .then(function() {
        if (!me.ws_mode) {
          if (me._ajax_reloader) {
            clearInterval(me._ajax_reloader);
          }
          me._ajax_reloader = setInterval(function() {
            me._load_states(me)
              .then(function() {})
              .catch(function(err) {});
          }, me._intervals.ajax_reload * 1000);
        } else {
          if (me._ajax_reloader) {
            clearInterval(me._ajax_reloader);
          }
          if (me._intervals.reload) {
            me._ajax_reloader = setInterval(function() {
              me._load_states(me)
                .then(function() {})
                .catch(function(err) {});
            }, me._intervals.reload * 1000);
          }
        }
        if (me._heartbeat_reloader) {
          clearInterval(me._heartbeat_reloader);
        }
        me._heartbeat_reloader = setInterval(function() {
          me._heartbeat(me)
            .then(function() {})
            .catch(function() {});
        }, me._intervals.heartbeat * 1000);
        me._debug('start', `login successful, user: ${user}`);
        me.logged_in = true;
        me.authorized_user = user;
        eva_invoke_handler(me, 'login.success');
      })
      .catch(function(err) {
        me.logged_in = false;
        if (err.code === undefined) {
          err.code = 4;
          err.message = 'Unknown error';
        }
        me._debug('start', `login failed: ${err.code} ${err.message})`);
        me._stop_engine();
        me.erase_token_cookie();
        eva_invoke_handler(me, 'login.failed', err);
      });
    return true;
  }

  restart() {
    this._debug('restart', 'performing restart');
    var me = this;
    this.stop()
      .then(function() {
        me._schedule_restart();
      })
      .catch(function() {
        me._schedule_restart();
      });
  }

  _schedule_restart() {
    var me = this;
    setTimeout(function() {
      me.start();
    }, me._intervals.restart * 1000);
  }

  erase_token_cookie() {
    this.api_token = '';
    this.authorized_user = null;
    this._set_token_cookie();
  }

  call(func, p1, p2) {
    var params;
    if (typeof p1 === 'string' || Array.isArray(p1)) {
      params = eva_extend({}, p2);
      params['i'] = p1;
    } else {
      params = p1;
    }
    var p = this._prepare_call_params(params);
    return this._api_call(func, p);
  }

  _uuidv4() {
    var dt = new Date().getTime();
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(
      c
    ) {
      var r = (dt + Math.random() * 16) % 16 | 0;
      dt = Math.floor(dt / 16);
      return (c == 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
    return uuid;
  }

  _api_call(func, params) {
    var id = this._uuidv4();
    var api_uri = this.api_uri + '/jrpc';
    var me = this;
    this._debug('_api_call', `${id}: ${api_uri}: ${func}`);
    return new Promise(function(resolve, reject) {
      var payload = {
        jsonrpc: '2.0',
        method: func,
        params: params,
        id: id
      };
      fetch(api_uri, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        redirect: 'error',
        body: JSON.stringify(payload)
      })
        .then(function(response) {
          if (response.ok) {
            me._debug('_api_call', id + ' success');
            response
              .json()
              .then(function(data) {
                if (
                  !'id' in data ||
                  data.id != id ||
                  (!'result' in data && !'error' in data)
                ) {
                  reject({
                    code: 9,
                    message: 'Invalid server response',
                    data: data
                  });
                } else if ('error' in data) {
                  me._debug(
                    '_api_call',
                    `${id} failed: ${data.error.code} (${data.error.message})`
                  );
                  reject({
                    code: data.error.code,
                    message: data.error.message,
                    data: data
                  });
                } else {
                  resolve(data.result);
                }
              })
              .catch(function(err) {
                var code = 9;
                var message = 'Invalid server response';
                me._debug('_api_call', `${id} failed: ${code} (${message})`);
                reject({
                  code: code,
                  message: message,
                  data: data
                });
              });
          } else {
            var code = 7;
            var message = 'Server error';
            me._debug('_api_call', `${id} failed: ${code} (${message})`);
            reject({code: code, message: message, data: data});
          }
        })
        .catch(function(err) {
          var code = 7;
          var message = 'Server error';
          me._debug('_api_call', `${id} failed: ${code} (${message})`);
          reject({code: code, message: message, data: null});
        });
    });
  }

  _heartbeat(me, on_login) {
    return new Promise(function(resolve, reject) {
      if (on_login) me._last_ping = null;
      var q = {};
      if (on_login) {
        q['icvars'] = 1;
      }
      if (me.ws_mode) {
        if (me._last_ping !== null) {
          if (
            me._last_pong === null ||
            me._last_ping - me._last_pong > me._intervals.heartbeat
          ) {
            me._debug('heartbeat', 'error: ws ping timeout');
            eva_invoke_handler(me, 'heartbeat.error');
          }
        }
        if (!on_login && me.ws) {
          me._last_ping = Date.now() / 1000;
          try {
            me._debug('heartbeat', 'ws ping');
            me.ws.send(JSON.stringify({s: 'ping'}));
          } catch (err) {
            me._debug('heartbeat', 'error: unable to send ws ping');
            eva_invoke_handler(me, 'heartbeat_error', err);
            reject();
            return;
          }
        }
      }
      me.call('test', q)
        .then(function(data) {
          me.server_info = data;
          me.tsdiff = new Date().getTime() / 1000 - data.time;
          if (on_login) {
            if (data['cvars']) {
              me._cvars = data['cvars'];
              Object.keys(data['cvars']).map(function(k) {
                if (typeof global !== 'undefined')
                  eval(`global.${k}="${data['cvars'][k]}"`);
                if (typeof window !== 'undefined')
                  eval(`window.${k}="${data['cvars'][k]}"`);
              });
            } else {
              me._cvars = {};
            }
          }
          eva_invoke_handler(me, 'heartbeat.success');
          resolve(true);
        })
        .catch(function(err) {
          me._debug('heartbeat', 'error: unable to send test API call');
          eva_invoke_handler(me, 'heartbeat.error', err);
        });
      me._debug('heartbeat', 'ok');
    });
  }

  on(handler, func) {
    this._handlers[handler] = func;
    this._debug('on', 'setting handler for ' + handler);
  }

  interval(i, value) {
    this._intervals[i] = value;
  }

  cvar(name) {
    return this._cvars[name];
  }

  watch(oid, func) {
    if (!oid.includes('*')) {
      if (!(oid in this._update_state_functions)) {
        this._update_state_functions[oid] = [];
      }
      this._update_state_functions[oid].push(func);
      var state = this.state(oid);
      if (state !== undefined) func(state);
    } else {
      if (!(oid in this._update_state_mask_functions)) {
        this._update_state_mask_functions[oid] = [];
      }
      this._update_state_mask_functions[oid].push(func);
      var v = this.state(oid);
      if (Array.isArray(v)) {
        v.map(func);
      } else {
        func(v);
      }
    }
  }

  /**
   * get item status
   *
   * @param oid - item id in format type:full_id, e.g. sensor:env/temp1
   *
   * @returns object status(int) or undefined if no object found
   */
  status(oid) {
    var state = this.state(oid);
    if (state === undefined || state === null) return undefined;
    return state.status;
  }

  /**
   * get item value
   *
   * @param oid - item id in format type:full_id, e.g. sensor:env/temp1
   *
   * @returns object value (null, string or numeric if possible)
   * or undefined if no object found
   */
  value(oid) {
    var state = this.state(oid);
    if (state === undefined || state === null) return undefined;
    if (Number(state.value) == state.value) {
      return Number(state.value);
    } else {
      return state.value;
    }
  }

  /**
   * get item state
   *
   * @param oid - item id in format type:full_id, e.g. sensor:env/temp1
   *
   * @returns object state or undefined if no object found
   */
  state(oid) {
    if (!oid.includes('*')) {
      if (oid in this._states) {
        return this._states[oid];
      } else {
        return undefined;
      }
    }
    var result = [];
    Object.keys(this._states).map(function(k) {
      if (eva_oid_match(k, oid)) {
        result.push(this._states[k]);
      }
    }, this);
    return result;
  }

  /**
   * get lvar expiration time left
   *
   * @param lvar_id - item id in format type:full_id, e.g. lvar:timers/timer1
   *
   * @returns - seconds to expiration, -1 if expired, -2 if stopped
   */
  expires_in(lvar_id) {
    // get item
    var i = this.state((lvar_id.startsWith('lvar:') ? '' : 'lvar:') + lvar_id);
    // if no such item
    if (i === undefined) return undefined;
    // if item has no expiration or expiration is set to zero
    if (i.expires === undefined || i.expires == 0) return null;
    // if no timestamp diff
    if (this.tsdiff == null) return undefined;
    // if timer is disabled (stopped), return -2
    if (i.status == 0) return -2;
    // if timer is expired, return -1
    if (i.status == -1) return -1;
    var t = i.expires - new Date().getTime() / 1000 + this.tsdiff + i.set_time;
    if (t < 0) t = 0;
    return t;
  }

  stop() {
    var me = this;
    return new Promise(function(resolve, reject) {
      me._stop_engine();
      me.logged_in = false;
      me.call('logout')
        .then(function() {
          me.erase_token_cookie();
          resolve();
        })
        .catch(function(err) {
          me.erase_token_cookie();
          reject(err);
        });
    });
  }

  _load_log_entries(postprocess, me) {
    if (!me) var me = this;
    if (me.ws_mode) me._lr2p = [];
    me.call('log_get', {
      l: me.log.level,
      n: me.log.records
    })
      .then(function(data) {
        if (me.ws_mode && me._log_first_load) {
          me._set_ws_log_level(me.log.level);
        }
        data.map(function(l) {
          eva_invoke_handler(me, 'log.record', l);
        });
        me._log_loaded = true;
        me._lr2p.map(function(l) {
          eva_invoke_handler(me, 'log.record', l);
        });
        if (postprocess) {
          eva_invoke_handler(me, 'log.postprocess');
        }
        me._log_first_load = false;
      })
      .catch(function(err) {
        eva_log_error('unable to load log entries');
      });
  }

  _stop_engine() {
    this._clear();
    if (this._heartbeat_reloader) {
      clearInterval(this._heartbeat_reloader);
      this._heartbeat_reloader = null;
    }
    if (this._ajax_reloader) {
      clearInterval(this._ajax_reloader);
      this._ajax_reloader = null;
    }
    if (this._log_reloader) {
      clearInterval(this._log_reloader);
      this._log_reloader = null;
    }
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.onerror = function() {};
        //this.ws.send(JSON.stringify({s: 'bye'}));
        this.ws.close();
      } catch (err) {
        // web socket may be still open, will close later
        var ws = this.ws;
        setTimeout(function() {
          try {
            ws.close();
          } catch (err) {}
        }, 1000);
      }
    }
  }

  _prepare_call_params(params) {
    var p = params ? params : {};
    if (this.api_token) {
      p['k'] = this.api_token;
    }
    return p;
  }

  _set_token_cookie() {
    if (this.set_auth_cookies && !inProcess) {
      ['/ui', '/pvt', '/rpvt'].map(function(uri) {
        document.cookie = 'auth=' + this.api_token + '; path=' + uri;
      }, this);
    }
  }

  _load_states(me) {
    if (!me) var me = this;
    return new Promise(function(resolve, reject) {
      if (!me.state_updates) {
        resolve(true);
      } else {
        var params = {};
        if (me.state_updates !== true) {
          var groups = me.state_updates['g'];
          var tp = me.state_updates['p'];
          if (groups) {
            params['g'] = groups;
          }
          if (tp) {
            params['p'] = tp;
          }
        }
        me.call('state_all', params)
          .then(function(data) {
            data.map(function(state) {
              me._process_state(state);
            });
            resolve(true);
          })
          .catch(function(err) {
            reject(err);
          });
      }
    });
  }

  _start_ws() {
    var me = this;
    return new Promise(function(resolve, reject) {
      if (me.ws_mode) {
        var uri;
        if (!me.api_uri) {
          var loc = window.location;
          if (loc.protocol === 'https:') {
            uri = 'wss:';
          } else {
            uri = 'ws:';
          }
          uri += '//' + loc.host;
        } else {
          uri = me.api_uri;
        }
        me.ws = new WebSocket(`${uri}/ws?k=${me.api_token}`);
        me.ws.onmessage = function(evt) {
          me._process_ws(evt);
        };
        me.ws.addEventListener('open', function(event) {
          me._debug('_start_ws', 'ws connected');
          var st;
          if (me.state_updates) {
            st = {s: 'state'};
            if (me.state_updates !== true) {
              var groups = me.state_updates['g'];
              if (!groups) {
                groups = '#';
              }
              var tp = me.state_updates['p'];
              if (!tp) {
                tp = '#';
              }
              st['g'] = groups;
              st['tp'] = tp;
              st['i'] = [];
            }
          }
          if (st) {
            me.ws.send(JSON.stringify(st));
          }
          if (me._log_subscribed) {
            me.log_level(me.log.level);
          }
        });
      }
      resolve(true);
    });
  }

  log_level(log_level) {
    this.log.level = log_level;
    this._set_ws_log_level(log_level);
    this._load_log_entries(true);
  }

  _set_ws_log_level(l) {
    this._log_subscribed = true;
    try {
      if (this.ws) this.ws.send(JSON.stringify({s: 'log', l: l}));
    } catch (err) {
      this._debug('log_level', 'warning: unable to send ws packet');
    }
  }

  _process_ws(evt) {
    var data = JSON.parse(evt.data);
    if (data.s == 'pong') {
      this._debug('ws', 'pong');
      this._last_pong = Date.now() / 1000;
      return;
    }
    if (data.s == 'reload') {
      this._debug('ws', 'reload');
      return eva_invoke_handler(this, 'server.reload');
    }
    if (data.s == 'server' && data.d == 'restart') {
      this._debug('ws', 'server_restart');
      return eva_invoke_handler(this, 'server.restart');
    }
    if (eva_invoke_handler(this, 'ws.event', data) === false) return;
    if (data.s == 'state') {
      this._debug('ws', 'state');
      if (Array.isArray(data.d)) {
        data.d.map(function(state) {
          this._process_state(state);
        }, this);
      } else {
        this._process_state(data.d);
      }
      return;
    }
    if (data.s == 'log') {
      if (Array.isArray(data.d)) {
        data.d.map(function(l) {
          this._preprocess_log_record(l);
        }, this);
      } else {
        this._preprocess_log_record(data.d);
      }
      eva_invoke_handler(this, 'log.postprocess');
      return;
    }
  }

  _preprocess_log_record(l) {
    if (!this._log_loaded) {
      this._lr2p.push(l);
    } else {
      eva_invoke_handler(this, 'log.record', l);
    }
  }

  _process_state(state) {
    var z = [];
    var x = [];
    try {
      var oid = state.oid;
      // copy missing fields from old state
      if (oid in this._states) {
        var old_state = this._states[oid];
        z = '';
        Object.keys(old_state).map(function(k) {
          if (!(k in state)) {
            state[k] = old_state[k];
          }
        });
      }
      this._states[oid] = state;
      if (!eva_cmp(state, old_state)) {
        this._debug(
          'process_state',
          `${oid} s: ${state.status} v: ${state.value}`
        );
        if (oid in this._update_state_functions) {
          this._update_state_functions[oid].map(function(f) {
            try {
              if (typeof f === 'string' || f instanceof String) {
                eval(f);
              } else {
                f(state);
              }
            } catch (err) {
              eva_log_error(`state function processing for ${oid}:`, err);
            }
          });
        }
        Object.keys(this._update_state_mask_functions).map(function(k) {
          if (eva_oid_match(oid, k)) {
            this._update_state_mask_functions[k].map(function(f) {
              try {
                if (typeof f === 'string' || f instanceof String) {
                  eval(f);
                } else {
                  f(state);
                }
              } catch (err) {
                eva_log_error(`state function processing for ${oid}:`, err);
              }
            });
          }
        }, this);
      }
    } catch (err) {
      eva_log_error('State processing error, invalid object received', err);
    }
  }

  _debug(method) {
    if (this.debug) {
      eva_log_debug.apply(
        null,
        ['EVA::' + method].concat([].slice.call(arguments, 1))
      );
    }
  }
}

function eva_invoke_handler(obj, handler) {
  var f = obj._handlers[handler];
  if (f) {
    if (obj.debug) eva_log_debug('eva_sfa::invoking handler for ' + handler);
    try {
      if (typeof f === 'string') {
        return eval(f);
      } else if (typeof f === 'function') {
        return f.apply(obj, [].slice.call(arguments, 2));
      }
    } catch (err) {
      eva_log_error(`handler for ${handler}:`, err);
    }
  }
}

function eva_read_cookie(name) {
  var nameEQ = name + '=';
  var ca = document.cookie.split(';');
  for (var i = 0; i < ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

function eva_extend() {
  var extended = {};
  var deep = false;
  var i = 0;
  var length = arguments.length;
  if (Object.prototype.toString.call(arguments[0]) === '[object Boolean]') {
    deep = arguments[0];
    i++;
  }
  var merge = function(obj) {
    for (var prop in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, prop)) {
        if (
          deep &&
          Object.prototype.toString.call(obj[prop]) === '[object Object]'
        ) {
          extended[prop] = eva_extend(true, extended[prop], obj[prop]);
        } else {
          extended[prop] = obj[prop];
        }
      }
    }
  };
  for (; i < length; i++) {
    var obj = arguments[i];
    merge(obj);
  }
  return extended;
}

function eva_cmp(a, b) {
  if (a === undefined || b === undefined) {
    return false;
  }
  var a_props = Object.getOwnPropertyNames(a);
  var b_props = Object.getOwnPropertyNames(b);
  if (a_props.length != b_props.length) {
    return false;
  }
  for (var i = 0; i < a_props.length; i++) {
    var prop_name = a_props[i];
    if (!Array.isArray(a[prop_name]) && a[prop_name] !== b[prop_name]) {
      return false;
    }
  }
  return true;
}

function eva_oid_match(oid, mask) {
  return new RegExp('^' + mask.split('*').join('.*') + '$').test(oid);
}

function eva_log_debug() {
  console.log.apply(null, Array.from(arguments));
}

function eva_log_warning(msg) {
  console.log.apply(
    null,
    [(inProcess ? '' : '%c') + 'WARNING: ' + msg].concat(
      [inProcess ? '' : 'color: orange; font-weight: bold; font-size: 14px;'],
      [].slice.call(arguments, 1)
    )
  );
}

function eva_log_error(msg) {
  console.log.apply(
    null,
    [(inProcess ? '' : '%c') + 'ERROR: ' + msg].concat(
      [inProcess ? '' : 'color: red; font-weight: bold; font-size: 14px;'],
      [].slice.call(arguments, 1)
    )
  );
}

if (typeof exports !== 'undefined') {
  exports.EVA = EVA;
} else {
  var $eva = new EVA();
}
