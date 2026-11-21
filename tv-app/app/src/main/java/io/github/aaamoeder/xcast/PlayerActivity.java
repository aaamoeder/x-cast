package io.github.aaamoeder.xcast;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.annotation.OptIn;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;

import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;

/**
 * Player. Fetches the video directly from X with x.com as the referrer:
 * video.twimg.com refuses (403) any other referrer, which is why the default
 * Chromecast receiver does not work (it sends gstatic.com).
 */
@OptIn(markerClass = UnstableApi.class)
public class PlayerActivity extends Activity {
    private static final String UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

    private static volatile PlayerActivity current;
    private static volatile String currentUrl = "";
    private static volatile String currentTitle = "";

    private ExoPlayer player;
    private PlayerView view;
    private TextView title;
    private View seekBox;
    private TextView seekText;
    private ProgressBar seekProgress;
    private int seekStepSec = 10;
    private boolean live;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable hideSeek = () -> seekBox.setVisibility(View.GONE);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_player);
        view = findViewById(R.id.player_view);
        title = findViewById(R.id.title);
        seekBox = findViewById(R.id.seek_bar_box);
        seekText = findViewById(R.id.seek_text);
        seekProgress = findViewById(R.id.seek_progress);
        view.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener) visibility ->
                title.setVisibility(visibility == View.VISIBLE ? View.VISIBLE : View.GONE));
        current = this;
        play(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        play(intent);
    }

    private void play(Intent intent) {
        String url = intent.getStringExtra("url");
        if (url == null) {
            finish();
            return;
        }
        release();

        Map<String, String> headers = new HashMap<>();
        headers.put("Referer", "https://x.com/");
        headers.put("Origin", "https://x.com");
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                .setUserAgent(UA)
                .setAllowCrossProtocolRedirects(true)
                .setDefaultRequestProperties(headers);

        player = new ExoPlayer.Builder(this)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(http))
                .build();
        view.setPlayer(player);

        String t = intent.getStringExtra("title");
        String sub = intent.getStringExtra("subtitle");
        live = intent.getBooleanExtra("live", false);
        // Seek step from the Chrome extension options (default 10 s).
        seekStepSec = Math.max(1, intent.getIntExtra("seekStep", 10));
        currentUrl = url;
        currentTitle = t == null ? "" : t;
        title.setText((live ? "LIVE  " : "") + (t == null ? "" : t) + (sub == null || sub.isEmpty() ? "" : "\n" + sub));

        MediaItem.Builder item = new MediaItem.Builder()
                .setUri(Uri.parse(url))
                .setMediaMetadata(new MediaMetadata.Builder().setTitle(t).setArtist(sub).build());
        if (intent.getBooleanExtra("hls", url.contains(".m3u8"))) item.setMimeType(MimeTypes.APPLICATION_M3U8);
        player.setMediaItem(item.build());

        double pos = intent.getDoubleExtra("position", 0);
        if (!live && pos > 1) player.seekTo((long) (pos * 1000));

        player.addListener(new Player.Listener() {
            @Override
            public void onPlayerError(PlaybackException error) {
                Log.e(CastService.TAG, "playback error", error);
                title.setVisibility(View.VISIBLE);
                title.setText("Playback failed: " + error.getErrorCodeName());
            }

            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED) view.showController();
            }
        });
        player.setPlayWhenReady(true);
        player.prepare();
        // Start without controls, like YouTube and Netflix on TV.
        view.hideController();
    }

    /**
     * Standard TV app behaviour: Back first hides the controls, a second Back
     * closes the player. Other keys go to the player, which then shows the
     * controls (D-pad) or plays/pauses (media keys).
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int key = event.getKeyCode();
        if ((key == KeyEvent.KEYCODE_DPAD_LEFT || key == KeyEvent.KEYCODE_DPAD_RIGHT)
                && player != null && !view.isControllerFullyVisible()) {
            // Without controls: seek. With controls: move between the buttons.
            if (event.getAction() == KeyEvent.ACTION_DOWN) seekBy(key == KeyEvent.KEYCODE_DPAD_RIGHT ? seekStepSec : -seekStepSec);
            return true;
        }
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (view.isControllerFullyVisible()) {
                if (event.getAction() == KeyEvent.ACTION_UP) view.hideController();
                return true;
            }
            return super.dispatchKeyEvent(event);
        }
        return view.dispatchKeyEvent(event) || super.dispatchKeyEvent(event);
    }

    private void seekBy(int seconds) {
        long dur = player.getDuration();
        long target = Math.max(0, player.getCurrentPosition() + seconds * 1000L);
        if (dur != androidx.media3.common.C.TIME_UNSET) target = Math.min(target, dur);
        player.seekTo(target);

        String sign = seconds > 0 ? "+" : "\u2212";
        String where;
        if (live && dur != androidx.media3.common.C.TIME_UNSET) {
            long behind = Math.max(0, dur - target);
            where = behind < 3000 ? "LIVE" : "LIVE \u2212" + fmt(behind);
        } else if (dur != androidx.media3.common.C.TIME_UNSET && dur > 0) {
            where = fmt(target) + " / " + fmt(dur);
        } else {
            where = fmt(target);
        }
        seekText.setText(sign + Math.abs(seconds) + " s   " + where);
        seekProgress.setProgress(dur > 0 && dur != androidx.media3.common.C.TIME_UNSET ? (int) (target * 1000 / dur) : 0);
        seekBox.setVisibility(View.VISIBLE);
        handler.removeCallbacks(hideSeek);
        handler.postDelayed(hideSeek, 2000);
    }

    private static String fmt(long ms) {
        long s = ms / 1000;
        long h = s / 3600;
        return h > 0 ? String.format(java.util.Locale.ROOT, "%d:%02d:%02d", h, (s / 60) % 60, s % 60)
                : String.format(java.util.Locale.ROOT, "%02d:%02d", s / 60, s % 60);
    }

    private void release() {
        if (player != null) {
            player.release();
            player = null;
        }
    }

    @Override
    protected void onStop() {
        super.onStop();
        // Leaving the player (Home or Back): stop, like Chromecast apps do.
        release();
        finish();
    }

    @Override
    protected void onDestroy() {
        release();
        if (current == this) current = null;
        super.onDestroy();
    }

    static void stopFromRemote() {
        PlayerActivity a = current;
        if (a != null) a.runOnUiThread(a::finish);
    }

    static String statusJson() {
        JSONObject o = new JSONObject();
        try {
            PlayerActivity a = current;
            o.put("playing", a != null);
            o.put("url", a != null ? currentUrl : "");
            o.put("title", a != null ? currentTitle : "");
        } catch (Exception ignored) {
        }
        return o.toString();
    }
}
