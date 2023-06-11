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

interface OTPParams {
  size?: number;
  issuer?: string;
  user?: string;
  xtr?: string;
}

interface HiQRParams {
  size?: number;
  url?: string;
  user?: string;
  password?: string;
}

interface LogRecord {
  dt: string;
  h: string;
  l: number;
  lvl: string;
  mod: string;
  msg: string;
  t: number;
  th: string | null;
}

interface WsCommand {
  m: string;
  p?: any;
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
  params?: object;
  id: number;
}

interface JsonRpcResponse {
  jsonrpc: string;
  result?: object;
  error?: EvaError;
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

interface StatePayload {
  full?: boolean;
  i?: string | Array<string>;
}

interface LvarIncrDecrResult {
  result: number;
}

interface LogCollector {
  level: number;
  records: number;
}

interface ItemState {
  act?: number;
  connected?: boolean;
  enabled?: boolean;
  ieid?: Array<number>;
  meta?: object;
  node?: string;
  oid: string;
  status: number | null;
  t?: number;
  value: any;
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
  constructor(code: number, message?: string, data?: any) {
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
    let api_uri = `${this.eva.api_uri}/jrpc`;
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
        this.eva.watch_action(data.uuid, (action: ActionResult | EvaError) => {
          if ((action as ActionResult).finished) {
            resolve(action as ActionResult);
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
    let state = this.eva.state(lvar_oid) as ItemState;
    // if no such item
    if (state === undefined || state.t === undefined) return undefined;
    // if item has no expiration or expiration is set to zero
    if (
      !state.meta ||
      (state.meta as any).expires === undefined ||
      (state.meta as any).expires == 0
    ) {
      return null;
    }
    // if timer is disabled (stopped), return -2
    if (state.status == 0) return -2;
    // if timer is expired, return -1
    if (state.status == -1) return -1;
    let t =
      (state.meta as any).expires -
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
  _handlers: Map<HandlerId, (...args: any[]) => void | boolean>;
  _intervals: Map<IntervalId, number>;
  _ws_handler_registered: boolean;
  _heartbeat_reloader: any;
  _ajax_reloader: any;
  _log_reloader: any;
  _scheduled_restarter: any;
  _states: Map<string, ItemState>;
  _action_states: Map<string, ActionResult>;
  _action_watch_functions: Map<
    String,
    Array<(result: ActionResult | EvaError) => void>
  >;
  _last_ping: number | null;
  _last_pong: number | null;
  _log_subscribed: boolean;
  _log_started: boolean;
  _log_first_load: boolean;
  _log_loaded: boolean;
  _update_state_functions: Map<string, Array<(state: ItemState) => void>>;
  _update_state_mask_functions: Map<string, Array<(state: ItemState) => void>>;
  _lr2p: Array<LogRecord>;

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
    this._api_call_id = 0;
    this.tsdiff = 0;
    this._last_ping = null;
    this._last_pong = null;
    this._log_subscribed = false;
    this._log_started = false;
    this._log_first_load = false;
    this._log_loaded = false;
    this._lr2p = [];
    this.in_evaHI =
      typeof navigator !== "undefined" &&
      typeof navigator.userAgent === "string" &&
      navigator.userAgent.startsWith("evaHI ");
    this.log = {
      level: 20,
      records: 200
    };
    this._update_state_functions = new Map();
    this._update_state_mask_functions = new Map();
    this._handlers = new Map([[HandlerId.HeartBeatError, this.restart]]);
    this._handlers.set(HandlerId.HeartBeatError, this.restart);
    this._states = new Map();
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
  async start(): Promise<void> {
    this._cancel_scheduled_restart();
    this._debug("framework", `version: ${this.version}`);
    if (typeof fetch === "undefined") {
      this.logger.error(
        '"fetch" function is unavailable. Upgrade your web browser or ' +
          "connect polyfill"
      );
      return;
    }
    if (this.logged_in) {
      this._debug("start", "already logged in");
      return;
    }
    if (this.wasm && !this.evajw) {
      await this._start_evajw();
    } else {
      this._start_engine();
    }
  }
  _start_engine() {
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
    this._api_call("login", q)
      .then(() => {
        this.server_info.aci.token_mode = "normal";
        this._invoke_handler(HandlerId.LoginSuccess);
      })
      .catch((err: EvaError) => {
        this.error_handler(err, "set_normal");
        if (err.code !== -32022) {
          this._invoke_handler(HandlerId.LoginFailed, err);
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
  watch(oid: string, func: (state: ItemState) => void, ignore_initial = false) {
    if (oid.includes("*")) {
      let fcs = this._update_state_mask_functions.get(oid);
      if (fcs === undefined) {
        fcs = [];
        this._update_state_mask_functions.set(oid, fcs);
      }
      fcs.push(func);
      if (!ignore_initial) {
        let v = this.state(oid);
        if (Array.isArray(v)) {
          v.map(func);
        } else if (v !== undefined) {
          func(v);
        }
      }
    } else {
      let fcs = this._update_state_functions.get(oid);
      if (fcs === undefined) {
        fcs = [];
        this._update_state_functions.set(oid, fcs);
      }
      fcs.push(func);
      if (!ignore_initial) {
        let state = this.state(oid) as ItemState;
        if (state !== undefined) func(state);
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
  watch_action(uuid: string, func: (result: ActionResult | EvaError) => void) {
    let fcs = this._action_watch_functions.get(uuid);
    if (fcs === undefined) {
      fcs = [];
      this._action_watch_functions.set(uuid, fcs);
      fcs.push(func);
      const watcher = () => {
        this.call("action.result", { u: uuid })
          .then((result: ActionResult) => {
            let st = this._action_states.get(uuid);
            if (st === undefined || st.status != result.status) {
              this._action_states.set(uuid, result);
              let fcs = this._action_watch_functions.get(uuid);
              if (fcs !== undefined) {
                fcs.map((f) => f(result));
              }
            }
            if (result.finished) {
              this._action_watch_functions.delete(uuid);
              this._action_states.delete(uuid);
            } else {
              setTimeout(
                watcher,
                (this._intervals.get(IntervalId.ActionWatch) as number) * 1000
              );
            }
          })
          .catch((err: EvaError) => {
            let fcs = this._action_watch_functions.get(uuid);
            if (fcs) {
              fcs.map((f) => f(err));
            }
            this._action_watch_functions.delete(uuid);
            this._action_states.delete(uuid);
          });
      };
      setTimeout(
        watcher,
        (this._intervals.get(IntervalId.ActionWatch) as number) * 1000
      );
    } else {
      fcs.push(func);
      let state = this._action_states.get(uuid);
      if (state !== undefined) {
        func(state);
      }
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
  unwatch(oid?: string, func?: (state: ItemState) => void) {
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

  // WASM override
  _unwatch_func(oid: string, func?: (state: ItemState) => void) {
    let fcs = this._update_state_functions.get(oid);
    if (fcs !== undefined) {
      this._update_state_functions.set(
        oid,
        fcs.filter((el) => el !== func)
      );
    }
  }

  // WASM override
  _unwatch_all(oid: string) {
    this._update_state_functions.delete(oid);
  }

  // WASM override (not supported)
  _unwatch_mask_func(oid: string, func: (state: ItemState) => void) {
    let fcs = this._update_state_mask_functions.get(oid);
    if (fcs !== undefined) {
      this._update_state_mask_functions.set(
        oid,
        fcs.filter((el) => el !== func)
      );
    }
  }

  // WASM override
  _unwatch_mask_all(oid: string) {
    this._update_state_mask_functions.delete(oid);
  }

  /**
   * Get item status
   *
   * @param oid {string} item OID
   *
   * @returns item status(int) or undefined if no object found
   */
  // WASM override
  status(oid: string): number | null | undefined {
    let state = this.state(oid) as ItemState;
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
  value(oid: string): number | undefined {
    let state = this.state(oid) as ItemState;
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
  state(oid: string): ItemState | Array<ItemState> | undefined {
    if (!oid.includes("*")) {
      return this._state(oid);
    } else {
      return this._states_by_mask(oid);
    }
  }

  // WASM override
  _state(oid: string) {
    return this._states.get(oid);
  }

  // WASM override
  _states_by_mask(oid_mask: string): Array<ItemState> {
    let result: Array<ItemState> = [];
    Object.keys(this._states).map((k) => {
      if (this._oid_match(k, oid_mask)) {
        result.push(this._states.get(k) as ItemState);
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
  async stop(keep_auth?: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      this._stop_engine();
      this.logged_in = false;
      if (keep_auth) {
        resolve();
      } else if (this.api_token) {
        let token = this.api_token;
        this.erase_token_cookie();
        this._api_call("logout", { a: token })
          .then(() => {
            this.api_token = "";
            resolve();
          })
          .catch(function (err) {
            reject(err);
          });
      }
    });
  }

  // ***** private functions *****
  _inject_evajw(mod: any) {
    if (mod) {
      mod.init(undefined, this).then(() => {
        mod.init_engine();
        this.evajw = mod;
        let build = mod.get_build();
        this.logger.info(
          "EVA ICS JavaScript WASM engine loaded. Build: " + build
        );
        try {
          mod.check_license();
        } catch (err) {
          this.logger.error("License check failed. WASM engine disabled");
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
        function transfer_watchers(
          src: Map<string, Array<(state: ItemState) => void>>,
          mod: any
        ) {
          Object.keys(src).map((oid) => {
            (src.get(oid) as any).map((f: any) => {
              mod.watch(oid, f, true);
            });
          });
        }
        transfer_watchers(this._update_state_functions, mod);
        transfer_watchers(this._update_state_mask_functions, mod);
        return this._start_engine();
      });
    } else {
      this.evajw = null;
      return false;
    }
  }

  async _start_evajw() {
    this.evajw = undefined;
    let mod;
    try {
      mod = await import(
        /*webpackIgnore: true*/ "./evajw/evajw.js?" + new Date().getTime()
      );
    } catch (err) {
      this._critical("evajs WASM module load error", true, false);
      this._critical(err);
    }
  }

  _is_ws_handler_registered() {
    return this._ws_handler_registered;
  }

  // WASM override
  _clear_watchers() {
    this._update_state_functions.clear();
    this._update_state_mask_functions.clear();
  }

  // WASM override
  _clear_states() {
    this._states.clear();
  }

  _clear() {
    //this._clear_watchers();
    this._clear_states();
    this.server_info = null;
    this.tsdiff = 0;
    this._log_subscribed = false;
    this._log_first_load = true;
    this._log_loaded = false;
    this._log_started = false;
    this._lr2p = [];
    this._last_ping = null;
    this._last_pong = null;
  }

  _critical(message: any, write_on_screen = false, throw_err = true) {
    if (write_on_screen) {
      document.write(`<font color="red" size="30">${message}</font>`);
    }
    this.logger.critical(message);
    if (throw_err) {
      throw new Error(`critical: ${message}`);
    }
  }

  _prepare_api_call(method: string, params?: object): JsonRpcRequest {
    if (this._api_call_id == 4294967295) {
      this._api_call_id = 0;
    }
    this._api_call_id += 1;
    let id = this._api_call_id;
    if (this.debug == 2) {
      this.logger.debug(method, params);
    }
    return {
      jsonrpc: "2.0",
      method: method,
      params: params,
      id: id
    };
  }

  async _api_call(method: string, params?: object): Promise<any> {
    const req = this._prepare_api_call(method, params);
    const id = req.id;
    let api_uri = `${this.api_uri}/jrpc`;
    this._debug("_api_call", `${id}: ${api_uri}: ${method}`);
    return new Promise((resolve, reject) => {
      this.external
        .fetch(api_uri, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          redirect: "error",
          body: JSON.stringify(req)
        })
        .then((response: any) => {
          if (response.ok) {
            this._debug(method, `api call ${id}  success`);
            response
              .json()
              .then((data: JsonRpcResponse) => {
                if (
                  data.id != id ||
                  (data.result === undefined && data.error === undefined)
                ) {
                  reject(new EvaError(-32009, "Invalid server response", data));
                } else if (data.error) {
                  this._debug(
                    method,
                    `api call ${id} failed: ${data.error.code} (${data.error.message})`
                  );
                  reject(
                    new EvaError(data.error.code, data.error.message, data)
                  );
                } else {
                  if (this.debug == 2) {
                    this.logger.debug(
                      `API ${id} ${method} response`,
                      data.result
                    );
                  }
                  resolve(data.result);
                }
              })
              .catch((err: any) => {
                let code = -32009;
                let message = "Invalid server response";
                this._debug(
                  method,
                  `api call ${id} failed: ${code} (${message})`
                );
                reject(new EvaError(code, message));
              });
          } else {
            let code = -32007;
            let message = "Server error";
            this._debug(method, `api call ${id} failed: ${code} (${message})`);
            reject(new EvaError(code, message));
          }
        })
        .catch((err: any) => {
          let code = -32007;
          let message = "Server error";
          this._debug(method, `api call ${id} failed: ${code} (${message})`);
          reject({ code: code, message: message, data: null });
        });
    });
  }

  async _heartbeat(on_login: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      if (on_login) this._last_ping = null;
      if (this.ws_mode) {
        if (this._last_ping !== null) {
          if (
            this._last_pong === null ||
            this._last_ping - this._last_pong >
              (this._intervals.get(IntervalId.Heartbeat) as number)
          ) {
            this._debug("heartbeat", "error: ws ping timeout");
            this._invoke_handler(HandlerId.HeartBeatError);
          }
        }
        if (!on_login && this.ws) {
          this._last_ping = Date.now() / 1000;
          try {
            this._debug("heartbeat", "ws ping");
            let payload = { m: "ping" };
            this.ws.send(JSON.stringify(payload));
            this.ws.send("");
          } catch (err) {
            this._debug("heartbeat", "error: unable to send ws ping");
            this._invoke_handler(HandlerId.HeartBeatError, err);
            reject();
            return;
          }
        }
      }
      this.call("test")
        .then((data: any) => {
          this.server_info = data;
          this.tsdiff = new Date().getTime() / 1000 - data.time;
          this._invoke_handler(HandlerId.HeartBeatSuccess);
          resolve();
        })
        .catch((err: EvaError) => {
          this._debug("heartbeat", "error: unable to send test API call");
          this._invoke_handler(HandlerId.HeartBeatError, err);
        });
      this._debug("heartbeat", "ok");
    });
  }

  _load_log_entries(postprocess: boolean) {
    if (this.ws_mode) this._lr2p = [];
    this.call("log.get", {
      l: this.log.level,
      n: this.log.records
    })
      .then((data: Array<LogRecord>) => {
        if (this.ws_mode && this._log_first_load) {
          this._set_ws_log_level(this.log.level);
        }
        data.map((l) => this._invoke_handler(HandlerId.LogRecord, l));
        this._log_loaded = true;
        this._lr2p.map((l) => this._invoke_handler(HandlerId.LogRecord, l));
        if (postprocess) {
          this._invoke_handler(HandlerId.LogPostProcess);
        }
        this._log_first_load = false;
      })
      .catch((err: EvaError) => {
        this.logger.error(`unable to load log entries: ${err.message}`);
      });
  }

  _schedule_restart() {
    this._scheduled_restarter = setTimeout(() => {
      this.start();
    }, (this._intervals.get(IntervalId.Restart) as number) * 1000);
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
        setTimeout(() => {
          try {
            this.ws.close();
          } catch (err) {}
        }, 1000);
      }
    }
  }

  _prepare_call_params(params?: any): object {
    let p: any = to_obj(params);
    if (this.api_token) {
      p.k = this.api_token;
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
  _process_loaded_states(data: Array<ItemState>, clear_unavailable: boolean) {
    let received_oids: string[] = [];
    if (clear_unavailable) {
      data.map((s) => received_oids.push(s.oid));
    }
    data.map((s) => this._process_state(s));
    if (clear_unavailable) {
      this._states.forEach((state, oid) => {
        if (
          state.status !== undefined &&
          state.status !== null &&
          !received_oids.includes(oid)
        ) {
          this._debug(`clearing unavailable item ${oid}`);
          this._clear_state(oid);
        }
      });
    }
  }

  async _load_states(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.state_updates) {
        resolve();
      } else {
        let params: StatePayload = { full: true };
        if (this.state_updates == true) {
          params.i = "#";
        } else {
          params.i = this.state_updates;
        }
        this.call("item.state", params)
          .then((data: Array<ItemState>) => {
            this._process_loaded_states(data, this.clear_unavailable);
            resolve();
          })
          .catch((err: EvaError) => {
            reject(err);
          });
      }
    });
  }

  async _start_ws(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws_mode) {
        let uri;
        if (!this.api_uri) {
          let loc = window.location;
          if (loc.protocol === "https:") {
            uri = "wss:";
          } else {
            uri = "ws:";
          }
          uri += "//" + loc.host;
        } else {
          uri = this.api_uri;
          if (uri.startsWith("http://")) {
            uri = uri.replace("http://", "ws://");
          } else if (uri.startsWith("https://")) {
            uri = uri.replace("https://", "wss://");
          } else {
            let loc = window.location;
            if (loc.protocol === "https:") {
              uri = "wss:";
            } else {
              uri = "ws:";
            }
            uri += "//" + loc.host + this.api_uri;
          }
        }
        let ws_uri = `${uri}/ws?k=${this.api_token}`;
        let ws_buf_ttl = this._intervals.get(IntervalId.WSBufTTL) as number;
        if (ws_buf_ttl > 0) {
          ws_uri += `&buf_ttl=${ws_buf_ttl}`;
        }
        this.ws = new this.external.WebSocket(ws_uri);
        this.ws.onmessage = (evt: any) => {
          this._process_ws(evt.data);
        };
        this.ws.addEventListener("open", (event: any) => {
          this._debug("_start_ws", "ws connected");
          if (this.state_updates) {
            let st: WsCommand = { m: "subscribe.state" };
            var masks;
            if (this.state_updates == true) {
              masks = ["#"];
            } else {
              masks = this.state_updates;
            }
            st.p = masks;
            this.ws.send(JSON.stringify(st));
            this.ws.send("");
          }
          if (this._log_subscribed) {
            this.log_level(this.log.level);
          }
        });
      }
      resolve();
    });
  }

  _set_ws_log_level(level: number) {
    this._log_subscribed = true;
    try {
      if (this.ws) {
        let payload: WsCommand = { m: "subscribe.log", p: level };
        this.ws.send(JSON.stringify(payload));
        this.ws.send("");
      }
    } catch (err) {
      this._debug("log_level", "warning: unable to send ws packet", err);
    }
  }

  _process_ws_frame_pong() {
    this._last_pong = Date.now() / 1000;
  }

  _process_ws_frame_log(data: Array<LogRecord> | LogRecord) {
    if (Array.isArray(data)) {
      data.map((record) => this._preprocess_log_record(record));
    } else {
      this._preprocess_log_record(data);
    }
    this._invoke_handler(HandlerId.LogPostProcess);
  }

  // WASM override
  _process_ws(payload: string) {
    var data = JSON.parse(payload);
    if (data.s == "pong") {
      this._debug("ws", "pong");
      this._process_ws_frame_pong();
      return;
    }
    if (data.s == "reload") {
      this._debug("ws", "reload");
      this._invoke_handler(HandlerId.ServerReload);
      return;
    }
    if (data.s == "server") {
      let ev = "server." + data.d;
      this._debug("ws", ev);
      this._invoke_handler(ev as HandlerId);
      return;
    }
    if (data.s.substring(0, 11) == "supervisor.") {
      this._debug("ws", data.s);
      this._invoke_handler(data.s, data.d);
      return;
    }
    if (this._invoke_handler(HandlerId.WsEvent, data) === false) return;
    if (data.s == "state") {
      this._debug("ws", "state");
      if (Array.isArray(data.d)) {
        data.d.map(
          (state: ItemState) => this._process_state(state, true),
          this
        );
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

  _preprocess_log_record(record: LogRecord) {
    this._log_loaded
      ? this._invoke_handler(HandlerId.LogRecord, record)
      : this._lr2p.push(record);
  }

  // WASM override
  _clear_state(oid: string) {
    this._states.delete(oid);
    this._process_state({
      oid: oid,
      status: null,
      value: null
    });
  }

  _process_state(state: ItemState, is_update = false) {
    try {
      let oid = state.oid;
      let old_state = this._states.get(oid);
      if (!old_state && is_update) {
        return;
      }
      if (
        // no old state
        old_state === undefined ||
        // node
        state.node != old_state.node ||
        // use ieid
        (state.ieid !== undefined &&
          (old_state.ieid === undefined ||
            state.ieid[0] == 0 ||
            old_state.ieid[0] < state.ieid[0] ||
            (old_state.ieid[0] == state.ieid[0] &&
              old_state.ieid[1] < state.ieid[1])))
      ) {
        if (old_state && (is_update || state.ieid == undefined)) {
          Object.keys(old_state).map(function (k) {
            if (!(k in state)) {
              // copy fields as-is
              (state as any)[k] = (old_state as any)[k];
            }
          });
        }
        this._debug(
          "process_state",
          `${oid} s: ${state.status} v: "${state.value}"`,
          `act: ${state.act} t: "${state.t}"`
        );
        this._states.set(oid, state);
        let fcs = this._update_state_functions.get(oid);
        if (fcs) {
          fcs.map((f) => {
            try {
              f(state);
            } catch (err) {
              this.logger.error(`state function processing for ${oid}:`, err);
            }
          });
        }
        this._update_state_mask_functions.forEach((fcs, k) => {
          if (this._oid_match(oid, k)) {
            fcs.map((f) => {
              try {
                f(state);
              } catch (err) {
                this.logger.error(`state function processing for ${oid}:`, err);
              }
            });
          }
        });
        Object.keys(this._update_state_mask_functions).map((k) => {}, this);
      }
    } catch (err) {
      this.logger.error("State processing error, invalid object received", err);
    }
  }

  _invoke_handler(handler: HandlerId, ...args: any[]): void | boolean {
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

  _oid_match(oid: string, mask: string): boolean {
    return new RegExp("^" + mask.split("*").join(".*") + "$").test(oid);
  }

  _debug(method: string, ...data: any[]) {
    if (this.debug) {
      this.logger.debug.apply(this.logger, [`EVA::${method}`].concat(data));
    }
  }

  parse_svc_message(msg?: string): SvcMessage | null {
    if (msg && msg.startsWith("|")) {
      let sp = msg.split("|");
      let kind = sp[1];
      if (kind) {
        let result: SvcMessage = { kind: kind, svc: sp[2] };
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
  otpQR(ctx: object | string, secret: string, params?: OTPParams) {
    if (typeof document !== "object") {
      this.logger.error("document object not found");
      return;
    }
    if (!params) params = {};
    let size = params.size || 200;
    let issuer = params.issuer || `HMI ${document.location.hostname}`;
    let user = params.user || this.login;
    let value =
      "otpauth://totp/" +
      encodeURIComponent(user) +
      `?secret=${secret}&issuer=` +
      encodeURIComponent(issuer);
    if (params.xtr) {
      value += params.xtr;
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
   *                        user - override user (default: authorized_user),
   *                        password - override password, null to clear
   *
   * @returns QRious QR object if QR code is generated
   */
  hiQR(ctx: object | string, params?: HiQRParams) {
    if (typeof document !== "object") {
      this.logger.error("document object not found");
      return;
    }
    if (!params) params = {};
    let url = params.url || document.location.href;
    let user = params.user || this.authorized_user || "";
    if (!url || !user || user.startsWith(".")) {
      return;
    }
    let password = params.password;
    if (password === undefined) {
      password = this.password;
    }
    let size = params.size || 200;
    let link = document.createElement("a");
    link.href = url;
    let protocol = link.protocol.substring(0, link.protocol.length - 1);
    let host = link.hostname;
    let port = link.port || (protocol == "http" ? "80" : "443");
    let value = `scheme:${protocol}|address:${host}|port:${port}|user:${user}`;
    if (password) {
      value += `|password:${password}`;
    }
    return new this.external.QRious({
      element: typeof ctx === "object" ? ctx : document.getElementById(ctx),
      value: value,
      size: size
    });
  }
}

if (typeof window !== "undefined") {
  let $eva = new EVA();
  (window as any).$eva = new EVA();
}

export default EVA;
export {
  EVA,
  EvaError,
  ActionResult,
  ItemState,
  LogRecord,
  HandlerId,
  IntervalId,
  OTPParams,
  HiQRParams
};
