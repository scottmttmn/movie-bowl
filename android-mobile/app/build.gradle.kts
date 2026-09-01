plugins {
    id("com.android.application")
}

android {
    namespace = "app.moviebowl.voicecaptureprobe"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.moviebowl.voicecaptureprobe"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        // Stay aligned with the repository's known-good Android wrapper.
        disable.add("AndroidGradlePluginVersion")
        warningsAsErrors = true
    }
}

dependencies {
    // App Actions capabilities in shortcuts.xml require AndroidX Core 1.6.0+.
    implementation("androidx.core:core:1.19.0")

    androidTestImplementation("androidx.test:core:1.7.0")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
}
