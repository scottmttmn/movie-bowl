plugins {
    id("com.android.application")
}

// The emulator reaches the development Mac at 10.0.2.2. A physical television
// cannot, so debug builds accept the Mac's LAN address instead:
//   ./gradlew installDebug -PtvDebugHost=192.168.1.50
val tvDebugHost = (project.findProperty("tvDebugHost") as? String) ?: "10.0.2.2"

fun releaseSigningValue(name: String): String? =
    providers.environmentVariable(name).orNull?.trim()?.takeIf { it.isNotEmpty() }

val releaseStoreFile = releaseSigningValue("MOVIE_BOWL_TV_UPLOAD_STORE_FILE")
val releaseStorePassword = releaseSigningValue("MOVIE_BOWL_TV_UPLOAD_STORE_PASSWORD")
val releaseKeyAlias = releaseSigningValue("MOVIE_BOWL_TV_UPLOAD_KEY_ALIAS")
val releaseKeyPassword = releaseSigningValue("MOVIE_BOWL_TV_UPLOAD_KEY_PASSWORD")
val releaseSigningValues = listOf(
    releaseStoreFile,
    releaseStorePassword,
    releaseKeyAlias,
    releaseKeyPassword,
)
val releaseSigningConfigured = releaseSigningValues.all { it != null }

check(releaseSigningValues.none { it != null } || releaseSigningConfigured) {
    "TV upload signing is only partially configured. Set all four MOVIE_BOWL_TV_UPLOAD_* environment variables."
}

android {
    namespace = "app.moviebowl.tv"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.moviebowl.tv"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "0.1.1"

        buildConfigField(
            "String",
            "TV_URL",
            "\"https://moviebowl.app/tv\""
        )
        manifestPlaceholders["usesCleartextTraffic"] = "false"
    }

    signingConfigs {
        if (releaseSigningConfigured) {
            create("upload") {
                storeFile = file(checkNotNull(releaseStoreFile))
                storePassword = checkNotNull(releaseStorePassword)
                keyAlias = checkNotNull(releaseKeyAlias)
                keyPassword = checkNotNull(releaseKeyPassword)
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            buildConfigField(
                "String",
                "TV_URL",
                "\"http://$tvDebugHost:3000/tv\""
            )
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }

        release {
            isMinifyEnabled = false
            isDebuggable = false
            if (releaseSigningConfigured) {
                signingConfig = signingConfigs.getByName("upload")
            }
        }

        // Field-test build for a physical Google TV device: the production URL,
        // signed with the debug keystore so `adb install` accepts it, and left
        // debuggable so chrome://inspect still reaches the WebView during a QA
        // pass. This variant must never stand in for a store build.
        create("sideload") {
            initWith(getByName("release"))
            signingConfig = signingConfigs.getByName("debug")
            isDebuggable = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }
}
