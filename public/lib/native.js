// Running inside the iOS app rather than a browser tab changes how a reminder
// is delivered. A WKWebView gets no Web Push, so the native build schedules a
// repeating LOCAL notification instead: no server, no network, and it fires
// even in Airplane mode. The web build keeps using Web Push.
//
// Everything here is dynamically imported, so the browser build never loads a
// line of Capacitor.

export function isNative() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform &&
            window.Capacitor.isNativePlatform());
}

// Plugins are reached through the runtime bridge, not through npm imports.
// This app ships without a bundler, so a bare specifier like
// '@capacitor/local-notifications' would not resolve in the WebView. Capacitor
// puts every installed plugin on window.Capacitor.Plugins at runtime.
function plugin(name) {
  const p = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name];
  if (!p) throw new Error(`Capacitor plugin ${name} unavailable`);
  return p;
}

// One notification per weekday rather than a single repeating one, so each day
// can carry an accurate body: a lesson day mentions the new page, a rest day is
// not scheduled at all. iOS weekday numbering is 1=Sunday..7=Saturday.
const BASE_ID = 1001;
const isoToAppleWeekday = (iso) => (iso === 7 ? 1 : iso + 1);

export async function nativePermission() {
  const LocalNotifications = plugin('LocalNotifications');
  let perm = await LocalNotifications.checkPermissions();
  if (perm.display !== 'granted') perm = await LocalNotifications.requestPermissions();
  return perm.display === 'granted';
}

// bodies: an array of 7, indexed by ISO weekday - 1 (Monday first). A null
// entry means that day is not scheduled at all.
export async function scheduleNativeReminders(hhmm, bodies) {
  const LocalNotifications = plugin('LocalNotifications');
  const [hour, minute] = hhmm.split(':').map(Number);

  await cancelNativeReminders();

  const notifications = [];
  for (let iso = 1; iso <= 7; iso++) {
    const body = bodies[iso - 1];
    if (!body) continue;                     // rest day: stay quiet
    notifications.push({
      id: BASE_ID + iso,
      title: 'Time to revise',
      body,
      schedule: {
        on: { weekday: isoToAppleWeekday(iso), hour, minute },
        repeats: true,
        allowWhileIdle: true
      },
      extra: { url: '/' }
    });
  }
  if (notifications.length) await LocalNotifications.schedule({ notifications });
  return notifications.length;
}

export async function cancelNativeReminders() {
  const LocalNotifications = plugin('LocalNotifications');
  const ids = [];
  for (let iso = 1; iso <= 7; iso++) ids.push({ id: BASE_ID + iso });
  await LocalNotifications.cancel({ notifications: ids });
}

export async function pendingNativeReminders() {
  const LocalNotifications = plugin('LocalNotifications');
  const { notifications } = await LocalNotifications.getPending();
  return notifications || [];
}

// Native haptics feel materially better than the web vibrate API on iOS.
export async function tapFeedback(kind = 'light') {
  if (!isNative()) return false;
  try {
    // ImpactStyle is a plain string enum across the bridge.
    await plugin('Haptics').impact({ style: kind === 'heavy' ? 'MEDIUM' : 'LIGHT' });
    return true;
  } catch { return false; }
}
