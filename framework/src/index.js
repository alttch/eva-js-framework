"use strict";

const eva_framework_version = "0.3.24";

(() => {
  if (typeof window !== "undefined") {
    var fetch = window.fetch;
    var WebSocket = window.WebSocket;
  } else if (typeof process !== "undefined" && process.title !== "browser") {
    var fetch = require("node-fetch");
    var WebSocket = require("ws");
  }

  const jsaltt = require("@altertech/jsaltt");
  const cookies = require("@altertech/cookies");

  const QRious = require("qrious");

  class EVA {
    constructor() {
      this.version = eva_framework_version;
      this.login = "";
      this.password = "";
      this.apikey = "";
      this.api_uri = "";
      this.set_auth_cookies = true;
      this.global_cvars = true;
      this.api_token = "";
      this.authorized_user = null;
      this.logged_in = false;
      this.debug = false;
      this.state_updates = true;
      this.clear_unavailable = false;
      this.ws_mode = typeof WebSocket !== "undefined";
      this.ws = null;
      this.client_id = null;
      this.in_evaHI =
        typeof navigator !== "undefined" &&
        navigator.userAgent &&
        navigator.userAgent.startsWith("evaHI ");
      this.log = {
        level: 20,
        records: 200
      };
      this._handlers = { "heartbeat.error": this.restart };
      this._intervals = {
        ajax_reload: 2,
        ajax_log_reload: 2,
        action_watch: 0.5,
        heartbeat: 5,
        reload: 5,
        restart: 1,
        ws_buf_ttl: 0
      };
      this.log_level_names = {
        10: "DEBUG",
        20: "INFO",
        30: "WARNING",
        40: "ERROR",
        50: "CRITICAL"
      };
      this._heartbeat_reloader = null;
      this._ajax_reloader = null;
      this._log_reloader = null;
      this._scheduled_restarter = null;
      this._action_watch_functions = [];
      this._action_states = {};
      this._clear();
      this.clear_watchers();
    }

    clear_watchers() {
      this._update_state_functions = [];
      this._update_state_mask_functions = [];
    }

    _clear_states() {
      this._states = [];
    }

    _clear() {
      this.clear_watchers();
      this._clear_states();
      this.server_info = null;
      this.tsdiff = null;
      this._cvars = {};
      this._log_subscribed = false;
      this._log_first_load = true;
      this._log_loaded = false;
      this._log_started = false;
      this._lr2p = [];
      this._last_ping = null;
      this._last_pong = null;
    }

    /**
     * start Framework API
     * After calling the function will authenticate user, open WebSocket (in
     * case of WS mode) or schedule AJAX refresh interval.
     */
    start() {
      this._cancel_scheduled_restart();
      this._debug("framework", `version: ${this.version}`);
      if (typeof fetch === "undefined") {
        jsaltt.logger.error(
          '"fetch" function is unavailable. Upgrade your web browser or ' +
            "connect polyfill"
        );
        return false;
      }
      if (this.logged_in) {
        this._debug("start", "already logged in");
        return true;
      }
      this._last_ping = null;
      this._last_pong = null;
      var q = {};
      if (this.apikey) {
        q = { k: this.apikey };
        this._debug("start", "logging in with API key");
      } else if (this.password) {
        q = { u: this.login, p: this.password };
        this._debug("start", "logging in with password");
      } else if (this.set_auth_cookies) {
        var token = cookies.read("auth");
        if (token) {
          q = { a: token };
          this._debug("start", "logging in with auth token");
        } else {
          this._debug("start", "logging in without credentials");
        }
      }
      var me = this;
      var user;
      this._api_call("login", q)
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
          me._debug("start", `login successful, user: ${user}`);
          me.logged_in = true;
          me.authorized_user = user;
          me._invoke_handler("login.success");
        })
        .catch(function(err) {
          me.logged_in = false;
          if (err.code === undefined) {
            err.code = 4;
            err.message = "Unknown error";
          }
          me._debug("start", `login failed: ${err.code} (${err.message})`);
          me._stop_engine();
          me.erase_token_cookie();
          me._invoke_handler("login.failed", err);
        });
      return true;
    }

    /**
     * start log processing
     *
     * Starts log processing. Framework class must be already logged in.
     *
     * @param log_level - log processing level (optional)
     */
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
          }, this._intervals.ajax_log_reload * 1000);
        }
      }
    }

    /**
     * change log processing level
     *
     * @param log_level - log processing level
     */
    log_level(log_level) {
      this.log.level = log_level;
      this._set_ws_log_level(log_level);
      this._load_log_entries(true);
    }

    /**
     * restart Framework API
     * e.g. used on heartbeat error
     */
    restart() {
      this._cancel_scheduled_restart();
      this._debug("restart", "performing restart");
      var me = this;
      this.stop(true)
        .then(function() {
          me._schedule_restart();
        })
        .catch(function() {
          me._schedule_restart();
        });
    }

    /**
     * erase auth token cookie
     *
     * It's recommended to call this function when login form is displayed to
     * prevent old token caching
     */
    erase_token_cookie() {
      this.api_token = "";
      this.authorized_user = null;
      this._set_token_cookie();
    }

    /**
     * call API function
     *
     * Calls any available SFA API function
     *
     * @param arguments - item OID (if required), API call params
     *
     * @returns - Promise object
     */
    call(func, p1, p2) {
      var params;
      if (typeof p1 === "string" || Array.isArray(p1)) {
        params = jsaltt.extend({}, p2);
        params["i"] = p1;
      } else {
        params = p1;
      }
      var p = this._prepare_call_params(params);
      return this._api_call(func, p);
    }

    /**
     * ask server to set the token read-only (e.g. after idle)
     *
     * (EVA ICS 3.3.2+)
     *
     * the current mode can be obtained from $eva.server_info.aci.token_mode
     */
    set_readonly() {
      var me = this;
      return new Promise(function(resolve, reject) {
        me.call("set_token_readonly")
          .then(function(data) {
            me.server_info.aci.token_mode = "readonly";
            resolve(data);
          })
          .catch(function(err) {
            reject(err);
          });
      });
    }

    /**
     * ask server to return the token to normal mode
     *
     * (EVA ICS 3.3.2+)
     */
    set_normal(u, p) {
      var q = {};
      var user;
      if (u === undefined) {
        user = "";
      } else {
        user = u;
      }
      if (p === undefined || p === null) {
        q = { k: user };
      } else {
        q = { u: user, p: p };
      }
      q["a"] = this.api_token;
      var me = this;
      return new Promise(function(resolve, reject) {
        me._api_call("login", q)
          .then(function(data) {
            me.server_info.aci.token_mode = "normal";
            resolve(data);
          })
          .catch(function(err) {
            reject(err);
          });
      });
    }

    /**
     * Set event handler function. One event can have one handler only
     *
     * @param event - event, possible values:
     *           login.success, login.failed, ws.event, server.reload,
     *           server.restart, heartbeat.success, heartbeat.error, log.record,
     *           log.postprocess
     * @param func - function called on event
     */
    on(event, func) {
      this._handlers[event] = func;
      this._debug("on", "setting handler for " + event);
    }

    /**
     * Set intervals
     *
     * @param i - interval, possible values:
     *            ajax_reload, heartbeat, log_reload, reload, restart
     * @param value - interval value (in seconds)
     */
    interval(i, value) {
      this._intervals[i] = value;
    }

    /**
     * Get server CVAR
     *
     * All CVARs are also available as globals
     *
     * @param name - cvar name
     *
     */
    cvar(name) {
      return this._cvars[name];
    }

    /**
     * watch item state updates
     *
     * Registers the function to be called in case of state change event (or at
     * first state load).
     *
     * If state is already loaded, function will be called immediately. One item
     * (or item mask, set with *) can have multiple watchers.
     *
     * @param oid - item oid (e.g. sensor:env/temp1, or sensor:env/*)
     * @param func - function to be called
     *
     */
    watch(oid, func) {
      if (!oid.includes("*")) {
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
     * watch action state by uuid
     *
     * Registers the function to be called in case of action status change
     * event (or at first state load).
     *
     * If status is already loaded, function will be called immediately.
     * Otherwise status is polled from the server with "action_watch" interval
     * (default: 500ms).
     *
     * There's no unwatch function as watching is stopped as soon as action is
     * completed (or server error is occurred)
     *
     * @param uuid - action uuid
     * @param func - function to be called
     *
     */
    watch_action(uuid, func) {
      if (uuid in this._action_watch_functions) {
        this._action_watch_functions[uuid].push(func);
        if (uuid in this._action_states) {
          func(this._action_states[uuid]);
        }
      } else {
        this._action_watch_functions[uuid] = [];
        this._action_watch_functions[uuid].push(func);
        var me = this;
        var watcher = function() {
          me.call("result", { u: uuid })
            .then(function(result) {
              if (
                !me._action_states[uuid] ||
                me._action_states[uuid].status != result.status
              ) {
                me._action_states[uuid] = result;
                me._action_watch_functions[uuid].map((f) => f(result));
              }
              if (result.finished) {
                delete me._action_watch_functions[uuid];
                delete me._action_states[uuid];
              } else {
                setTimeout(watcher, me._intervals.action_watch);
              }
            })
            .catch(function(err) {
              me._action_watch_functions[uuid].map((f) => f(err));
              delete me._action_watch_functions[uuid];
              delete me._action_states[uuid];
            });
        };
        setTimeout(watcher, this._intervals.action_watch);
      }
    }

    /**
     * Stop watching item state updates
     *
     * If item oid or function is not specified, all watching functions are
     * removed for a single oid (mask) or for all.
     *
     * @param oid - item oid (e.g. sensor:env/temp1, or sensor:env/*)
     * @param func - function to be removed
     */
    unwatch(oid, func) {
      if (!oid) {
        this._update_state_functions = [];
        this._update_state_mask_functions = [];
      } else if (!oid.includes("*")) {
        if (oid in this._update_state_functions) {
          if (func) {
            this._update_state_functions[oid] = this._update_state_functions[
              oid
            ].filter((el) => el !== func);
          } else {
            delete this._update_state_functions[oid];
          }
        }
      } else {
        if (oid in this._update_state_mask_functions) {
          if (func) {
            this._update_state_mask_functions[
              oid
            ] = this._update_state_mask_functions[oid].filter(
              (el) => el !== func
            );
          } else {
            delete this._update_state_mask_functions[oid];
          }
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
      if (!oid.includes("*")) {
        if (oid in this._states) {
          return this._states[oid];
        } else {
          return undefined;
        }
      }
      var result = [];
      Object.keys(this._states).map(function(k) {
        if (this._oid_match(k, oid)) {
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
      var i = this.state(
        (lvar_id.startsWith("lvar:") ? "" : "lvar:") + lvar_id
      );
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
      var t =
        i.expires - new Date().getTime() / 1000 + this.tsdiff + i.set_time;
      if (t < 0) t = 0;
      return t;
    }

    /**
     * stop Framework API
     * After calling the function will close open WebSocket if available,
     * clear all the refresh intervals then try to close server session
     *
     * @param keep_auth - keep authentication cookies and token (e.g. on
     * restart)
     *
     * @returns - Promise object
     */
    stop(keep_auth) {
      var me = this;
      return new Promise(function(resolve, reject) {
        me._stop_engine();
        me.logged_in = false;
        if (keep_auth) {
          resolve();
        } else {
          me.call("logout")
            .then(function() {
              me.erase_token_cookie();
              resolve();
            })
            .catch(function(err) {
              me.erase_token_cookie();
              reject(err);
            });
        }
      });
    }

    // ***** private functions *****

    _uuidv4() {
      var dt = new Date().getTime();
      var uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
        /[xy]/g,
        function(c) {
          var r = (dt + Math.random() * 16) % 16 | 0;
          dt = Math.floor(dt / 16);
          return (c == "x" ? r : (r & 0x3) | 0x8).toString(16);
        }
      );
      return uuid;
    }

    _api_call(func, params) {
      var id = this._uuidv4();
      var api_uri = this.api_uri + "/jrpc";
      var me = this;
      this._debug("_api_call", `${id}: ${api_uri}: ${func}`);
      if (this.debug == 2) {
        console.log(func, params);
      }
      return new Promise(function(resolve, reject) {
        var payload = {
          jsonrpc: "2.0",
          method: func,
          params: params,
          id: id
        };
        fetch(api_uri, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          redirect: "error",
          body: JSON.stringify(payload)
        })
          .then(function(response) {
            if (response.ok) {
              me._debug("_api_call", id + " success");
              response
                .json()
                .then(function(data) {
                  if (
                    !"id" in data ||
                    data.id != id ||
                    (!"result" in data && !"error" in data)
                  ) {
                    reject({
                      code: 9,
                      message: "Invalid server response",
                      data: data
                    });
                  } else if ("error" in data) {
                    me._debug(
                      "_api_call",
                      `${id} failed: ${data.error.code} (${data.error.message})`
                    );
                    reject({
                      code: data.error.code,
                      message: data.error.message,
                      data: data
                    });
                  } else {
                    if (me.debug == 2) {
                      console.log(`API ${id} ${func} response`, data.result);
                    }
                    resolve(data.result);
                  }
                })
                .catch(function(err) {
                  var code = 9;
                  var message = "Invalid server response";
                  me._debug("_api_call", `${id} failed: ${code} (${message})`);
                  reject({
                    code: code,
                    message: message,
                    data: data
                  });
                });
            } else {
              var code = 7;
              var message = "Server error";
              me._debug("_api_call", `${id} failed: ${code} (${message})`);
              reject({ code: code, message: message, data: data });
            }
          })
          .catch(function(err) {
            var code = 7;
            var message = "Server error";
            me._debug("_api_call", `${id} failed: ${code} (${message})`);
            reject({ code: code, message: message, data: null });
          });
      });
    }

    _heartbeat(me, on_login) {
      return new Promise(function(resolve, reject) {
        if (on_login) me._last_ping = null;
        var q = {};
        if (on_login) {
          q["icvars"] = 1;
        }
        if (me.ws_mode) {
          if (me._last_ping !== null) {
            if (
              me._last_pong === null ||
              me._last_ping - me._last_pong > me._intervals.heartbeat
            ) {
              me._debug("heartbeat", "error: ws ping timeout");
              me._invoke_handler("heartbeat.error");
            }
          }
          if (!on_login && me.ws) {
            me._last_ping = Date.now() / 1000;
            try {
              me._debug("heartbeat", "ws ping");
              me.ws.send(JSON.stringify({ s: "ping" }));
            } catch (err) {
              me._debug("heartbeat", "error: unable to send ws ping");
              me._invoke_handler("heartbeat_error", err);
              reject();
              return;
            }
          }
        }
        me.call("test", q)
          .then(function(data) {
            me.server_info = data;
            me.tsdiff = new Date().getTime() / 1000 - data.time;
            if (on_login) {
              if (data["cvars"]) {
                me._cvars = data["cvars"];
                if (me.global_cvars) {
                  Object.keys(data["cvars"]).map(function(k) {
                    if (typeof global !== "undefined")
                      eval(`global.${k}="${data["cvars"][k]}"`);
                    if (typeof window !== "undefined")
                      eval(`window.${k}="${data["cvars"][k]}"`);
                  });
                }
              } else {
                me._cvars = {};
              }
            }
            me._invoke_handler("heartbeat.success");
            resolve(true);
          })
          .catch(function(err) {
            me._debug("heartbeat", "error: unable to send test API call");
            me._invoke_handler("heartbeat.error", err);
          });
        me._debug("heartbeat", "ok");
      });
    }

    _load_log_entries(postprocess, me) {
      if (!me) var me = this;
      if (me.ws_mode) me._lr2p = [];
      me.call("log_get", {
        l: me.log.level,
        n: me.log.records
      })
        .then(function(data) {
          if (me.ws_mode && me._log_first_load) {
            me._set_ws_log_level(me.log.level);
          }
          data.map((l) => me._invoke_handler("log.record", l));
          me._log_loaded = true;
          me._lr2p.map((l) => me._invoke_handler("log.record", l));
          if (postprocess) {
            me._invoke_handler("log.postprocess");
          }
          me._log_first_load = false;
        })
        .catch(function(err) {
          jsaltt.logger.error("unable to load log entries");
        });
    }

    _schedule_restart() {
      var me = this;
      me._scheduled_restarter = setTimeout(function() {
        me.start();
      }, me._intervals.restart * 1000);
    }

    _cancel_scheduled_restart() {
      if (this._scheduled_restarter) {
        clearTimeout(this._scheduled_restarter);
        this._scheduled_restarter = null;
      }
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
        p["k"] = this.api_token;
      }
      return p;
    }

    _set_token_cookie() {
      if (this.set_auth_cookies && typeof document !== "undefined") {
        ["/ui", "/pvt", "/rpvt", "/upload"].map(
          (uri) => (document.cookie = `auth=${this.api_token}; path=${uri}`),
          this
        );
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
            var groups = me.state_updates["g"];
            var tp = me.state_updates["p"];
            if (groups) {
              params["g"] = groups;
            }
            if (tp) {
              params["p"] = tp;
            }
          }
          me.call("state_all", params)
            .then(function(data) {
              let received_oids = [];
              if (me.clear_unavailable) {
                data.map((s) => received_oids.push(s.oid));
              }
              data.map((s) => me._process_state(s));
              if (me.clear_unavailable) {
                for (let oid in me._states) {
                  if (
                    me._states[oid].status !== undefined &&
                    me._states[oid].status !== null &&
                    !received_oids.includes(oid)
                  ) {
                    me._debug("clearing unavailable item " + oid);
                    me._clear_state(oid);
                  }
                }
              }
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
            if (loc.protocol === "https:") {
              uri = "wss:";
            } else {
              uri = "ws:";
            }
            uri += "//" + loc.host;
          } else {
            uri = me.api_uri;
          }
          let ws_uri = `${uri}/ws?k=${me.api_token}`;
          if (me._intervals.ws_buf_ttl > 0) {
            ws_uri += `&buf_ttl=${me._intervals.ws_buf_ttl}`;
          }
          if (me.client_id != null) {
            ws_uri += `&client_id=${me.client_id}`;
          }
          me.ws = new WebSocket(ws_uri);
          me.ws.onmessage = function(evt) {
            me._process_ws(evt);
          };
          me.ws.addEventListener("open", function(event) {
            me._debug("_start_ws", "ws connected");
            var st;
            if (me.state_updates) {
              st = { s: "state" };
              if (me.state_updates !== true) {
                var groups = me.state_updates["g"];
                if (!groups) {
                  groups = "#";
                }
                var tp = me.state_updates["p"];
                if (!tp) {
                  tp = "#";
                }
                st["g"] = groups;
                st["tp"] = tp;
                st["i"] = [];
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

    _set_ws_log_level(l) {
      this._log_subscribed = true;
      try {
        if (this.ws) this.ws.send(JSON.stringify({ s: "log", l: l }));
      } catch (err) {
        this._debug("log_level", "warning: unable to send ws packet");
      }
    }

    _process_ws(evt) {
      var data = JSON.parse(evt.data);
      if (data.s == "pong") {
        this._debug("ws", "pong");
        this._last_pong = Date.now() / 1000;
        return;
      }
      if (data.s == "reload") {
        this._debug("ws", "reload");
        return this._invoke_handler("server.reload");
      }
      if (data.s == "server") {
        let ev = "server." + data.d;
        this._debug("ws", ev);
        return this._invoke_handler(ev);
      }
      if (data.s.substring(0, 11) == "supervisor.") {
        this._debug("ws", data.s);
        return this._invoke_handler(data.s, data.d);
      }
      if (this._invoke_handler("ws.event", data) === false) return;
      if (data.s == "state") {
        this._debug("ws", "state");
        if (Array.isArray(data.d)) {
          data.d.map((s) => this._process_state(s), this);
        } else {
          this._process_state(data.d);
        }
        return;
      }
      if (data.s == "log") {
        if (Array.isArray(data.d)) {
          data.d.map((l) => this._preprocess_log_record(l), this);
        } else {
          this._preprocess_log_record(data.d);
        }
        this._invoke_handler("log.postprocess");
        return;
      }
    }

    _preprocess_log_record(l) {
      this._log_loaded
        ? this._invoke_handler("log.record", l)
        : this._lr2p.push(l);
    }

    _clear_state(oid) {
      delete this._states[oid];
      this._process_state({
        oid: oid,
        status: null,
        value: null
      });
    }

    _process_state(state) {
      var z = [];
      var x = [];
      try {
        var oid = state.oid;
        // copy missing fields from old state
        if (oid in this._states) {
          var old_state = this._states[oid];
          z = "";
          Object.keys(old_state).map(function(k) {
            if (!(k in state)) {
              state[k] = old_state[k];
            }
          });
        }
        if (!jsaltt.cmp(state, old_state)) {
          if (state.set_time === true) {
            old_state = undefined;
            state.set_time = 0;
          }
          if (
            // no old state
            old_state === undefined ||
            // controller changed
            state.controller_id != old_state.controller_id ||
            // use ieid
            (state.ieid !== undefined &&
              (old_state.ieid === undefined ||
                old_state.ieid[0] < state.ieid[0] ||
                (old_state.ieid[0] == state.ieid[0] &&
                  old_state.ieid[1] < state.ieid[1]))) ||
            // use set_time
            (state.ieid === undefined &&
              (state.set_time === undefined ||
                old_state.set_time === undefined ||
                state.set_time >= old_state.set_time))
          ) {
            this._debug(
              "process_state",
              `${oid} s: ${state.status} v: "${state.value}"`,
              `ns: ${state.nstatus} nv: "${state.nvalue}"`
            );
            this._states[oid] = state;
            if (oid in this._update_state_functions) {
              this._update_state_functions[oid].map(function(f) {
                try {
                  if (typeof f === "string" || f instanceof String) {
                    eval(f);
                  } else {
                    f(state);
                  }
                } catch (err) {
                  jsaltt.logger.error(
                    `state function processing for ${oid}:`,
                    err
                  );
                }
              });
            }
            Object.keys(this._update_state_mask_functions).map(function(k) {
              if (this._oid_match(oid, k)) {
                this._update_state_mask_functions[k].map(function(f) {
                  try {
                    if (typeof f === "string" || f instanceof String) {
                      eval(f);
                    } else {
                      f(state);
                    }
                  } catch (err) {
                    jsaltt.logger.error(
                      `state function processing for ${oid}:`,
                      err
                    );
                  }
                });
              }
            }, this);
          }
        }
      } catch (err) {
        jsaltt.logger.error(
          "State processing error, invalid object received",
          err
        );
      }
    }

    _invoke_handler(handler) {
      var f = this._handlers[handler];
      if (f) {
        this._debug("invoke_handler", "invoking for " + handler);
        try {
          if (typeof f === "string") {
            return eval(f);
          } else if (typeof f === "function") {
            return f.apply(this, [].slice.call(arguments, 1));
          }
        } catch (err) {
          jsaltt.logger.error(`handler for ${handler}:`, err);
        }
      }
    }

    _oid_match(oid, mask) {
      return new RegExp("^" + mask.split("*").join(".*") + "$").test(oid);
    }

    _debug(method) {
      if (this.debug) {
        jsaltt.logger.debug.apply(
          jsaltt.logger,
          ["EVA::" + method].concat([].slice.call(arguments, 1))
        );
      }
    }

    /**
     * QR code for EvaHI
     *
     * Generates QR code for :doc:`EvaHI</evahi>`-compatible apps (e.g. for EVA
     * ICS Control Center mobile app for Android). Current framework session
     * must be authorized using user login. If $eva.password is defined, QR
     * code also contain password value. Requires qrious js library.
     *
     * @param ctx - html <canvas /> element or id to generate QR code in
     * @param params - object with additional parameters:
     *              @size - QR code size in px (default: 200)
     *              @url - override UI url (default: document.location)
     *              @user - override user (default: authorized_user)
     *              @password - override password
     *
     * @returns Qrious QR object if QR code is generated
     */
    hiQR(ctx, params) {
      if (typeof document !== "object") {
        jsaltt.logger.error("document object not found");
        return;
      }
      var params = params;
      if (!params) params = {};
      var url = params["url"];
      if (!url) {
        url = document.location;
      }
      var user = params["user"];
      if (user === undefined) {
        user = this.authorized_user;
      }
      var password = params["password"];
      if (password === undefined) {
        password = this.password;
      }
      var size = params["size"];
      if (!size) {
        size = 200;
      }
      if (!url || !user) {
        return;
      }
      var l = document.createElement("a");
      l.href = url;
      var protocol = l.protocol.substring(0, l.protocol.length - 1);
      var host = l.hostname;
      var port = l.port;
      if (!port) {
        if (protocol == "http") {
          port = 80;
        } else {
          port = 443;
        }
      }
      var value =
        "scheme:" +
        protocol +
        "|address:" +
        host +
        "|port:" +
        port +
        "|user:" +
        user;
      if (password) {
        value += "|password:" + password;
      }
      return new QRious({
        element: typeof ctx === "object" ? ctx : document.getElementById(ctx),
        value: value,
        size: size
      });
    }
  }

  let $eva = new EVA();

  if (typeof exports === "object") {
    exports.EVA = EVA;
    exports.$eva = $eva;
  }

  if (typeof window === "object") {
    window.$eva = $eva;
    window.eva_framework_version = eva_framework_version;
  }
})();
