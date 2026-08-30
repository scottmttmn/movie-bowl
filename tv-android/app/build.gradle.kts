plugins {
    id("com.android.application")
}

// The emulator reaches the development Mac at 10.0.2.2. A physical television
// cannot, so debug builds accept the Mac's LAN address instead:
//   ./gradlew installDebug -PtvDebugHost=192.168.1.50
val tvDebugHost = (project.findProperty("tvDebugHost") as? String) ?: "10.0.2.2"

android {
    namespace = "app.moviebowl.tv"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.moviebowl.tv"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        buildConfigField(
            "String",
            "TV_URL",
            "\"https://moviebowl.app/tv\""
        )
        manifestPlaceholders["usesCleartextTraffic"] = "false"
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
        }

        // Field-test build for a physical Google TV device: the production URL,
        // signed with the debug keystore so `adb install` accepts it, and left
        // debuggable so chrome://inspect still reaches the WebView during a QA
        // pass. Release stays unsigned on purpose — store signing is its own
        // decision, and this variant must never stand in for it.
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
