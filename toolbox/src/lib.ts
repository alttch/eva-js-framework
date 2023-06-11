const eva_toolbox_version = "0.5.0";

import "./style.css";
import { EVA } from "@eva-ics/framework";

interface ChartParams {
  timeframe?: string | Array<string>;
  animate?: (ctx: string | HTMLDivElement) => void;
  fill?: string;
  update?: number;
  prop?: string;
  units?: string;
  args: any;
}

interface PopupParams {
  ct?: number;
  btn1?: string;
  btn2?: string;
  va?: () => boolean;
}

enum PopupKind {
  Info = "info",
  Warning = "warning",
  Error = "error",
  InfoLarge = "!info",
  WarningLarge = "!warning",
  ErrorLarge = "error"
}

class EVA_TOOLBOX {
  eva: EVA;
  version: string;
  /**
   * Constructs a toolbox object
   *
   * @param eva {obect} EVA object instance
   */
  constructor(eva: EVA) {
    this.eva = eva;
    this.version = eva_toolbox_version;
  }
  /**
   * Display a chart
   *
   * If multiple timeframes and multiple items are specified, chart data is
   * filled as: first timeframe for all items, second timeframe for all
   * items etc.
   *
   * To use the function, EVA object instance external.Chart field
   * ($eva.external.Chart for web browsers) must be set to Chart.js class
   *
   * @param ctx {string|object} html container element or id to draw in (must
   *                            have fixed width/height)
   * @param cfg {object} Chart.js configuration
   * @param oid {string|array} item oid or oids
   *
   * @param params {object} object with props
   *
   *               timeframe - timeframe to display (5T - 5 min, 2H - 2 hr, 2D
   *               - 2 days etc.), default: 1D. To display past timeframes, use
   *               two values, separated with ":", e.g. 2D:1D - get data for
   *               yesterday. To display multiple timeframes, send this param as
   *               array. Axis X is always formed from the first timeframe. If
   *               you want to change this, put "t" before the necessary
   *               timeframe, e.g.: t2D:1D
   *
   *               fill - precision[:np] (10T - 60T recommended, more accurate -
   *               more data), np - number precision, optional. default: 30T:2
   *
   *               update - update interval in seconds. If the chart container
   *               is no longer visible, chart stops updating
   *
   *               prop - item property to use (default is value)
   *
   *               units - data units (e.g. mm or °C)
   *
   *               args - additional API options (state_history)
   *
   * @returns chart object
   */
  chart(
    ctx: string | HTMLDivElement,
    cfg: any,
    oid: string | Array<string>,
    params?: ChartParams,
    _chart?: any
  ) {
    let _params = params || ({} as ChartParams);
    let _oid: Array<string> = Array.isArray(oid) ? oid : oid.split(",");
    let timeframe = _params.timeframe || "1D";
    let fill = _params.fill || "30T:2";
    let update = _params.update;
    let prop = _params.prop;
    let cc: HTMLDivElement =
      typeof ctx === "object"
        ? ctx
        : (document.getElementById(ctx) as HTMLDivElement);
    let data_units = _params.units;
    let chart: any;
    let nchart: any;
    let canvas: HTMLCanvasElement;
    let work_cfg: any;
    let animate = _params.animate || this.animate;
    let api_opts = _params.args || {};
    if (_chart) {
      chart = _chart;
    } else {
      canvas = document.createElement("canvas");
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.className = "eva_toolbox_chart";
      cc.innerHTML = "";
      cc.appendChild(canvas);
      work_cfg = cfg || {};
      nchart = new this.eva.external.Chart(canvas, work_cfg);
    }
    var chartfunc = () => {
      if (chart && (cc.offsetWidth <= 0 || cc.offsetHeight <= 0)) {
        chart.destroy();
        return;
      }
      if (!chart) this.animate(ctx);
      var x = "value";
      if (prop !== undefined && prop !== null) {
        x = prop;
      }
      let tframes: Array<string> = Array.isArray(timeframe)
        ? timeframe
        : [timeframe];
      let calls: Promise<any>[] = [];
      let primary_tf_idx = 0;
      tframes.map((tf, idx) => {
        let t = tf.split(":");
        let t_start = t[0];
        if (t_start.startsWith("t")) {
          t_start = t_start.substr(1);
          primary_tf_idx = idx;
        }
        let t_end = t[1] || null;
        let _api_opts = {
          ...{
            s: t_start,
            e: t_end,
            x: x,
            w: fill
          },
          ...api_opts
        };
        let method;
        calls.push(this.eva.call("item.state_history", _oid, _api_opts));
      });
      Promise.all(calls)
        .then(function (result) {
          let index = 0;
          let wtf = 0;
          result.map((data) => {
            data.t.forEach((t: number, index: number) => {
              if (t) {
                data.t[index] = new Date(t * 1000);
              }
            });
            if (chart) {
              if (wtf == primary_tf_idx) {
                chart.data.labels = data.t;
              }
              for (let i = 0; i < _oid.length; i++) {
                chart.data.datasets[i + index].data = data[_oid[i] + "/" + x];
              }
              chart.update();
            } else {
              if (wtf == primary_tf_idx) {
                work_cfg.data.labels = data.t;
              }
              for (let i = 0; i < _oid.length; i++) {
                work_cfg.data.datasets[i + index].data =
                  data[_oid[i] + "/" + x];
              }
              chart = nchart;
              chart.update();
              cc.innerHTML = "";
              cc.appendChild(canvas);
              if (data_units) {
                let p = {
                  tooltip: {
                    callbacks: {}
                  }
                };
                work_cfg.options.plugins = {
                  ...p,
                  ...work_cfg.options.plugins
                };
                work_cfg.options.plugins.tooltip.callbacks.label = (
                  ctx: any
                ) => {
                  return ctx.formattedValue + data_units;
                };
              }
            }
            index += _oid.length;
            wtf++;
          });
        })
        .catch((err) => {
          let d_error = document.createElement("div");
          d_error.className = "eva_toolbox_chart";
          d_error.style.cssText =
            "width: 100%; height: 100%; " +
            "color: red; font-weight: bold; font-size: 14px";
          d_error.innerHTML = "Error loading chart data: " + err.message;
          cc.innerHTML = "";
          cc.appendChild(d_error);
          if (chart) chart.destroy();
          chart = null;
        });
      if (update) {
        setTimeout(chartfunc, update * 1000);
      }
    };
    chartfunc();
    return nchart;
  }

