'use strict';

/**
 * display a chart
 *
 * To work with charts you should include Chart.js library, which is located in
 * file lib/chart.min.js (ui folder).
 *
 * @param ctx - html container element id to draw in (must have fixed
 *              width/height)
 * @param cfg - Chart.js configuration
 * @param oid - item oid or oids, array or comma separated (type:full_id)
 * @param params - object with props
 *              @timeframe - timeframe to display (5T - 5 min, 2H - 2 hr, 2D - 2
 *                          days etc.), default: 1D
 *              @fill - precision[:np] (10T - 60T recommended, more accurate -
 *              more data), np - number precision, optional. default: 30T:2
 *              @update - update interval in seconds. If the chart conteiner is
 *                        no longer visible, chart stops updating.
 *              @prop - item property to use (default is value)
 *              @u - data units (e.g. mm or °C)
 *
 */
function eva_toolbox_chart(ctx, cfg, oid, params, _do_update) {
  if (document === 'undfined') throw Error('DOM is required');
  var chartfunc = function() {
    var params = jsaltt.extend({}, params);
    var _oid;
    if (typeof oid === 'object') {
      _oid = oid;
    } else {
      _oid = oid.split(',');
    }
    var timeframe = params['timeframe'];
    if (!timeframe) {
      timeframe = '1D';
    }
    var fill = params['fill'];
    if (!fill) {
      fill = '30T:2';
    }
    var update = params['update'];
    var prop = params['prop'];
    var cc = document.getElementById(ctx);
    var data_units = params['u'];
    var chart = null;
    if (_do_update) {
      chart = _do_update;
    }
    if (
      _do_update !== undefined &&
      (cc.offsetWidth <= 0 || cc.offsetHeight <= 0)
    ) {
      if (chart) chart.destroy();
      return;
    }
    var d = new Date();
    if (timeframe[timeframe.length - 1] == 'T') {
      d.setMinutes(
        d.getMinutes() - timeframe.substring(0, timeframe.length - 1)
      );
    } else if (timeframe[timeframe.length - 1] == 'H') {
      d.setHours(d.getHours() - timeframe.substring(0, timeframe.length - 1));
    } else if (timeframe[timeframe.length - 1] == 'D') {
      d.setHours(
        d.getHours() - timeframe.substring(0, timeframe.length - 1) * 24
      );
    }
    if (!_do_update) eva_toolbox_animate(ctx);
    var x = 'value';
    if (prop !== undefined && prop !== null) {
      x = prop;
    }
    $eva
      .call('state_history', _oid, {
        t: 'iso',
        s: d.toISOString(),
        x: x,
        w: fill
      })
      .then(function(data) {
        if (chart) {
          chart.data.labels = data.t;
          for (var i = 0; i < _oid.length; i++) {
            chart.data.datasets[i].data = data[_oid[i] + '/' + x];
          }
          chart.update();
        } else {
          var canvas = document.createElement('canvas');
          canvas.style.width = '100%';
          canvas.style.height = '100%';
          canvas.className = 'eva_toolbox_chart';
          var work_cfg = jsaltt.extend({}, cfg);
          work_cfg.data.labels = data.t;
          for (var i = 0; i < _oid.length; i++) {
            work_cfg.data.datasets[i].data = data[_oid[i] + '/' + x];
          }
          cc.innerHTML = '';
          cc.appendChild(canvas);
          chart = new Chart(canvas, work_cfg);
          if (data_units) {
            work_cfg.options.tooltips.callbacks.label = function(tti) {
              return tti.yLabel + data_units;
            };
          }
        }
      })
      .catch(function(err) {
        var d_error = document.createElement('div');
        d_error.className = 'eva_toolbox_chart';
        d_error.style.cssText =
          'width: 100%; height: 100%; ' +
          'color: red; font-weight: bold; font-size: 14px';
        d_error.innerHTML = 'Error loading chart data: ' + err.message;
        cc.innerHTML = '';
        cc.appendChild(d_error);
        if (chart) chart.destroy();
        chart = null;
      });
    if (update) {
      setTimeout(function() {
        chartfunc(ctx, cfg, _oid, params, chart);
      }, update * 1000);
    }
  };
  chartfunc();
}

/**
 * animate html element block
 *
 * Simple loading animation
 *
 * @param el_id - html element id
 */
