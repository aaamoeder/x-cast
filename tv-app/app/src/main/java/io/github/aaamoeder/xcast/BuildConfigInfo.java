package io.github.aaamoeder.xcast;

import android.content.Context;

final class BuildConfigInfo {
    private BuildConfigInfo() {}

    static String version(Context ctx) {
        try {
            return ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "?";
        }
    }
}
