# JavaScript Framework for EVA ICS

JavaScript Framework for [EVA
ICS](https://www.bohemia-automation.com/software/eva4/) - open source platform
for industrial and home IoT.

Technical documentation: <https://info.bma.ai/en/actual/eva-js-framework/index.html>

## Migration from 0.4

* EVA JS Framework and Toolbox have become ES modules.

* the default "$eva" object is now available for web browsers only

* Web socket mode is now turned on by default

* "fetch" is no longer bundled as it is present in the majority of
environments. For older environments consider manually importing a polyfill
(e.g. "node-fetch") and setting it to EVAOBJECT.external.fetch.

* "WebSocket" is no longer bundled by default. Consider either setting
"eva.ws\_mode" to false or using an external module (e.g. "ws") and setting it
to EVAOBJECT.external.WebSocket.

* QRious is no longer bundled by default. If QR codes are required, consider
manually importing "QRious" module and setting it to EVAOBJECT.external.QRious

* Chart.js is no longer bundled by default. If the toolbox is used and charts
are required, consider manually importing "Chart.js" module (v2, v3 and v4 are
tested) and setting it to EVAOBJECT.external.Chart
