"use strict";

import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';

(() => {
  const eva_framework = require("@eva-ics/framework");
  const jsaltt = require("@altertech/jsaltt");

  const css = require("./style.css");

  var $eva = eva_framework.$eva;
  /**
   * Display a chart
   *
   * If multiple timeframes and multiple items are specified, chart data is
   * filled as: first timeframe for all items, second timeframe for all
   * items etc.
   *
   * @param ctx {string|object} html container element or id to draw in (must
   *                            have fixed width/height)
   * @param cfg {object} Chart.js configuration (Chart.js v4)
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
  function eva_toolbox_chart(ctx, cfg, oid, params, _chart) {
    var params = jsaltt.extend({}, params);
    var _oid;
    if (typeof oid === "object") {
      _oid = oid;
    } else {
      _oid = oid.split(",");
    }
    var timeframe = params["timeframe"];
    if (!timeframe) {
      timeframe = "1D";
    }
    var fill = params["fill"];
    if (!fill) {
      fill = "30T:2";
    }
    var update = params["update"];
    var prop = params["prop"];
    var cc = typeof ctx === "object" ? ctx : document.getElementById(ctx);
    var data_units = params["units"];
    var chart;
    var nchart;
    var canvas;
    var work_cfg;
    var animate = params["animate"];
    var api_opts = params["args"];
    if (!api_opts) api_opts = {};
    if (!animate) animate = animate_el;
    if (_chart) {
      chart = _chart;
    } else {
      canvas = document.createElement("canvas");
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.className = "eva_toolbox_chart";
      cc.innerHTML = "";
      cc.appendChild(canvas);
      work_cfg = jsaltt.extend({}, cfg);
      nchart = new Chart(canvas, work_cfg);
    }
    var chartfunc = function() {
      if (chart && (cc.offsetWidth <= 0 || cc.offsetHeight <= 0)) {
        chart.destroy();
        return;
      }
      if (!chart) animate(ctx);
      var x = "value";
      if (prop !== undefined && prop !== null) {
        x = prop;
      }
      let tframes = timeframe;
      if (!Array.isArray(tframes)) {
        tframes = [tframes];
      }
      let calls = [];
      let primary_tf_idx = 0;
      tframes.map((tf, idx) => {
        let t = tf.split(":");
        let t_start = t[0];
        if (t_start.startsWith("t")) {
          t_start = t_start.substr(1);
          primary_tf_idx = idx;
        }
        let t_end = t[1];
        if (!t_end) t_end = null;
        let _api_opts = jsaltt.extend(
          {
            s: t_start,
            e: t_end,
            x: x,
            w: fill
          },
          api_opts
        );
        let method;
        if ($eva.api_version == 4) {
          method = "item.state_history";
        } else {
          method = "state_history";
        }
        calls.push($eva.call(method, _oid, _api_opts));
      });
      Promise.all(calls)
        .then(function(result) {
          let index = 0;
          let wtf = 0;
          result.map((data) => {
            data.t.forEach((t, index) => {
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
                work_cfg.options.plugins = jsaltt.extend(
                  p,
                  work_cfg.options.plugins
                );
                work_cfg.options.plugins.tooltip.callbacks.label = (ctx) => {
                  return ctx.formattedValue + data_units;
                };
              }
            }
            index += _oid.length;
            wtf++;
          });
        })
        .catch(function(err) {
          var d_error = document.createElement("div");
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
  function eva_toolbox_animate(ctx) {
    var el = typeof ctx === "object" ? ctx : document.getElementById(ctx);
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
   * @param pclass {string} popup class: info, warning or error. opens a large
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
   *                        popup contains input fields.
   *
   * @returns Promise object. Resolve and reject functions are called with
   *                         "true" parameter if button is pressed by user.
   *
   */
  function eva_toolbox_popup(ctx, pclass, title, msg, params) {
    var params = params;
    if (!params) params = {};
    return new Promise(function(resolve, reject) {
      if (document === "undfined") throw Error("DOM is required");
      var popup = typeof ctx === "object" ? ctx : document.getElementById(ctx);
      if (popup === undefined || popup === null)
        throw Error(`DOM context ${ctx} not found`);
      var ct = params["ct"];
      var btn1 = params["btn1"];
      var btn2 = params["btn2"];
      var va = params["va"];
      var _pclass = pclass;
      if (pclass[0] == "!") {
        _pclass = pclass.substr(1);
      }
      var popup_priority = function(pclass) {
        if (pclass == "info") return 20;
        if (pclass == "warning") return 30;
        if (pclass == "error") return 40;
        return 0;
      };
      if (popup && popup_priority(popup.priority) > popup_priority(_pclass)) {
        throw Error("popup with higher priority is already active");
      }
      if (popup) {
        clearInterval(popup.ticker);
        document.removeEventListener("keydown", popup.key_listener);
      }
      popup.innerHTML = "";
      popup.priority = _pclass;
      popup.className = "eva_toolbox_popup";
      var popup_window = document.createElement("div");
      popup.appendChild(popup_window);
      if (pclass[0] == "!") {
        popup_window.className = "eva_toolbox_popup_window_big";
      } else {
        popup_window.className = "eva_toolbox_popup_window";
      }
      var popup_header = document.createElement("div");
      popup_header.className =
        "eva_toolbox_popup_header eva_toolbox_popup_header_" + _pclass;
      if (title !== undefined && title !== null) {
        popup_header.innerHTML = title;
      } else {
        popup_header.innerHTML =
          _pclass.charAt(0).toUpperCase() + _pclass.slice(1);
      }
      popup_window.append(popup_header);
      var popup_content = document.createElement("div");
      popup_content.className = "eva_toolbox_popup_content";
      popup_content.innerHTML = msg;
      popup_window.appendChild(popup_content);
      var popup_footer = document.createElement("div");
      popup_footer.className = "eva_toolbox_popup_footer";
      popup_window.appendChild(popup_footer);
      var popup_buttons = document.createElement("div");
      popup_buttons.className = "row";
      popup_window.appendChild(popup_buttons);
      var popup_btn1 = document.createElement("div");
      var popup_btn2 = document.createElement("div");
      var spacer = document.createElement("div");
      spacer.className = "col-xs-1 col-sm-2";
      popup_buttons.appendChild(spacer);
      popup_buttons.appendChild(popup_btn1);
      popup_buttons.appendChild(popup_btn2);
      spacer = document.createElement("div");
      spacer.className = "col-xs-1 col-sm-2";
      popup_buttons.appendChild(spacer);
      var btn1text = "OK";
      if (btn1) {
        btn1text = btn1;
      }
      var btn1_o = document.createElement("div");
      btn1_o.className =
        "eva_toolbox_popup_btn eva_toolbox_popup_btn_" + _pclass;
      btn1_o.innerHTML = btn1text;
      var close_popup = function() {
        clearInterval(popup.ticker);
        document.getElementById(ctx).style.display = "none";
        document.getElementById(ctx).innerHTML = "";
        document.removeEventListener("keydown", popup.key_listener);
        popup.priority = null;
      };
      var f_validate_run_and_close = function() {
        if (va === undefined || va == null || va()) {
          close_popup();
          resolve(true);
        }
      };
      btn1_o.addEventListener("click", f_validate_run_and_close);
      popup_btn1.appendChild(btn1_o);
      var btn2_o;
      if (btn2) {
        btn2_o = document.createElement("div");
        btn2_o.className =
          "eva_toolbox_popup_btn eva_toolbox_popup_btn_" + _pclass;
        btn2_o.innerHTML = btn2;
        btn2_o.addEventListener("click", function() {
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
      popup.key_listener = function(e) {
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
        var ticker_func = function() {
          if (popup.ct <= 0) {
            close_popup();
            reject();
          }
          var obj;
          var txt = "";
          if (btn2_o) {
            obj = btn2_o;
            txt = btn2;
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

  function animate_el(el) {
    typeof $eva === "object" && typeof $eva.toolbox === "object"
      ? $eva.toolbox.animate(el)
      : eva_toolbox_animate(el);
  }

  const eva_toolbox_version = "0.4.3";

  function inject_toolbox() {
    var $eva = window.$eva;
    if (typeof $eva === "object") {
      if (!$eva.toolbox) {
        $eva.toolbox = {};
      }
      $eva.toolbox.chart = eva_toolbox_chart;
      $eva.toolbox.animate = eva_toolbox_animate;
      $eva.toolbox.popup = eva_toolbox_popup;
      $eva.toolbox.version = eva_toolbox_version;
    }
  }

  inject_toolbox();

  if (typeof exports === "object") {
    exports.chart = eva_toolbox_chart;
    exports.animate = eva_toolbox_animate;
    exports.popup = eva_toolbox_popup;
  }
})();
