plugins {
    id("com.android.application")
}

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
                "\"http://10.0.2.2:3000/tv\""
            )
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }

        release {
            isMinifyEnabled = false
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
