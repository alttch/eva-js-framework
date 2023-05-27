import { EVA } from '@eva-ics/framework';
import { WebSocket } from 'ws';

let $eva = new EVA();
$eva.external.WebSocket = WebSocket;

async function stop() {
  await $eva.sleep(2);
  await $eva.stop();
}

$eva.debug = true;
$eva.login = 'admin'
$eva.password = 'xxx';
$eva.api_uri = 'http://localhost:7727';
$eva.on('login.success', () => {
  stop()
});
$eva.start()
