const eva_framework_version = "0.5.0";

import { Logger, cookies } from "@altertech/jsaltt";

enum HandlerId {
  HeartBeatSuccess = "heartbeat.success",
  HeartBeatError = "heartbeat.error",
  LoginSuccess = "login.success",
  LoginFailed = "login.failed",
  LoginOTPRequired = "login.otp_required",
  LoginOTPInvalid = "login.otp_invalid",
  LoginOTPSetup = "login.otp_setup",
  WsEvent = "ws.event",
  ServerReload = "server.reload",
  ServerRestart = "server.restart",
  LogRecord = "log.record",
  LogPostProcess = "log.postprocess"
}

function to_obj(obj?: object): object {
  if (typeof obj === "object") {
    return obj;
  } else {
    return {};
  }
}

interface LoginPayload {
  k?: string;
  u?: string;
  p?: string;
  a?: string;
  xopts?: object;
}

interface SvcMessage {
  kind: string;
  svc: string;
  message?: string;
  value?: string;
}

interface JsonRpcRequest {
  jsonrpc: string;
  method: string;
  params: object;
  id: number;
}

interface JsonRpcResponse {
  jsonrpc: string;
  result?: object;
  error?: object;
  id: number;
}

interface External {
  fetch?: any;
  WebSocket?: any;
  QRious?: any;
}

interface ActionResult {
  elapsed: number;
  exitcode: number | null;
  finished: boolean;
  node: string;
  oid: string;
  params: any;
  priority: number;
  status: string;
  svc: string;
  time: any;
  uuid: string;
}

interface LvarIncrDecrResult {
  result: number;
}

interface LogCollector {
  level: number;
  records: number;
}

enum IntervalId {
  AjaxReload = "ajax_reload",
  AjaxLogReload = "log_reload",
  ActionWatch = "action_watch",
  Heartbeat = "heartbeat",
  Reload = "reload",
  Restart = "restart",
  WSBufTTL = "ws_buf_ttl"
}

class EvaError {
  code: number;
  message?: string;
  data?: any;
  constructor(code: number, message: string, data?: any) {
    this.code = code;
    this.message = message;
    this.data = data;
  }
}

class EVABulkRequestPartHandler {
  fn_ok?: (result: any) => void;
  fn_err?: (result: any) => void;

  constructor() {}
  then(fn_ok: (result: any) => void) {
    this.fn_ok = fn_ok;
    return this;
  }
  catch(fn_err: (err: any) => void) {
    this.fn_err = fn_err;
    return this;
  }
}

class EVABulkRequest {
  requests: any;
  payload: Array<any>;
  eva: EVA;

  constructor(eva: EVA) {
    this.requests = {};
    this.payload = [];
    this.eva = eva;
  }
  /**
   * Prepare API function call for bulk calling
   *
   * Calls any available SFA API function
   *
   * @param p1 item OID (if required) or API call params
   * @param p2 extra call params or empty object
   * @param fn_ok function which is executed on successfull call
   * @parma fn_err function which is executed on error
   *
   * @returns Part handler object
   */
  prepare(
    method: string,
    p1: string | object,
    p2?: object
  ): EVABulkRequestPartHandler {
    let params: any;
    if (typeof p1 === "string" || Array.isArray(p1)) {
      params = to_obj(p2);
      params["i"] = p1;
    } else {
      params = p1;
    }
    let p = this.eva._prepare_call_params(params);
    let payload: JsonRpcRequest = this.eva._prepare_api_call(method, p);
    let req = new EVABulkRequestPartHandler();
    this.requests[payload.id] = req;
    this.payload.push(payload);
    return req;
  }
  /**
   * Perform bulk API call
   */
  call(): Promise<boolean> {
    let api_uri = this.eva.api_uri + "/jrpc";
    this.eva._debug("call_bulk", `${api_uri}`);
    return new Promise((resolve, reject) => {
      this.eva.external
        .fetch(api_uri, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          redirect: "error",
          body: JSON.stringify(this.payload)
        })
        .then((response: any) => {
          if (response.ok) {
            response
              .json()
              .then((data: JsonRpcResponse) => {
                this.eva._debug("call_bulk success");
                if (Array.isArray(data)) {
                  data.forEach((d) => {
                    if (
                      typeof d.id === "undefined" ||
                      (typeof d.result === "undefined" &&
                        typeof d.error === "undefined")
                    ) {
                      reject({
                        code: -32009,
                        message: "Invalid server response",
                        data: d
                      });
                    } else {
                      let id = d.id;
                      let req = this.requests[id];
                      let fn_ok;
                      let fn_err;
                      if (req) {
                        fn_ok = req.fn_ok;
                        fn_err = req.fn_err;
                      }
                      if (typeof d.error !== "undefined") {
                        this.eva._debug(
                          "call_bulk req",
                          `${id} failed: ${d.error.code} (${d.error.message})`
                        );
                        if (fn_err) {
                          fn_err({
                            code: d.error.code,
                            message: d.error.message,
                            data: d
                          });
                        }
                      } else {
                        if (this.eva.debug == 2) {
                          this.eva.logger.info(
                            `call_bulk API ${id} ${req.func} response`,
                            d.result
                          );
                        }
                        if (fn_ok) {
                          fn_ok(d.result);
                        }
                      }
                    }
                  });
                  resolve(true);
                } else {
                  let code = -32009;
                  let message = "Invalid server response (not an array)";
                  this.eva._debug("call_bulk", `failed: ${code} (${message})`);
                  reject(new EvaError(code, message, data));
                }
              })
              .catch((err: any) => {
                let code = -32009;
                let message = "Invalid server response";
                this.eva._debug("call_bulk", `failed: ${code} (${message})`);
                reject(new EvaError(code, message));
              });
          } else {
            let code = -32007;
            let message = "Server error";
            this.eva._debug("call_bulk", `failed: ${code} (${message})`);
            reject(new EvaError(code, message));
          }
        })
        .catch((err: any) => {
          let code = -32007;
          let message = "Server error";
          this.eva._debug("call_bulk", `failed: ${code} (${message})`);
          reject(new EvaError(code, message));
        });
    });
  }
}

