# EVA JS Toolbox

Additional functions for [EVA JS
Framework](https://www.npmjs.com/package/@eva-ics/framework)

## Initialization

Toolbox is automatically injected in EVA JS Framework as *$eva.toolbox* when
loaded in a web browser.

## Toolbox functions

### $eva.toolbox.chart(ctx, cfg, oid, params)

requires chart.js

Params:

* **ctx** html container element or id to draw in (must have fixed
            width/height)
* **cfg** chart.js configuration
* **oid** item oid or oids, array or comma separated (type:full_id)
* **params** object with additional params:

  * timeframe - timeframe to display (5T - 5 min, 2H - 2 hr, 2D - 2 days etc.),
    default: 1D. To display past timeframes, use two values, separated with
    ":", e.g. 2D:1D - get data for yesterday. To display multiple timeframes,
    send this param as array. Axis X is always formed from the first timeframe.
    If you want to change this, put "t" before the necessary timeframe, e.g.:
    t2D:1D

  * fill - precision[:np] (10T - 60T recommended, more accurate -
          more data), np - number precision, optional. default: 30T:2
  * update - update interval in seconds. If the chart container is no longer
            visible, chart stops updating

  * prop - item property to use (default is value)

  * units - data units (e.g. mm or °C)

  * animate - custom animation function

  * args - additional API options (state_history)

Returns Chart object.

If multiple timeframes and multiple items are specified, chart data is filled
as: first timeframe for all items, second timeframe for all items etc.

### $eva.toolbox.animate(ctx)

Simple standard load animation.

Param ctx - HTML element or id.

### $eva.toolbox.popup(ctx, pclass, title, msg, params)

Opens popup window. Requires bootstrap CSS. There can be only 1 popup opened
with specified html ctx. If the page want to open another popup, the current
one will be overwritten unless it's class is higher than a new one, otherwise
exception is raised.

* **ctx** html element or id to use as popup (any empty <div /> is fine)

* **pclass** popup class: info, warning or error. opens big popup window
             if '!' is put before the class (e.g. !info)

* **title** popup window title

* **msg** popup window message

* **params** object with handlers and additional parameters:

  * ct - popup auto close time (sec), equal to pressing escape

  * btn1 - button 1 name (default: 'OK')

  * btn2 - button 2 name

  * va - validate function which runs before Promise resolve
        function. If the function return true, the popup is closed and
        resolve function is executed. "va" function is used to validate an
        input, if popup contains any input fields.

Returns Promise object. Resolve and reject functions are called with "true"
parameter if button is pressed by user.

### Custom animation functions

You may override default animation function with custom:

```javascript
$eva.toolbox.animate = function(ctx) {
  var el = typeof ctx === 'object' ? ctx : document.getElementById(ctx);
  // replace specified HTML DOM element with animation
}
```