  /**
   * Animate html element block
   *
   * Simple loading animation
   *
   * @param {string|object} ctx DOM element (or id)
   */
  animate(ctx: string | HTMLDivElement) {
    var el =
      typeof ctx === "object"
        ? ctx
        : (document.getElementById(ctx) as HTMLDivElement);
    el.innerHTML =
      '<div class="eva-toolbox-cssload-square"><div \
      class="eva-toolbox-cssload-square-part \
      eva-toolbox-cssload-square-green"></div><div \
      class="eva-toolbox-cssload-square-part \
      eva-toolbox-cssload-square-pink"></div><div \
      class="eva-toolbox-cssload-square-blend"></div></div>';
  }

  /**
   * Popup window
   *
   * Opens  popup window.
   *
   * There can be only one popup opened using the specified html ctx. If the
   * page wants to open another popup, the current one is overwritten unless
   * its pclass is higher than a new one.
   *
   * @param ctx {string|object} html element to use as popup (any empty <div />
   *                            is fine)
   * @param kind {string} popup kind: info, warning or error. opens a large
   *                        popup window if '!' is put before the class (e.g.
   *                        !info)
   * @param title {string} popup window title
   * @param msg {string} popup window message
   * @param params {object} object with handlers and additional parameters:
   *
   *                        ct - popup auto close time (sec), equal to pressing
   *                        escape
   *
   *                        btn1 - button 1 name (default: 'OK')
   *                        btn2 - button 2 name
   *
   *                        va - validate function which is executed before
   *                        Promise resolves. If the function returns true, the
   *                        popup is closed and resolve function is executed.
   *                        The function is commonly used to validate input if
   *                        the popup contains input fields.
   *
   * @returns Promise object. Resolve and reject functions are called with
   *                         "true" parameter if button is pressed by user.
   *
   */
  async popup(
    ctx: string | HTMLDivElement,
    kind: PopupKind,
    title: string,
    msg: string,
    params?: PopupParams
  ): Promise<boolean> {
    let _params = params || ({} as PopupParams);
    if (typeof window === "undefined") throw Error("DOM is required");
    return new Promise(function (resolve, reject) {
      let popup: any =
        typeof ctx === "object" ? ctx : document.getElementById(ctx);
      if (popup === undefined || popup === null)
        throw Error(`DOM context ${ctx} not found`);
      let ct = _params.ct;
      let btn1 = _params.btn1;
      let btn2 = _params.btn2;
      let va = _params.va;
      let _pkind = kind as string;
      if (_pkind[0] == "!") {
        _pkind = _pkind.substr(1);
      }
      let popup_priority = (p: string) => {
        switch (p) {
          case "info":
            return 20;
          case "warning":
            return 30;
          case "error":
            return 40;
          default:
            return 0;
        }
      };
      if (popup && popup_priority(popup.priority) > popup_priority(_pkind)) {
        throw Error("a popup with higher priority is already active");
      }
      if (popup) {
        clearInterval((popup as any).ticker);
        document.removeEventListener("keydown", popup.key_listener);
      }
      popup.innerHTML = "";
      popup.priority = _pkind;
      popup.className = "eva_toolbox_popup";
      let popup_window = document.createElement("div");
      popup.appendChild(popup_window);
      if (kind[0] == "!") {
        popup_window.className = "eva_toolbox_popup_window_big";
      } else {
        popup_window.className = "eva_toolbox_popup_window";
      }
      let popup_header = document.createElement("div");
      popup_header.className =
        "eva_toolbox_popup_header eva_toolbox_popup_header_" + _pkind;
      if (title !== undefined && title !== null) {
        popup_header.innerHTML = title;
      } else {
        popup_header.innerHTML =
          _pkind.charAt(0).toUpperCase() + _pkind.slice(1);
      }
      popup_window.append(popup_header);
      let popup_content = document.createElement("div");
      popup_content.className = "eva_toolbox_popup_content";
      popup_content.innerHTML = msg;
      popup_window.appendChild(popup_content);
      let popup_footer = document.createElement("div");
      popup_footer.className = "eva_toolbox_popup_footer";
      popup_window.appendChild(popup_footer);
      let popup_buttons = document.createElement("div");
      popup_buttons.className = "row";
      popup_window.appendChild(popup_buttons);
      let popup_btn1 = document.createElement("div");
      let popup_btn2 = document.createElement("div");
      let spacer = document.createElement("div");
      spacer.className = "col-xs-1 col-sm-2";
      popup_buttons.appendChild(spacer);
      popup_buttons.appendChild(popup_btn1);
      popup_buttons.appendChild(popup_btn2);
      spacer = document.createElement("div");
      spacer.className = "col-xs-1 col-sm-2";
      popup_buttons.appendChild(spacer);
      let btn1text = "OK";
      if (btn1) {
        btn1text = btn1;
      }
      let btn1_o = document.createElement("div");
      btn1_o.className =
        "eva_toolbox_popup_btn eva_toolbox_popup_btn_" + _pkind;
      btn1_o.innerHTML = btn1text;
      let close_popup = () => {
        clearInterval(popup.ticker);
        popup.style.display = "none";
        popup.innerHTML = "";
        document.removeEventListener("keydown", popup.key_listener);
        popup.priority = null;
      };
      let f_validate_run_and_close = function () {
        if (va === undefined || va == null || va()) {
          close_popup();
          resolve(true);
        }
      };
      btn1_o.addEventListener("click", f_validate_run_and_close);
      popup_btn1.appendChild(btn1_o);
      let btn2_o: HTMLDivElement;
      if (btn2) {
        btn2_o = document.createElement("div");
        btn2_o.className =
          "eva_toolbox_popup_btn eva_toolbox_popup_btn_" + _pkind;
        btn2_o.innerHTML = btn2;
        btn2_o.addEventListener("click", function () {
          close_popup();
          reject(true);
        });
        popup_btn2.appendChild(btn2_o);
        popup_btn1.className += " col-xs-5 col-sm-4";
        popup_btn2.className += " col-xs-5 col-sm-4";
      } else {
        popup_btn1.className += " col-xs-10 col-sm-8";
        popup_btn2.style.display = "none";
      }
      popup.style.display = "block";
      popup.key_listener = (e: KeyboardEvent) => {
        if (e.which == 27) {
          close_popup();
          reject();
          e.preventDefault();
        }
        if (e.which == 13) {
          f_validate_run_and_close();
          e.preventDefault();
        }
      };
      document.addEventListener("keydown", popup.key_listener);
      if (ct && ct > 0) {
        popup.ct = ct;
        var ticker_func = () => {
          if (popup.ct <= 0) {
            close_popup();
            reject();
          }
          var obj;
          var txt = "";
          if (btn2_o) {
            obj = btn2_o;
            txt = btn2 as string;
          } else {
            obj = btn1_o;
            txt = btn1text;
          }
          obj.innerHTML = `${txt} (${popup.ct})`;
          popup.ct -= 1;
        };
        ticker_func();
        popup.ticker = setInterval(ticker_func, 1000);
      }
    });
  }
}

if (typeof window !== "undefined") {
  let $eva = (window as any).$eva;
  if (typeof $eva === "object") {
    $eva.toolbox = new EVA_TOOLBOX($eva);
    if (typeof (window as any).Chart !== "undefined") {
      $eva.external.Chart = (window as any).Chart;
    }
  }
}

export { EVA_TOOLBOX, ChartParams, PopupParams, PopupKind };