function eva_toolbox_animate(el_id) {
  if (document === 'undfined') throw Error('DOM is required');
  document.getElementById(el_id).innerHTML =
    '<div class="eva-toolbox-cssload-square"><div \
      class="eva-toolbox-cssload-square-part \
      eva-toolbox-cssload-square-green"></div><div \
      class="eva-toolbox-cssload-square-part \
      eva-toolbox-cssload-square-pink"></div><div \
      class="eva-toolbox-cssload-square-blend"></div></div>';
}

/**
 * QR code for EvaHI
 *
 * Generates QR code for :doc:`EvaHI</evahi>`-compatible apps (e.g. for EVA ICS
 * Control Center mobile app for Android). Current framework session must be
 * authorized using user login. If $eva.password is defined, QR code also
 * contains password value. Requires qrious js library.
 *
 * @param ctx - html <canvas /> element id to generate QR code in
 * @param params - object with additional parameters:
 *              @size - QR code size in px (default: 200)
 *              @url - override UI url (default: document.location)
 *              @user - override user (default: $eva.authorized_user)
 *              @password - override password
 *
 * @returns Qrious QR object if QR code is generated
 */
function eva_toolbox_hiQR(ctx, params) {
  if (document === 'undfined') throw Error('DOM is required');
  var params = params;
  if (!params) params = {};
  var url = params['url'];
  if (!url) {
    url = document.location;
  }
  var user = params['user'];
  if (user === undefined) {
    user = $eva.authorized_user;
  }
  var password = params['password'];
  if (password === undefined) {
    password = $eva.password;
  }
  var size = params['size'];
  if (!size) {
    size = 200;
  }
  if (!url || !user) {
    return false;
  }
  var l = document.createElement('a');
  l.href = url;
  var protocol = l.protocol.substring(0, l.protocol.length - 1);
  var host = l.hostname;
  var port = l.port;
  if (!port) {
    if (protocol == 'http') {
      port = 80;
    } else {
      port = 443;
    }
  }
  var value =
    'scheme:' +
    protocol +
    '|address:' +
    host +
    '|port:' +
    port +
    '|user:' +
    user;
  if (password) {
    value += '|password:' + password;
  }
  return new QRious({
    element: document.getElementById(ctx),
    value: value,
    size: size
  });
}

/**
 * popup window
 *
 * Opens popup window. Requires bootstrap css included
 * There can be only 1 popup opened with specified html ctx. If the page want to
 * open another popup, the current one will be overwritten unless it's class is
 * higher than a new one, otherwise exception is raised.
 *
 * @param ctx - html element id to use as popup (any empty <div /> is fine)
 * @param pclass - popup class: info, warning or error. opens big popup window
 *                 if '!' is put before the class (e.g. !info)
 * @param title - popup window title
 * @param msg - popup window message
 * @param params - object with handlers and additional parameters:
 *              @ct - popup auto close time (sec), equal to pressing escape
 *              @btn1 - button 1 name ('OK' if not specified)
 *              @btn2 - button 2 name
 *              @va - validate function which runs before btn1a.
 *                   if the function return true, the popup is closed and btn1a
 *                   function is executed. otherwise the popup is kept and the
 *                   function btn1a is not executed. va function is used to
 *                   validate an input, if popup contains any input fields.
 *
 * @returns - Promise object. Resolve and reject functions are called with
 * "true" parameter if button is pressed by user.
 *
 */