class EVA_ACTION {
  eva: EVA;

  constructor(eva: EVA) {
    this.eva = eva;
  }
  /**
   * Call unit action with status=1
   *
   * @param oid {string} unit OID
   * @param wait {boolean} wait until the action is completed (default: true)
   */
  async start(oid: string, wait = false): Promise<ActionResult> {
    return this.exec(oid, { s: 1 }, wait);
  }
  /**
   * Call unit action with status=0
   *
   * @param oid {string} unit OID
   * @param wait {boolean} wait until the action is completed (default: true)
   */
  async stop(oid: string, wait = false): Promise<ActionResult> {
    return this.exec(oid, { s: 0 }, wait);
  }
  /**
   * Call unit action to toggle its status
   *
   * @param oid {string} unit OID
   * @param wait {boolean} wait until the action is completed (default: true)
   */
  async toggle(oid: string, wait = false): Promise<ActionResult> {
    return this._act("action.toggle", oid, {}, wait);
  }
  /**
   * Call unit action
   *
   * @param oid {string} unit OID
   * @param params {object} action params
   * @param wait {boolean} wait until the action is completed (default: true)
   */
  exec(oid: string, params: object, wait = false) {
    return this._act("action", oid, params, wait);
  }
  /**
   * Terminate all unit actions
   *
   * @param oid {string} unit OID
   */
  async kill(oid: string) {
    await this.eva.call("action.kill", oid);
  }
  /**
   * Terminate a unit action
   *
   * @param uuid {string} action uuid
   */
  async terminate(uuid: string) {
    let method = "action.terminate";
    await this.eva.call(method, { u: uuid });
  }
  /**
   * Run lmacro
   *
   * @param oid {string} lmacro oid
   * @param params {object} call params
   * @param wait {boolean} wait until completed (default: true)
   */
  async run(oid: string, params?: object, wait = false): Promise<ActionResult> {
    return this._act("run", oid, params, wait);
  }
  async _act(
    method: string,
    oid: string,
    params?: object,
    wait = false
  ): Promise<ActionResult> {
    let data = (await this.eva.call(method, oid, params)) as ActionResult;
    if (wait == false) {
      return data;
    } else {
      return new Promise((resolve) => {
        this.eva.watch_action(data.uuid, (action: ActionResult) => {
          if (action.finished) {
            resolve(action);
          }
        });
      });
    }
  }
}

class EVA_LVAR {
  eva: EVA;

  constructor(eva: EVA) {
    this.eva = eva;
  }
  /**
   * Reset lvar (set status to 1)
   *
   * @param oid {string} lvar oid
   */
  async reset(oid: string) {
    await this.eva.call("lvar.reset", oid);
  }
  /**
   * Clear lvar (set status to 0)
   *
   * @param oid {string} lvar oid
   */
  async clear(oid: string) {
    await this.eva.call("lvar.clear", oid);
  }
  /**
   * Toggle lvar status
   *
   * @param oid {string} lvar oid
   */
  async toggle(oid: string) {
    await this.eva.call("lvar.toggle", oid);
  }
  /**
   * Increment lvar value
   *
   * @param oid {string} lvar oid
   *
   * @returns the new value
   */
  async incr(oid: string): Promise<number> {
    let data = (await this.eva.call("lvar.incr", oid)) as LvarIncrDecrResult;
    return data.result;
  }
  /**
   * Decrement lvar value
   *
   * @param oid {string} lvar oid
   *
   * @returns the new value
   */
  async decr(oid: string) {
    let data = (await this.eva.call("lvar.decr", oid)) as LvarIncrDecrResult;
    return data.result;
  }
  /**
   * Set lvar state
   *
   * @param oid {string} lvar oid
   * @param status {numberr} lvar status
   * @param value lvar value
   */
  async set(oid: string, status?: number, value?: any) {
    let params: any = {};
    if (status !== undefined) {
      params.status = status;
    }
    if (value !== undefined) {
      params.value = value;
    }
    if (params) {
      let method = "lvar.set";
      await this.eva.call("lvar.set", oid, params);
    }
  }
  /**
   * Set lvar status
   *
   * @param oid {string} lvar oid
   * @param status {number} lvar status
   */
  async set_status(oid: string, status: number) {
    await this.set(oid, status);
  }
  /**
   * Set lvar value
   *
   * @param oid {string} lvar oid
   * @param value lvar value
   */
  async set_value(oid: string, value: any) {
    await this.set(oid, (value = value));
  }

  /**
   * Get lvar expiration time left
   *
   * @param lvar_oid {string} lvar OID
   *
   * @returns seconds to expiration, -1 if expired, -2 if stopped
   */
  expires(lvar_oid: string): number | null | undefined {
    // get item state
    let state = this.eva.state(lvar_oid);
    // if no such item
    if (state === undefined) return undefined;
    // if item has no expiration or expiration is set to zero
    if (
      !state.meta ||
      state.meta.expires === undefined ||
      state.meta.expires == 0
    ) {
      return null;
    }
    // if no timestamp diff
    if (this.eva.tsdiff == null) return undefined;
    // if timer is disabled (stopped), return -2
    if (state.status == 0) return -2;
    // if timer is expired, return -1
    if (state.status == -1) return -1;
    let t =
      state.meta.expires -
      new Date().getTime() / 1000 +
      this.eva.tsdiff +
      state.t;
    if (t < 0) t = 0;
    return t;
  }
}

