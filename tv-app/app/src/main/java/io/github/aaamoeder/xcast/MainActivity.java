package io.github.aaamoeder.xcast;

import android.app.Activity;
import android.os.Bundle;
import android.widget.TextView;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Collections;

/** Start screen: starts the service and shows where it listens. */
public class MainActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        CastService.start(this);
        ((TextView) findViewById(R.id.status)).setText(
                "x-cast " + BuildConfigInfo.version(this) + " is ready.\n\n"
                        + "TV address: " + ipAddress() + "  (port " + CastService.PORT + ")\n\n"
                        + "In Chrome, click the Cast icon on a video on x.com.\n"
                        + "If the TV is not found, enter this address in the extension options.\n"
                        + "This app does not need to stay open.");
    }

    private static String ipAddress() {
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address) return a.getHostAddress();
                }
            }
        } catch (Exception ignored) {
        }
        return "?";
    }
}