function eva_toolbox_popup(ctx, pclass, title, msg, params) {
  var params = params;
  if (!params) params = {};
  return new Promise(function(resolve, reject) {
    if (document === 'undfined') throw Error('DOM is required');
    var popup = document.getElementById(ctx);
    if (popup === undefined || popup === null)
      throw Error(`DOM context ${ctx} not found`);
    var ct = params['ct'];
    var btn1 = params['btn1'];
    var btn2 = params['btn2'];
    var va = params['va'];
    var _pclass = pclass;
    if (pclass[0] == '!') {
      _pclass = pclass.substr(1);
    }
    var popup_priority = function(pclass) {
      if (pclass == 'info') return 20;
      if (pclass == 'warning') return 30;
      if (pclass == 'error') return 40;
      return 0;
    };
    if (popup && popup_priority(popup.priority) > popup_priority(_pclass)) {
      throw Error('popup with higher priority is already active');
    }
    if (popup) {
      clearInterval(popup.ticker);
      document.removeEventListener('keydown', popup.key_listener);
    }
    popup.innerHTML = '';
    popup.priority = _pclass;
    popup.className = 'eva_toolbox_popup';
    var popup_window = document.createElement('div');
    popup.appendChild(popup_window);
    if (pclass[0] == '!') {
      popup_window.className = 'eva_toolbox_popup_window_big';
    } else {
      popup_window.className = 'eva_toolbox_popup_window';
    }
    var popup_header = document.createElement('div');
    popup_header.className =
      'eva_toolbox_popup_header eva_toolbox_popup_header_' + _pclass;
    if (title !== undefined && title !== null) {
      popup_header.innerHTML = title;
    } else {
      popup_header.innerHTML =
        _pclass.charAt(0).toUpperCase() + _pclass.slice(1);
    }
    popup_window.append(popup_header);
    var popup_content = document.createElement('div');
    popup_content.className = 'eva_toolbox_popup_content';
    popup_content.innerHTML = msg;
    popup_window.appendChild(popup_content);
    var popup_footer = document.createElement('div');
    popup_footer.className = 'eva_toolbox_popup_footer';
    popup_window.appendChild(popup_footer);
    var popup_buttons = document.createElement('div');
    popup_buttons.className = 'row';
    popup_window.appendChild(popup_buttons);
    var popup_btn1 = document.createElement('div');
    var popup_btn2 = document.createElement('div');
    var spacer = document.createElement('div');
    spacer.className = 'col-xs-1 col-sm-2';
    popup_buttons.appendChild(spacer);
    popup_buttons.appendChild(popup_btn1);
    popup_buttons.appendChild(popup_btn2);
    spacer = document.createElement('div');
    spacer.className = 'col-xs-1 col-sm-2';
    popup_buttons.appendChild(spacer);
    var btn1text = 'OK';
    if (btn1) {
      btn1text = btn1;
    }
    var btn1_o = document.createElement('div');
    btn1_o.className = 'eva_toolbox_popup_btn eva_toolbox_popup_btn_' + _pclass;
    btn1_o.innerHTML = btn1text;
    var close_popup = function() {
      clearInterval(popup.ticker);
      document.getElementById(ctx).style.display = 'none';
      document.getElementById(ctx).innerHTML = '';
      document.removeEventListener('keydown', popup.key_listener);
      popup.priority = null;
    };
    var f_validate_run_and_close = function() {
      if (va === undefined || va == null || va()) {
        close_popup();
        resolve(true);
      }
    };
    btn1_o.addEventListener('click', f_validate_run_and_close);
    popup_btn1.appendChild(btn1_o);
    var btn2_o;
    if (btn2) {
      btn2_o = document.createElement('div');
      btn2_o.className =
        'eva_toolbox_popup_btn eva_toolbox_popup_btn_' + _pclass;
      btn2_o.innerHTML = btn2;
      btn2_o.addEventListener('click', function() {
        close_popup();
        reject(true);
      });
      popup_btn2.appendChild(btn2_o);
      popup_btn1.className += ' col-xs-5 col-sm-4';
      popup_btn2.className += ' col-xs-5 col-sm-4';
    } else {
      popup_btn1.className += ' col-xs-10 col-sm-8';
      popup_btn2.style.display = 'none';
    }
    popup.style.display = 'block';
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
    document.addEventListener('keydown', popup.key_listener);
    if (ct && ct > 0) {
      popup.ct = ct;
      var ticker_func = function() {
        if (popup.ct <= 0) {
          close_popup();
          reject();
        }
        var obj;
        var txt = '';
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

if (typeof $eva !== 'undefined') {
  if (!$eva.toolbox) {
    $eva.toolbox = {};
  }
  $eva.toolbox.chart = eva_toolbox_chart;
  $eva.toolbox.animate = eva_toolbox_animate;
  $eva.toolbox.hiQR = eva_toolbox_hiQR;
  $eva.toolbox.popup = eva_toolbox_popup;
}

if (typeof exports !== 'undefined') {
  exports.chart = eva_toolbox_chart;
  exports.animate = eva_toolbox_animate;
  exports.hiQR = eva_toolbox_hiQR;
  exports.popup = eva_toolbox_popup;
}