class EVA {
  action: EVA_ACTION;
  lvar: EVA_LVAR;
  api_uri: string;
  apikey: string;
  api_token: string;
  //api_version: number | null;
  authorized_user: string | null;
  clear_unavailable: boolean;
  client_id: string | null;
  debug: boolean | number;
  external: External;
  evajw: any;
  in_evaHI: boolean;
  log: LogCollector;
  logger: Logger;
  logged_in: boolean;
  login: string;
  login_xopts: object | null;
  log_level_names: Map<number, string>;
  password: string;
  set_auth_cookies: boolean;
  state_updates: boolean | Array<string>;
  tsdiff: number;
  version: string;
  wasm: boolean;
  ws_mode: boolean;
  ws: any;
  server_info: any;
  _api_call_id: number;
  _handlers: Map<HandlerId, (...args: any[]) => void>;
  _intervals: Map<IntervalId, number>;
  _ws_handler_registered: boolean;
  _heartbeat_reloader: any;
  _ajax_reloader: any;
  _log_reloader: any;
  _scheduled_restarter: any;
  _action_states: Map<string, ActionResult>;
  _action_watch_functions: Map<String, Array<(result: ActionResult) => void>>;
  _last_ping: number | null;
  _last_pong: number | null;
  _log_started: boolean;
  _log_first_load: boolean;
  _log_loaded: boolean;

  constructor() {
    this.version = eva_framework_version;
    this.logger = new Logger();
    this.login = "";
    this.password = "";
    this.login_xopts = null;
    this.apikey = "";
    this.api_uri = "";
    this.set_auth_cookies = true;
    this.api_token = "";
    this.authorized_user = null;
    this.logged_in = false;
    this.debug = false;
    this.state_updates = true;
    this.wasm = false;
    this.clear_unavailable = false;
    this._ws_handler_registered = false;
    this.ws_mode = true;
    this.ws = null;
    //this.api_version = null;
    this.client_id = null;
    this._api_call_id = 0;
    this.tsdiff = 0;
    this._last_ping = null;
    this._last_pong = null;
    this._log_started = false;
    this._log_first_load = false;
    this._log_loaded = false;
    this.in_evaHI =
      typeof navigator !== "undefined" &&
      typeof navigator.userAgent === "string" &&
      navigator.userAgent.startsWith("evaHI ");
    this.log = {
      level: 20,
      records: 200
    };
    this._handlers = new Map([[HandlerId.HeartBeatError, this.restart]]);
    this._handlers.set(HandlerId.HeartBeatError, this.restart);
    this._intervals = new Map([
      [IntervalId.AjaxReload, 2],
      [IntervalId.AjaxLogReload, 2],
      [IntervalId.ActionWatch, 0.5],
      [IntervalId.Heartbeat, 5],
      [IntervalId.Reload, 5],
      [IntervalId.Restart, 1],
      [IntervalId.WSBufTTL, 0]
    ]);
    this.log_level_names = new Map([
      [10, "DEBUG"],
      [20, "INFO"],
      [30, "WARNING"],
      [40, "ERROR"],
      [50, "CRITICAL"]
    ]);
    this._heartbeat_reloader = null;
    this._ajax_reloader = null;
    this._log_reloader = null;
    this._scheduled_restarter = null;
    this._action_watch_functions = new Map();
    this._action_states = new Map();
    this._clear();
    this._clear_watchers();
    this.action = new EVA_ACTION(this);
    this.lvar = new EVA_LVAR(this);
    this.evajw = null;
    this.external = {};
    this.server_info = null;
    if (typeof window !== "undefined") {
      if (typeof window.fetch !== "undefined") {
        this.external.fetch = window.fetch.bind(window);
      }
    } else if (typeof fetch !== "undefined") {
      this.external.fetch = fetch;
    } else {
      this.external.fetch = null;
    }
    if (typeof WebSocket !== "undefined") {
      this.external.WebSocket = WebSocket;
    } else {
      this.external.WebSocket = null;
    }
    if (
      typeof window !== "undefined" &&
      typeof (window as any).QRious !== "undefined"
    ) {
      this.external.QRious = (window as any).QRious;
    } else {
      this.external.QRious = null;
    }
  }

  bulk_request(): EVABulkRequest {
    return new EVABulkRequest(this);
  }

  // WASM override
  /**
   * Get framework engine mode
   
   * @returns "js" or "wasm"
   */
  get_mode(): string {
    return "js";
  }

  /**
   * Start the Framework
   *
   * After calling the function authenticates user, opens a WebSocket (in
   * case of WS mode) or schedule AJAXs refresh interval.
   */
  async start(): Promise<boolean> {
    this._cancel_scheduled_restart();
    this._debug("framework", `version: ${this.version}`);
    if (typeof fetch === "undefined") {
      this.logger.error(
        '"fetch" function is unavailable. Upgrade your web browser or ' +
          "connect polyfill"
      );
      return false;
    }
    if (this.logged_in) {
      this._debug("start", "already logged in");
      return true;
    }
    if (this.wasm && !this.evajw) {
      return this._start_evajw();
    } else {
      return this._start_engine();
    }
  }
  _start_engine(): boolean {
    this._last_ping = null;
    this._last_pong = null;
    let q: LoginPayload = {};
    if (this.apikey) {
      q = { k: this.apikey };
      if (this.login_xopts) {
        q.xopts = this.login_xopts;
      }
      this._debug("start", "logging in with API key");
    } else if (this.password) {
      q = { u: this.login, p: this.password };
      if (this.api_token) {
        q.a = this.api_token;
      }
      if (this.login_xopts) {
        q.xopts = this.login_xopts;
      }
      this._debug("start", "logging in with password");
    } else if (this.api_token) {
      q = { a: this.api_token };
      this._debug("start", "logging in with existing auth token");
    } else if (this.set_auth_cookies) {
      let token = cookies.read("auth");
      if (token) {
        q = { a: token };
        this._debug("start", "logging in with cookie-cached auth token");
      }
    }
    if (Object.keys(q).length === 0) {
      this._debug("start", "logging in without credentials");
    }
    let user: string;
    this._api_call("login", q)
      .then((data) => {
        this.api_token = data.token;
        user = data.user;
        this._set_token_cookie();
        //if (!this.api_version) {
        //if (data.api_version) {
        //this.api_version = data.api_version;
        //} else {
        //this.api_version = 4;
        //}
        //}
        //if (this.evajw) {
        //this.evajw.set_api_version(data.api_version || 4);
        //}
        return Promise.all([
          this._load_states(),
          this._heartbeat(true),
          this._start_ws()
        ]);
      })
      .then(() => {
        if (!this.ws_mode) {
          if (this._ajax_reloader) {
            clearInterval(this._ajax_reloader);
          }
          this._ajax_reloader = setInterval(() => {
            this._load_states().catch(() => {});
          }, (this._intervals.get(IntervalId.AjaxReload) as number) * 1000);
        } else {
          if (this._ajax_reloader) {
            clearInterval(this._ajax_reloader);
          }
          let reload = this._intervals.get(IntervalId.Reload) as number;
          if (reload) {
            this._ajax_reloader = setInterval(() => {
              this._load_states().catch(() => {});
            }, reload * 1000);
          }
        }
        if (this._heartbeat_reloader) {
          clearInterval(this._heartbeat_reloader);
        }
        this._heartbeat_reloader = setInterval(() => {
          this._heartbeat(false).catch(() => {});
        }, (this._intervals.get(IntervalId.Heartbeat) as number) * 1000);
        this._debug("start", `login successful, user: ${user}`);
        this.logged_in = true;
        this.authorized_user = user;
        this._invoke_handler(HandlerId.LoginSuccess);
      })
      .catch((err) => {
        this._debug("start", err);
        this.logged_in = false;
        if (err.code === undefined) {
          err.code = 4;
          err.message = "Unknown error";
        }
        this._debug("start", `login failed: ${err.code} (${err.message})`);
        this._stop_engine();
        this.error_handler(err, "login");
        this.erase_token_cookie();
        this._invoke_handler(HandlerId.LoginFailed, err);
      });
    return true;
  }

