plugins {
    id("com.android.application")
}

android {
    namespace = "io.github.aaamoeder.xcast"
    compileSdk = 37

    defaultConfig {
        applicationId = "io.github.aaamoeder.xcast"
        minSdk = 26
        targetSdk = 30
        versionCode = 6
        versionName = "0.4.0-alpha.1"
    }

    // Release signing. The key is kept outside the repository; its location and
    // passwords come from ~/.gradle/gradle.properties (XCAST_STORE_FILE,
    // XCAST_STORE_PASSWORD, XCAST_KEY_ALIAS, XCAST_KEY_PASSWORD). Without them
    // the release build is left unsigned.
    val storeFilePath = providers.gradleProperty("XCAST_STORE_FILE").orNull
    signingConfigs {
        if (storeFilePath != null) {
            create("release") {
                storeFile = file(storeFilePath)
                storePassword = providers.gradleProperty("XCAST_STORE_PASSWORD").get()
                keyAlias = providers.gradleProperty("XCAST_KEY_ALIAS").get()
                keyPassword = providers.gradleProperty("XCAST_KEY_PASSWORD").get()
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (storeFilePath != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    // targetSdk 30 is deliberate (sideloaded TV app, not for Play): the
    // Play Store rule on old target SDKs does not apply.
    lint {
        disable += "ExpiredTargetSdkVersion"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.media3:media3-exoplayer:1.11.1")
    implementation("androidx.media3:media3-exoplayer-hls:1.11.1")
    implementation("androidx.media3:media3-ui:1.11.1")
    implementation("org.nanohttpd:nanohttpd:2.3.1")
}
