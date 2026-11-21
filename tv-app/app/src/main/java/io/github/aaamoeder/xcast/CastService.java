package io.github.aaamoeder.xcast;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import org.json.JSONObject;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

import fi.iki.elonen.NanoHTTPD;

/**
 * Background service: listens on the LAN (port 8790) for commands from the
 * Chrome extension and opens the player. Starts when the TV boots.
 *
 * GET  /info    who am I, with the device name (the extension finds TVs with this)
 * POST /play    {url, title, subtitle, hls, live, position, seekStep} plays a video
 * POST /stop    stops the player
 * GET  /status  what is playing now
 */
public class CastService extends Service {
    static final String TAG = "x-cast";
    static final int PORT = 8790;
    private static final String CHANNEL = "xcast";

    private Server server;

    public static void start(Context ctx) {
        Intent i = new Intent(ctx, CastService.class);
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
        else ctx.startService(i);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "x-cast", NotificationManager.IMPORTANCE_MIN));
        }
        Notification n = new Notification.Builder(this, CHANNEL)
                .setContentTitle("x-cast")
                .setContentText("Ready to receive videos from X")
                .setSmallIcon(android.R.drawable.ic_media_play)
                .build();
        startForeground(1, n);

        server = new Server();
        try {
            server.start(NanoHTTPD.SOCKET_READ_TIMEOUT, true);
            Log.i(TAG, "listening on port " + PORT);
        } catch (IOException e) {
            Log.e(TAG, "server could not start", e);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (server != null) server.stop();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /**
     * Wakes the TV, like Chromecast does. If the screensaver (Android "dream")
     * is running, waking ends it; otherwise it stays on top of the player and
     * the video stops right away.
     */
    @SuppressWarnings("deprecation")
    private void wakeUp() {
        PowerManager pm = getSystemService(PowerManager.class);
        PowerManager.WakeLock wl = pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP, "x-cast:cast");
        wl.acquire(3000);
        try {
            Thread.sleep(300); // give the screensaver time to close
        } catch (InterruptedException ignored) {
        }
    }

    private class Server extends NanoHTTPD {
        Server() {
            super(PORT);
        }

        @Override
        public Response serve(IHTTPSession s) {
            Response r;
            try {
                r = route(s);
            } catch (Exception e) {
                Log.e(TAG, "error handling request", e);
                r = json(Response.Status.INTERNAL_ERROR, "{\"ok\":false,\"error\":" + JSONObject.quote(String.valueOf(e)) + "}");
            }
            // The extension calls this from Chrome: allow CORS.
            r.addHeader("Access-Control-Allow-Origin", "*");
            r.addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            r.addHeader("Access-Control-Allow-Headers", "Content-Type");
            r.addHeader("Access-Control-Allow-Private-Network", "true");
            return r;
        }

        private Response route(IHTTPSession s) throws Exception {
            if (s.getMethod() == Method.OPTIONS) return json(Response.Status.OK, "{}");
            String uri = s.getUri();
            if ("/info".equals(uri)) {
                JSONObject o = new JSONObject();
                o.put("app", "x-cast");
                o.put("version", BuildConfigInfo.version(CastService.this));
                o.put("device", Build.MODEL);
                // Name set in Android (Device Preferences > About > Device name).
                String name = android.provider.Settings.Global.getString(getContentResolver(), android.provider.Settings.Global.DEVICE_NAME);
                o.put("name", name == null || name.isEmpty() ? Build.MODEL : name);
                return json(Response.Status.OK, o.toString());
            }
            if ("/status".equals(uri)) {
                return json(Response.Status.OK, PlayerActivity.statusJson());
            }
            if ("/stop".equals(uri) && s.getMethod() == Method.POST) {
                PlayerActivity.stopFromRemote();
                return json(Response.Status.OK, "{\"ok\":true}");
            }
            if ("/play".equals(uri) && s.getMethod() == Method.POST) {
                Map<String, String> files = new HashMap<>();
                s.parseBody(files);
                String body = files.get("postData");
                if (body == null) return json(Response.Status.BAD_REQUEST, "{\"ok\":false,\"error\":\"no body\"}");
                JSONObject o = new JSONObject(body);
                String url = o.optString("url", "");
                if (!url.startsWith("https://") && !url.startsWith("http://")) {
                    return json(Response.Status.BAD_REQUEST, "{\"ok\":false,\"error\":\"invalid url\"}");
                }
                Intent i = new Intent(CastService.this, PlayerActivity.class);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                i.putExtra("url", url);
                i.putExtra("title", o.optString("title", ""));
                i.putExtra("subtitle", o.optString("subtitle", ""));
                i.putExtra("live", o.optBoolean("live", false));
                i.putExtra("position", o.optDouble("position", 0));
                i.putExtra("hls", o.optBoolean("hls", url.contains(".m3u8")));
                i.putExtra("seekStep", o.optInt("seekStep", 10));
                wakeUp();
                startActivity(i);
                Log.i(TAG, "playing: " + url);
                return json(Response.Status.OK, "{\"ok\":true}");
            }
            return json(Response.Status.NOT_FOUND, "{\"ok\":false,\"error\":\"not found\"}");
        }

        private Response json(Response.Status st, String body) {
            return newFixedLengthResponse(st, "application/json; charset=utf-8", body);
        }
    }
}