  /**
   * Get system name
   *
   * @returns the system name or null if the framework is not logged in
   */
  system_name() {
    if (this.server_info) {
      return this.server_info.system_name;
    } else {
      return null;
    }
  }
  /**
   * Sleep the number of seconds
   *
   * @param sec {number} seconds to sleep
   */
  async sleep(sec: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, sec * 1000));
  }

  /**
   * Start log processing
   *
   * Starts log processing. Framework class must be already logged in.
   *
   * @param log_level {number} log processing level (optional)
   */
  log_start(log_level?: number) {
    this._log_started = true;
    if (log_level !== undefined) {
      this.log.level = log_level;
    }
    if (!this.ws_mode || this._log_first_load) {
      this._log_loaded = false;
      this._load_log_entries(true);
      if (!this.ws_mode) {
        this._log_reloader = setInterval(() => {
          this._load_log_entries(false);
        }, (this._intervals.get(IntervalId.AjaxLogReload) as number) * 1000);
      }
    }
  }

  /**
   * Change log processing level
   *
   * @param log_level {number} log processing level
   */
  log_level(log_level: number) {
    this.log.level = log_level;
    this._set_ws_log_level(log_level);
    this._load_log_entries(true);
  }

  /**
   * Restart the Framework
   *
   * e.g. used on heartbeat error or if subscription parameters are changed
   */
  restart() {
    this._cancel_scheduled_restart();
    this._debug("restart", "performing restart");
    this.stop(true)
      .then(() => {
        this._schedule_restart();
      })
      .catch(() => {
        this._schedule_restart();
      });
  }

  /**
   * Erase auth token cookie
   *
   * It is recommended to call this function when login form is displayed to
   * prevent old token caching
   */
  erase_token_cookie() {
    this.api_token = "";
    this.authorized_user = null;
    this._set_token_cookie();
  }

  /**
   * Call API function
   *
   * Calls any available SFA API function
   *
   * @param arguments item OID (if required), API call params
   *
   * @returns Promise object
   */
  call(method: string, p1?: object | string, p2?: object): any {
    let params;
    if (typeof p1 === "string" || Array.isArray(p1)) {
      params = to_obj(p2) as any;
      params.i = p1;
    } else {
      params = p1;
    }
    let p = this._prepare_call_params(params);
    return this._api_call(method, p);
  }

  /**
   * Ask server to set the token read-only (e.g. after idle)
   *
   * (EVA ICS 3.3.2+)
   *
   * the current mode can be obtained from $eva.server_info.aci.token_mode
   */
  set_readonly(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.call("session.set_readonly")
        .then((data: any) => {
          this.server_info.aci.token_mode = "readonly";
          resolve();
        })
        .catch((err: any) => {
          reject(err);
        });
    });
  }

  /**
   * Ask server to return the token to normal mode
   *
   * (EVA ICS 3.3.2+)
   *
   * @param u {string} login
   * @param p {string} password
   * @param xopts {object} extra options (e.g. OTP)
   */
  set_normal(user?: string, password?: string, xopts?: object) {
    let q: LoginPayload = {};
    if (typeof password === "undefined" || password === null) {
      q = { k: user };
    } else {
      q = { u: user, p: password };
    }
    q.a = this.api_token;
    if (xopts !== undefined) {
      q.xopts = xopts;
    }
    var me = this;
    me._api_call("login", q)
      .then(function () {
        me.server_info.aci.token_mode = "normal";
        me._invoke_handler(HandlerId.LoginSuccess);
      })
      .catch(function (err) {
        me.error_handler(err, "set_normal");
        if (err.code !== -32022) {
          me._invoke_handler(HandlerId.LoginFailed, err);
        }
      });
    return true;
  }

  error_handler(err: EvaError, method: string) {
    if (err.code == -32022) {
      let msg = this.parse_svc_message(err.message) as any;
      msg.method = method;
      if (msg && msg.kind == "OTP") {
        switch (msg.message) {
          case "REQ":
            this._invoke_handler(HandlerId.LoginOTPRequired, msg);
            return;
          case "INVALID":
            this._invoke_handler(HandlerId.LoginOTPInvalid, msg);
            return;
          case "SETUP":
            this._invoke_handler(HandlerId.LoginOTPSetup, msg);
            return;
        }
      }
    }
  }

  /**
   * Set event handler function
   *
   * A single kind of event can have a single handler only
   *
   * @param event {string} event, possible values:
   *           login.success, login.failed, ws.event, server.reload,
   *           server.restart, heartbeat.success, heartbeat.error, log.record,
   *           log.postprocess, login.otp_required, login.otp_invalid,
   *           login.otp_setup
   *
   * @param func {function} function called on event
   */
  on(event: HandlerId, func: (...args: any[]) => void) {
    this._handlers.set(event, func);
    this._debug("on", `setting handler for ${event}`);
    if (event == HandlerId.WsEvent) {
      this._ws_handler_registered = true;
    }
  }

  /**
   * Set intervals
   *
   * @param interval_id {string} interval, possible values:
   *            ajax_reload, heartbeat, log_reload, reload, restart, action_watch
   * @param value {number} interval value (in seconds)
   */
  set_interval(interval_id: IntervalId, value: number) {
    this._intervals.set(interval_id, value);
  }

  /**
   * Watch item state updates
   *
   * Registers the function to be called in case of state change event (or at
   * first state load).
   *
   * If state is already loaded, function will be called immediately. One item
   * (or item mask, set with "*") can have multiple watchers.
   *
   * @param oid {string} item oid (e.g. sensor:env/temp1, or sensor:env/\*)
   * @param func {function} function to be called
   * @param ignore_initial {boolean} skip initial state callback
   *
   */
  // WASM override
  watch(oid, func, ignore_initial) {
    if (!oid.includes("*")) {
      if (!(oid in this._update_state_functions)) {
        this._update_state_functions[oid] = [];
      }
      this._update_state_functions[oid].push(func);
      if (!ignore_initial) {
        var state = this.state(oid);
        if (state !== undefined) func(state);
      }
    } else {
      if (!(oid in this._update_state_mask_functions)) {
        this._update_state_mask_functions[oid] = [];
      }
      this._update_state_mask_functions[oid].push(func);
      if (!ignore_initial) {
        var v = this.state(oid);
        if (Array.isArray(v)) {
          v.map(func);
        } else {
          func(v);
        }
      }
    }
  }

  /**
   * Watch action state by uuid
   *
   * Registers the function to be called in case of action status change
   * event (or at first state load).
   *
   * If status is already loaded, function will be called immediately.
   * Otherwise status is polled from the server with "action_watch" interval
   * (default: 500ms).
   *
   * There is no unwatch function as watching is stopped as soon as the
   * action is completed (or server error is occurred)
   *
   * @param uuid {string} action uuid
   * @param func {function} function to be called
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
      var method = "result";
      if (this.api_version == 4) {
        method = "action.result";
      }
      var watcher = function () {
        me.call(method, { u: uuid })
          .then(function (result) {
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
              setTimeout(watcher, me._intervals.action_watch * 1000);
            }
          })
          .catch(function (err) {
            me._action_watch_functions[uuid].map((f) => f(err));
            delete me._action_watch_functions[uuid];
            delete me._action_states[uuid];
          });
      };
      setTimeout(watcher, this._intervals.action_watch * 1000);
    }
  }

  /**
   * Stop watching item state updates
   *
   * If item oid or function is not specified, all watching functions are
   * removed for a single oid (mask) or for all the items watched.
   *
   * @param oid {string} item oid (e.g. sensor:env/temp1, or sensor:env/\*)
   * @param func {function} function to be removed
   */
  unwatch(oid, func) {
    if (!oid) {
      this._clear_watchers();
    } else if (!oid.includes("*")) {
      if (func) {
        this._unwatch_func(oid, func);
      } else {
        this._unwatch_all(oid);
      }
    } else {
      if (func) {
        this._unwatch_mask_func(oid, func);
      } else {
        this._unwatch_mask_all(oid);
      }
    }
  }

  // WASM override (not supported)
  _unwatch_func(oid, func) {
    if (oid in this._update_state_functions) {
      this._update_state_functions[oid] = this._update_state_functions[
        oid
      ].filter((el) => el !== func);
    }
  }

  // WASM override
  _unwatch_all(oid) {
    delete this._update_state_functions[oid];
  }

  // WASM override (not supported)
  _unwatch_mask_func(oid, func) {
    if (oid in this._update_state_mask_functions) {
      this._update_state_mask_functions[oid] =
        this._update_state_mask_functions[oid].filter((el) => el !== func);
    }
  }

  // WASM override
  _unwatch_mask_all(oid) {
    delete this._update_state_mask_functions[oid];
  }

  /**
   * Get item status
   *
   * @param oid {string} item OID
   *
   * @returns item status(int) or undefined if no object found
   */
  // WASM override
  status(oid) {
    var state = this.state(oid);
    if (state === undefined || state === null) return undefined;
    return state.status;
  }

  /**
   * Get item value
   *
   * @param oid {string} item OID
   *
   * @returns item value or undefined if no item found
   */
  // WASM override
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
   * Get item state
   *
   * @param oid {string} item OID
   *
   * @returns state object or undefined if no item found
   */
  state(oid) {
    if (!oid.includes("*")) {
      return this._state(oid);
    } else {
      return this._states_by_mask(oid);
    }
  }

  // WASM override
  _state(oid) {
    if (oid in this._states) {
      return this._states[oid];
    } else {
      return undefined;
    }
  }

  // WASM override
  _states_by_mask(oid_mask) {
    var result = [];
    Object.keys(this._states).map(function (k) {
      if (this._oid_match(k, oid_mask)) {
        result.push(this._states[k]);
      }
    }, this);
    return result;
  }

  /**
   * Stop Framework
   *
   * After calling the function closes open WebSocket if available, stops all
   * workers then tries to close the server session
   *
   * @param keep_auth {boolean} keep authentication cookies and token
   *
   * @returns Promise object
   */
  stop(keep_auth?: boolean) {
    var me = this;
    return new Promise(function (resolve, reject) {
      me._stop_engine();
      me.logged_in = false;
      if (keep_auth) {
        resolve();
      } else if (me.api_version == 4) {
        if (me.api_token) {
          let token = me.api_token;
          me.erase_token_cookie();
          me._api_call("logout", { a: token })
            .then(function () {
              me.api_token = "";
              resolve();
            })
            .catch(function (err) {
              reject(err);
            });
        }
      } else {
        me.call("logout")
          .then(function () {
            me.erase_token_cookie();
            resolve();
          })
          .catch(function (err) {
            me.erase_token_cookie();
            reject(err);
          });
      }
    });
  }

  // ***** private functions *****
  _inject_evajw(mod) {
    if (mod) {
      mod.init(undefined, this).then(() => {
        mod.init_engine();
        this.evajw = mod;
        let build = mod.get_build();
        log.info("EVA ICS JavaScript WASM engine loaded. Build: " + build);
        try {
          mod.check_license();
        } catch (err) {
          log.error("License check failed. WASM engine disabled");
          this.wasm = false;
          this._start_engine();
          return;
        }
        this._clear_watchers = mod.clear_watchers;
        this._clear_states = mod.clear_states;
        this.watch = mod.watch;
        this.get_mode = mod.get_mode;
        this._unwatch_func = mod.unwatch_func;
        this._unwatch_all = mod.unwatch_all;
        this._unwatch_mask_func = mod.unwatch_mask_func;
        this._unwatch_mask_all = mod.unwatch_mask_all;
        this.status = mod.status;
        this.value = mod.value;
        this._state = mod.state;
        this._states_by_mask = mod.states_by_mask;
        this._process_loaded_states = mod.process_loaded_states;
        this._process_ws = mod.process_ws;
        this._clear_state = mod.clear_state;
        // transfer registered watchers to WASM
        function transfer_watchers(src, mod) {
          Object.keys(src).map((oid) => {
            src[oid].map((f) => {
              mod.watch(oid, f, true);
            });
          });
        }
        transfer_watchers(this._update_state_functions, mod);
        transfer_watchers(this._update_state_mask_functions, mod);
        this._start_engine();
      });
    } else {
      this.evajw = null;
    }
  }

  _start_evajw(): boolean {
    this.evajw = undefined;
    import(/*webpackIgnore: true*/ "./evajw/evajw.js?" + new Date().getTime())
      .then((mod) => {
        this._inject_evajw(mod);
      })
      .catch((err) => {
        this._critical("evajs WASM module load error", true);
        this._critical(err);
        return;
      });
  }

  _is_ws_handler_registered() {
    let me;
    if (this === undefined) {
      me = window.$eva;
    } else {
      me = this;
    }
    return me._ws_handler_registered;
  }

  // WASM override
  _clear_watchers() {
    this._update_state_functions = [];
    this._update_state_mask_functions = [];
  }

  // WASM override
  _clear_states() {
    this._states = [];
  }

  _clear() {
    //this._clear_watchers();
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

  _critical(message, write_on_screen) {
    if (write_on_screen) {
      document.write('<font color="red" size="30">' + message + "</font>");
    }
    jsaltt.logger.error(message);
    throw "critical";
  }

  _prepare_api_call(method: string, params: object): JsonRpcRequest {
    if (this._api_call_id == 4294967295) {
      this._api_call_id = 0;
    }
    this._api_call_id += 1;
    var id = this._api_call_id;
    var api_uri = this.api_uri + "/jrpc";
    var me = this;
    this._debug("_api_call", `${id}: ${api_uri}: ${func}`);
    if (this.debug == 2) {
      log.debug(func, params);
    }
    var payload = {
      jsonrpc: "2.0",
      method: func,
      params: params,
      id: id
    };
    return payload;
  }

  async _api_call(method: string, params?: object): Promise<any> {
    let payload = this._prepare_api_call(method, params);
    return new Promise(function (resolve, reject) {
      me.external
        .fetch(api_uri, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          redirect: "error",
          body: JSON.stringify(payload)
        })
        .then(function (response) {
          if (response.ok) {
            me._debug("_api_call", id + " success");
            response
              .json()
              .then(function (data) {
                if (
                  !"id" in data ||
                  data.id != id ||
                  (!"result" in data && !"error" in data)
                ) {
                  reject({
                    code: -32009,
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
                    log.debug(`API ${id} ${func} response`, data.result);
                  }
                  resolve(data.result);
                }
              })
              .catch(function (err) {
                var code = -32009;
                var message = "Invalid server response";
                me._debug("_api_call", `${id} failed: ${code} (${message})`);
                reject({
                  code: code,
                  message: message,
                  data: data
                });
              });
          } else {
            var code = -32007;
            var message = "Server error";
            me._debug("_api_call", `${id} failed: ${code} (${message})`);
            reject({ code: code, message: message, data: data });
          }
        })
        .catch(function (err) {
          var code = -32007;
          var message = "Server error";
          me._debug("_api_call", `${id} failed: ${code} (${message})`);
          reject({ code: code, message: message, data: null });
        });
    });
  }

  _heartbeat(on_login) {
    return new Promise(function (resolve, reject) {
      if (on_login) me._last_ping = null;
      var q = {};
      if (on_login && me.api_version != 4) {
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
            var payload;
            if (me.api_version == 4) {
              payload = { m: "ping" };
            } else {
              payload = { s: "ping" };
            }
            me.ws.send(JSON.stringify(payload));
            me.ws.send("");
          } catch (err) {
            me._debug("heartbeat", "error: unable to send ws ping");
            me._invoke_handler("heartbeat_error", err);
            reject();
            return;
          }
        }
      }
      me.call("test", q)
        .then(function (data) {
          me.server_info = data;
          me.tsdiff = new Date().getTime() / 1000 - data.time;
          if (on_login) {
            if (data["cvars"]) {
              me._cvars = data["cvars"];
            } else {
              me._cvars = {};
            }
          }
          me._invoke_handler("heartbeat.success");
          resolve(true);
        })
        .catch(function (err) {
          me._debug("heartbeat", "error: unable to send test API call");
          me._invoke_handler("heartbeat.error", err);
        });
      me._debug("heartbeat", "ok");
    });
  }

  _load_log_entries(postprocess) {
    if (!me) var me = this;
    var method = "log_get";
    if (me.api_version == 4) {
      method = "log.get";
    }
    if (me.ws_mode) me._lr2p = [];
    me.call(method, {
      l: me.log.level,
      n: me.log.records
    })
      .then(function (data) {
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
      .catch(function (err) {
        jsaltt.logger.error("unable to load log entries");
      });
  }

  _schedule_restart() {
    var me = this;
    me._scheduled_restarter = setTimeout(function () {
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
        this.ws.onerror = function () {};
        //this.ws.send(JSON.stringify({s: 'bye'}));
        this.ws.close();
      } catch (err) {
        // web socket may be still open, will close later
        var ws = this.ws;
        setTimeout(function () {
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
      [
        this.api_uri + "/ui",
        this.api_uri + "/pvt",
        this.api_uri + "/rpvt",
        this.api_uri + "/upload"
      ].map(
        (uri) => (document.cookie = `auth=${this.api_token}; path=${uri}`),
        this
      );
    }
  }

  // WASM override
  _process_loaded_states(data, clear_unavailable, me) {
    if (!me) var me = this;
    let received_oids = [];
    if (clear_unavailable) {
      data.map((s) => received_oids.push(s.oid));
    }
    data.map((s) => me._process_state(s));
    if (clear_unavailable) {
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
  }

  _state_updates_v3_as_v4_list(me) {
    var groups = me.state_updates["g"];
    var tp = me.state_updates["p"];
    var masks = [];
    if (groups && tp) {
      groups.map((g) => {
        tp.map((t) => {
          let mask = t + ":" + g;
          if (!g.endsWith("#") && !g.endsWith("*")) {
            mask += "/+";
          }
          masks.push(mask);
        });
      });
    } else if (groups) {
      groups.map((g) => {
        let mask = "+:" + g;
        if (!g.endsWith("#") && !g.endsWith("*")) {
          mask += "/+";
        }
        masks.push(mask);
      });
    } else if (tp) {
      tp.map((t) => {
        masks.push(t + ":#");
      });
    }
    return masks;
  }

  _load_states() {
    if (!me) var me = this;
    return new Promise(function (resolve, reject) {
      if (!me.state_updates) {
        resolve(true);
      } else {
        var params = {};
        var method = "state_all";
        if (me.api_version == 4) {
          method = "item.state";
        }
        if (me.api_version == 4) {
          params["full"] = true;
          if (me.state_updates == true) {
            params["i"] = "#";
          } else if (Array.isArray(me.state_updates)) {
            params["i"] = me.state_updates;
          } else {
            jsaltt.logger.warning(
              "deprecated state_updates format, consider switching to OID mask array"
            );
            var masks;
            try {
              masks = me._state_updates_v3_as_v4_list(me);
              params["i"] = masks;
            } catch (err) {
              log.error(err);
            }
          }
        } else {
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
        }
        me.call(method, params)
          .then(function (data) {
            me._process_loaded_states(data, me.clear_unavailable, me);
            resolve(true);
          })
          .catch(function (err) {
            reject(err);
          });
      }
    });
  }

  _start_ws() {
    var me = this;
    return new Promise(function (resolve, reject) {
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
          if (uri.startsWith("http://")) {
            uri = uri.replace("http://", "ws://");
          } else if (uri.startsWith("https://")) {
            uri = uri.replace("https://", "wss://");
          } else {
            var loc = window.location;
            if (loc.protocol === "https:") {
              uri = "wss:";
            } else {
              uri = "ws:";
            }
            uri += "//" + loc.host + me.api_uri;
          }
        }
        let ws_uri = `${uri}/ws?k=${me.api_token}`;
        if (me._intervals.ws_buf_ttl > 0) {
          ws_uri += `&buf_ttl=${me._intervals.ws_buf_ttl}`;
        }
        if (me.client_id != null) {
          ws_uri += `&client_id=${me.client_id}`;
        }
        me.ws = new me.external.WebSocket(ws_uri);
        me.ws.onmessage = function (evt) {
          me._process_ws(evt.data);
        };
        me.ws.addEventListener("open", function (event) {
          me._debug("_start_ws", "ws connected");
          var st;
          if (me.state_updates) {
            if (me.api_version == 4) {
              st = { m: "subscribe.state" };
              var masks;
              if (me.state_updates == true) {
                masks = ["#"];
              } else if (Array.isArray(me.state_updates)) {
                masks = me.state_updates;
              } else {
                masks = me._state_updates_v3_as_v4_list(me);
              }
              st["p"] = masks;
            } else {
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
          }
          if (st) {
            me.ws.send(JSON.stringify(st));
            me.ws.send("");
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
      if (this.ws) {
        var payload;
        if (this.api_version == 4) {
          payload = { m: "subscribe.log", p: l };
        } else {
          payload = { s: "log", l: l };
        }
        this.ws.send(JSON.stringify(payload));
        this.ws.send("");
      }
    } catch (err) {
      this._debug("log_level", "warning: unable to send ws packet");
    }
  }

  _process_ws_frame_pong() {
    let me;
    if (this === undefined) {
      me = window.$eva;
    } else {
      me = this;
    }
    me._last_pong = Date.now() / 1000;
  }

  _process_ws_frame_log(d) {
    let me;
    if (this === undefined) {
      me = window.$eva;
    } else {
      me = this;
    }
    if (Array.isArray(d)) {
      d.map((l) => me._preprocess_log_record(l), me);
    } else {
      me._preprocess_log_record(d);
    }
    me._invoke_handler("log.postprocess");
    return;
  }

  // WASM override
  _process_ws(payload) {
    var data = JSON.parse(payload);
    if (data.s == "pong") {
      this._debug("ws", "pong");
      this._process_ws_frame_pong();
      return;
    }
    if (data.s == "reload") {
      this._debug("ws", "reload");
      this._invoke_handler("server.reload");
      return;
    }
    if (data.s == "server") {
      let ev = "server." + data.d;
      this._debug("ws", ev);
      this._invoke_handler(ev);
      return;
    }
    if (data.s.substring(0, 11) == "supervisor.") {
      this._debug("ws", data.s);
      this._invoke_handler(data.s, data.d);
      return;
    }
    if (this._invoke_handler("ws.event", data) === false) return;
    if (data.s == "state") {
      this._debug("ws", "state");
      if (Array.isArray(data.d)) {
        data.d.map((s) => this._process_state(s, true), this);
      } else {
        this._process_state(data.d, true);
      }
      return;
    }
    if (data.s == "log") {
      this._debug("ws", "log");
      this._process_ws_frame_log(data.d);
      return;
    }
  }

  _preprocess_log_record(l) {
    this._log_loaded
      ? this._invoke_handler("log.record", l)
      : this._lr2p.push(l);
  }

  // WASM override
  _clear_state(oid) {
    delete this._states[oid];
    this._process_state({
      oid: oid,
      status: null,
      value: null
    });
  }

  _process_state(state, is_update) {
    var old_state;
    try {
      var oid = state.oid;
      // copy missing fields from old state
      if (oid in this._states) {
        old_state = this._states[oid];
      }
      if (!old_state && is_update) {
        return;
      }
      if (!jsaltt.cmp(state, old_state)) {
        if (this.api_version != 4) {
          if (state.set_time === true) {
            old_state = undefined;
            state.set_time = 0;
          }
        }
        if (
          // no old state
          old_state === undefined ||
          // controller changed
          state.controller_id != old_state.controller_id ||
          // node changed (v4)
          state.node != old_state.node ||
          // use ieid
          (state.ieid !== undefined &&
            (old_state.ieid === undefined ||
              state.ieid[0] == 0 ||
              old_state.ieid[0] < state.ieid[0] ||
              (old_state.ieid[0] == state.ieid[0] &&
                old_state.ieid[1] < state.ieid[1]))) ||
          // use set_time
          (state.ieid === undefined &&
            (state.set_time === undefined ||
              old_state.set_time === undefined ||
              state.set_time >= old_state.set_time))
        ) {
          if (old_state && (is_update || state.ieid == undefined)) {
            Object.keys(old_state).map(function (k) {
              if (!(k in state)) {
                state[k] = old_state[k];
              }
            });
          }
          this._debug(
            "process_state",
            `${oid} s: ${state.status} v: "${state.value}"`,
            `act: ${state.act} t: "${state.t}"`
          );
          this._states[oid] = state;
          if (oid in this._update_state_functions) {
            this._update_state_functions[oid].map(function (f) {
              try {
                f(state);
              } catch (err) {
                jsaltt.logger.error(
                  `state function processing for ${oid}:`,
                  err
                );
              }
            });
          }
          Object.keys(this._update_state_mask_functions).map(function (k) {
            if (this._oid_match(oid, k)) {
              this._update_state_mask_functions[k].map(function (f) {
                try {
                  f(state);
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

  _invoke_handler(handler: HandlerId, ...args: any[]) {
    let f = this._handlers.get(handler);
    if (f) {
      this._debug("invoke_handler", "invoking for " + handler);
      try {
        f.apply(this, args);
      } catch (err) {
        this.logger.error(`handler for ${handler}:`, err);
      }
    }
  }

  _oid_match(oid, mask) {
    return new RegExp("^" + mask.split("*").join(".*") + "$").test(oid);
  }

  _debug(method, ...data: any[]) {
    if (this.debug) {
      this.logger.debug.apply([`EVA::${method}`].concat(data));
    }
  }

  parse_svc_message(msg?: string): SvcMessage {
    if (msg && msg.startsWith("|")) {
      let sp = msg.split("|");
      let kind = sp[1];
      if (kind) {
        let result = { kind: kind, svc: sp[2] };
        let svc_msg = sp[3];
        if (svc_msg) {
          let sp_msg = svc_msg.split("=");
          result.message = sp_msg[0];
          result.value = sp_msg[1];
        }
        return result;
      }
    }
    return null;
  }

  /**
   * OTP setup code
   *
   * @param ctx html <canvas /> element or id to generate QR code in
   * @param secret {string} OTP secret
   * @param params {object} object with additional parameters
   *        size QR code size in px (default: 200)
   *        issuer override issuer (default: HMI document.location.hostname)
   *        user override user (default: $eva.login)
   *        xtr extra parameters (added as-is)
   *
   * @returns QRious QR object if QR code is generated
   */
  otpQR(ctx, secret, params) {
    if (typeof document !== "object") {
      jsaltt.logger.error("document object not found");
      return;
    }
    var params = params;
    if (!params) params = {};
    let size = params["size"];
    if (!size) {
      size = 200;
    }
    let issuer = params["issuer"];
    if (!issuer) {
      issuer = "HMI " + document.location.hostname;
    }
    let user = params["user"];
    if (!user) {
      user = this.login;
    }
    let value =
      "otpauth://totp/" +
      encodeURIComponent(user) +
      `?secret=${secret}&issuer=` +
      encodeURIComponent(issuer);
    let xtr = params["xtr"];
    if (xtr) {
      value += xtr;
    }
    return new this.external.QRious({
      element: typeof ctx === "object" ? ctx : document.getElementById(ctx),
      value: value,
      size: size
    });
  }

  /**
   * QR code for EvaHI
   *
   * Generates QR code for :doc:`EvaHI</evahi>`-compatible apps (e.g. for EVA
   * ICS Control Center mobile app for Android). Current framework session
   * must be authorized using user login. If $eva.password is defined, QR
   * code also contain password value. Requires qrious js library.
   *
   * @param ctx html <canvas /> element or id to generate QR code in
   * @param params {object} object with additional parameters
   *                        size - QR code size in px (default: 200)
   *                        url - override UI url (default: document.location)
   *                        user - override user (default: authorized_user)
   *                        password - override password
   *
   * @returns QRious QR object if QR code is generated
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
    return new this.external.QRious({
      element: typeof ctx === "object" ? ctx : document.getElementById(ctx),
      value: value,
      size: size
    });
  }
}

if (typeof window !== "undefined") {
  $eva = new EVA();
  window.$eva = new EVA();
}

export default EVA;
export { EVA, EvaError, ActionResult, HandlerId, IntervalId };
