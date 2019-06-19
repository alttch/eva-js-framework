# EVA JS Toolbox

Additional functions for [EVA JS
Framework](https://www.npmjs.com/package/@eva-ics/framework)

## Initialization

Toolbox is automatically injected in EVA ICS Framework when working in web
browser as *$eva.toolbox*.

## Toolbox functions

### $eva.toolbox.chart(ctx, cfg, oid, params)

requires chart.js

Params:

* **ctx** html container element or id to draw in (must have fixed
            width/height)
* **cfg** chart.js configuration
* **oid** item oid or oids, array or comma separated (type:full_id)
* **params** object with additional params:

  * timeframe - time frame to display (5T - 5 min, 2H - 2 hr, 2D
                - 2 days etc.), default: 1D

  * fill - precision[:np] (10T - 60T recommended, more accurate -
          more data), np - number precision, optional. default: 30T:2
  * update - update interval in seconds. If the chart container is no longer
            visible, chart stops updating.

  * prop - item property to use (default is value)

  * u - data units (e.g. mm or °C)

Returns Chart object.

### $eva.toolbox.animate(ctx)

Simple standard load animation.

Param ctx - HTML element or id.

## $eva.toolbox.popup(ctx, pclass, title, msg, params)

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

