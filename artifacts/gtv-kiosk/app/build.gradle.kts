plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "edu.bridgew.tvkiosk"
    compileSdk = 34

    defaultConfig {
        applicationId = "edu.bridgew.tvkiosk"
        // Android TV back to Lollipop; the Google TV Streamer is API 34.
        minSdk = 21
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"

        // Baked default. Overridable at runtime from the setup screen.
        buildConfigField("String", "DEFAULT_SERVER_URL", "\"http://its-avctrl-bsu-av/\"")
    }

    buildFeatures { buildConfig = true }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
}
