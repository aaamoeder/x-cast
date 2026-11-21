package io.github.aaamoeder.xcast;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Starts the listening service after the TV boots and after an app update. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        CastService.start(context);
    }
}
